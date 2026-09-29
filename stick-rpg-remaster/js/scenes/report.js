// js/scenes/report.js — owner: W2-Home. the report scene (UI §5.11).
// wave-1 slice placeholder, owner W2-Home (BUILD_PLAN §3.12; the lead at the wave-1 integration).
// Only what the grey-box vertical slice needs: the `report` overlay (params.report, CONTRACT §11.3)
// shows a night's Report in a plain Modal, its lines grouped by `section` in the order of UI §5.11
// (a section with no lines collapses), and opens by itself when an action hands its night to the
// UI (Result.report, e.g. the placeholder home.sleep). Its button finishes the night as CONTRACT
// §13 asks of the report scene (the Report's rule events re-emitted, then day:started { day,
// report }) and returns to the city at the home door. The Daily Fold layout, the headline, the
// editions, the morning sting and the last-day Final Edition are W2-Home's. The owner replaces
// the whole file.
(function () {
  'use strict';
  /* stub, owner: W2-Home */
  var SR = window.SR;

  var SECTIONS = ['overnight', 'money', 'markets', 'weather', 'today', 'hospital', 'jail', 'election'];
  var open = null;             // { params, scope } while the overlay is up

  function D() { return SR.ui.dom; }

  function body(rep) {
    var h = D().h, wrap = h('div', { class: 'report-ph', 'data-id': 'report-sections',
      style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--sp-4)', marginTop: 'var(--sp-4)' } });
    SECTIONS.forEach(function (sec) {
      var lines = (rep.lines || []).filter(function (l) { return l && l.section === sec; });
      if (!lines.length) return;
      wrap.appendChild(h('section', { 'data-id': 'report-sec-' + sec },
        h('h3', { class: 't-label' }, D().t('news.section.' + sec)),
        h('ul', { style: { listStyle: 'none', margin: '0', padding: '0' } }, lines.map(function (l) {
          return h('li', { class: 't-body', style: { display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', margin: 'var(--sp-1) 0' } },
            l.icon ? D().icon(l.icon, 20) : null, h('span', null, D().t(l.key, l.vars)));
        }))));
    });
    return wrap;
  }

  /** The button: the night's events, day:started, then the city at the home door. */
  function finish(params) {
    var top = SR.scenes.top();
    if (!open || !top || top.id !== 'report' || top.params !== params) return;
    var rep = params.report || {};
    (rep.events || []).forEach(function (e) { if (e && e.name) SR.events.emit(e.name, e.payload); });
    if (SR.state) SR.events.emit('day:started', { day: typeof rep.day === 'number' ? rep.day : SR.state.clock.day, report: rep });
    if (SR.state && SR.world.ready) SR.world.place('homeDoor', SR.state);
    SR.scenes.go(SR.reg.scene.city ? 'city' : 'title');
  }

  SR.scenes.register('report', {
    kind: 'overlay',
    blocksUpdate: true,
    ui: {
      mount: function (root, params) {
        params = params || {};
        var rep = params.report || {}, kind = rep.kind === 'hospital' || rep.kind === 'jail' ? rep.kind : 'sleep';
        var vars = { day: rep.day, weekday: D().t('hud.weekday.' + rep.weekday) };
        var box = SR.ui.modal({
          id: 'report', title: 'news.masthead', text: 'news.edition.' + kind, vars: vars, large: true, icon: 'news', body: body(rep),
          actions: [{ id: 'continue', label: 'news.continue', variant: 'primary', autofocus: true }],
          onAction: function () { finish(params); },
        });
        root.classList.add('modal-root');
        root.appendChild(D().h('div', { class: 'scrim', 'data-id': 'scrim' }));
        root.appendChild(box);
        open = { params: params, scope: SR.ui.focus.push(box, { id: 'report' }) };
      },
      unmount: function () {
        if (open) SR.ui.focus.pop(open.scope);
        open = null;
      },
    },
    onAction: function (action, ev) {
      if (SR.ui.focus.handle(action, ev)) return true;
      if (open && action === 'back' && (!ev || ev.down !== false)) { finish(open.params); return true; }
      return false;
    },
  });

  // An action that ran a night hands its Report to the UI (CONTRACT §8.9: Result.report).
  SR.onBoot(50, function () {
    SR.events.on('action:done', function (p) {
      var r = p && p.result;
      if (r && r.ok && r.report && !(SR.scenes.top() && SR.scenes.top().id === 'report')) SR.scenes.push('report', { report: r.report });
    });
  });
})();
