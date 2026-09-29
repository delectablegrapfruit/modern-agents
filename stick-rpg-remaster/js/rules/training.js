// js/rules/training.js — owner: W2-RulesE (W1-E in wave 1). SR.rules.training: the gains of every training source of
// BALANCE B-03 with their daily limits and counters, the U of S karma (+1, at most +3 a day),
// class counts, degrees (P1 `degrees`: 20 classes → +25 once and +1 on later gains) and seminars
// (P1: stat ≥ 150, ≥ 10 classes in the track, 2 a day) (GDD §4.5). Cash, time and HP are the
// action's costs (the pipeline pays them); these functions apply the gains and counters.
// Pure. Numbers: SR.tuning.training (B-03).
(function () {
  'use strict';
  var SR = window.SR;

  function T() { return SR.tuning.training; }
  function refuse(reason, vars) { return { ok: false, reason: reason, vars: vars || {} }; }

  /** @returns {object} the degree tracks and their stats (B-03: biz → int, kin → str, thr → cha). */
  function tracks() { return T().degree.tracks; }
  /** @returns {string|null} the track a source counts a class for (B-03 `track`). */
  function classTrack(id) { return (T()[id] && T()[id].track) || null; }
  // Sources whose daily count lives in state.daily.<field> (the TV channels share daily.tv), and
  // the weekly one in state.weekly.<field> (Open Mic, once a calendar week).
  var DAILY_FIELD = { seminar: 'seminars', onlineCourse: 'online', paper: 'paper', chess: 'chess' };
  var WEEKLY_FIELD = { openMic: 'openMic' };
  var TV = ['tvNews', 'tvFitness', 'tvDating', 'tvMarket'];

  /** @returns {number} how many times the source was used today. */
  function usedToday(s, id) {
    if (TV.indexOf(id) >= 0) return (s.daily.tv && s.daily.tv[id]) || 0;
    var f = DAILY_FIELD[id];
    return f ? s.daily[f] || 0 : 0;
  }
  function countToday(s, id) {
    if (TV.indexOf(id) >= 0) { s.daily.tv = s.daily.tv || {}; s.daily.tv[id] = (s.daily.tv[id] || 0) + 1; return; }
    var f = DAILY_FIELD[id];
    if (f) s.daily[f] = (s.daily[f] || 0) + 1;
    var w = WEEKLY_FIELD[id];
    if (w) s.weekly[w] = (s.weekly[w] || 0) + 1;
  }

  var training = {
    /** @returns {string|null} the track of a class id ('classBiz' → 'biz'). */
    classTrack: classTrack,

    /**
     * A source's gain before the degree bonus and Winded (B-03 `gain`); Study follows the Public
     * Library Act (GDD §4.17: +3 INT) through W1-C's named fn decree.studyGain when it is loaded.
     * @returns {number}
     */
    gain: function (s, id) {
      var row = T()[id], fn = SR.reg.fn['decree.studyGain'];
      if (id === 'study' && typeof fn === 'function') return Number(fn(s, {}, {})) || row.gain;
      return row.gain;
    },

    /**
     * A source's minutes (B-03 `min`): Speed Reader (P1 `perks`) makes Study 90 min and the paper
     * 0 min.
     * @returns {number}
     */
    minutes: function (s, id) {
      var row = T()[id];
      if (!row) return 0;
      if (row.speedReaderMin !== undefined && SR.features.perks && SR.rules.perks.has(s, 'speedReader')) return row.speedReaderMin;
      return row.min;
    },

    /**
     * How many more times a source can be used today (the TV sub-screen's "views left"): its daily
     * limit minus today's uses (this week's for Open Mic); null for a source without a limit.
     * @returns {number|null}
     */
    left: function (s, id) {
      var row = T()[id];
      if (!row) return 0;
      if (row.weekly && WEEKLY_FIELD[id]) return Math.max(0, row.weekly - (s.weekly[WEEKLY_FIELD[id]] || 0));
      if (id === 'seminar') return Math.max(0, row.daily - (s.daily.seminars || 0));
      if (!row.daily) return null;
      return Math.max(0, row.daily - usedToday(s, id));
    },

    /** @returns {number} the HP a nap restores (B-03 `nap`: 15 % of HP max, floor; P1 `homesPlus`). */
    napHp: function (s) { return Math.floor(T().nap.hpPct * s.stats.hpMax); },

    /**
     * Whether a source can be used now: its daily limit (TV 2 a channel, Market Watch 1, the online
     * course 1, the paper 1, chess 3, seminars 2 across tracks), its weekly one (Open Mic) and, for a
     * seminar, seminarOk.
     * @param {object=} opts { track } for a seminar
     * @returns {{ok: boolean, reason?: string, vars?: object}}
     */
    can: function (s, id, opts) {
      var row = T()[id];
      if (!row) return refuse('reason.noTraining');
      if (id === 'seminar') return training.seminarOk(s, (opts && opts.track) || 'biz');
      if (row.daily && usedToday(s, id) >= row.daily) return refuse('reason.dailyLimit');
      if (row.weekly && WEEKLY_FIELD[id] && (s.weekly[WEEKLY_FIELD[id]] || 0) >= row.weekly) return refuse('reason.weeklyLimit');
      return { ok: true };
    },

    /**
     * Applies a source's gain (through SR.rules.stats.add: degree bonus, Winded, the cap), counts
     * it (daily and weekly limits, classes in a track) and adds the U of S karma (+1, at most +3 a
     * day). Other karma (smoking's -1), Buzz and HP are the action's own effects and costs.
     * @param {object=} opts { track } for a seminar; { ctx } the pipeline context (the preview's "(max)" note)
     * @returns {{ok: boolean, reason?: string, stat?: string, n?: number, karma?: number, events?: object[], deltas?: object[]}}
     */
    apply: function (s, id, opts) {
      var ok = training.can(s, id, opts);
      if (!ok.ok) return ok;
      var row = T()[id], track = id === 'seminar' ? (opts && opts.track) || 'biz' : classTrack(id);
      var stat = id === 'seminar' ? tracks()[track] : row.stat;
      var from = s.stats[stat];
      // The gain with its UI §4.3 feedback (the stamp, the Winded and maxed-out toasts), as the
      // `stat` effect gives it (SR.rules.effects.gainStat).
      var fb = { toasts: [], stamps: [] };
      var n = SR.rules.effects.gainStat(s, stat, training.gain(s, id), 'train', opts && opts.ctx, fb);
      var out = { ok: true, stat: stat, n: n, karma: 0, deltas: [{ kind: 'stat', key: stat, n: n, from: from, to: s.stats[stat] }],
        events: [{ name: 'train', payload: { id: id, stat: stat, n: n } }], toasts: fb.toasts, stamps: fb.stamps };
      countToday(s, id);
      if (track && id !== 'seminar') s.edu.classes[track] = (s.edu.classes[track] || 0) + 1;
      if (row.where === 'uofs') {
        var k = T().uofsKarma;
        if ((s.daily.uofsKarma || 0) < k.dailyMax) {
          var k0 = s.stats.karma;
          SR.rules.stats.karma(s, k.n);
          s.daily.uofsKarma = (s.daily.uofsKarma || 0) + k.n;
          out.karma = s.stats.karma - k0;
          out.deltas.push({ kind: 'karma', n: out.karma, from: k0, to: s.stats.karma });
        }
      }
      return out;
    },

    /**
     * A seminar is possible (P1 `degrees`): the track's stat ≥ 150, ≥ 10 classes in the track and
     * fewer than 2 seminars today (B-03).
     * @returns {{ok: boolean, reason?: string, vars?: object}}
     */
    seminarOk: function (s, track) {
      var row = T().seminar, stat = tracks()[track];
      if (!SR.features.degrees) return refuse('reason.featureOff');
      if (!stat) return refuse('reason.noTraining');
      if (s.stats[stat] < row.needStat) return refuse('reason.needStat', { stat: stat.toUpperCase(), min: row.needStat, have: s.stats[stat] });
      var cls = s.edu.classes[track] || 0;
      if (cls < row.needClasses) return refuse('reason.needClasses', { need: row.needClasses, have: cls });
      if ((s.daily.seminars || 0) >= row.daily) return refuse('reason.dailyLimit');
      return { ok: true };
    },

    /** @returns {{ok: boolean, reason?: string, vars?: object}} a degree can be granted now (P1 `degrees`). */
    canGraduate: function (s, track) {
      if (!SR.features.degrees) return refuse('reason.featureOff');
      if (!tracks()[track]) return refuse('reason.noTraining');
      if (s.edu.degrees[track]) return refuse('reason.graduated');
      var need = T().degree.classes, have = s.edu.classes[track] || 0;
      if (have < need) return refuse('reason.needClasses', { need: need, have: have });
      return { ok: true };
    },

    /**
     * Graduation (P1 `degrees`; the 1 h ceremony is the action's cost): +25 to the track's stat
     * once (before the degree's own +1 applies), the diploma, a stamp and the log entry.
     * @returns {{ok: boolean, reason?: string, stat?: string, n?: number, events?: object[], stamps?: object[], log?: object[], deltas?: object[]}}
     */
    graduate: function (s, track) {
      var ok = training.canGraduate(s, track);
      if (!ok.ok) return ok;
      var stat = tracks()[track], from = s.stats[stat];
      var n = SR.rules.stats.add(s, stat, T().degree.bonusStat, 'fixed');
      s.edu.degrees[track] = true;
      s.items.diplomas = (s.items.diplomas || []).concat([track]);
      // The log entry is delivered by the pipeline's merge (SR.rules.effects.merge).
      return { ok: true, stat: stat, n: n, deltas: [{ kind: 'stat', key: stat, n: n, from: from, to: s.stats[stat] }],
        events: [{ name: 'graduate', payload: { track: track } }],
        stamps: [{ key: 'stamp.training.' + track, vars: {} }],
        log: [{ kind: 'degree', vars: { track: track, name: SR.text('report.track.' + track) } }] };
    },
  };

  SR.rules.training = training;

  // --- named functions for the U of S, TV and other training rows ---
  function res(r) { return r.ok ? r : { ok: false, reason: r.reason, vars: r.vars }; }
  /** Effect: ['fn', 'training.apply', 'study'] (a seminar takes the track as a second argument or params.track). */
  SR.def.fn('training.apply', function (s, params, ctx, id, track) {
    return res(training.apply(s, id || params.id, { track: track || (params && params.track), ctx: ctx }));
  });
  /** Condition: the source's daily limit (and a seminar's requirements). */
  SR.def.fn('training.can', function (s, params, ctx, id, track) {
    return training.can(s, id || params.id, { track: track || (params && params.track) });
  });
  SR.def.fn('training.seminarOk', function (s, params, ctx, track) { return training.seminarOk(s, track || params.track); });
  SR.def.fn('training.canGraduate', function (s, params, ctx, track) { return training.canGraduate(s, track || params.track); });
  SR.def.fn('training.graduate', function (s, params, ctx, track) { return res(training.graduate(s, track || params.track)); });
  // Costs and amounts by name (a cost field or an effect argument cannot pass an argument):
  // cost: { min: 'training.studyMin' } / 'training.paperMin' (Speed Reader), ['heal', 'training.napHp'].
  SR.def.fn('training.studyMin', function (s) { return training.minutes(s, 'study'); });
  SR.def.fn('training.paperMin', function (s) { return training.minutes(s, 'paper'); });
  SR.def.fn('training.napHp', function (s) { return training.napHp(s); });
})();
