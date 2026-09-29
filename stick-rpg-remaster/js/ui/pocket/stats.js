// js/ui/pocket/stats.js — owner: W2-Pocket (W3-Prog in wave 3). The Pocket's Stats tab (UI §5.9):
// your portrait, name, title, rank and run (difficulty, length, day); STR / INT / CHA with a
// 14-day Sparkline each (state.history, then today's value) and the next perk milestone (P1
// `perks`); karma on a -100..+100 slider in its band colour with its tier; HP, Heat and Buzz (P1
// `nightlife`); each job track's rank and shifts (the rating is P1 `hustles`); classes and degrees
// (P1 `degrees`); perks (P1 `perks`); the net-worth breakdown of B-18 (SR.rules.endgame.breakdown);
// days played; records. Everything is read from the state; nothing here commits an action.
// Registered with SR.ui.pocket.panel at boot (prio 50). Load-time rule: defines functions only.
(function () {
  'use strict';
  var SR = window.SR;

  var SPARK_DAYS = 14;                         // UI §5.9: 14-day Sparklines
  var TRACKS = ['mcsticks', 'nli'];            // B-05's two job ladders
  var RECORDS = ['falls', 'carHits', 'fightsWon', 'robberies', 'jailDays', 'hospital', 'shiftsMcsticks', 'citiesVisited'];
  var WORTH = ['cash', 'bank', 'cds', 'stocks', 'homes', 'furniture', 'car', 'loan', 'lien'];
  var DEBTS = { loan: true, lien: true };

  var S = null;   // { root, ctx }

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function t(k, v) { return D().t(k, v); }
  function on(flag) { return !!(SR.features && SR.features[flag]); }
  function num(n) { return SR.text.num(n); }

  function heading(key) {
    return h('h3', { class: 't-label', style: { margin: '0 0 var(--sp-2)', color: 'var(--ink-900)', fontFamily: 'var(--font-display)', fontWeight: '900',
      textTransform: 'uppercase', letterSpacing: '0.02em' } }, t(key));
  }
  function box(id, children) {
    return h('section', { 'data-id': id, style: { minWidth: '0', padding: 'var(--sp-3)', border: 'var(--line)', borderRadius: 'var(--r-m)', background: 'var(--paper-0)' } }, children);
  }
  function kv(label, value, id, strong) {
    return h('div', { 'data-id': id || null, style: { display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-3)', padding: '3px 0',
      borderBottom: 'var(--line-thin)', fontWeight: strong ? '900' : '400' } },
      h('span', { style: { color: 'var(--ink-700)', fontWeight: strong ? '900' : '600' } }, label),
      h('span', { style: { fontVariantNumeric: 'tabular-nums', color: 'var(--ink-900)', textAlign: 'right' } }, value));
  }

  function jobTitle(s) {
    var v = null;
    if (SR.rules.jobs && typeof SR.rules.jobs.bestTitle === 'function') { try { v = SR.rules.jobs.bestTitle(s); } catch (e) { v = null; } }
    return v && SR.text.has('job.' + v) ? SR.text('job.' + v) : t('hud.noJob');
  }

  /** @returns {number[]} the last 14 days of a stat: the morning points, then today's value. */
  function trend(s, key) {
    var dayOf = function (p) { return Array.isArray(p) ? p[0] : p && typeof p.day === 'number' ? p.day : null; };
    // The points of the last 14 days (history is daily to day 120, then weekly: fewer points then).
    var pts = ((s.history && s.history[key]) || []).filter(function (p) { var d = dayOf(p); return d === null || d > s.clock.day - SPARK_DAYS; });
    var vals = pts.map(function (p) { return Array.isArray(p) ? p[1] : p && typeof p.value === 'number' ? p.value : Number(p) || 0; });
    var lastDay = pts.length ? dayOf(pts[pts.length - 1]) : null;
    var now = key === 'karma' ? s.stats.karma : s.stats[key];
    if (lastDay === s.clock.day && vals.length) vals[vals.length - 1] = now; else vals.push(now);
    return vals.slice(-SPARK_DAYS);
  }

  function nextPerk(v) {
    var lv = SR.tuning.perks && SR.tuning.perks.levels;
    if (!on('perks') || !Array.isArray(lv)) return null;
    for (var i = 0; i < lv.length; i++) if (lv[i] > v) return lv[i];
    return null;
  }

  function statRow(s, key) {
    var v = s.stats[key], cap = SR.tuning.start && SR.tuning.start.statCap, np = nextPerk(v);
    var meta = cap && v >= cap ? t('pocket.stats.maxed') : np ? t('pocket.stats.nextPerk', { n: np }) : t('pocket.stats.trend', { n: SPARK_DAYS });
    return h('div', { 'data-id': 'stats-' + key, style: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) 96px', alignItems: 'center',
      gap: 'var(--sp-2)', padding: '4px 0', borderBottom: 'var(--line-thin)' } },
      SR.ui.statChip({ id: 'stats-chip-' + key, stat: key, value: v }),
      h('span', { class: 't-small', style: { color: 'var(--ink-700)' } }, meta),
      SR.ui.sparkline({ id: 'stats-spark-' + key, data: trend(s, key), kind: key, label: 'ui.statLong.' + key }));
  }

  /** @returns {number[]} a stat's [min, max] (GDD §4.2; tuning start.karmaRange, heatRange, buzzRange). */
  function range(key, fallback) {
    var r = SR.tuning.start && SR.tuning.start[key + 'Range'];
    return Array.isArray(r) && r.length === 2 ? r : fallback;
  }

  function karmaSlider(s) {
    var k = Math.round(s.stats.karma), band = SR.ui.karmaMedallion.band(k), tier = SR.ui.karmaMedallion.tier(k);
    var kr = range('karma', [-100, 100]), reach = Math.max(Math.abs(kr[0]), Math.abs(kr[1])) || 1;
    var pct = Math.max(kr[0], Math.min(kr[1], k)) / reach * 50;   // % of the track from its centre (0 in the middle)
    var col = 'var(--karma-' + band.side + '-' + band.i + ')';
    var fill = h('span', { 'aria-hidden': 'true', 'data-id': 'stats-karma-fill', style: { position: 'absolute', top: '0', bottom: '0', left: (k >= 0 ? 50 : 50 + pct) + '%',
      width: Math.abs(pct) + '%', background: col, borderLeft: k >= 0 ? '0' : 'var(--line)', borderRight: k >= 0 ? 'var(--line)' : '0' } });
    var knob = h('span', { 'aria-hidden': 'true', style: { position: 'absolute', top: '-4px', bottom: '-4px', left: 'calc(' + (50 + pct) + '% - 3px)', width: '6px',
      borderRadius: 'var(--r-xs)', background: 'var(--ink-900)' } });
    var track = h('span', { 'aria-hidden': 'true', style: { position: 'relative', display: 'block', height: '16px', border: 'var(--line)', borderRadius: 'var(--r-xs)',
      background: 'var(--paper-2)' } }, fill,
      h('span', { style: { position: 'absolute', top: '0', bottom: '0', left: 'calc(50% - 1px)', width: '2px', background: 'var(--ink-500)' } }), knob);
    var value = t('pocket.stats.karmaValue', { karma: (k > 0 ? '+' : '') + k, tier: t('ui.karmaTier.' + tier) });
    return h('div', { 'data-id': 'stats-karma', role: 'img', 'aria-label': t('pocket.stats.karma') + ': ' + value,
      style: { display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-2) 0' } },
      SR.ui.karmaMedallion({ id: 'stats-karma-medallion', karma: k, size: 48 }),
      h('div', { style: { minWidth: '0' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
          h('span', { style: { fontWeight: '700' } }, t('pocket.stats.karma')),
          h('span', { 'data-id': 'stats-karma-value', style: { fontVariantNumeric: 'tabular-nums' } }, value)),
        track));
  }

  function body(s) {
    var list = [
      h('div', { style: { display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', alignItems: 'center', gap: 'var(--sp-2)', padding: '4px 0' } },
        h('span', { style: { fontWeight: '700' } }, t('pocket.stats.hp')),
        SR.ui.meter({ id: 'stats-hp', kind: 'hp', value: s.stats.hp, max: s.stats.hpMax })),
    ];
    if (SR.rules.stats && typeof SR.rules.stats.winded === 'function' && SR.rules.stats.winded(s)) {
      var wf = SR.tuning.training && SR.tuning.training.winded;
      list.push(h('p', { class: 't-small', 'data-id': 'stats-winded', style: { margin: '0', color: 'var(--danger-ink)', fontWeight: '600' } },
        t('pocket.stats.winded', { factor: wf ? Math.round(wf.factor * 100) : '?' })));
    }
    list.push(h('div', { style: { display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', alignItems: 'center', gap: 'var(--sp-2)', padding: '4px 0' } },
      h('span', { style: { fontWeight: '700' } }, t('pocket.stats.heat')),
      SR.ui.meter({ id: 'stats-heat', kind: 'heat', value: s.stats.heat, max: range('heat', [0, 100])[1], w: 160 })));
    if (on('nightlife')) {
      list.push(h('div', { style: { display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', alignItems: 'center', gap: 'var(--sp-2)', padding: '4px 0' } },
        h('span', { style: { fontWeight: '700' } }, t('pocket.stats.buzz')),
        SR.ui.meter({ id: 'stats-buzz', kind: 'buzz', value: s.stats.buzz, max: range('buzz', [0, 5])[1], w: 160 })));
    }
    return list;
  }

  function work(s) {
    var rows = TRACKS.map(function (track) {
      var rank = s.job.ranks[track];
      var place = t('place.' + track);
      return kv(place, rank ? t('pocket.stats.rankAt', { job: SR.text.has('job.' + rank) ? SR.text('job.' + rank) : rank, n: s.job.shiftsAtRank[track] || 0 })
        : t('pocket.stats.noRank'), 'stats-job-' + track);
    });
    rows.push(kv(t('pocket.stats.totalShifts', { n: num(s.job.totalShifts || 0) }), '', 'stats-shifts'));
    if (on('hustles')) rows.push(kv(t('pocket.stats.rating', { n: (s.job.rating || 1).toFixed(2) }), '', 'stats-rating'));
    return rows;
  }

  function school(s) {
    var D3 = SR.tuning.training && SR.tuning.training.degree, need = D3 ? D3.classes : 20;
    var tracks = on('degrees') ? ['biz', 'kin', 'thr'] : ['biz'];
    return tracks.map(function (tr) {
      var n = (s.edu.classes && s.edu.classes[tr]) || 0, deg = s.edu.degrees && s.edu.degrees[tr];
      var v = deg ? t('pocket.stats.degree') : on('degrees') ? t('pocket.stats.classes', { n: n, need: need }) : t('pocket.stats.classesTaken', { n: n });
      return kv(t('pocket.stats.track.' + tr), v, 'stats-school-' + tr);
    });
  }

  function perks(s) {
    var owned = (s.perks && s.perks.owned) || [];
    var rows = owned.length ? owned.map(function (id) {
      var def = SR.reg.perk && SR.reg.perk[id];
      return h('li', { 'data-id': 'stats-perk-' + id, style: { padding: '2px 0' } }, def && def.name ? t(def.name) : id);
    }) : [h('li', { style: { color: 'var(--ink-700)' } }, t('pocket.stats.perksNone'))];
    if (s.perks && s.perks.pending && s.perks.pending.length) rows.push(h('li', { style: { color: 'var(--primary-600)', fontWeight: '700' } }, t('pocket.stats.perkPending')));
    return h('ul', { style: { listStyle: 'none', margin: '0', padding: '0' } }, rows);
  }

  function worth(s) {
    var E = SR.rules.endgame;
    if (!E || typeof E.breakdown !== 'function') return [];
    var b;
    try { b = E.breakdown(s); } catch (e) { return []; }
    var rows = [];
    WORTH.forEach(function (k) {
      if (k === 'cds' && !on('homesPlus') && !b.cds) return;
      if (!b[k] && k !== 'cash' && k !== 'bank') return;
      rows.push(kv(t('pocket.stats.nw.' + k), DEBTS[k] ? SR.text.money(-b[k]) : SR.text.money(b[k]), 'stats-nw-' + k));
    });
    rows.push(kv(t('pocket.stats.nw.total'), SR.text.money(b.total), 'stats-nw-total', true));
    return rows;
  }

  function records(s) {
    var r = s.records || {};
    return RECORDS.map(function (k) { return kv(t('pocket.stats.rec.' + k), num(r[k] || 0), 'stats-rec-' + k); });
  }

  function render() {
    if (!S) return;
    var s = S.ctx.state;
    D().clear(S.root);
    if (!s) return;
    var rank = null;
    if (SR.rules.endgame && typeof SR.rules.endgame.rank === 'function') { try { rank = SR.rules.endgame.rank(s); } catch (e) { rank = null; } }
    var mode = t('pocket.stats.mode', { difficulty: t('pocket.stats.difficulty.' + s.mode.difficulty),
      length: s.mode.length ? t('pocket.stats.length', { n: s.mode.length }) : t('pocket.stats.lengthUnlimited') });
    var days = s.mode.length ? t('pocket.stats.days', { day: s.clock.day, length: s.mode.length }) : t('pocket.stats.daysUnlimited', { day: s.clock.day });
    var head = h('div', { 'data-id': 'stats-head', style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', marginBottom: 'var(--sp-3)' } },
      SR.ui.portrait({ id: 'stats-portrait', person: 'player', size: 96, label: s.player.name }),
      h('div', { style: { minWidth: '0' } },
        h('h3', { class: 't-h3', 'data-id': 'stats-name', style: { margin: '0', color: 'var(--ink-900)' } }, s.player.name),
        h('p', { class: 't-body', 'data-id': 'stats-title', style: { margin: '0', fontWeight: '600' } }, jobTitle(s)),
        rank && rank.id ? h('p', { class: 't-small', 'data-id': 'stats-rank', style: { margin: '0', color: 'var(--ink-700)' } }, t('pocket.stats.rank', { rank: t(rank.key) })) : null,
        h('p', { class: 't-small', 'data-id': 'stats-run', style: { margin: '0', color: 'var(--ink-700)' } }, days + ' · ' + mode)));
    var grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(calc(300px * var(--ui-scale)), 1fr))', gap: 'var(--sp-3)' } },
      box('stats-stats', [heading('pocket.stats.stats'), statRow(s, 'str'), statRow(s, 'int'), statRow(s, 'cha'), karmaSlider(s)]),
      box('stats-body', [heading('pocket.stats.body')].concat(body(s))),
      box('stats-work', [heading('pocket.stats.work')].concat(work(s))),
      box('stats-school', [heading('pocket.stats.school')].concat(school(s))),
      on('perks') ? box('stats-perks', [heading('pocket.stats.perks'), perks(s)]) : null,
      box('stats-worth', [heading('pocket.stats.worth')].concat(worth(s))),
      box('stats-records', [heading('pocket.stats.records')].concat(records(s))));
    S.root.appendChild(head);
    S.root.appendChild(grid);
  }

  SR.onBoot(50, function () {
    if (!SR.ui.pocket || typeof SR.ui.pocket.panel !== 'function') return;
    SR.ui.pocket.panel('stats', {
      label: 'pocket.tab.stats', icon: 'star',
      mount: function (root, ctx) { S = { root: root, ctx: ctx }; render(); },
      refresh: function (ctx) { if (S) { S.ctx = ctx; var y = S.root.scrollTop; render(); S.root.scrollTop = y; } },
      unmount: function () { S = null; },
      /** @returns {object} the values the tab shows (tests). */
      debug: function () {
        var s = SR.state;
        if (!s) return null;
        return { trend: { str: trend(s, 'str'), int: trend(s, 'int'), cha: trend(s, 'cha') }, title: jobTitle(s),
          worth: SR.rules.endgame && SR.rules.endgame.breakdown ? SR.rules.endgame.breakdown(s).total : null };
      },
    });
  });
})();
