// js/ui/pocket/journal.js — owner: W2-Pocket (W3-Prog in wave 3). The Pocket's Journal tab (UI §5.9,
// §9): the First Day list (P0: while the run's mode.tutorial is on and it is still day 1: check
// messages · eat something · work a shift at McSticks · study at the U of S · go home and sleep),
// the Advisor's goals and the Road to Office checklist (P1 `advisor`, once W3-Prog's
// SR.rules.advisor lands), the tips you have seen (P1 `tutorial`), and Help: one page per topic.
// First Day ticks come from the state (a message read, a shift worked, a U of S activity today),
// and eating from the `eat` rule event this session or state.records.meals when the rules record it.
// Registered with SR.ui.pocket.panel at boot (prio 50). Load-time rule: defines functions only.
(function () {
  'use strict';
  var SR = window.SR;

  var FIRST_DAY = ['messages', 'eat', 'work', 'study', 'sleep'];                       // UI §9, in order
  var HELP = ['time', 'stats', 'karma', 'jobs', 'money', 'crime', 'getAround', 'endgame'];

  var J = null;          // { root, ctx, topic }
  var lastTopic = null;  // the Help page reopens where you left it (this session)
  var ate = {};          // `${seed}:${day}` → true: an `eat` rule event heard this session

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function t(k, v) { return D().t(k, v); }
  function dayKey(s) { return s.seed + ':' + s.clock.day; }

  /** @returns {boolean} the First Day list shows (P0: the run's tutorial is on, day 1). */
  function firstDayOn(s) { return !!(s && s.mode && s.mode.tutorial !== false && s.clock.day === 1); }

  /** @returns {object} step → done, read from the state (UI §9). */
  function firstDay(s) {
    var msgs = (s.msgs || []).filter(function (m) { return m && !m.archived; });
    return {
      messages: msgs.length > 0 && msgs.every(function (m) { return m.read; }),
      eat: !!ate[dayKey(s)] || (s.records && s.records.meals > 0),
      work: (s.job && s.job.totalShifts > 0) || (s.records && s.records.shiftsMcsticks > 0),
      study: !!(s.daily && s.daily.uofsKarma > 0) || !!ate['study:' + dayKey(s)],
      sleep: s.clock.day > 1,
    };
  }

  function heading(key, id) {
    return h('h3', { class: 't-label', 'data-id': id || null, style: { margin: 'var(--sp-3) 0 var(--sp-2)', color: 'var(--ink-900)',
      fontFamily: 'var(--font-display)', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.02em' } }, t(key));
  }

  function check(done, label, id) {
    return h('li', { 'data-id': id, 'data-done': done ? 'true' : 'false', style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
      padding: '6px 0', borderBottom: 'var(--line-thin)' } },
      h('span', { 'aria-hidden': 'true', style: { display: 'inline-grid', placeItems: 'center', width: '24px', height: '24px', flex: 'none',
        border: 'var(--line)', borderRadius: 'var(--r-xs)', background: done ? 'var(--ok)' : 'var(--paper-0)', color: 'var(--ink-900)', fontWeight: '900' } }, done ? '✓' : ''),
      h('span', { style: { flex: '1 1 auto', fontWeight: '600', color: done ? 'var(--ink-700)' : 'var(--ink-900)', textDecoration: done ? 'line-through' : 'none' } }, t(label)),
      h('span', { class: 'vh' }, t(done ? 'pocket.journal.done' : 'pocket.journal.todo')));
  }

  function renderFirstDay(s, box) {
    if (!firstDayOn(s)) return;
    var st = firstDay(s);
    box.appendChild(heading('pocket.journal.firstDay', 'journal-firstday-title'));
    var all = FIRST_DAY.every(function (k) { return k === 'sleep' || st[k]; });
    box.appendChild(h('p', { class: 't-small', style: { margin: '0 0 var(--sp-2)', color: 'var(--ink-700)' } }, t(all ? 'pocket.journal.firstDayDone' : 'pocket.journal.firstDayNote')));
    var ul = h('ul', { 'data-id': 'journal-firstday', style: { listStyle: 'none', margin: '0', padding: '0' } });
    FIRST_DAY.forEach(function (k) { ul.appendChild(check(st[k], 'pocket.journal.fd.' + k, 'journal-fd-' + k)); });
    box.appendChild(ul);
  }

  /** P1 `advisor`: up to 3 goals with ProgressBars, then the Road to Office (GDD §4.17, B-17). */
  function renderAdvisor(s, box) {
    if (!(SR.features && SR.features.advisor)) return;
    var A = SR.rules.advisor;
    if (A && typeof A.goals === 'function') {
      var goals = [];
      try { goals = A.goals(s) || []; } catch (e) { goals = []; }
      if (goals.length) {
        box.appendChild(heading('pocket.journal.advisor'));
        goals.slice(0, 3).forEach(function (g, i) {
          var p = g.progress || {};
          box.appendChild(SR.ui.progress({ id: 'journal-goal-' + i, label: g.key, vars: g.vars, value: p.value || 0, max: p.max || 1, kind: p.kind || 'primary' }));
        });
      }
    }
    var R = SR.tuning.election && SR.tuning.election.requires;
    if (!R) return;
    var path = s.stats.karma < 0 ? R.dictator : R.president;
    var low = Math.min(s.stats.str, s.stats.int, s.stats.cha);
    var karmaOk = s.stats.karma < 0 ? s.stats.karma <= R.dictator.karmaMax : s.stats.karma >= R.president.karmaMin;
    box.appendChild(heading('pocket.journal.road'));
    var ul = h('ul', { 'data-id': 'journal-road', style: { listStyle: 'none', margin: '0', padding: '0' } });
    ul.appendChild(check(s.homes.living === R.home, 'pocket.journal.road.castle', 'journal-road-castle'));
    ul.appendChild(check(s.money.cash + s.money.bank >= R.money, t('pocket.journal.road.money', { money: SR.text.money(R.money) }), 'journal-road-money'));
    ul.appendChild(check(low >= path.stats, t('pocket.journal.road.stats', { n: path.stats }), 'journal-road-stats'));
    ul.appendChild(check(karmaOk, t('pocket.journal.road.karma', { n: s.stats.karma < 0 ? '≤ ' + R.dictator.karmaMax : '≥ +' + R.president.karmaMin }), 'journal-road-karma'));
    box.appendChild(ul);
  }

  /** P1 `tutorial`: the one-shot tips you have seen, to re-read (UI §9; keys hint.<id> when W3-Onboard registers them). */
  function renderHints(s, box) {
    if (!(SR.features && SR.features.tutorial)) return;
    var seen = Object.keys((s.journal && s.journal.hintsSeen) || {}).filter(function (k) { return SR.text.has('hint.' + k); });
    if (!seen.length) return;
    box.appendChild(heading('pocket.journal.hints'));
    var ul = h('ul', { style: { margin: '0', paddingLeft: 'var(--sp-4)' } });
    seen.forEach(function (k) { ul.appendChild(h('li', { style: { padding: '2px 0' } }, SR.text('hint.' + k))); });
    box.appendChild(ul);
  }

  function renderHelp(box) {
    box.appendChild(heading('pocket.journal.help', 'journal-help-title'));
    box.appendChild(h('p', { class: 't-small', style: { margin: '0 0 var(--sp-2)', color: 'var(--ink-700)' } }, t('pocket.journal.helpIntro')));
    var bar = h('div', { role: 'tablist', 'aria-label': t('pocket.journal.help'), 'data-id': 'journal-help-topics',
      style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-1)', marginBottom: 'var(--sp-2)' } });
    HELP.forEach(function (k) {
      var on = J.topic === k;
      var b = h('button', { type: 'button', role: 'tab', class: 'btn btn--s ' + (on ? 'btn--primary' : 'btn--secondary'), 'data-nav': '',
        'data-id': 'journal-help-' + k, 'aria-selected': on ? 'true' : 'false' }, t('pocket.help.' + k + '.title'));
      b.addEventListener('click', function () {
        D().sfx('click');
        J.topic = k;
        render();
        var again = J.root.querySelector('[data-id="journal-help-' + k + '"]');
        if (again) SR.ui.focus.focus(again);
      });
      bar.appendChild(b);
    });
    box.appendChild(bar);
    box.appendChild(h('div', { role: 'tabpanel', 'data-id': 'journal-help-page', 'aria-label': t('pocket.help.' + J.topic + '.title'),
      style: { padding: 'var(--sp-3)', border: 'var(--line)', borderRadius: 'var(--r-m)', background: 'var(--paper-0)' } },
      h('h4', { class: 't-label', style: { margin: '0 0 var(--sp-1)', color: 'var(--ink-900)' } }, t('pocket.help.' + J.topic + '.title')),
      h('p', { class: 't-body', style: { margin: '0', color: 'var(--ink-900)' } }, t('pocket.help.' + J.topic + '.body'))));
  }

  function render() {
    if (!J) return;
    var s = J.ctx.state;
    D().clear(J.root);
    var box = h('div', { class: 'journal', 'data-id': 'journal', style: { maxWidth: '760px' } });
    if (s) { renderFirstDay(s, box); renderAdvisor(s, box); renderHints(s, box); }
    renderHelp(box);
    J.root.appendChild(box);
  }

  SR.onBoot(50, function () {
    if (SR.events && typeof SR.events.on === 'function') {
      // Eating and studying on day 1 (the list's only facts the state may not keep).
      SR.events.on('eat', function () { if (SR.state) ate[dayKey(SR.state)] = true; });
      SR.events.on('train', function (p) {
        var row = p && SR.tuning.training && SR.tuning.training[p.id];
        if (SR.state && row && row.where === 'uofs') ate['study:' + dayKey(SR.state)] = true;
      });
    }
    if (!SR.ui.pocket || typeof SR.ui.pocket.panel !== 'function') return;
    SR.ui.pocket.panel('journal', {
      label: 'pocket.tab.journal', icon: 'journal', needsGame: false,
      mount: function (root, ctx) { J = { root: root, ctx: ctx, topic: (ctx.params && ctx.params.topic) || lastTopic || HELP[0] }; render(); },
      refresh: function (ctx) { if (!J) return; J.ctx = ctx; var a = document.activeElement, had = a && J.root.contains(a) ? a.getAttribute('data-id') : null;
        render(); if (had) { var again = J.root.querySelector('[data-id="' + had + '"]'); if (again) SR.ui.focus.focus(again); } },
      unmount: function () { if (J) lastTopic = J.topic; J = null; },
      /** @returns {object} the First Day list and the Help topic (tests). */
      debug: function () {
        var s = SR.state;
        return { firstDay: s && firstDayOn(s) ? firstDay(s) : null, topic: J ? J.topic : null, topics: HELP.slice() };
      },
      firstDay: firstDay,
    });
  });
})();
