// js/rules/state.js — owner: W1-R. SR.rules.state: the v1 state schema (ARCHITECTURE §6.1, frozen),
// create(opts) builds a new game and defaults() returns the fully populated default that the save
// migration deep-fills from. Pure: no DOM, browser API or unseeded randomness (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  var VERSION = 1;
  var DEFAULT_SEED = 12345;            // the schema's example seed; callers pass their own
  var DIFFICULTIES = ['relaxed', 'standard', 'hardcore'];

  /** @returns {object} the stock entries of the schema, one per ticker of B-10, at the given prices. */
  function stocks(prices) {
    var T = SR.tuning.stocks, out = {};
    T.tickers.forEach(function (t) {
      var p = prices ? prices[t] : T[t].start;
      out[t] = { price: p, prev: p, hist: [], held: 0, basis: 0 };
    });
    return out;
  }

  /**
   * The v1 state with every field at its default (ARCHITECTURE §6.1): Standard, 40 days, Fair start
   * 7 / 7 / 7, the B-10 start prices and a 2.0 % rate. Deterministic; used by the save's deep-fill.
   * @returns {object} a new plain-JSON state
   */
  function defaults() {
    var T = SR.tuning, fair = T.start.fairStart;
    var hpMax = T.start.hpMaxBase + fair.str;
    return {
      v: VERSION, seed: DEFAULT_SEED, rng: { rules: SR.rng.create(DEFAULT_SEED).state() },
      mode: { length: 40, difficulty: 'standard', tutorial: true, cheat: false, keepPlaying: false, inProgress: false },
      clock: { day: T.start.startPlace.day, min: T.time.wake, wake: T.time.wake, pillAuto: true },
      player: {
        name: 'Stick', look: { acc: 'none' }, x: 998, y: 1088, facing: 180,
        driving: null,
        cars: {
          junker: { owned: false, bought: false, x: 727, y: 1113, a: 0, towed: false },
          sports: { owned: false, bought: false, x: 1865, y: 1120, a: 0, towed: false },
        },
        lastSafe: { x: 998, y: 1088 },
      },
      stats: { str: fair.str, int: fair.int, cha: fair.cha, karma: 0, hp: hpMax, hpMax: hpMax, heat: 0, buzz: 0 },
      money: { cash: T.start.cash.standard, bank: 0, rate: 2.0, rateHist: [], cds: [], loan: null, lien: 0, creditFrozenUntil: 0 },
      job: {
        ranks: { mcsticks: T.start.startJob, nli: null }, shiftsAtRank: { mcsticks: 0, nli: 0 },
        totalShifts: 0, rating: T.jobs.rating.start, weekNliWages: 0, weekNliShifts: 0, overtimeToday: 0,
        lastFullEnd: -1, ceoSinceDay: 0, office: null,
      },
      edu: { classes: { biz: 0, kin: 0, thr: 0 }, degrees: { biz: false, kin: false, thr: false } },
      perks: { owned: [], pending: [] },
      items: {
        smokes: 0, pills: 0, gum: 0, paper: 0, scratch: 0, takeout: [], knife: 0, knuckles: 0,
        gun: 0, ammo: 0, vest: 0, alarm: 0, phone: 0, skateboard: 0, prodeck: 0, booze: 0,
        snow: 0, shirt: 0, scraps: [], coupon: 0, diplomas: [],
      },
      homes: { owned: [T.start.startPlace.home], living: T.start.startPlace.home, lets: {} },
      furniture: { owned: {}, storage: [] },
      stocks: stocks(null),
      tip: null,
      trade: { rep: {}, visited: {}, smuggleProfit: 0, tours: 0, demand: {}, tourDemand: {}, tourWeek: {}, buyers: [0, 0, 0, 0, 0] },
      fight: { won: 0, champion: false, ringBouts: 0 },
      casino: { points: 0, barredUntil: 0, suspicion: 0, winToday: 0, shoe: null, lastBet: 0 },
      crime: { bankRobDays: [] },
      daily: {
        tv: {}, beers: 0, gambleKarma: 0, uofsKarma: 0, seminars: 0, paper: 0, chess: 0, nap: 0,
        benchNap: 0, online: 0, dartsPractice: 0, dartsMatches: 0, bjHands: 0, homePerk: 0,
        charity: 0, ducks: 0, preacher: 0, skate: 0, soup: 0, leftovers: 0, relax: 0,
        secondWind: 0, vipDrinks: 0, falls: 0, forecastSeen: false,
        campaign: { rally: 0, tvAd: 0, doorKnock: 0, kissBabies: 0, intimidate: 0, bribe: 0 },
      },
      weekly: { index: 0, openMic: 0, party: 0, mchollandTip: 0, bankRob: 0 },
      npc: {
        harold: { gave10: 0, bottles: 0, takeout: 0, shirt: false, branch: null, stage: 'start', hiredDay: 0, repayDay: 0 },
        kid: { packs: 0, gumDays: 0, lastGumDay: 0, branch: null, stage: 'start', dead: false, contestDay: 0 },
        dealer: { bought: 0, credit: null, creditEnded: false, goonsDue: false, stage: 'red', turnedInDay: 0 },
        mcholland: { stage: 'none', bribedUntil: 0 },
        crease: { stage: 'none' },
      },
      election: {
        status: 'none', path: null, nominatedDay: 0, poll: 0, campaignDay: 0, chest: 0, debateDone: false,
        decrees: [], decreesUsed: [], offer: [], nextDecreeDay: 0, retryFromDay: 0, flipMornings: 0, runs: 0, cityName: null,
      },
      world: {
        weather: T.weather.day1, tomorrow: T.weather.day1, forecast: T.weather.day1, todayHadRain: false,
        encounters: [], cityEvent: null, skateContestDay: 0,
      },
      jail: null,
      pending: null,
      msgs: [],
      log: { today: [], yesterday: [] },
      journal: { hintsSeen: {}, tracked: null },
      records: {
        falls: 0, carHits: 0, fightsWon: 0, ringWins: 0, jailDays: 0, jailWorkouts: 0,
        robberies: 0, bankRobberies: 0, hospital: 0, shiftsMcsticks: 0, citiesVisited: 0, spent: 0,
      },
      history: { nw: [], str: [], int: [], cha: [], karma: [] },
      achievements: {},
      flags: {},
      over: false,
      result: null,
    };
  }

  /** @returns {number} a clamped whole stat for a new character. */
  function startStat(v, fallback) {
    var n = Math.floor(Number(v));
    if (!isFinite(n)) n = fallback;
    return SR.util.clamp(n, 0, SR.tuning.start.statCap);
  }

  /**
   * Builds a new game (GDD §4.2, §5; BALANCE B-02). The rolls it needs (the starting savings rate,
   * the stock start prices) come from a stream derived from the seed, so the same options always
   * give the same state; state.rng.rules is the rules stream seeded with `seed`, which the caller
   * installs with SR.rng.rules.setState(state.rng.rules) (or SR.rng.rules.seed(state.seed)).
   * @param {{seed: number, name: string, stats: {str: number, int: number, cha: number},
   *   difficulty: string, length: number, tutorial: boolean, look: object, rng: object}=} opts
   *   stats are the final distributed values (default Fair start 7 / 7 / 7); difficulty
   *   'relaxed' | 'standard' | 'hardcore'; length 15 | 40 | 100 | 0 (Unlimited) | 7..365 (P2);
   *   rng overrides the creation stream (tests)
   * @returns {object} the state
   */
  function create(opts) {
    opts = opts || {};
    var T = SR.tuning;
    var s = defaults();
    var seed = opts.seed === undefined || opts.seed === null ? DEFAULT_SEED : opts.seed;
    var rng = opts.rng || SR.rng.create(SR.util.hash(seed, 'newgame'));

    s.seed = seed;
    s.rng.rules = SR.rng.create(seed).state();

    var diff = DIFFICULTIES.indexOf(opts.difficulty) >= 0 ? opts.difficulty : 'standard';
    s.mode.difficulty = diff;
    if (opts.length !== undefined && isFinite(Number(opts.length))) s.mode.length = Math.max(0, Math.floor(Number(opts.length)));
    if (opts.tutorial !== undefined) s.mode.tutorial = !!opts.tutorial;
    s.money.cash = T.start.cash[diff];

    var fair = T.start.fairStart, st = opts.stats || {};
    s.stats.str = startStat(st.str, fair.str);
    s.stats.int = startStat(st.int, fair.int);
    s.stats.cha = startStat(st.cha, fair.cha);

    var name = typeof opts.name === 'string' ? opts.name.trim().slice(0, T.start.nameMax).trim() : '';
    if (name) s.player.name = name;
    if (opts.look && SR.util.isObject(opts.look)) s.player.look = SR.util.clone(opts.look);

    // The cheat name (GDD §5): 555 in every stat, $10,000, renamed, achievements and Hall of Fame off.
    var cheat = T.start.cheat;
    if (name && name.toUpperCase() === cheat.name) {
      s.mode.cheat = true;
      s.stats.str = s.stats.int = s.stats.cha = cheat.stats;
      s.money.cash = cheat.cash;
      s.player.name = cheat.rename;
    }

    s.stats.hpMax = T.start.hpMaxBase + s.stats.str;
    s.stats.hp = s.stats.hpMax;

    // B-09 rateStart: rand(10..30) / 10 % per day; B-10 start prices: base + rand(-j..j).
    s.money.rate = rng.int(T.bank.rateStart.rand[0], T.bank.rateStart.rand[1]) / T.bank.rateStart.div;
    var prices = {};
    T.stocks.tickers.forEach(function (t) { prices[t] = T.stocks[t].start + rng.int(-T.stocks[t].jitter, T.stocks[t].jitter); });
    s.stocks = stocks(prices);
    return s;
  }

  SR.rules.state = {
    /** The schema version of this file (ARCHITECTURE §15: v1 in waves 1-2). */
    VERSION: VERSION,
    create: create,
    defaults: defaults,
  };
})();
