// js/ui/screens/halloffame.js — owner: W2-Front. The `halloffame` scene (UI §5.18; GDD §4.19; B-18;
// P1 `achievements`: the title shows its entry while the flag is on): tabs per length (Short, Medium,
// Long, Unlimited), the top 10 runs of each (name, rank, net worth, legacy, date, difficulty), from
// the profile (js/ui/screens/results.js files them). Q / E switch tabs; Back returns to the title.
// Load-time rule: defines functions and registers the scene only.
(function () {
  'use strict';
  var SR = window.SR;

  var BUCKETS = ['short', 'medium', 'long', 'unlimited'];
  var F = null;

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function text(k, v) { return SR.text(k, v); }

  function rows(bucket) {
    var p;
    try { p = SR.save.profile(); } catch (e) { p = null; }
    return p && Array.isArray(p.hallOfFame[bucket]) ? p.hallOfFame[bucket] : [];
  }

  function table(bucket) {
    var list = rows(bucket);
    if (!list.length) return h('p', { class: 'hof-empty', 'data-id': 'hof-empty' }, text('front.hof.empty'));
    var head = h('tr', null, ['n', 'name', 'rank', 'netWorth', 'legacy', 'date', 'difficulty'].map(function (k) {
      return h('th', { scope: 'col', class: 'hof-' + k }, text('front.hof.col.' + k));
    }));
    var body = h('tbody');
    list.forEach(function (e, i) {
      body.appendChild(h('tr', { 'data-id': 'hof-row-' + (i + 1) },
        h('td', { class: 'hof-n' }, String(i + 1)),
        h('td', { class: 'hof-name' }, e.name || ''),
        h('td', { class: 'hof-rank' }, e.rankKey && SR.text.has(e.rankKey) ? text(e.rankKey) : String(e.rank || '')),
        h('td', { class: 'hof-num' }, SR.text.money(e.netWorth || 0)),
        h('td', { class: 'hof-num' }, SR.text.num(e.legacy || 0)),
        h('td', { class: 'hof-date' }, e.date || ''),
        h('td', { class: 'hof-diff' }, SR.ui.title.difficultyName(e.difficulty))));
    });
    return h('table', { class: 'hof-table', 'data-id': 'hof-table-' + bucket }, h('thead', null, head), body);
  }

  function show(bucket) {
    F.bucket = bucket;
    D().clear(F.body);
    F.body.appendChild(h('div', { role: 'tabpanel', 'aria-label': text('rank.bucket.' + bucket), 'data-id': 'hof-panel-' + bucket }, table(bucket)));
  }

  function back() { SR.scenes.go('title'); }

  SR.scenes.register('halloffame', {
    kind: 'base',
    music: 'paper_sky',
    enter: function () { SR.ui.title.backdrop.enter(); },
    exit: function () { SR.ui.title.backdrop.exit(); },
    update: function (dt) { SR.ui.title.backdrop.update(dt); },
    render: function (ctx, alpha) { SR.ui.title.backdrop.render(ctx, alpha); },
    ui: {
      mount: function (root, params) {
        params = params || {};
        F = { bucket: BUCKETS.indexOf(params.tab) >= 0 ? params.tab : 'medium' };
        F.tabs = SR.ui.tabs({ id: 'hof-tabs', label: 'front.hof.title', value: F.bucket,
          tabs: BUCKETS.map(function (b) { return { id: b, label: 'rank.bucket.' + b }; }), onChange: show });
        F.body = h('div', { class: 'hof-body scroll-y' });
        F.panel = h('section', { class: 'front-panel paper', 'data-id': 'halloffame', 'aria-label': text('front.hof.title') },
          h('div', { class: 'front-head' }, h('h1', { class: 't-h1' }, text('front.hof.title')),
            SR.ui.button({ id: 'hof-back', label: 'ui.back', hint: 'back', onClick: back })),
          h('p', { class: 'front-sub' }, text('front.hof.sub')), F.tabs, F.body);
        root.appendChild(F.panel);
        show(F.bucket);
        F.scope = SR.ui.focus.push(F.panel, { id: 'halloffame' });
        F.ctxPop = SR.input && SR.input.pushContext ? SR.input.pushContext('tabs') : null;
      },
      unmount: function () {
        if (F) { if (F.ctxPop) F.ctxPop(); if (F.scope) SR.ui.focus.pop(F.scope); }
        F = null;
      },
    },
    onAction: function (action, ev) {
      if (!F || (ev && (ev.consumed || ev.down === false))) return false;
      if (action === 'pocket' && ev && ev.code === 'Tab') return false;
      if (action === 'tabNext') { F.tabs.next(); return true; }
      if (action === 'tabPrev') { F.tabs.prev(); return true; }
      if (SR.ui.focus.handle(action, ev)) return true;
      if (action === 'back' && !(ev && ev.repeat)) { back(); return true; }
      return false;
    },
    /** @returns {object|null} the shown tab and its rows (tests). */
    info: function () { return F ? { bucket: F.bucket, rows: rows(F.bucket).length } : null; },
  });
})();
