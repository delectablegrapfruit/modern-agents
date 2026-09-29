// js/ui/screens/profile.js — owner: W2-Front. The `profile` scene (UI §5.18; the title's Achievements
// entry; works with no game running): tabs Achievements (the grid of SR.reg.achievement with the run
// day of each unlock and locked silhouettes; P1 `achievements`, a note until then), Badges ("Old
// School": Classic mode opened; "Met the Artist": the Theory of the Fold finished) and Totals (runs
// finished, days played, falls, fights, best net worth per length). Everything comes from the
// profile (SR.save.profile). Q / E switch tabs; Back returns to the title.
// Load-time rule: defines functions and registers the scene only.
(function () {
  'use strict';
  var SR = window.SR;

  var TABS = ['achievements', 'badges', 'totals'];
  var BADGES = ['oldSchool', 'metArtist'];
  var BUCKETS = ['short', 'medium', 'long', 'unlimited'];
  var P = null;

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function text(k, v) { return SR.text(k, v); }
  function profile() { try { return SR.save.profile(); } catch (e) { return { achievements: {}, badges: {}, totals: {}, hallOfFame: {} }; } }

  function unlockDay(v) {
    if (typeof v === 'number') return v;
    if (v && typeof v === 'object' && typeof v.day === 'number') return v.day;
    return null;
  }

  function achievements(box, p) {
    var defs = SR.registry ? SR.registry.entries('achievement') : [];
    if (!SR.features.achievements || !defs.length) {
      box.appendChild(h('p', { class: 'prof-note', 'data-id': 'prof-ach-soon' }, text('front.profile.achSoon')));
      return;
    }
    var grid = h('ul', { class: 'prof-grid', 'data-id': 'prof-ach-grid', 'aria-label': text('front.profile.tab.achievements') });
    var got = 0;
    defs.forEach(function (e) {
      var d = e.def, v = p.achievements[e.id];
      var on = !!v;
      if (on) got++;
      var name = d.name && SR.text.has(d.name) ? text(d.name) : SR.text.has('ach.' + e.id + '.name') ? text('ach.' + e.id + '.name') : e.id;
      var day = unlockDay(v);
      grid.appendChild(h('li', { class: ['prof-tile', on ? 'is-on' : 'is-locked'], 'data-id': 'prof-ach-' + e.id },
        D().icon(d.icon || 'star', 32, 'prof-ico'),
        h('span', { class: 'prof-tile-name' }, on ? name : text('front.profile.locked')),
        h('span', { class: 'prof-tile-meta' }, on ? (day ? text('front.profile.day', { day: day }) : text('front.profile.unlocked')) : '')));
    });
    box.appendChild(h('p', { class: 'prof-count', 'data-id': 'prof-ach-count' }, text('front.profile.count', { n: got, of: defs.length })));
    box.appendChild(grid);
  }

  function badges(box, p) {
    var grid = h('ul', { class: 'prof-grid prof-grid--badges', 'data-id': 'prof-badges' });
    BADGES.forEach(function (id) {
      var on = !!p.badges[id];
      grid.appendChild(h('li', { class: ['prof-tile', on ? 'is-on' : 'is-locked'], 'data-id': 'prof-badge-' + id },
        h('span', { class: 'prof-tile-name' }, text('front.badge.' + id)),
        h('span', { class: 'prof-tile-meta' }, on ? text('front.badge.' + id + '.got') : text('front.badge.' + id + '.how'))));
    });
    box.appendChild(grid);
  }

  function totals(box, p) {
    var t = p.totals || {};
    var dl = h('dl', { class: 'prof-totals', 'data-id': 'prof-totals' });
    function add(k, v) { dl.appendChild(h('dt', null, text('front.profile.total.' + k))); dl.appendChild(h('dd', { 'data-id': 'prof-total-' + k }, v)); }
    add('runs', SR.text.num(t.runs || 0));
    add('days', SR.text.num(t.days || 0));
    add('falls', SR.text.num(t.falls || 0));
    add('fights', SR.text.num(t.fights || 0));
    BUCKETS.forEach(function (b) {
      var v = t.best && typeof t.best[b] === 'number' ? SR.text.money(t.best[b]) : text('front.profile.none');
      dl.appendChild(h('dt', null, text('front.profile.best', { bucket: text('rank.bucket.' + b) })));
      dl.appendChild(h('dd', { 'data-id': 'prof-best-' + b }, v));
    });
    box.appendChild(dl);
  }

  var BUILD = { achievements: achievements, badges: badges, totals: totals };

  function show(id) {
    P.tab = id;
    D().clear(P.body);
    var box = h('div', { role: 'tabpanel', 'aria-label': text('front.profile.tab.' + id), 'data-id': 'prof-panel-' + id });
    BUILD[id](box, profile());
    P.body.appendChild(box);
  }

  function back() { SR.scenes.go('title'); }

  SR.scenes.register('profile', {
    kind: 'base',
    music: 'paper_sky',
    enter: function () { SR.ui.title.backdrop.enter(); },
    exit: function () { SR.ui.title.backdrop.exit(); },
    update: function (dt) { SR.ui.title.backdrop.update(dt); },
    render: function (ctx, alpha) { SR.ui.title.backdrop.render(ctx, alpha); },
    ui: {
      mount: function (root, params) {
        params = params || {};
        P = { tab: TABS.indexOf(params.tab) >= 0 ? params.tab : 'achievements' };
        P.tabs = SR.ui.tabs({ id: 'prof-tabs', label: 'front.profile.title', value: P.tab,
          tabs: TABS.map(function (id) { return { id: id, label: 'front.profile.tab.' + id }; }), onChange: show });
        P.body = h('div', { class: 'prof-body scroll-y' });
        P.panel = h('section', { class: 'front-panel paper', 'data-id': 'profile', 'aria-label': text('front.profile.title') },
          h('div', { class: 'front-head' }, h('h1', { class: 't-h1' }, text('front.profile.title')),
            SR.ui.button({ id: 'prof-back', label: 'ui.back', hint: 'back', onClick: back })),
          P.tabs, P.body);
        root.appendChild(P.panel);
        show(P.tab);
        P.scope = SR.ui.focus.push(P.panel, { id: 'profile' });
        P.ctxPop = SR.input && SR.input.pushContext ? SR.input.pushContext('tabs') : null;
      },
      unmount: function () {
        if (P) { if (P.ctxPop) P.ctxPop(); if (P.scope) SR.ui.focus.pop(P.scope); }
        P = null;
      },
    },
    onAction: function (action, ev) {
      if (!P || (ev && (ev.consumed || ev.down === false))) return false;
      if (action === 'pocket' && ev && ev.code === 'Tab') return false;
      if (action === 'tabNext') { P.tabs.next(); return true; }
      if (action === 'tabPrev') { P.tabs.prev(); return true; }
      if (SR.ui.focus.handle(action, ev)) return true;
      if (action === 'back' && !(ev && ev.repeat)) { back(); return true; }
      return false;
    },
    /** @returns {object|null} the shown tab (tests). */
    info: function () { return P ? { tab: P.tab } : null; },
  });
})();
