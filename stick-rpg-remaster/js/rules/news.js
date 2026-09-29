// js/rules/news.js — owner: W2-RulesE (W1-E in wave 1). SR.rules.news: the Daily Fold's headline from yesterday's log and
// the TV news story that leads with the same entry (BALANCE B-29; GDD §6.8; ARCHITECTURE §6.9).
// Pure. Numbers: SR.tuning.news (B-29: weights, minWeight). The templates are text keys in
// js/data/text/en-news.js (W2-Home): news.head.<kind> and news.head.absurd (headlines),
// news.tv.<kind> and news.story (TV stories), each an array of variants.
(function () {
  'use strict';
  var SR = window.SR;

  function T() { return SR.tuning.news; }

  /** @returns {number} the weight of a log entry (its own, else the B-29 weight of its kind). */
  function weightOf(e) {
    if (typeof e.weight === 'number') return e.weight;
    return (T().weights && T().weights[e.kind]) || 0;
  }

  /** A stable variant for a template, so a morning always shows the same line (no rules draw). */
  function variant(s, tag) { return SR.util.hash(s.seed, s.clock.day, tag) % 1000; }

  var news = {
    /**
     * The heaviest entry of yesterday's log (ties: the latest) whose weight ≥ minWeight, or null.
     * @returns {object|null} { kind, weight, vars }
     */
    lead: function (s) {
      var list = (s.log && s.log.yesterday) || [], best = null, bw = -Infinity;
      for (var i = 0; i < list.length; i++) {
        var w = weightOf(list[i]);
        if (w >= bw) { best = list[i]; bw = w; }
      }
      return best && bw >= T().minWeight ? best : null;
    },

    /**
     * The morning headline (night step 12): news.head.<kind> of the lead entry with its vars, else
     * a city-absurdity template.
     * @returns {{key: string, vars: object, kind: (string|null)}}
     */
    headline: function (s) {
      var e = news.lead(s);
      if (!e) return { key: 'news.head.absurd', vars: { variant: variant(s, 'absurd') }, kind: null };
      return { key: 'news.head.' + e.kind, vars: Object.assign({}, e.vars, { variant: variant(s, e.kind) }), kind: e.kind };
    },

    /**
     * The TV news story: it leads with the headline's entry (news.tv.<kind>), else one of the
     * stories (news.story); `rng` (optional) picks the story's variant.
     * @returns {{key: string, vars: object, lead: boolean}}
     */
    tvStory: function (s, rng) {
      var e = news.lead(s);
      var v = rng ? rng.int(0, 999) : variant(s, 'tv');
      if (e) return { key: 'news.tv.' + e.kind, vars: Object.assign({}, e.vars, { variant: v }), lead: true };
      return { key: 'news.story', vars: { variant: v }, lead: false };
    },
  };

  SR.rules.news = news;
})();
