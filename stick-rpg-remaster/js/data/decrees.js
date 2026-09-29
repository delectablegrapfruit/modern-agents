// js/data/decrees.js — owner: W2-RulesC (W1-C in wave 1). SR.def.decree: the Mayor's Office decrees (GDD §4.17; BALANCE
// B-17; P1, flag `civicPlus`). On taking office and every 7 days after, SR.rules.election offers 3
// random eligible decrees; one picked stays active for the rest of the term, and a once-only decree
// never returns (state.election.decreesUsed).
//
// A def: { path: 'any' | 'president' | 'dictator', once, effects (run once when the decree is issued),
// name / desc text keys (decree.<id>.*, en-conflict.js; `names` by path where the name changes),
// icon, order, where }. `where` documents the module that makes the decree bite while it is active
// (they read state.election.decrees): the price modifiers of B-28a (js/data/tuning.js priceMods),
// the night (js/rules/night.js steps 3 and 9), jobs, bank, the world and traffic, the bus.
// Ids are camelCase because the rules that already read them use B-17's key names
// ('casinoLevy', 'toughOnCrime', 'seizeBank', 'beerSubsidy', 'nationalised', ...).
// The issue-time numbers come from SR.tuning.election (seizeBank) or, where BALANCE has none, from
// the named constants of js/rules/election.js (docs/requests/W1-C.md).
// Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  var order = 0;
  /** Registers a decree (every decree is P1 behind `civicPlus`). */
  function decree(id, path, once, where, extra) {
    order += 1;
    SR.def.decree(id, Object.assign({
      path: path, once: once, effects: [], name: 'decree.' + id + '.name', desc: 'decree.' + id + '.desc',
      icon: 'decree', order: order, where: where, p: 1, feature: 'civicPlus',
    }, extra || {}));
  }

  decree('guardRails', 'any', false, 'js/world/world.js: unrailed edges bounce you back; no falls');
  decree('freeFriesFriday', 'any', false, 'tuning.priceMods freeFriesFriday: McSticks food $0 on Fridays');
  decree('pedestrianSupremacy', 'any', false, 'js/world/traffic.js: every driver always notices you');
  decree('casinoLevy', 'any', false, 'night step 3 (+$2,000); js/rules/casino.js slots.pays: $$$ ×560');
  decree('publicLibrary', 'any', false, 'the named fn decree.studyGain (Study +3 INT)');
  decree('beerSubsidy', 'any', false, 'tuning.priceMods beerSubsidy: beer $10');
  decree('fourDayWeek', 'any', false, 'js/rules/jobs.js wage: shifts pay ×1.25');
  decree('nationalised', 'any', false, 'tuning.priceMods nationalised (tickets $0); js/rules/trade.js tour fee ×1.2');
  decree('mandatoryHats', 'any', false, 'night step 9: +1 CHA a night; every stick wears a hat');
  decree('statueOfMe', 'any', false, 'night step 9: ±2 karma a night; the festival headline and statue');
  decree('toughOnCrime', 'any', false, 'night step 9: Heat -25 a night; police ×2 (js/world/police.js)',
    { names: { president: 'decree.toughOnCrime.name', dictator: 'decree.toughOnCrime.martial' } });
  decree('renameCity', 'any', true, 'state.election.cityName (the results front page)',
    { effects: [['fn', 'decree.renameCity']], textField: true });
  decree('seizeBank', 'dictator', true, 'js/rules/bank.js interest: 0 forever',
    { effects: [['fn', 'decree.seizeBank']] });
  decree('universalFries', 'president', true, 'a celebratory news story',
    { effects: [['fn', 'decree.universalFries']] });
})();
