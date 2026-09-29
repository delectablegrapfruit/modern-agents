// js/ui/pocket/achievements.js — owner: W2-Pocket (W3-Prog in wave 3). The Pocket's Achievements
// tab (UI §5.9, §5.18; P1 `achievements`): this run's grid of the 48 achievements, each tile with
// its icon and name once unlocked (and the run day it happened, state.achievements[id]), a locked
// silhouette otherwise, and the count. A placeholder until W3-Prog registers the defs
// (SR.def.achievement in js/data/achievements.js) and takes the file over: it shows whatever defs
// exist, reading `name` / `icon` when a def has them (else `ach.<id>` and the trophy).
// Registered with SR.ui.pocket.panel at boot (prio 50). Load-time rule: defines functions only.
(function () {
  'use strict';
  var SR = window.SR;

  var TILE = 96;
  var A = null;   // { root, ctx }

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function t(k, v) { return D().t(k, v); }

  function defs() { return SR.registry.entries('achievement').map(function (e) { return e.def; }); }

  function render() {
    if (!A) return;
    var s = A.ctx.state, list = defs(), got = (s && s.achievements) || {};
    D().clear(A.root);
    if (!list.length) { A.root.appendChild(h('p', { class: 't-body', 'data-id': 'ach-none', style: { color: 'var(--ink-700)' } }, t('pocket.ach.none'))); return; }
    var n = list.filter(function (d) { return got[d.id] !== undefined; }).length;
    A.root.appendChild(h('p', { class: 't-label', 'data-id': 'ach-progress', style: { margin: '0 0 var(--sp-3)' } }, t('pocket.ach.progress', { n: n, total: list.length })));
    var grid = h('ul', { 'data-id': 'ach-grid', style: { listStyle: 'none', margin: '0', padding: '0', display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(' + TILE + 'px, 1fr))', gap: 'var(--sp-2)' } });
    list.forEach(function (d) {
      var day = got[d.id], on = day !== undefined;
      var name = on ? t(d.name || 'ach.' + d.id) : t('pocket.ach.locked');
      grid.appendChild(h('li', { 'data-id': 'ach-' + d.id, 'data-unlocked': on ? 'true' : 'false',
        style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minHeight: TILE + 'px', padding: 'var(--sp-2)',
          border: on ? 'var(--line)' : 'var(--line-thin)', borderRadius: 'var(--r-m)', background: on ? 'var(--paper-0)' : 'var(--paper-2)', textAlign: 'center' } },
        D().icon(on ? d.icon || 'trophy' : 'lock', 32),
        h('span', { class: 't-small', style: { fontWeight: '700', color: on ? 'var(--ink-900)' : 'var(--ink-700)' } }, name),
        on ? h('span', { class: 't-small', style: { color: 'var(--ink-700)' } }, t('pocket.ach.day', { day: day })) : null));
    });
    A.root.appendChild(grid);
  }

  SR.onBoot(50, function () {
    if (!SR.ui.pocket || typeof SR.ui.pocket.panel !== 'function') return;
    SR.ui.pocket.panel('achievements', {
      label: 'pocket.tab.achievements', icon: 'trophy', feature: 'achievements',
      mount: function (root, ctx) { A = { root: root, ctx: ctx }; render(); },
      refresh: function (ctx) { if (A) { A.ctx = ctx; render(); } },
      unmount: function () { A = null; },
      debug: function () { return { defs: defs().length, unlocked: SR.state ? Object.keys(SR.state.achievements || {}) : [] }; },
    });
  });
})();
