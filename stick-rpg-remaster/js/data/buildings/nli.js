// js/data/buildings/nli.js — owner: W2-Money. New Lines Inc. (GDD §4.6, §6.1, §6.2; BALANCE B-05,
// B-30): the building and its people (Bea in Human Resources; Terry, your assistant, greets you from
// Vice President up), the card rows (Apply for a job, Ask for a promotion, Work a shift with P1
// `hustles` variants and the Hustle button, the job ladder `nli.jobs`; P1: the CEO takeover), the
// new boss's voicemail after each rung, the greeting and the named fns those rows use.
//
// Rules: W2-RulesE's jobs.* named fns (one rung per request, orig; every missing requirement named
// on the row, GDD §4.6, reason.needAll; +3 karma and the stamp on a promotion; the shift's pay,
// karma and counters; the weekly bonus on Friday night). This file adds what the data owns: the
// new boss's voicemails, the Ruthless karma of the Boardroom (B-30: "-1 karma"; the Duel reports
// the picks, the data applies them, CONTRACT §13.1) and the takeover's opening.
// Hustle skins by rank (B-05 hustle.skins): Janitor and Mail Room `sortit`, Salesperson (step 0) and
// Executive (step 1) `pitch`, VP and CEO `boardroom`.
// Numbers: SR.tuning.jobs (B-05), SR.tuning.duel.boardroom (B-30), read at run time.
// Pure data and named functions: no DOM, no platform RNG (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  var TRACK = 'nli';
  // The new boss who calls after each rung (GDD §4.6 "a voicemail from your new boss"; §6.2: Bea in
  // HR, Gil in the mail room, Frankie in sales, Terry your assistant from VP up).
  var BOSS_VM = { janitor: 'vm.bea.hired', mail: 'vm.gil.promoted', sales: 'vm.frankie.promoted', exec: 'vm.bea.exec',
    vp: 'vm.terry.vp', ceo: 'vm.terry.ceo' };
  var ASSISTANT_FROM = 'vp';   // Terry greets you from this rung up (GDD §6.2; ART_AUDIO §9 "Bea (or Terry at VP+)")

  function T() { return SR.tuning.jobs; }

  /** @returns {boolean} your NLI rank is Vice President or higher. */
  function assisted(s) {
    var rank = s && s.job && s.job.ranks ? s.job.ranks[TRACK] : null;
    var ladder = SR.tuning && SR.tuning.jobs ? SR.tuning.jobs.ladder[TRACK] : [];
    return !!rank && ladder.indexOf(rank) >= ladder.indexOf(ASSISTANT_FROM);
  }
  /** @returns {string} who receives you: Terry from VP up, else Bea (reads the live game, if any). */
  function host() { return assisted(SR.state) ? 'terry' : 'bea'; }

  // ---- the building ----------------------------------------------------------------------------

  // `owner` and `portrait` follow your rank (ART_AUDIO §9: Bea, or Terry at VP+): the card and the
  // building scene read them when you enter, so they are accessors of the live game (Bea when no
  // game is running, e.g. in Node).
  var building = {
    name: 'place.nli', music: 'please_hold', interior: 'nli', exteriorId: 'nli',
    groups: ['work', 'services', 'special'],
    greetings: ['greet.nli.default'],
  };
  Object.defineProperty(building, 'owner', { enumerable: true, get: host });
  Object.defineProperty(building, 'portrait', { enumerable: true, get: host });
  SR.def.building('nli', building);

  // ---- the ladder (GDD §4.6; B-05) ---------------------------------------------------------------

  SR.def.action('nli.apply', {
    building: 'nli', group: 'work', order: 10, icon: 'apply', label: 'act.nli.apply', p: 0, timeRule: 'free',
    hidden: [['jobTrack', TRACK]],
    requires: [['fn', 'jobs.canApply', TRACK]],
    effects: [['fn', 'jobs.apply', TRACK], ['fn', 'nli.newBoss']],
  });

  SR.def.action('nli.promote', {
    building: 'nli', group: 'work', order: 20, icon: 'promotion', label: 'act.nli.promote', p: 0, timeRule: 'free',
    hidden: [['not', ['jobTrack', TRACK]]],
    requires: [['fn', 'jobs.canPromote', TRACK]],
    effects: [['fn', 'jobs.promote', TRACK], ['fn', 'nli.newBoss']],
  });

  /** Effect after a rung: the new boss's voicemail (GDD §4.6). */
  SR.def.fn('nli.newBoss', function (s) {
    var key = BOSS_VM[s.job.ranks[TRACK]];
    return key ? { msgs: [{ key: key, vars: {} }] } : null;
  });

  // ---- work (GDD §4.6; B-05) ----------------------------------------------------------------------

  // Full 6 h (orig) with +1 karma; Half and Overtime are P1 (`hustles`): their variants hide while
  // the flag is off, so the row is the original's Full shift. The Hustle button (P1) plays the
  // rank's skin and commits this row itself with { m, hustle }, so there is no :resolve (CONTRACT
  // D61). The row stays unrepeatable until js/rules/act.js's registration check follows D61, as
  // McSticks' (docs/requests/decisions-w2-desk-content.md).
  SR.def.action('nli.work', {
    building: 'nli', group: 'work', order: 30, icon: 'work', label: 'act.nli.work', p: 0,
    variants: ['full', 'half', 'overtime'],
    cost: { min: 'shift.min', hp: 'shift.hp' },
    requires: [['jobTrack', TRACK], ['hpAbove', 'shift.hp'], ['fn', 'jobs.canWork', TRACK]],
    hidden: [['not', ['feature', 'hustles']], ['any', [['fn', 'mods.param', 'variant', 'half'], ['fn', 'mods.param', 'variant', 'overtime']]]],
    effects: [['fn', 'jobs.work', TRACK], ['fn', 'nli.ruthless']],
    minigame: { skin: 'nli.hustleSkin', auto: true },
  });

  /** The Hustle's skin and step for your NLI rank (B-05 hustle.skins, pitchStep). */
  SR.def.fn('nli.hustleSkin', function (s) {
    var J = SR.rules.jobs;
    return J && typeof J.hustleSkin === 'function' ? J.hustleSkin(s, TRACK) : null;
  });

  /**
   * Effect: the Boardroom's Ruthless picks cost karma (B-30: -1 each), win or lose. Reads the Duel
   * result of a Hustle (params.hustle) or of the takeover's resolve (params); anything else has no
   * picks and costs nothing.
   */
  SR.def.fn('nli.ruthless', function (s, params) {
    var r = params && (params.hustle || params);
    if (!r || !Array.isArray(r.picks)) return null;
    var opt = SR.tuning.duel.boardroom.options.ruthless, per = (opt && opt.karma) || 0;
    var n = r.picks.filter(function (id) { return id === 'ruthless'; }).length;
    if (!n || !per) return null;
    SR.rules.stats.karma(s, per * n);
    return { toasts: [{ key: 'toast.nli.ruthless', vars: { n: per * n }, kind: 'warning' }] };
  });

  // ---- the job ladder (UI §5.6 NLI › Jobs) ---------------------------------------------------------

  SR.def.action('nli.ladderOpen', {
    building: 'nli', group: 'services', order: 10, icon: 'info', label: 'act.nli.ladder', p: 0, timeRule: 'free',
    screen: 'nli.jobs',
  });

  // ---- the CEO takeover (P1 `hustles`; B-05 ceoTakeover, B-30 boardroom at D × 2) -----------------

  SR.def.action('nli.takeover', {
    building: 'nli', group: 'special', order: 10, icon: 'ceo', label: 'act.nli.takeover', p: 1, feature: 'hustles',
    timeRule: 'free',
    hidden: [['not', ['fn', 'jobs.takeoverDue']]],
    requires: [['fn', 'jobs.takeoverDue']],
    effects: [['fn', 'nli.takeoverOpen']],
  });
  SR.def.action('nli.takeover:resolve', {
    building: 'nli', p: 1, feature: 'hustles', timeRule: 'free',
    effects: [['fn', 'jobs.takeover'], ['fn', 'nli.ruthless'], ['fn', 'nli.takeoverNews']],
  });

  /** Effect: opens the Boardroom at the takeover's difficulty (B-05 ceoTakeover.dMult). */
  SR.def.fn('nli.takeoverOpen', function () {
    var c = T().ceoTakeover;
    return { open: { minigame: 'boardroom', skin: 'boardroom', params: { dScale: c.dMult, takeover: true }, resolve: 'nli.takeover:resolve' } };
  });

  /** Effect after jobs.takeover: the bonus toast (m ≥ 1.2) or the loss's voicemail (GDD §4.6). */
  SR.def.fn('nli.takeoverNews', function (s, params) {
    var c = T().ceoTakeover, won = (Number(params && params.m) || 0) >= c.mNeed;
    if (won) return { toasts: [{ key: 'toast.nli.takeoverWon', vars: { n: c.bonus, money: SR.text.money(c.bonus) }, kind: 'reward' }], msgs: [{ key: 'vm.terry.takeoverWon', vars: {} }] };
    return { toasts: [{ key: 'toast.nli.takeoverLost', vars: {}, kind: 'warning' }], msgs: [{ key: 'vm.bea.takeoverLost', vars: {} }] };
  });

  // ---- the greeting (UI §5.6: first visit, time, karma, weather, job) -----------------------------

  var LATE_FROM = 1320;   // "late" from 22:00 (a presentation threshold, CONTRACT D49)

  /**
   * The card's greeting (CONTRACT §15.4 `greet.<building>`): Bea's until you make Vice President,
   * then Terry's. The first match wins.
   * @returns {{key: string, vars?: object}}
   */
  SR.def.fn('greet.nli', function (s) {
    var rank = s.job.ranks[TRACK];
    if (!rank) {
      var need = T()[T().ladder[TRACK][0]].int;
      return s.stats.int >= need ? { key: 'greet.nli.hiring' } : { key: 'greet.nli.visitor', vars: { int: need } };
    }
    var ready = SR.rules.jobs.promotion(s, TRACK).ok;
    var friday = SR.rules.time.weekday(s) === T().weeklyBonus.weekday && typeof T().weeklyBonus[rank] === 'number';
    if (assisted(s)) {
      if (ready) return { key: 'greet.nli.ready' };
      if (friday) return { key: 'greet.nli.friday' };
      return { key: rank === 'ceo' ? 'greet.nli.ceo' : 'greet.nli.terry' };
    }
    if (ready) return { key: 'greet.nli.ready' };
    if (friday) return { key: 'greet.nli.friday' };
    if (s.clock.min >= LATE_FROM) return { key: 'greet.nli.late' };
    if (SR.text.has('greet.nli.' + rank)) return { key: 'greet.nli.' + rank };
    return { key: 'greet.nli.default' };
  });
})();
