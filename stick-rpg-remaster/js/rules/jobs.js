// js/rules/jobs.js — owner: W1-E. SR.rules.jobs: the job ladder (apply, promotion requirements,
// promote), shifts (Full; P1 Half and Overtime), pay with its multipliers, the rating, the weekly
// NLI counters and bonus, the Monday bonus, the credit limit, titles and the CEO takeover hook
// (BALANCE B-05; GDD §4.6). Pure. Numbers: SR.tuning.jobs (B-05, with the office's row and the
// Networker / Workaholic values), SR.tuning.karma (B-04a), SR.tuning.endgame (legacy job ranks).
(function () {
  'use strict';
  var SR = window.SR;

  function T() { return SR.tuning.jobs; }
  function refuse(reason, vars) { return { ok: false, reason: reason, vars: vars || {} }; }
  function perk(s, id) { return !!(SR.features.perks && SR.rules.perks.has(s, id)); }
  function feature(def) { return !def.feature || !!SR.features[def.feature]; }
  function decreeActive(s, id) { return ((s.election && s.election.decrees) || []).indexOf(id) >= 0; }

  /** @returns {string[]} the job ids of a track in ladder order (B-05; feature-off rungs included). */
  function ladder(track) { return T().ladder[track] || []; }
  /** @returns {number} shifts needed at the current rank to reach `next` (Networker: one fewer, min 0; B-05). */
  function shiftsNeeded(s, next) {
    var n = T()[next].shifts || 0;
    if (perk(s, 'networker')) n = Math.max(0, n + T().networker);
    return n;
  }
  /** @returns {object} the variant's row of B-05 shift.* ({ min, karma, counts, payMult, hp, perDay }). */
  function variantRow(variant) { return T().shift[variant]; }
  function variantOn(variant) { return variant === 'full' || !!SR.features.hustles; }

  var jobs = {
    ladder: ladder,

    /**
     * The next rung of a track and every requirement you still miss (GDD §4.6: INT (orig), CHA from
     * Salesperson, shifts at the current rank, rating ≥ 0.9 for VP and CEO with `hustles`).
     * @returns {{ok: boolean, next: (string|null), missing: {key: string, need: number, have: number}[]}}
     */
    promotion: function (s, track) {
      var cur = s.job.ranks[track] || null, list = ladder(track);
      var i = cur ? list.indexOf(cur) + 1 : 0;
      var next = list[i] || null;
      if (!next || !feature(SR.reg.job[next])) return { ok: false, next: null, missing: [{ key: 'top', need: 0, have: 0 }] };
      var row = T()[next], missing = [];
      if (s.stats.int < row.int) missing.push({ key: 'int', need: row.int, have: s.stats.int });
      if (s.stats.cha < row.cha) missing.push({ key: 'cha', need: row.cha, have: s.stats.cha });
      if (cur) {
        var need = shiftsNeeded(s, next), have = s.job.shiftsAtRank[track] || 0;
        if (have < need) missing.push({ key: 'shifts', need: need, have: have });
      }
      if (SR.features.hustles && row.rating && s.job.rating < row.rating) {
        missing.push({ key: 'rating', need: row.rating, have: Math.round(s.job.rating * 100) / 100 });
      }
      return { ok: missing.length === 0, next: next, missing: missing };
    },

    /**
     * Whether you can take a track's entry job (NLI Janitor at INT 20; McSticks if you left it).
     * @returns {{ok: boolean, next: (string|null), missing: object[], reason?: string}}
     */
    canApply: function (s, track) {
      if (s.job.ranks[track]) return { ok: false, next: null, missing: [], reason: 'reason.hired' };
      return jobs.promotion(s, track);
    },

    /** @returns {object} a refusal for the first missing requirement (UI copy: "Need INT 75 (you: 61)"). */
    missingReason: function (p) {
      var m = p.missing[0];
      if (!m) return refuse('reason.topRank');
      if (m.key === 'top') return refuse('reason.topRank');
      if (m.key === 'shifts') return refuse('reason.needShifts', { need: m.need, have: m.have });
      if (m.key === 'rating') return refuse('reason.needRating', { need: m.need, have: m.have });
      return refuse('reason.needStat', { stat: m.key.toUpperCase(), min: m.need, have: m.have });
    },

    /**
     * One rung per request (orig): applying takes the entry job; a promotion gives +3 karma (orig)
     * and a stamp; reaching CEO starts the takeover clock. The new boss's voicemail is the
     * building's (W2-Money / W2-Food data).
     * @returns {{ok: boolean, reason?: string, vars?: object, from?: string, to?: string, events?: object[], stamps?: object[], log?: object[]}}
     */
    promote: function (s, track) {
      var p = jobs.promotion(s, track);
      if (!p.ok) return jobs.missingReason(p);
      var from = s.job.ranks[track] || null, to = p.next;
      s.job.ranks[track] = to;
      s.job.shiftsAtRank[track] = 0;
      var out = { ok: true, from: from, to: to, events: [{ name: 'promote', payload: { track: track, from: from, to: to } }],
        stamps: [], log: [], deltas: [{ kind: 'job', key: track, n: 1, from: from, to: to }] };
      if (from) {
        var k0 = s.stats.karma;
        SR.rules.stats.karma(s, SR.tuning.karma.changes.promotion);
        out.deltas.push({ kind: 'karma', n: s.stats.karma - k0, from: k0, to: s.stats.karma });
        out.stamps.push({ key: 'stamp.jobs.' + to, vars: {} });
        // The log entry is delivered by the pipeline's merge (SR.rules.effects.merge).
        out.log.push({ kind: to === 'ceo' ? 'promotedCeo' : 'promoted', vars: { job: to, title: SR.text('job.' + to) } });
      } else {
        out.stamps.push({ key: 'stamp.jobs.hired', vars: { title: SR.text('job.' + to) } });
      }
      if (to === 'ceo') s.job.ceoSinceDay = s.clock.day;
      return out;
    },

    /**
     * The hourly wage of a job after the Relaxed wage bonus (B-16) and Four-Day Week (B-17).
     * @returns {number} $/h
     */
    wage: function (s, id) {
      var w = T()[id] ? T()[id].wage : 0;
      if (s.mode.difficulty === 'relaxed') w *= T().relaxedWages;
      if (decreeActive(s, 'fourDayWeek')) w *= T().fourDayWeek;
      return w;
    },

    /** @returns {{min: number, hp: number}} the time and HP cost of a shift variant (Workaholic: no OT HP). */
    shiftCost: function (s, variant) {
      var v = variantRow(variant || 'full');
      var hp = v.hp || 0;
      if (variant === 'overtime' && perk(s, 'workaholic')) hp = v.workaholicHp;
      return { min: v.min, hp: hp };
    },

    /**
     * Whether a shift can start now (before its cost is paid): hired on the track; Half and
     * Overtime need `hustles`; Overtime only right after a Full shift with nothing in between
     * (`job.lastFullEnd == now`), once a day (twice with Workaholic) and with HP > 10.
     * @returns {{ok: boolean, reason?: string, vars?: object}}
     */
    canWork: function (s, track, variant) {
      variant = variant || 'full';
      if (!s.job.ranks[track]) return refuse('reason.notHired');
      if (!variantRow(variant) || !variantOn(variant)) return refuse('reason.featureOff');
      if (variant === 'overtime') {
        var ot = variantRow('overtime');
        var per = perk(s, 'workaholic') ? ot.workaholicPerDay : ot.perDay;
        if (s.job.lastFullEnd !== s.clock.min) return refuse('reason.overtimeNotNow');
        if ((s.job.overtimeToday || 0) >= per) return refuse('reason.dailyLimit');
        var hp = jobs.shiftCost(s, 'overtime').hp;
        if (hp && !(s.stats.hp > hp)) return refuse('reason.tooHurt');
      }
      return { ok: true };
    },

    /**
     * A shift's pay and counters, applied after its time (and HP) cost was paid, so the clock
     * already reads the shift's end (ARCHITECTURE §6.2). Pay = wage × hours × (1.5 for Overtime) ×
     * m (the hustle multiplier, 0.7-1.3; Auto 1.0) through the lien; Full gives +1 karma and counts
     * one shift, Half 0.5; the first shift of a Monday gives +1 CHA (P1 `calendar`); the rating
     * follows m (P1 `hustles`).
     * @param {number=} m the pay multiplier (default 1.0)
     * @returns {{ok: boolean, reason?: string, pay?: number, events?: object[], deltas?: object[]}}
     */
    work: function (s, track, variant, m) {
      variant = variant || 'full';
      var rank = s.job.ranks[track];
      if (!rank) return refuse('reason.notHired');
      if (!variantRow(variant) || !variantOn(variant)) return refuse('reason.featureOff');
      var h = T().hustle, v = variantRow(variant);
      m = typeof m === 'number' && isFinite(m) ? SR.util.clamp(m, h.m[0], h.m[1]) : h.auto;
      var pay = Math.round(jobs.wage(s, rank) * v.min / 60 * (v.payMult || 1) * m);
      var out = { ok: true, pay: pay, deltas: [], events: [] };
      var got = SR.rules.bank.income(s, pay, 'wage', 'cash');
      out.deltas = out.deltas.concat(got.deltas);
      if (v.karma) {
        var k0 = s.stats.karma;
        SR.rules.stats.karma(s, v.karma);
        out.deltas.push({ kind: 'karma', n: s.stats.karma - k0, from: k0, to: s.stats.karma });
      }
      var count = v.counts || 0;
      s.job.shiftsAtRank[track] = (s.job.shiftsAtRank[track] || 0) + count;
      s.job.totalShifts = (s.job.totalShifts || 0) + count;
      if (track === 'mcsticks') s.records.shiftsMcsticks = (s.records.shiftsMcsticks || 0) + count;
      if (track === 'nli') {
        s.job.weekNliWages = (s.job.weekNliWages || 0) + pay;
        s.job.weekNliShifts = (s.job.weekNliShifts || 0) + count;
      }
      if (variant === 'full') s.job.lastFullEnd = s.clock.min;
      if (variant === 'overtime') s.job.overtimeToday = (s.job.overtimeToday || 0) + 1;
      // Motivation Monday (P1 `calendar`): +1 CHA on the first shift of a Monday.
      var first = !(s.daily.shifts > 0);
      s.daily.shifts = (s.daily.shifts || 0) + 1;
      if (first && SR.features.calendar && SR.rules.time.weekday(s) === 0) {
        var mb = T().mondayBonus, c0 = s.stats[mb.stat], got2 = SR.rules.stats.add(s, mb.stat, mb.n, 'reward');
        out.deltas.push({ kind: 'stat', key: mb.stat, n: got2, from: c0, to: s.stats[mb.stat] });
      }
      if (SR.features.hustles) s.job.rating = Math.round((s.job.rating + T().rating.alpha * (m - s.job.rating)) * 10000) / 10000;
      out.events.push({ name: 'shift', payload: { track: track, rank: rank, variant: variant, m: m, pay: pay } });
      return out;
    },

    /**
     * The NLI weekly bonus paid on Friday night (night step 4): Executive 10 %, VP 20 %, CEO 30 %
     * of the week's NLI wages (B-05), through the lien.
     * @returns {{pct: number, amount: number, toLien: number}|null}
     */
    weeklyBonus: function (s) {
      var wb = T().weeklyBonus, rank = s.job.ranks.nli, pct = rank && typeof wb[rank] === 'number' ? wb[rank] : 0;
      if (!pct) return null;
      var amount = Math.floor((s.job.weekNliWages || 0) * pct);
      if (!amount) return null;
      var got = SR.rules.bank.income(s, amount, 'wage', 'cash');
      return { pct: pct, amount: amount, toLien: got.toLien };
    },

    /** @returns {number} your credit limit: the best of your jobs' (B-05), the office's in office. */
    creditLimit: function (s) {
      var best = 0;
      Object.keys(s.job.ranks).forEach(function (track) {
        var id = s.job.ranks[track];
        if (id && T()[id]) best = Math.max(best, T()[id].credit);
      });
      if (s.job.office) best = Math.max(best, T().office.credit);
      return best;
    },

    /**
     * Your displayed title: the office if you hold it ('president' | 'dictator'), else your best
     * job by legacy rank (ties: the better wage, then NLI). Text key: 'job.' + the result.
     * @returns {string|null}
     */
    bestTitle: function (s) {
      if (s.job.office) return s.job.office;
      var ranks = SR.tuning.endgame.legacy.jobRanks, best = null;
      Object.keys(s.job.ranks).forEach(function (track) {
        var id = s.job.ranks[track];
        if (!id) return;
        if (!best) { best = id; return; }
        var a = ranks[id] || 0, b = ranks[best] || 0;
        if (a > b || (a === b && (T()[id].wage > T()[best].wage || (T()[id].wage === T()[best].wage && track === 'nli')))) best = id;
      });
      return best;
    },

    /** @returns {number} the legacy job rank (B-18): cook 0 ... CEO 6, office 7. */
    legacyRank: function (s) {
      var ranks = SR.tuning.endgame.legacy.jobRanks;
      if (s.job.office) return ranks.office;
      var best = 0;
      Object.keys(s.job.ranks).forEach(function (t) { var id = s.job.ranks[t]; if (id) best = Math.max(best, ranks[id] || 0); });
      return best;
    },

    /** @returns {{skin: string, step: number}|null} the hustle skin of your rank on a track (B-05 hustle.skins). */
    hustleSkin: function (s, track) {
      var id = s.job.ranks[track], h = T().hustle;
      if (!id || !h.skins[id]) return null;
      return { skin: h.skins[id], step: (h.pitchStep && h.pitchStep[id]) || 0 };
    },

    /** @returns {boolean} the CEO takeover is due: your third week as CEO, once (B-05; P1 `hustles`). */
    takeoverDue: function (s) {
      var c = T().ceoTakeover, since = s.job.ceoSinceDay, day = s.clock.day;
      return !!(SR.features.hustles && s.job.ranks.nli === 'ceo' && since && !s.flags.ceoTakeover &&
        day >= since + c.fromDays && day < since + c.toDays);
    },

    /**
     * Resolves the takeover (the Boardroom at double D): m ≥ 1.2 pays $20,000 (through the lien);
     * a loss only brings the voicemail. Marks it done.
     * @returns {{won: boolean, bonus: number}}
     */
    takeover: function (s, m) {
      var c = T().ceoTakeover;
      s.flags.ceoTakeover = true;
      var won = m >= c.mNeed;
      if (won) SR.rules.bank.income(s, c.bonus, 'prize', 'cash');
      return { won: won, bonus: won ? c.bonus : 0 };
    },
  };

  SR.rules.jobs = jobs;

  // --- named functions for the McSticks and NLI rows ---
  function trackOf(params, arg) { return arg !== undefined ? arg : (params && params.track) || 'nli'; }
  function res(r) { return r.ok ? r : { ok: false, reason: r.reason, vars: r.vars }; }
  /** Cost: a shift's minutes by params.variant (ARCHITECTURE §6.3: cost: { min: 'shift.min' }). */
  SR.def.fn('shift.min', function (s, params) { return jobs.shiftCost(s, (params && params.variant) || 'full').min; });
  /** Cost: a shift's HP (Overtime -10, none with Workaholic). */
  SR.def.fn('shift.hp', function (s, params) { return jobs.shiftCost(s, (params && params.variant) || 'full').hp; });
  SR.def.fn('jobs.canWork', function (s, params, ctx, track) { return jobs.canWork(s, trackOf(params, track), (params && params.variant) || 'full'); });
  SR.def.fn('jobs.work', function (s, params, ctx, track) {
    params = params || {};
    return res(jobs.work(s, trackOf(params, track), params.variant || 'full', params.m));
  });
  SR.def.fn('jobs.canPromote', function (s, params, ctx, track) {
    var p = jobs.promotion(s, trackOf(params, track));
    return p.ok ? { ok: true } : jobs.missingReason(p);
  });
  SR.def.fn('jobs.canApply', function (s, params, ctx, track) {
    var p = jobs.canApply(s, trackOf(params, track));
    if (p.reason) return refuse(p.reason);
    return p.ok ? { ok: true } : jobs.missingReason(p);
  });
  SR.def.fn('jobs.promote', function (s, params, ctx, track) { return res(jobs.promote(s, trackOf(params, track))); });
  SR.def.fn('jobs.apply', function (s, params, ctx, track) {
    track = trackOf(params, track);
    if (s.job.ranks[track]) return refuse('reason.hired');
    return res(jobs.promote(s, track));
  });
  /** The hustle skin of the row's track (ARCHITECTURE §6.3: minigame: { skin: 'jobs.hustleSkin' }). */
  SR.def.fn('jobs.hustleSkin', function (s, params, ctx, track) {
    var h = jobs.hustleSkin(s, trackOf(params, track));
    return h ? h.skin : null;
  });
})();
