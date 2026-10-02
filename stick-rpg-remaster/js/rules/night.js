// js/rules/night.js — owner: W2-RulesE (W1-E in wave 1). SR.rules.night.run: the night, the only place the day advances.
// Every nightly rule of the game is a numbered step of GDD §4.7, run in that fixed order:
//   0 capture · 1 stocks · 2 bank · 3 income · 4 weekly · 5 election · 6 HP restore ·
//   7 furniture · 8 the day advances · 9 meters and counters · 10 timers · 11 messages ·
//   12 morning · 13 end
// kind 'sleep' runs them all; 'jail' runs 0-5, 8 (wake 08:00 in the cell), 9, 10 (+ jail.daysLeft
// - 1, no encounters), 11, 12 (a one-line report), 13; 'hospital' runs 0-5, 6 as HP = 50 % of HP
// max, 8 (wake 12:00), 9-13 (no furniture). Returns the Report of ARCHITECTURE §6.6.
// Pure; every draw comes from ctx.rng (the rules stream). Numbers: SR.tuning.time, sleep,
// training, election, world, health (BALANCE B-01, B-03, B-07, B-17, B-15, B-31).
(function () {
  'use strict';
  var SR = window.SR;

  var ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  var SUBSETS = {
    sleep: ALL,
    jail: [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13],
    hospital: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13],
  };
  // Retention, not balance (ARCHITECTURE §15): history is daily to day 120, then every 7th morning.
  var HISTORY_DAILY_TO = 120, HISTORY_EVERY = 7;
  // Markets section: at most this many movers are listed (the rest stay in the markets app).
  var MOVERS_SHOWN = 3;
  // The day-365 phone call and sports car (orig), in any mode.
  var ANNIVERSARY = 365;
  // The weathers that get a morning weather alert (GDD §4.7 step 11, §3.12: gusts at the edges,
  // fog banks over them); a storm (15 % of rain days) gets one too.
  var WEATHER_ALERTS = ['windy', 'fog'];
  // Floating point, not balance: hpMax × (0.25 + 0.10) is 62.99999999999999 at HP max 180, so the
  // B-07 floor would lose 1 HP. The exact product is a multiple of 0.05; the error is < 1e-12.
  var FLOOR_EPS = 1e-8;

  function weekdayOf(day) { return SR.rules.time.weekdayOf(day); }
  function decreeActive(s, id) { return ((s.election && s.election.decrees) || []).indexOf(id) >= 0; }
  function round1(x) { return Math.round(x * 10) / 10; }
  /** @returns {string} money for a report line ('$1,240'); lines carry display strings next to raw numbers. */
  function $(n) { return SR.text.money(n); }
  /** @returns {string} a signed whole number ('+2', '-2'). */
  function signed(n) { return (n > 0 ? '+' : '') + n; }

  /**
   * The B-07 restore of a night's sleep, before the cap: floor(hpMax × (base + bed + freezer +
   * home)) + flat - 20 with a pill, at least 0 (night step 6).
   * @param {boolean=} pill a caffeine pill is used tonight (default: owned and the toggle on)
   * @returns {number}
   */
  function restoreHp(s, pill) {
    var T = SR.tuning.sleep, b = SR.rules.homes.sleepBonus(s);
    if (pill === undefined) pill = s.items.pills > 0 && s.clock.pillAuto !== false;
    return Math.max(0, Math.floor(s.stats.hpMax * (T.base + b.total) + FLOOR_EPS) + T.flat - (pill ? T.pill : 0));
  }

  /** Adds a report line. */
  function line(R, section, icon, key, vars, weight) {
    R.lines.push({ section: section, icon: icon, key: key, vars: vars || {}, weight: weight || 0 });
  }

  /** Zeroes a counters object in place: numbers → 0, booleans → false, nested objects recursively. */
  function zero(o) {
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (typeof v === 'number') o[k] = 0;
      else if (typeof v === 'boolean') o[k] = false;
      else if (Array.isArray(v)) o[k] = [];
      else if (v && typeof v === 'object') zero(v);
    });
    return o;
  }

  /**
   * Folds a partial Result of another rule module into the night: delivers its msgs (the inbox,
   * with the 150 retention rule of SR.rules.effects) and log entries unless `delivered` (a result of
   * SR.rules.effects.run has delivered them already), and appends its rule events and report lines.
   * @returns {*} part
   */
  function absorb(s, R, part, delivered) {
    if (!part || typeof part !== 'object') return part;
    if (!delivered) {
      (part.msgs || []).forEach(function (m) { SR.rules.effects.addMsg(s, m.key, m.vars); });
      (part.log || []).forEach(function (l) { SR.rules.log.add(s, l.kind, l.vars); });
    }
    (part.events || []).forEach(function (e) { R.events.push(e); });
    (part.lines || []).forEach(function (l) { R.lines.push(l); });
    return part;
  }

  // ------------------------------------------------------------------------------------------
  // The steps. Each is step(s, ctx, R, f) where f holds the facts captured at step 0 and the
  // messages queued for step 11.
  var steps = {};

  /** 0. Capture the facts of the day being ended (before any step changes them). */
  steps[0] = function capture(s, ctx, R, f) {
    f.endedDay = s.clock.day;
    f.weekday = weekdayOf(f.endedDay);
    f.market = SR.rules.time.isMarketDay(f.endedDay);
    f.rain = !!s.world.todayHadRain;
    f.falls = s.daily.falls || 0;
    f.casinoWin = s.casino.winToday || 0;
    f.nliShifts = s.job.weekNliShifts || 0;
    f.pill = R.kind === 'sleep' && s.items.pills > 0 && s.clock.pillAuto !== false;
    f.alarm = R.kind === 'sleep' && s.items.alarm > 0;
    f.cityEvent = SR.rules.calendar.cityEvent(s);
    var ce = s.world.cityEvent;
    f.rebound = !!(SR.features.calendar && ce && ce.id === 'stockScare' && ce.day === f.endedDay - 1);
    f.msgs = [];
  };

  /** 1. Stocks (market days only): the tick with its quirks and the tip's shock; reverse splits. */
  steps[1] = function stocks(s, ctx, R, f) {
    if (!f.market) return;
    var res = SR.rules.stocks.tick(s, {
      rng: ctx.rng, day: f.endedDay,
      ceo: s.job.ranks.nli === 'ceo', nliShifts: f.nliShifts,
      casinoWin: f.casinoWin,
      rain: !!SR.features.weather && f.rain,
      falls: f.falls > 0,
      burgerDay: f.cityEvent === 'burgerDay',
      scare: f.cityEvent === 'stockScare',
      rebound: f.rebound,
    });
    var movers = res.movers.slice().sort(function (a, b) { return Math.abs(b.pct) - Math.abs(a.pct) || (a.ticker < b.ticker ? -1 : 1); });
    movers.slice(0, MOVERS_SHOWN).forEach(function (m) {
      line(R, 'markets', m.pct >= 0 ? 'star' : 'warning', m.pct >= 0 ? 'report.stockUp' : 'report.stockDown',
        { ticker: m.ticker, pct: SR.text.num(Math.abs(m.pct), 1), price: SR.text.money(m.to, { cents: true }) }, Math.abs(m.pct));
    });
    // The biggest mover also goes into the jail's one-line summary (UI §5.12).
    if (movers.length) f.topMover = { ticker: movers[0].ticker, arrow: movers[0].pct >= 0 ? '▲' : '▼', pct: SR.text.num(Math.abs(movers[0].pct), 0) };
    res.splits.forEach(function (sp) {
      line(R, 'markets', 'info', 'report.split', { ticker: sp.ticker, price: SR.text.money(sp.to, { cents: true }), n: sp.leftover, money: $(sp.paid) }, 50);
    });
    if (res.tip && res.tip.seen) {
      line(R, 'markets', 'info', res.tip.truthful ? 'report.tipRight' : 'report.tipWrong',
        { ticker: res.tip.ticker, dir: res.tip.dir, arrow: res.tip.dir === 'up' ? '▲' : '▼' }, 40);
    }
    res.logs.forEach(function (e) { SR.rules.log.add(s, e.kind, e.vars); });
  };

  /** 2. Bank: rate step, savings interest, CD maturities, loan interest and countdown, default. */
  steps[2] = function bank(s, ctx, R, f) {
    var B = SR.rules.bank;
    B.rateStep(s, ctx.rng);
    var intr = B.interest(s);
    if (intr > 0) {
      var got = B.income(s, intr, 'interest', 'bank');
      line(R, 'money', 'bank', 'report.interest', { n: intr, money: $(intr), rate: SR.text.num(B.paidRate(s), 2), lien: got.toLien }, 30);
    } else {
      line(R, 'money', 'rateboard', 'report.rate', { rate: SR.text.num(B.paidRate(s), 2) }, 5);
    }
    B.maturities(s).forEach(function (cd) {
      line(R, 'money', 'cd', 'report.cdMatured', { n: cd.amount, money: $(cd.amount), interest: $(cd.interest) }, 25);
    });
    var ln = B.loanNight(s);
    if (!ln) return;
    if (ln.due) {
      var d = absorb(s, R, B.default(s));
      if (d.dead) {
        line(R, 'money', 'loan', 'report.loanDead', { n: d.owed, money: $(d.owed) }, 100);
      } else {
        line(R, 'money', 'loan', 'report.loanDefault', { n: d.owed, money: $(d.owed), lien: $(d.lien) }, 90);
        d.seized.forEach(function (x) {
          var what = x.kind === 'furniture' ? SR.text('furn.' + x.key) : x.kind === 'home' ? SR.text('home.' + x.key) : x.key;
          line(R, 'money', 'warning', 'report.seized.' + x.kind, { n: x.applied, money: $(x.applied), what: what }, 20);
        });
        f.msgs.push({ key: 'vm.penny.default', vars: { n: d.owed, money: SR.text.money(d.owed), lien: d.lien, lienMoney: SR.text.money(d.lien) } });
      }
      return;
    }
    // Step 2 counts down before it defaults, so the morning with 1 day left is the loan's last day:
    // tonight's step 2 runs the default (docs/requests/W2-Money.md 7).
    line(R, 'money', 'loan', ln.daysLeft === 1 ? 'report.loanDueTonight' : 'report.loanDays',
      { days: ln.daysLeft, n: ln.amount, money: $(ln.amount) }, ln.warn ? 60 : 20);
    if (ln.warn) f.msgs.push({ key: 'vm.penny.loan' + ln.warn, vars: { days: ln.daysLeft, n: ln.amount, money: SR.text.money(ln.amount) } });
  };

  /** 3. Income: rent from lets, the office salary, nightly decree cash; through the lien. */
  steps[3] = function income(s, ctx, R) {
    var B = SR.rules.bank, E = SR.tuning.election;
    SR.rules.homes.rents(s).forEach(function (r) {
      var got = B.income(s, r.amount, 'rent', 'bank');
      line(R, 'money', 'realestate', 'report.rent', { n: r.amount, money: $(r.amount), home: SR.text('home.' + r.id), lien: got.toLien }, 25);
    });
    if (s.job.office) {
      var sal = B.income(s, E.salary, 'salary', 'cash');
      line(R, 'money', 'election', 'report.salary', { n: E.salary, money: $(E.salary), lien: sal.toLien }, 30);
    }
    if (decreeActive(s, 'casinoLevy')) {
      var lev = B.income(s, E.casinoLevy, 'salary', 'cash');
      line(R, 'money', 'decree', 'report.casinoLevy', { n: E.casinoLevy, money: $(E.casinoLevy), lien: lev.toLien }, 20);
    }
    if (s.money.lien > 0) line(R, 'money', 'warning', 'report.lien', { n: s.money.lien, money: $(s.money.lien) }, 30);
  };

  /** 4. Weekly: the NLI bonus on Friday night. */
  steps[4] = function weekly(s, ctx, R, f) {
    if (f.weekday !== SR.tuning.jobs.weeklyBonus.weekday) return;
    var b = SR.rules.jobs.weeklyBonus(s);
    if (b) line(R, 'money', 'star', 'report.weeklyBonus', { n: b.amount, money: $(b.amount), pct: Math.round(b.pct * 100), lien: b.toLien }, 40);
  };

  /**
   * 5. Election (GDD §4.17, B-17): on a campaign night (jail and hospital nights too) the rival's
   * daily gain, then campaignDay + 1; the debate no-show penalty after day 4; election night after
   * campaign day 7 (SR.rules.election.electionNight rolls it); an unaccepted nomination lapses 14
   * days after the call. campaignDay is 1 on the first campaign day.
   */
  steps[5] = function election(s, ctx, R, f) {
    var el = s.election, T = SR.tuning.election, E = SR.rules.election;
    if (!el) return;
    if (el.status === 'campaign') {
      var drop = ctx.rng.int(T.rivalDaily[0], T.rivalDaily[1]);
      el.poll = round1(SR.util.clamp(el.poll - drop, T.pollClamp[0], T.pollClamp[1]));
      el.campaignDay += 1;
      line(R, 'election', 'ballot', 'report.election.rival', { n: drop, poll: el.poll }, 30);
      if (el.campaignDay === T.debate.day + 1 && !el.debateDone) {
        el.poll = round1(SR.util.clamp(el.poll + T.debate.noShow, T.pollClamp[0], T.pollClamp[1]));
        line(R, 'election', 'debate', 'report.election.noShow', { n: -T.debate.noShow, poll: el.poll }, 40);
      }
      if (el.campaignDay > T.campaignDays) {
        if (E && typeof E.electionNight === 'function') {
          var res = absorb(s, R, E.electionNight(s, ctx.rng)) || {};
          R.election = { won: !!res.won, poll: res.poll !== undefined ? res.poll : el.poll, roll: res.roll, path: res.path || el.path };
          line(R, 'election', 'election', R.election.won ? 'report.election.won' : 'report.election.lost',
            { poll: R.election.poll, roll: R.election.roll, path: R.election.path }, 100);
        } else {
          SR.util.warnOnce('night:electionNight', 'SR.rules.night: SR.rules.election.electionNight is not available yet');
        }
      }
    } else if (el.status === 'nominated' && f.endedDay >= el.nominatedDay + T.acceptWithin - 1) {
      el.status = 'none';
      el.retryFromDay = f.endedDay + T.retry;
      line(R, 'election', 'ballot', 'report.election.lapsed', { day: el.retryFromDay }, 50);
    }
  };

  /** 6. HP restore (B-07); the hospital night sets HP to 50 % of HP max instead (B-31). */
  steps[6] = function restore(s, ctx, R, f) {
    var st = s.stats;
    if (R.kind === 'hospital') {
      st.hp = Math.floor(SR.tuning.health.hospital.hpPct * st.hpMax);
      line(R, 'hospital', 'hp', 'report.hospital.hp', { hp: st.hp, max: st.hpMax }, 50);
      return;
    }
    var from = st.hp;
    st.hp = Math.min(st.hpMax, st.hp + restoreHp(s, f.pill));
    line(R, 'overnight', 'hp', 'report.hpRestored', { n: st.hp - from, hp: st.hp, max: st.hpMax }, 30);
  };

  /** 7. Nightly furniture gains: +2 per tier-1 stat piece, +4 per tier-2 (B-03, B-08b), in use only. */
  steps[7] = function furniture(s, ctx, R) {
    SR.rules.homes.nightly(s).forEach(function (g) {
      var n = SR.rules.stats.add(s, g.stat, g.n, 'furniture', R);   // R receives the `stat` rule event (W1-R request 12)
      line(R, 'overnight', g.stat, 'report.furniture', { n: n, stat: g.stat.toUpperCase(), piece: SR.text('furn.' + g.id) }, 20);
    });
  };

  /** 8. The day advances: weather, wake time (alarm, pill; 08:00 in jail, 12:00 in hospital). */
  steps[8] = function advance(s, ctx, R, f) {
    var TT = SR.tuning.time;
    s.clock.day += 1;
    R.day = s.clock.day;
    R.weekday = weekdayOf(R.day);
    SR.rules.calendar.rollWeather(s, ctx.rng);
    s.world.todayHadRain = s.world.weather === 'rain';
    var wake = TT.wake;
    if (R.kind === 'sleep') {
      if (f.alarm) wake -= TT.alarmMinus;
      if (f.pill) {
        wake -= TT.pillMinus;
        s.items.pills -= 1;
        line(R, 'overnight', 'pills', 'report.pillUsed', { left: s.items.pills }, 10);
      }
    } else if (R.kind === 'hospital') {
      wake = SR.tuning.health.hospital.wake;
    }
    s.clock.wake = Math.max(0, wake);
    s.clock.min = s.clock.wake;
    ctx.now = s.clock.min;   // the night's own context: later steps (arc effects) see the new morning
    R.events.push({ name: 'night', payload: { day: R.day, weekday: R.weekday, kind: R.kind } });
  };

  /** 9. Meters and counters: Heat decay, Buzz 0, decree stat effects, daily and weekly resets, the log roll. */
  steps[9] = function counters(s, ctx, R) {
    var T = SR.tuning.sleep, E = SR.tuning.election;
    var decay = T.heatDecay.base;
    if (decreeActive(s, 'toughOnCrime')) decay = T.heatDecay.toughOnCrime;
    else if (SR.features.karmaTiers) {
      var tier = SR.rules.stats.tier(s.stats.karma);
      if (tier === 'good' || tier === 'angelic') decay = T.heatDecay.good;
    }
    if (s.stats.heat > 0) SR.rules.stats.heat(s, -Math.min(decay, s.stats.heat));
    s.stats.buzz = T.buzzReset;
    if (decreeActive(s, 'statueOfMe')) {
      var k = SR.tuning.karma.changes.statueOfMe[s.job.office === 'dictator' ? 'dictator' : 'president'];
      SR.rules.stats.karma(s, k);
      line(R, 'overnight', 'decree', 'report.statue', { n: k, signed: signed(k) }, 10);
    }
    if (decreeActive(s, 'mandatoryHats')) {
      var n = SR.rules.stats.add(s, 'cha', E.mandatoryHats, 'reward', R);
      line(R, 'overnight', 'cha', 'report.hats', { n: n }, 10);
    }
    zero(s.daily);
    s.job.overtimeToday = 0;
    s.job.lastFullEnd = -1;
    s.casino.winToday = 0;
    var wk = SR.rules.time.week(s);
    if (s.weekly.index !== wk) {
      zero(s.weekly);
      s.weekly.index = wk;
      s.job.weekNliWages = 0;
      s.job.weekNliShifts = 0;
    }
    SR.rules.log.roll(s);
  };

  /** 10. Timers: the car tow, arcs, bank-robbery memory, the city event, the tip, encounters, jail days. */
  steps[10] = function timers(s, ctx, R, f) {
    var W = SR.tuning.world;
    ['junker', 'sports'].forEach(function (type) {
      var car = s.player.cars && s.player.cars[type];
      if (!car || !car.towed) return;
      var c = SR.rules.bank.charge(s, W.carTow.cash, 'tow');
      var lot = W.homeLots[type];
      car.towed = false;
      car.x = (lot[0] + lot[2]) / 2;
      car.y = (lot[1] + lot[3]) / 2;
      line(R, 'money', 'car', 'report.tow', { n: c.paid + c.writtenOff, money: $(c.paid + c.writtenOff), writtenOff: c.writtenOff }, 30);
    });
    if (SR.rules.arcs && typeof SR.rules.arcs.onEvent === 'function') {
      var ev = { name: 'night', payload: { day: s.clock.day, weekday: weekdayOf(s.clock.day), kind: R.kind } };
      var effects = SR.rules.arcs.onEvent(s, ev, ctx);
      if (effects && effects.length) {
        if (SR.rules.effects && typeof SR.rules.effects.run === 'function') absorb(s, R, SR.rules.effects.run(s, effects, ctx), true);
        else SR.util.warnOnce('night:effects', 'SR.rules.night: no effects runner for arc effects');
      }
    }
    if (s.crime && s.crime.bankRobDays) {
      var keep = SR.tuning.crime.bank.D.recentDays;
      s.crime.bankRobDays = s.crime.bankRobDays.filter(function (d) { return s.clock.day - d < keep; });
    }
    if (f.weekday === SR.rules.time.dayIndex('sun') && SR.features.calendar) {
      var e = SR.rules.calendar.rollCityEvent(s, ctx.rng);
      // A Heat Wave drawn for the Monday just begun forces its weather (step 8 rolled it already),
      // and a rainy morning it replaces is no rainy day (PPR's quirk reads todayHadRain).
      if (e && e.id === 'heatWave' && e.day === s.clock.day && SR.features.weather) {
        s.world.weather = SR.tuning.calendar.events.heatWave.weather;
        s.world.todayHadRain = s.world.weather === 'rain';
      }
    }
    if (SR.features.stockTips && SR.rules.time.isMarketDay(s.clock.day)) SR.rules.stocks.drawTip(s, ctx.rng);
    else s.tip = null;
    if (R.kind !== 'jail' && SR.features.encounters && SR.rules.encounters && typeof SR.rules.encounters.seed === 'function') {
      absorb(s, R, SR.rules.encounters.seed(s, ctx.rng));
    }
    if (R.kind === 'jail' && s.jail) {
      s.jail.daysLeft -= 1;
      s.jail.served = (s.jail.served || 0) + 1;
    }
  };

  /**
   * 11. Messages: the queued voicemails (loan warnings, default), the car-hit call, the weather alert
   * (P1 `weather`: a windy, foggy or stormy day; today's weather only, which the report shows anyway,
   * so it gives nothing of the forecast away) and the day-365 call and car.
   */
  steps[11] = function messages(s, ctx, R, f) {
    f.msgs.forEach(function (m) { SR.rules.effects.addMsg(s, m.key, m.vars); });
    if (s.flags.carHitVm) carHitCall(s, ctx, R);
    if (SR.features.weather) {
      var alert = SR.rules.calendar.storm(s) ? 'storm' : WEATHER_ALERTS.indexOf(s.world.weather) >= 0 ? s.world.weather : null;
      if (alert) SR.rules.effects.addMsg(s, 'vm.skywatch.' + alert, {});
    }
    if (s.clock.day === ANNIVERSARY) {
      var car = s.player.cars.sports, lot = SR.tuning.world.homeLots.sports;
      car.owned = true;
      car.towed = false;
      car.x = (lot[0] + lot[2]) / 2;
      car.y = (lot[1] + lot[3]) / 2;
      SR.rules.effects.addMsg(s, 'vm.crew.day365', {});
      line(R, 'today', 'sportscar', 'report.day365', {}, 80);
    }
  };

  /**
   * The morning after a car hit (GDD §3.10, B-15 carHit; docs/requests/W1-W.md 3): one of the three
   * ambulance-chaser voicemails (vm.carhit.1..3, en-city.js), 20 % of them with a settlement cheque
   * of base + rand(0..150) ($50-$200, income 'prize', paid to cash through the lien). Draws: the
   * voicemail, the cheque's chance, and its amount when it comes. Clears flags.carHitVm (several
   * hits in a day bring one call).
   */
  function carHitCall(s, ctx, R) {
    var C = SR.tuning.world.carHit, st = C.settlement;
    var k = ctx.rng.int(1, C.voicemails);
    var pay = ctx.rng.chance(st.chance) ? st.base + ctx.rng.int(st.rand[0], st.rand[1]) : 0;
    var got = pay ? SR.rules.bank.income(s, pay, 'prize', 'cash') : null;
    SR.rules.effects.addMsg(s, 'vm.carhit.' + k, { n: pay, money: SR.text.money(pay), cheque: pay > 0 });
    if (pay) line(R, 'money', 'money', 'report.carHitCheque', { n: pay, money: $(pay), lien: got.toLien }, 30);
    delete s.flags.carHitVm;
  }

  /**
   * 12. Morning: nomination check, a campaign day's event, office morning, achievements, history,
   * the "today" lines, the headline. Perk offers simply stay pending; the autosave (Hardcore: the
   * ironman slot) is written by the report scene through SR.save, outside the pure rules.
   */
  steps[12] = function morning(s, ctx, R, f) {
    var E = SR.rules.election;
    if (E && typeof E.nominationCheck === 'function') absorb(s, R, E.nominationCheck(s));
    // A campaign day's morning: the campaign event (P1 `civicPlus`, B-17 eventChance; W1-C draws
    // nothing while the flag is off).
    if (E && s.election && s.election.status === 'campaign' && typeof E.campaignMorning === 'function') absorb(s, R, E.campaignMorning(s, ctx.rng));
    if (E && s.job.office && typeof E.officeMorning === 'function') absorb(s, R, E.officeMorning(s, ctx.rng));
    if (SR.features.achievements && SR.rules.achievements && typeof SR.rules.achievements.evaluate === 'function') {
      var ids = SR.rules.achievements.evaluate(s, { name: 'night', payload: { day: s.clock.day, kind: R.kind } }, null);
      R.achievements = Array.isArray(ids) ? ids : [];
    }
    var day = s.clock.day;
    if (day <= HISTORY_DAILY_TO || (day - HISTORY_DAILY_TO) % HISTORY_EVERY === 0) {
      var h = s.history, st = s.stats;
      h.nw.push([day, SR.rules.endgame.netWorth(s)]);
      h.str.push([day, st.str]); h.int.push([day, st.int]); h.cha.push([day, st.cha]); h.karma.push([day, st.karma]);
    }
    R.weather = { today: s.world.weather };
    var storm = SR.rules.calendar.storm(s);
    // The storm belongs to the new day's log (after step 9's roll, and after a Heat Wave has had its
    // say at step 10), so tomorrow's paper can mention it (B-29 `storm`).
    if (storm) SR.rules.log.add(s, 'storm', {});
    line(R, 'weather', storm ? 'storm' : s.world.weather, storm ? 'report.weather.storm' : 'report.weather.' + s.world.weather, {}, 10);
    var cal = SR.rules.calendar.today(s);
    cal.bonuses.forEach(function (b) { line(R, 'today', 'star', 'report.today.' + b, {}, 20); });
    var ce = s.world.cityEvent;
    if (SR.features.calendar && ce && ce.day >= day && ce.day < day + 7 && (R.weekday === 0 || ce.day === day)) {
      line(R, 'today', 'info', ce.day === day ? 'report.event.' + ce.id : 'report.eventSoon',
        { event: SR.text('report.event.' + ce.id), weekday: SR.text('report.weekday.' + SR.tuning.time.weekdays[weekdayOf(ce.day)]) }, 30);
    }
    var unread = (s.msgs || []).filter(function (m) { return !m.read && !m.archived; }).length;
    if (unread) line(R, 'today', 'messages', unread === 1 ? 'report.unreadOne' : 'report.unread', { n: unread }, 25);
    if (s.stats.heat > 0) line(R, 'today', 'heat', 'report.heat', { n: s.stats.heat }, 15);
    if (R.kind === 'jail' && s.jail) {
      var got = R.lines.reduce(function (a, l) { return l.key === 'report.interest' ? a + l.vars.n : a; }, 0);
      var mv = (f && f.topMover) || null;
      line(R, 'jail', 'bail', mv ? 'report.jail.summaryMarket' : 'report.jail.summary', { interest: $(got), msgs: unread, days: s.jail.daysLeft,
        ticker: mv ? mv.ticker : null, arrow: mv ? mv.arrow : null, pct: mv ? mv.pct : null }, 50);
    }
    R.headline = SR.rules.news.headline(s);
  };

  /** 13. End: a Hardcore loan default ends in death; a timed game ends when day > length. */
  steps[13] = function end(s, ctx, R) {
    if (s.flags.dead) {
      R.dead = s.flags.dead;
      s.over = true;
      s.result = SR.rules.endgame.results(s, 'death');
    } else if (s.mode.length > 0 && s.clock.day > s.mode.length && !s.mode.keepPlaying) {
      R.ended = 'time';
      s.over = true;
      s.result = SR.rules.endgame.results(s, 'time');
    }
  };

  var night = {
    SUBSETS: SUBSETS,
    steps: steps,

    /**
     * What tonight's sleep would do, without running it (the Sleep row's preview, the report's
     * forecast of the pill): the HP restored after the cap, the pill, and the furniture gains.
     * @returns {{hp: number, pill: boolean, restore: number, gains: {id: string, stat: string, n: number}[]}}
     */
    preview: function (s) {
      var pill = s.items.pills > 0 && s.clock.pillAuto !== false, n = restoreHp(s, pill);
      var hp = Math.min(s.stats.hpMax, s.stats.hp + n);
      // Step 7 runs after the restore, so Winded is judged on the restored HP.
      var after = { stats: Object.assign({}, s.stats, { hp: hp }), edu: s.edu };
      var gains = SR.rules.homes.nightly(s).map(function (g) {
        var a = SR.rules.stats.gain(after, g.stat, g.n, 'furniture').applied;
        after.stats[g.stat] += a;
        return { id: g.id, stat: g.stat, n: a };
      });
      return { hp: hp - s.stats.hp, pill: pill, restore: n, gains: gains };
    },
    restoreHp: restoreHp,

    /**
     * Runs the night.
     * @param {object=} ctx { rng, now, source } (default: the rules stream)
     * @param {object=} opts { kind: 'sleep' | 'jail' | 'hospital', bill, paid, writtenOff, cause
     *   (hospital: the Stick General lines), trace (an array: the step numbers are pushed as they run) }
     * @returns {object} the Report
     */
    run: function (s, ctx, opts) {
      opts = opts || {};
      // The night's own context: only the stream is shared, so nothing the night runs (arc effects)
      // can mark the caller's context (the action pipeline's, from health.down) as refused.
      ctx = { rng: (ctx && ctx.rng) || SR.rng.rules, now: s.clock.min, source: (ctx && ctx.source) || 'sim', params: {} };
      var kind = SUBSETS[opts.kind] ? opts.kind : 'sleep';
      var R = { kind: kind, day: s.clock.day, endedDay: s.clock.day, weekday: weekdayOf(s.clock.day), lines: [],
        headline: null, weather: { today: s.world.weather }, election: null, events: [], ended: null, dead: null };
      if (kind === 'hospital') {
        line(R, 'hospital', 'hp', 'report.hospital.bill', { n: opts.bill || 0, money: $(opts.bill || 0), paid: $(opts.paid || 0),
          writtenOff: $(opts.writtenOff || 0), off: opts.writtenOff || 0, cause: opts.cause || null }, 90);
      }
      var f = {};
      SUBSETS[kind].forEach(function (n) {
        if (opts.trace) opts.trace.push(n);
        night.steps[n](s, ctx, R, f);
      });
      if (kind === 'hospital') line(R, 'hospital', 'time', 'report.hospital.discharge', { min: s.clock.min, time: SR.text.time(s.clock.min, false) }, 60);
      return R;
    },
  };

  SR.rules.night = night;
})();
