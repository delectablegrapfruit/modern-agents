// js/data/buildings/cityhall.js — owner: W2-Civic. City Hall and its Election Office (GDD §6.1,
// §4.17; BALANCE B-17): the building, Clerk Plume's greeting, and the rows the Election Office
// sub-screen (`cityhall.campaign`, js/ui/subscreens/campaign.js) commits through SR.act:
//   cityhall.office       the card row that opens the Election Office (P0)
//   cityhall.accept       accept the nomination with a war chest ({ chest: 0 | 1 | 2 }; P0)
//   cityhall.<action>     the campaign actions of B-17: rally, tvAd, doorKnock (President),
//                         kissBabies (President, P1 `civicPlus`), intimidate (Dictator), bribe (P0)
//   cityhall.debate       the day-4 debate (the Duel skin `debate`) and its :resolve (P0)
// Every rule is SR.rules.election's (W2-RulesC): the named fns election.accept, canCampaign,
// campaign, cash, min, canDebate, debateStart and debate (CONTRACT §8.10). The campaign rows' costs
// are the named fns election.cash / election.min, so the pipeline takes the cash and the time and
// shows them as chips. The nightly bookkeeping (the rival's gain, campaign days in jail and hospital
// too, the debate no-show, election night, the lapse, the salary) is the night's.
// The campaign and accept rows carry `row: false`: they are committed from the Election Office
// sub-screen (which shows their poll change, uses and caps), not listed as card rows
// (docs/requests/W2-Civic.md asks js/ui/card.js to skip them; until then they show on the City Hall
// card during a campaign only, through `hidden`). P1 City Hall rows (Mayor's Office, charity, soup
// kitchen, the Precinct desk, city-event rows) are W3-Crime's.
(function () {
  'use strict';
  var SR = window.SR;

  // Plume's late-night line from 22:00 to 06:00 (presentation, not balance; CONTRACT D49).
  var LATE = 1320, EARLY = 360;

  function T() { return SR.tuning.election; }
  function yes() { return { ok: true }; }
  function no() { return { ok: false, reason: 'reason.unavailable', vars: {} }; }

  SR.def.building('cityhall', {
    name: 'place.cityhall', owner: 'plume', portrait: 'plume', music: 'campus_canon', interior: 'cityhall',
    groups: ['services', 'special'],
    greetings: ['greet.cityhall.default'],
  });

  // ---- named fns (CONTRACT §8.5) -----------------------------------------------------------------

  /**
   * Hidden-condition of a campaign row: holds (the row hides) unless a campaign is running on the
   * row's path (Door-knocking and Kiss babies: President; Intimidate: Dictator; null: both).
   */
  SR.def.fn('cityhall.offCampaign', function (s, params, ctx, path) {
    var el = s.election;
    if (el.status !== 'campaign') return yes();
    return path && el.path !== path ? yes() : no();
  });

  /** Hidden-condition of the debate row: holds unless today is the debate's campaign day (B-17 debate.day). */
  SR.def.fn('cityhall.offDebate', function (s) {
    var el = s.election;
    return el.status === 'campaign' && el.campaignDay === T().debate.day ? no() : yes();
  });

  /** Hidden-condition of the accept row: holds while no war chest is chosen (params.chest). */
  SR.def.fn('cityhall.noChest', function (s, params) {
    var c = params ? params.chest : undefined;
    return c === undefined || c === null || c === '' ? yes() : no();
  });

  /**
   * Clerk Plume's greeting (UI §5.6): by the election's status, then the hour.
   * @returns {{key: string, vars: object}}
   */
  SR.def.fn('greet.cityhall', function (s) {
    var el = s.election, min = s.clock.min;
    if (s.job.office === 'dictator') return { key: 'greet.cityhall.dictator' };
    if (s.job.office) return { key: 'greet.cityhall.president' };
    if (el.status === 'nominated') return { key: 'greet.cityhall.nominated', vars: { day: SR.rules.election.acceptBy(s) } };
    if (el.status === 'campaign') return { key: 'greet.cityhall.campaign', vars: { day: el.campaignDay, poll: el.poll } };
    if (el.status === 'lost') return { key: 'greet.cityhall.lost' };
    if (el.status === 'removed') return { key: 'greet.cityhall.removed' };
    if (min >= LATE || min < EARLY) return { key: 'greet.cityhall.late' };
    return { key: 'greet.cityhall.default' };
  });

  // ---- rows ------------------------------------------------------------------------------------

  SR.def.action('cityhall.office', {
    building: 'cityhall', group: 'services', order: 10, icon: 'election', label: 'act.cityhall.office', p: 0,
    screen: 'cityhall.campaign',
  });

  // Accept the nomination (GDD §4.17): within 14 days of the call, the requirements still met, the
  // war chest of B-17 paid in full from cash, then the bank. Campaign day 1 is today.
  SR.def.action('cityhall.accept', {
    building: 'cityhall', group: 'special', order: 5, icon: 'ballot', label: 'act.cityhall.accept', p: 0,
    requires: [['election', 'nominated']],
    hidden: [['fn', 'cityhall.noChest']],
    effects: [['fn', 'election.accept'], ['anim', 'cheer']],
    confirm: 'card.cityhall.confirm.accept',
    row: false,
  });

  /** A campaign row of B-17: cost by name (cash and time), the daily cap, the path, the poll maths. */
  function campaign(id, o) {
    var def = {
      building: 'cityhall', group: 'special', order: o.order, icon: o.icon, label: 'act.cityhall.' + id, p: o.p || 0,
      cost: { cash: 'election.cash', min: 'election.min' },
      requires: [['fn', 'election.canCampaign']],
      hidden: [['fn', 'cityhall.offCampaign', o.path || null]],
      effects: [['fn', 'election.campaign']].concat(o.fx || []),
      row: false,
    };
    if (o.confirm) def.confirm = o.confirm;
    if (def.p >= 1) def.feature = o.feature;
    SR.def.action('cityhall.' + id, def);
  }
  campaign('rally', { order: 10, icon: 'rally', fx: [['sfx', 'cheer'], ['anim', 'cheer']] });
  campaign('tvAd', { order: 20, icon: 'tvad', fx: [['anim', 'talk']] });
  campaign('doorKnock', { order: 30, icon: 'campaign', path: 'president', fx: [['sfx', 'knock'], ['anim', 'wave']] });
  campaign('kissBabies', { order: 40, icon: 'campaign', path: 'president', p: 1, feature: 'civicPlus', fx: [['anim', 'happy']] });
  campaign('intimidate', { order: 50, icon: 'heat', path: 'dictator', confirm: 'card.cityhall.confirm.intimidate', fx: [['anim', 'guard']] });
  campaign('bribe', { order: 60, icon: 'money', confirm: 'card.cityhall.confirm.bribe', fx: [['anim', 'talk']] });

  // The debate (B-17: campaign day 4, 2 h, 3 questions in the Duel's stance mode, +3 / -2 a question;
  // not showing up by the end of day 4 costs -5 at night). debateStart opens the `debate` skin.
  SR.def.action('cityhall.debate', {
    building: 'cityhall', group: 'special', order: 70, icon: 'debate', label: 'act.cityhall.debate', p: 0,
    cost: { min: 'election.min' },
    requires: [['fn', 'election.canDebate']],
    hidden: [['fn', 'cityhall.offDebate']],
    effects: [['fn', 'election.debateStart']],
    row: false,
  });
  SR.def.action('cityhall.debate:resolve', {
    building: 'cityhall', p: 0, timeRule: 'free',
    effects: [['fn', 'election.debate']],
  });
})();
