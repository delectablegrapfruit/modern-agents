// js/data/buildings/uofs.js — owner: W2-Civic. The University of Stick: the building, Dean Quill's
// greeting, and its rows (GDD §6.1, §4.5; BALANCE B-03):
//   P0: Study (free, +2 INT), Business class ($20, +4 INT), Gym (free, +2 STR, -4 HP; "Too hurt" at
//       HP ≤ 4); each 2 h, +1 karma per U of S activity, at most +3 a day (orig; the rules count it).
//   P1 `degrees`: Kinesiology and Theatre classes, the seminars (shown once you qualify for the
//       track: stat ≥ 150 and ≥ 10 classes), the transcript sub-screen and graduation (a row appears
//       when a track has its 20 classes).
// Numbers are read from SR.tuning.training at run time by the named cost fns below (uofs.cash,
// uofs.min, uofs.hp), so the rows follow tuning.js; the gains, the class counts, the degree bonus,
// Winded and the U of S karma are SR.rules.training's (training.apply). Study's gain follows the
// Public Library Act through training.gain → decree.studyGain (W1-C 6). Wednesday classes (P1
// `calendar`) and Mastermind's free seminars are B-28a price modifiers on the priceTargets
// `class.<track>` and `seminar.<track>`.
(function () {
  'use strict';
  var SR = window.SR;

  var TRACKS = ['biz', 'kin', 'thr'];
  var TRACK_ID = { biz: 'Biz', kin: 'Kin', thr: 'Thr' };
  var TRACK_SFX = { biz: 'stat_int', kin: 'stat_str', thr: 'stat_cha' };   // the stat sound of a seminar's gain
  // Greeting thresholds (presentation, not balance; CONTRACT D49): Dean Quill calls you a scholar
  // from INT 200, the Mastermind milestone's neighbourhood; "morning" before 12:00, "late" from 20:00.
  var SCHOLAR_INT = 200;
  var MORNING_BEFORE = 720;
  var LATE_FROM = 1200;
  // The B-03 source (tuning.training.<source>) each row stands for.
  var SOURCE = {
    'uofs.study': 'study', 'uofs.classBiz': 'classBiz', 'uofs.gym': 'gym', 'uofs.classKin': 'classKin', 'uofs.classThr': 'classThr',
    'uofs.seminarBiz': 'seminar', 'uofs.seminarKin': 'seminar', 'uofs.seminarThr': 'seminar',
  };

  function T() { return SR.tuning.training; }
  function row(ctx) {
    var id = ctx && ctx.id ? String(ctx.id).replace(/:resolve$/, '') : '';
    return SOURCE[id] ? T()[SOURCE[id]] : null;
  }

  SR.def.building('uofs', {
    name: 'place.uofs', owner: 'quill', portrait: 'quill', music: 'campus_canon', interior: 'uofs',
    groups: ['train', 'services'],
    greetings: ['greet.uofs.default'],
  });

  // ---- named fns (CONTRACT §8.5) -----------------------------------------------------------------

  /** Cost: the row's cash (B-03 `cash`), before the B-28a price modifiers. @returns {number} */
  SR.def.fn('uofs.cash', function (s, params, ctx) { var r = row(ctx); return r ? r.cash || 0 : 0; });

  /**
   * Cost: the row's minutes (B-03 `min`; Speed Reader's 90-minute Study through
   * SR.rules.training.minutes); graduation takes degree.ceremonyMin. @returns {number}
   */
  SR.def.fn('uofs.min', function (s, params, ctx) {
    var id = ctx && ctx.id ? String(ctx.id) : '';
    if (/^uofs\.graduate/.test(id)) return T().degree.ceremonyMin;
    var src = SOURCE[id];
    if (!src) return 0;
    return SR.rules.training && typeof SR.rules.training.minutes === 'function' ? SR.rules.training.minutes(s, src) : T()[src].min;
  });

  /** Cost and "Too hurt" threshold: the row's HP cost (B-03 `hp`: the gym 4, Kinesiology 6). @returns {number} */
  SR.def.fn('uofs.hp', function (s, params, ctx) { var r = row(ctx); return r ? r.hp || 0 : 0; });

  /**
   * Condition: you qualify for the track's seminars (B-03: its stat ≥ needStat and ≥ needClasses
   * classes in it), whatever today's count. A seminar row is hidden until then (the Dean's
   * invitation, GDD §6.2); the daily limit disables it with a reason.
   */
  SR.def.fn('uofs.invited', function (s, params, ctx, track) {
    var sem = T().seminar, stat = T().degree.tracks[track];
    var ok = !!stat && s.stats[stat] >= sem.needStat && (s.edu.classes[track] || 0) >= sem.needClasses;
    return ok ? { ok: true } : { ok: false, reason: 'reason.notYet', vars: {} };
  });

  /**
   * Dean Quill's greeting (UI §5.6; GDD §6.1: by time, stats, karma and degrees).
   * @returns {{key: string}} a greet.uofs.* key (arrays pick a variant)
   */
  SR.def.fn('greet.uofs', function (s) {
    var st = s.stats, min = s.clock.min, K = SR.tuning.karma.tiers;
    if (st.hp < SR.tuning.training.winded.threshold * st.hpMax) return { key: 'greet.uofs.hurt' };
    if (TRACKS.some(function (t) { return s.edu.degrees[t]; })) return { key: 'greet.uofs.graduate' };
    if (st.karma <= K.bad) return { key: 'greet.uofs.bad' };
    if (st.int >= SCHOLAR_INT) return { key: 'greet.uofs.scholar' };
    if (st.karma >= K.good) return { key: 'greet.uofs.good' };
    if (min < MORNING_BEFORE) return { key: 'greet.uofs.morning' };
    if (min >= LATE_FROM) return { key: 'greet.uofs.late' };
    return { key: 'greet.uofs.default' };
  });

  // ---- rows ------------------------------------------------------------------------------------

  /** A training row: its B-03 cost by name, the rules' gain (training.apply), repeatable (GDD §4.4). */
  function train(id, o) {
    var def = {
      building: 'uofs', group: 'train', order: o.order, icon: o.icon, label: 'act.' + id, p: o.p,
      cost: { min: 'uofs.min' },
      requires: [],
      effects: [['fn', 'training.apply'].concat(o.args)].concat(o.fx || []),
      repeatable: true,
    };
    if (o.cash) { def.cost.cash = 'uofs.cash'; def.priceTarget = o.priceTarget; }
    if (o.hp) { def.cost.hp = 'uofs.hp'; def.requires.push(['hpAbove', 'uofs.hp']); }
    if (o.requires) def.requires = def.requires.concat(o.requires);
    if (o.hidden) def.hidden = o.hidden;
    if (o.p >= 1) def.feature = 'degrees';
    SR.def.action(id, def);
  }

  // P0 (orig): Study, Business class, Gym.
  train('uofs.study', { order: 10, icon: 'study', p: 0, args: ['study'], fx: [['sfx', 'stat_int'], ['anim', 'study']] });
  train('uofs.classBiz', { order: 20, icon: 'class', p: 0, args: ['classBiz'], cash: true, priceTarget: 'class.biz', fx: [['sfx', 'stat_int'], ['anim', 'study']] });
  train('uofs.gym', { order: 30, icon: 'gym', p: 0, args: ['gym'], hp: true, fx: [['sfx', 'stat_str'], ['anim', 'lift']] });

  // P1 `degrees`: the other two tracks' classes.
  train('uofs.classKin', { order: 40, icon: 'class', p: 1, args: ['classKin'], cash: true, hp: true, priceTarget: 'class.kin', fx: [['sfx', 'stat_str'], ['anim', 'lift']] });
  train('uofs.classThr', { order: 50, icon: 'class', p: 1, args: ['classThr'], cash: true, priceTarget: 'class.thr', fx: [['sfx', 'stat_cha'], ['anim', 'talk']] });

  // P1 `degrees`: a seminar per track (B-03: $150, 3 h, +10; 2 a day across tracks).
  TRACKS.forEach(function (track, i) {
    train('uofs.seminar' + TRACK_ID[track], {
      order: 60 + i, icon: 'seminar', p: 1, args: ['seminar', track], cash: true, priceTarget: 'seminar.' + track,
      requires: [['fn', 'training.seminarOk', track]],
      hidden: [['not', ['fn', 'uofs.invited', track]]],
      fx: [['sfx', TRACK_SFX[track]], ['anim', 'study']],
    });
  });

  // P1 `degrees`: the transcript and graduation (a 1 h ceremony; +25 once, the diploma, a stamp).
  SR.def.action('uofs.transcript', {
    building: 'uofs', group: 'services', order: 10, icon: 'transcript', label: 'act.uofs.transcript', p: 1, feature: 'degrees',
    screen: 'uofs.transcript',
  });
  TRACKS.forEach(function (track, i) {
    SR.def.action('uofs.graduate' + TRACK_ID[track], {
      building: 'uofs', group: 'services', order: 20 + i, icon: 'degree', label: 'act.uofs.graduate' + TRACK_ID[track], p: 1, feature: 'degrees',
      cost: { min: 'uofs.min' },
      requires: [['fn', 'training.canGraduate', track]],
      hidden: [['not', ['fn', 'training.canGraduate', track]]],
      effects: [['fn', 'training.graduate', track], ['sfx', 'cheer'], ['anim', 'cheer']],
    });
  });
})();
