// js/rules/health.js — owner: W1-E. SR.rules.health: HP 0 in one place (ARCHITECTURE §6.7;
// GDD §4.16; BALANCE B-16, B-31): Second Wind (P1 perk, once a day) → Hardcore death →
// Relaxed / Standard hospital (the bill as a forced charge, then the hospital night at once), and
// the bill. The act pipeline (W1-R) calls down() when HP reaches 0 and puts the Down in
// Result.down; SR.act emits player:down and js/scenes/hospital.js presents it.
// Pure. Numbers: SR.tuning.health (B-31), SR.tuning.perks (Second Wind).
(function () {
  'use strict';
  var SR = window.SR;

  function T() { return SR.tuning.health; }

  var health = {
    /**
     * The Stick General bill (B-31): Standard max($50, 10 % of cash + bank); Relaxed $0; Hardcore
     * never reaches the hospital ($0).
     * @returns {number}
     */
    bill: function (s) {
      var b = T().hospital.bill[s.mode.difficulty];
      if (!b) return 0;   // Hardcore dies instead
      return Math.max(b.min, Math.floor(b.pct * (s.money.cash + s.money.bank)));
    },

    /**
     * HP reached 0 (only involuntary damage gets here).
     *   1. Second Wind (perk, unused today): HP 1; nothing else happens.
     *   2. Hardcore: death; the game is over with its results.
     *   3. Relaxed / Standard: the bill (cash, then bank, the rest written off), the hospital's log
     *      entry, then the hospital night (the day advances, HP = 50 % of HP max, wake 12:00).
     * @param {string} cause 'fall' | 'carHit' | 'carCrash' | 'fight' | 'mugger' | 'goons' | 'other'
     * @param {object=} ctx { rng, now, source }
     * @returns {{outcome: string, cause: string, bill: number, writtenOff: number, report: (object|null),
     *   events: object[], toasts: object[]}} `toasts` carries Second Wind's toast (ARCHITECTURE §6.7:
     *   "a toast; nothing else happens"); js/rules/act.js appends it to Result.toasts
     */
    down: function (s, cause, ctx) {
      ctx = ctx || { rng: SR.rng.rules, now: s.clock.min, source: 'sim' };
      var d = { outcome: null, cause: cause || 'other', bill: 0, writtenOff: 0, report: null, events: [], toasts: [] };
      if (SR.features.perks && SR.rules.perks.has(s, 'secondWind') && !(s.daily.secondWind > 0)) {
        s.stats.hp = T().secondWind.hp;
        s.daily.secondWind = 1;
        d.outcome = 'secondWind';
        d.toasts.push({ key: 'toast.health.secondWind', vars: {}, kind: 'warning' });
      } else if (s.mode.difficulty === 'hardcore') {
        s.stats.hp = 0;
        d.outcome = 'death';
        s.over = true;
        s.result = SR.rules.endgame.results(s, 'death');
      } else {
        s.stats.hp = 0;
        d.outcome = 'hospital';
        d.bill = health.bill(s);
        var c = SR.rules.bank.charge(s, d.bill, 'hospital');
        d.writtenOff = c.writtenOff;
        s.records.hospital = (s.records.hospital || 0) + 1;
        SR.rules.log.add(s, 'hospital', { cause: d.cause });
        d.report = SR.rules.night.run(s, ctx, { kind: 'hospital', bill: d.bill, paid: c.paid, writtenOff: c.writtenOff, cause: d.cause });
      }
      d.events.push({ name: 'down', payload: { cause: d.cause, outcome: d.outcome } });
      return d;
    },
  };

  SR.rules.health = health;
})();
