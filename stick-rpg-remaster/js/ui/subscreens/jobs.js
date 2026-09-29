// js/ui/subscreens/jobs.js — owner: W2-Money. The sub-screen `nli.jobs` (CONTRACT §10; UI.md §5.6
// "NLI › Jobs: the ladder as a vertical list: each rank's INT, CHA, shifts and wage; you-are-here
// marker; missing requirements in danger-ink"; GDD §4.6; BALANCE B-05). New Lines Inc.'s ladder,
// Janitor to CEO: each rung's title, pay (hourly and a Full shift, after the difficulty's and the
// decrees' wage factors: SR.rules.jobs.wage), requirements (INT; CHA from Salesperson up; shifts
// at the rank below; P1 `hustles`: the rating from VP up) and credit limit (B-05, the bank's loan
// limit); your rung marked "You are here", the next one "Next" with every missing requirement in
// danger ink (or "Ready"); the Apply / Ask for a promotion button (ctx.act('nli.apply' /
// 'nli.promote'), its refusal from ctx.preview); the week's Friday bonus from Executive up
// (B-05 weeklyBonus). Never mutates state. Node-loadable: no DOM or browser API at load time.
(function () {
  'use strict';
  var SR = window.SR;

  var TRACK = 'nli';

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function t(k, v) { return D().t(k, v); }
  function money(n) { return SR.text.money(n); }
  function J() { return SR.tuning.jobs; }
  function title(id) { return SR.text('job.' + id); }

  /** @returns {string[]} the NLI ladder (B-05), rungs whose feature is off left out. */
  function ladder() {
    return (J().ladder[TRACK] || []).filter(function (id) {
      var d = SR.reg.job[id];
      return !d || !d.feature || SR.features[d.feature];
    });
  }

  /** The requirement line of a rung (B-05). */
  function needs(id, prev) {
    var row = J()[id], parts = [];
    parts.push(row.cha > 0 ? t('card.nli.needsCha', { int: row.int, cha: row.cha }) : t('card.nli.needs', { int: row.int }));
    if (prev && row.shifts > 0) parts.push(t('card.nli.shifts', { n: row.shifts, job: title(prev) }));
    if (SR.features.hustles && row.rating) parts.push(t('card.nli.rating', { n: row.rating }));
    return parts.join(' · ');
  }

  /** @returns {string[]} the missing requirements of the next rung, as lines. */
  function missing(s, p) {
    var cur = s.job.ranks[TRACK];
    return p.missing.filter(function (m) { return m.key !== 'top'; }).map(function (m) {
      if (m.key === 'shifts') return t('card.nli.missingShifts', { need: m.need, have: m.have, job: title(cur) });
      if (m.key === 'rating') return t('card.nli.missingRating', { need: m.need, have: m.have });
      return t('card.nli.missingStat', { stat: SR.rules.conditions.label(m.key), need: m.need, have: m.have });
    });
  }

  function rung(s, id, i, list, cur, p) {
    var row = J()[id], def = SR.reg.job[id] || {};
    var here = id === cur, next = p.next === id;
    var wage = SR.rules.jobs.wage(s, id);
    var full = Math.round(wage * J().shift.full.min / 60);
    var head = h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
      D().icon(def.icon || 'work', 32),
      h('strong', { 'data-id': 'ladder-title-' + id, style: { fontSize: 'calc(16px * var(--ui-scale))' } }, title(id)),
      here ? SR.ui.badge({ text: 'card.nli.here', kind: 'money', id: 'ladder-here' }) : null,
      next ? SR.ui.badge({ text: 'card.nli.next', kind: 'new', id: 'ladder-next' }) : null);
    var body = [
      h('div', { class: 't-small', 'data-id': 'ladder-pay-' + id }, t('card.nli.pay', { money: money(wage), full: money(full) })),
      h('div', { class: 't-small', 'data-id': 'ladder-needs-' + id, style: { color: 'var(--ink-700)' } }, needs(id, i > 0 ? list[i - 1] : null)),
      h('div', { class: 't-small', style: { color: 'var(--ink-700)' } }, t('card.nli.credit', { money: money(row.credit) })),
    ];
    if (next) {
      var miss = missing(s, p);
      if (miss.length) {
        body.push(h('div', { class: 't-small', 'data-id': 'ladder-missing', style: { color: 'var(--danger-ink)', fontWeight: '700', marginTop: 'var(--sp-1)' } },
          t('card.nli.missingTitle', { job: title(id) }),
          h('ul', { style: { margin: '2px 0 0', paddingLeft: '1.2em' } }, miss.map(function (m) { return h('li', null, m); }))));
      } else {
        body.push(h('div', { class: 't-small', 'data-id': 'ladder-ready', style: { color: 'var(--ink-900)', fontWeight: '700', marginTop: 'var(--sp-1)' } },
          t('card.nli.ready', { job: title(id) })));
      }
    }
    return h('div', { role: 'listitem', 'data-id': 'ladder-' + id,
      style: { padding: 'var(--sp-2) var(--sp-3)', borderLeft: '6px solid ' + (here ? 'var(--money)' : next ? 'var(--primary-500)' : 'var(--paper-3)'),
        background: here ? 'var(--money-100)' : next ? 'var(--primary-100)' : 'transparent', marginBottom: 'var(--sp-1)', borderRadius: 'var(--r-xs)' } },
    head, body);
  }

  function render(M) {
    var root = M.root, s = M.ctx.state, a = document.activeElement;
    var inside = !!(a && root.contains(a));
    D().clear(root);
    var cur = s.job.ranks[TRACK] || null;
    var p = SR.rules.jobs.promotion(s, TRACK);
    root.appendChild(h('p', { class: 't-small', 'data-id': 'ladder-intro', style: { margin: '0', color: 'var(--ink-700)' } }, t('card.nli.intro')));
    root.appendChild(h('p', { class: 't-body', 'data-id': 'ladder-status', style: { margin: '0', fontWeight: '700' } },
      cur ? t('card.nli.hiredAs', { job: title(cur), shifts: SR.text.num(s.job.shiftsAtRank[TRACK] || 0, (s.job.shiftsAtRank[TRACK] || 0) % 1 ? 1 : 0) }) : t('card.nli.notHired')));
    var mc = s.job.ranks.mcsticks;
    if (mc && cur) root.appendChild(h('p', { class: 't-small', 'data-id': 'ladder-moonlight', style: { margin: '0', color: 'var(--ink-700)' } }, t('card.nli.moonlight', { job: title(mc) })));
    // The action: Apply before you are hired, then Ask for a promotion (the card's rows, here too).
    var action = cur ? 'nli.promote' : 'nli.apply';
    var pv = M.ctx.preview(action, {});
    if (!pv.hidden) {
      var top = cur && !p.next;
      if (top) root.appendChild(h('p', { class: 't-small', 'data-id': 'ladder-top', style: { margin: '0', fontWeight: '700' } }, t('card.nli.top')));
      else {
        var btn = SR.ui.button({ id: 'ladder-go', label: 'act.' + action, variant: 'primary', icon: cur ? 'promotion' : 'apply', autofocus: true,
          disabled: !pv.ok, reason: pv.reason, reasonVars: pv.vars,
          onClick: function () {
            var now = M.ctx.preview(action, {});
            if (!now.ok) { D().refuse(btn, now.reason ? t(now.reason, now.vars) : ''); return; }
            M.ctx.act(action, {});
          } });
        root.appendChild(h('div', null, btn));
      }
    }
    root.appendChild(h('h3', { class: 'bcard-group', style: { margin: 'var(--sp-1) 0 0' } }, t('card.nli.jobs')));
    var list = ladder();
    var el = h('div', { role: 'list', 'data-id': 'ladder-list', 'aria-label': t('card.nli.jobs') });
    list.forEach(function (id, i) { el.appendChild(rung(s, id, i, list, cur, p)); });
    root.appendChild(el);
    // The Friday bonus (B-05 weeklyBonus): the week so far at your rank, or who gets one.
    var wb = J().weeklyBonus, pct = cur && typeof wb[cur] === 'number' ? wb[cur] : 0;
    if (pct) {
      var wages = s.job.weekNliWages || 0;
      root.appendChild(h('p', { class: 't-small', 'data-id': 'ladder-bonus', style: { margin: '0', fontWeight: '700' } },
        t('card.nli.bonus', { wages: money(wages), pct: Math.round(pct * 100), money: money(Math.floor(wages * pct)) })));
    } else {
      var pcts = list.map(function (id) { return wb[id]; }).filter(function (v) { return typeof v === 'number'; });
      if (pcts.length) {
        root.appendChild(h('p', { class: 't-small', 'data-id': 'ladder-bonus', style: { margin: '0', color: 'var(--ink-700)' } },
          t('card.nli.bonusFrom', { from: Math.round(Math.min.apply(null, pcts) * 100), to: Math.round(Math.max.apply(null, pcts) * 100) })));
      }
    }
    if (inside) {
      var f = root.querySelector('[data-id="ladder-go"]') || root.querySelector('[data-nav]');
      if (f) SR.ui.focus.focus(f);
    }
  }

  /** Scrolls the card body back to the top on opening (docs/requests/W2-Money.md 2). */
  function toTop(root) {
    for (var el = root.parentElement; el && !el.hasAttribute('data-scene'); el = el.parentElement) if (el.scrollTop) el.scrollTop = 0;
  }

  var mounts = [];
  function of(ctx) { for (var i = mounts.length - 1; i >= 0; i--) if (mounts[i].ctx === ctx) return mounts[i]; return mounts[mounts.length - 1] || null; }

  SR.def.subscreen('nli.jobs', {
    title: 'sub.nli.jobs',
    p: 0,
    mount: function (root, ctx) { var M = { root: root, ctx: ctx, alive: true }; mounts.push(M); render(M); toTop(root); },
    refresh: function (ctx) { var M = of(ctx); if (!M || !M.alive) return; M.ctx = ctx || M.ctx; render(M); },
    unmount: function () { var M = mounts.pop(); if (M) M.alive = false; },
  });
})();
