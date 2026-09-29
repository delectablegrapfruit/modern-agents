// js/ui/subscreens/bank.js — owner: W2-Money. The bank's sub-screens (CONTRACT §10; UI.md §5.6;
// GDD §4.8; BALANCE B-09):
//   bank.deposit / bank.withdraw  the balances, a NumberField with 10 % / 50 % / All, the live
//                                 preview chips (or the refusal) and the commit button;
//   bank.loan                     the credit limit of your best job, the terms (r + 1 % a day,
//                                 15 days), a NumberField and Borrow (asks first: a loan is never
//                                 half done); the loan you owe with its days left and Repay; the
//                                 lien and the credit freeze, if any; what a default does on this
//                                 difficulty (B-09 default.*, B-16);
//   bank.rates                    today's rate, its 30-day chart, what your balance earns tonight
//                                 (the tiers and the $25,000 cap), the loan rate and Penny's forecast;
//   bank.cds (P1 `homesPlus`)     open a CD (≥ $1,000, r × 1.2, 7 days) and the open ones with Break.
// Every commit goes through ctx.act with the bank's commit actions (js/data/buildings/bank.js:
// bank.deposit, bank.withdraw, bank.loan, bank.repay, bank.openCd, bank.breakCd); every chip and
// refusal comes from ctx.preview. Back is vetoed (the host asks to discard) while a changed amount
// has not been committed. Never mutates state. Node-loadable: no DOM, canvas or browser API at load
// time.
(function () {
  'use strict';
  var SR = window.SR;

  var CHART_W = 400, CHART_H = 140;   // the rate board's LineChart (fits the 472 px card body)
  var LOAN_ITER_MAX = 400;            // the estimate's nightly steps (B-09 loan.days is 15)
  var RATE_POINTS = 30;               // the rate board's 30-day chart (UI.md §5.6; the rules keep 30 points)

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function t(k, v) { return D().t(k, v); }
  function money(n) { return SR.text.money(n); }
  function B() { return SR.tuning.bank; }
  /** @returns {string} a daily rate in percent (2.4 → "2.40 %"). */
  function ratePct(r) { return SR.text.pct(r / 100, 2); }

  // ---- per-mount records (a sub-screen may be open in the card and in the Pocket at once) ------
  function registry() {
    var list = [];
    return {
      add: function (M) { list.push(M); return M; },
      of: function (ctx) { for (var i = list.length - 1; i >= 0; i--) if (list[i].ctx === ctx) return list[i]; return list[list.length - 1] || null; },
      pop: function () { var M = list.pop(); if (M) M.alive = false; return M; },
    };
  }

  // ---- shared pieces --------------------------------------------------------------------------------

  /** The two balances side by side (cash, bank; the loan when one is open). */
  function balances(state, withLoan) {
    function fig(id, label, value, kind) {
      return h('div', { 'data-id': id, style: { flex: '1 1 0', minWidth: '0', padding: 'var(--sp-2) var(--sp-3)', borderRadius: 'var(--r-s)',
        background: kind === 'loan' ? 'var(--hp-100)' : 'var(--money-100)' } },
      h('div', { class: 't-small', style: { color: 'var(--ink-700)', fontWeight: '600' } }, t(label)),
      h('div', { style: { font: '900 calc(20px * var(--ui-scale)) var(--font-display)', color: kind === 'loan' ? 'var(--hp-ink)' : 'var(--money-ink)',
        fontVariantNumeric: 'tabular-nums' } }, money(value)));
    }
    var m = state.money;
    var row = h('div', { 'data-id': 'bank-balances', style: { display: 'flex', gap: 'var(--sp-2)' } },
      fig('bank-cash', 'card.bank.cash', m.cash), fig('bank-bank', 'card.bank.balance', m.bank));
    if (withLoan && m.loan && m.loan.amount > 0) row.appendChild(fig('bank-owed', 'card.bank.owed', m.loan.amount, 'loan'));
    return row;
  }

  function note(id, key, vars, tone) {
    // The sub-screen is a flex column with its own gap (css/components.css .subscreen): no margins.
    return h('p', { class: 't-small', 'data-id': id, style: { margin: '0', color: tone === 'danger' ? 'var(--danger-ink)' : 'var(--ink-700)' } }, t(key, vars));
  }

  function box(id, children, tone) {
    return h('div', { 'data-id': id, role: 'note', style: { padding: 'var(--sp-2) var(--sp-3)', margin: '0', borderRadius: 'var(--r-s)',
      border: tone === 'danger' ? '2px solid var(--danger-ink)' : 'var(--line-thin)', background: tone === 'danger' ? 'var(--hp-100)' : 'var(--paper-2)' } }, children);
  }

  function heading(key, vars) { return h('h3', { class: 'bcard-group', style: { margin: 'var(--sp-1) 0 0' } }, t(key, vars)); }

  /** The chips of a preview, or its refusal in danger ink (the ActionRow's line, UI.md §2.3). */
  function chipsLine(id, pv) {
    var line = h('div', { 'data-id': id, class: 'arow-line', 'aria-live': 'off', style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-1)', minHeight: 'calc(24px * var(--ui-scale))', margin: 'var(--sp-1) 0' } });
    fillChips(line, pv);
    return line;
  }
  function fillChips(line, pv) {
    D().clear(line);
    if (!pv || pv.hidden) return;
    if (!pv.ok) { if (pv.reason) line.appendChild(h('span', { class: 'arow-reason' }, t(pv.reason, pv.vars))); return; }
    SR.ui.chip.gains(pv).forEach(function (c) { line.appendChild(c); });
  }

  /**
   * Scrolls the card body back to the top when a sub-screen opens: the host resets its own body,
   * but the card's scrolling body keeps the row list's offset (docs/requests/W2-Money.md 2).
   */
  function toTop(root) {
    for (var el = root.parentElement; el && !el.hasAttribute('data-scene'); el = el.parentElement) if (el.scrollTop) el.scrollTop = 0;
  }

  /** Rebuilds a sub-screen's DOM, keeping focus on the control with the same data-id. */
  function rebuild(M, build) {
    var root = M.root, a = document.activeElement;
    var inside = !!(a && root.contains(a));
    var had = inside ? a.getAttribute('data-id') : null;
    D().clear(root);
    build(M);
    if (!inside) return;
    var el = had && root.querySelector('[data-id="' + had + '"]');
    if (!el || el.getAttribute('aria-disabled') === 'true') el = root.querySelector('[data-autofocus]') || root.querySelector('[data-nav]:not([aria-disabled="true"])');
    if (el) SR.ui.focus.focus(el);
  }

  /**
   * An amount form: a NumberField (money, whole dollars), the preview chips and a commit button.
   * @param {object} o { id, action, max, value, quick, button (text key with {money}), onCommit(amount),
   *   ctx, M, autofocus, params (extra action params) }
   * @returns {{el: HTMLElement, amount: function(): number}}
   */
  function amountForm(o) {
    var st = { n: Math.max(1, Math.min(o.max, o.value)) };
    var params = function () { return Object.assign({ amount: st.n }, o.params || {}); };
    var pv0 = o.ctx.preview(o.action, params());
    var line = chipsLine(o.id + '-chips', pv0);
    var btn = SR.ui.button({ id: o.id + '-go', label: o.button, vars: { money: money(st.n) }, variant: o.variant || 'primary', icon: o.icon,
      autofocus: !!o.autofocus, onClick: function () { go(); } });
    var field = SR.ui.numberField({ id: o.id, label: o.label || 'card.bank.amount', money: true, value: st.n, min: 1, max: Math.max(1, o.max),
      step: o.step || 1, quick: o.quick || ['10%', '50%', 'all'],
      onChange: function (v) { st.n = v; if (o.M) o.M.dirty = true; update(); }, onSubmit: function () { go(); } });
    function update() {
      var pv = o.ctx.preview(o.action, params());
      fillChips(line, pv);
      btn.update({ vars: { money: money(st.n) }, disabled: !(pv && pv.ok), reason: pv && pv.reason, reasonVars: pv && pv.vars });
      if (o.onUpdate) o.onUpdate(st.n, pv);
    }
    function go() {
      var pv = o.ctx.preview(o.action, params());
      if (!pv || pv.hidden) return;
      if (!pv.ok) { D().refuse(btn, pv.reason ? t(pv.reason, pv.vars) : ''); return; }
      o.onCommit(st.n, pv);
    }
    btn.addEventListener('focus', function () { var pv = o.ctx.preview(o.action, params()); if (SR.ui.hud) SR.ui.hud.ghost(pv && pv.ok ? pv : null); });
    btn.addEventListener('blur', function () { if (SR.ui.hud) SR.ui.hud.ghost(null); });
    var el = h('div', { 'data-id': o.id + '-form' }, field, line, btn);
    update();
    return { el: el, amount: function () { return st.n; }, field: field, button: btn };
  }

  /** The common lifecycle of an amount sub-screen: mount / refresh / unmount / the Back veto. */
  function lifecycle(reg, build) {
    return {
      mount: function (root, ctx) {
        var M = reg.add({ root: root, ctx: ctx, alive: true, dirty: false });
        rebuild(M, build);
        toTop(root);
      },
      refresh: function (ctx) {
        var M = reg.of(ctx);
        if (!M || !M.alive) return;
        M.ctx = ctx || M.ctx;
        M.dirty = false;   // the rebuilt form starts again from its default amount
        rebuild(M, build);
      },
      unmount: function () { reg.pop(); if (SR.ui.hud) SR.ui.hud.ghost(null); },
      back: function (ctx) { var M = reg.of(ctx); return !(M && M.dirty); },
    };
  }

  /** Commits an action from a form and clears the unsaved-amount flag. */
  function commit(M, id, params) {
    M.dirty = false;
    return M.ctx.act(id, params);
  }

  // ---- bank.deposit / bank.withdraw --------------------------------------------------------------------

  function moveScreen(kind) {
    var reg = registry();
    var deposit = kind === 'deposit';
    function build(M) {
      var s = M.ctx.state, root = M.root;
      root.appendChild(balances(s, false));
      var have = deposit ? s.money.cash : s.money.bank;
      if (have < 1) {
        root.appendChild(note('bank-nothing', 'card.bank.nothing'));
      } else {
        var form = amountForm({ id: 'bank-' + kind, action: 'bank.' + kind, max: have, value: have, ctx: M.ctx, M: M, autofocus: true,
          button: deposit ? 'card.bank.depositBtn' : 'card.bank.withdrawBtn', icon: deposit ? 'deposit' : 'withdraw',
          onCommit: function (n) { commit(M, 'bank.' + kind, { amount: n }); } });
        root.appendChild(form.el);
      }
      root.appendChild(note('bank-free', 'card.bank.free'));
      root.appendChild(note('bank-' + kind + '-note', deposit ? 'card.bank.depositNote' : 'card.bank.withdrawNote', { pct: ratePct(s.money.rate) }));
    }
    return Object.assign({ title: 'sub.bank.' + kind, p: 0 }, lifecycle(reg, build));
  }

  SR.def.subscreen('bank.deposit', moveScreen('deposit'));
  SR.def.subscreen('bank.withdraw', moveScreen('withdraw'));

  // ---- bank.loan ---------------------------------------------------------------------------------------

  /** @returns {number} what `amount` grows to over `days` nights at today's loan rate (B-09 loan.rate, floored nightly). */
  function loanEstimate(amount, rate, days) {
    var a = amount, add = B().loan.rateAdd;
    for (var i = 0; i < days && i < LOAN_ITER_MAX; i++) a += Math.floor(a * (rate + add) / 100);
    return a;
  }

  function defaultLine(s) {
    var d = B().default, diff = s.mode.difficulty === 'hardcore' || s.mode.difficulty === 'relaxed' ? s.mode.difficulty : 'standard';
    var hp = d.standard ? d.standard.hp : 1;
    return note('bank-loan-default', 'card.bank.loan.default.' + diff, { karma: d.penaltyKarma, hp: hp, days: d.creditFrozenDays });
  }

  var loanReg = registry();
  function buildLoan(M) {
    var s = M.ctx.state, root = M.root, m = s.money, L = B().loan;
    var focusRepay = M.ctx.params && M.ctx.params.focus === 'repay';
    root.appendChild(balances(s, true));
    if (m.lien > 0) root.appendChild(box('bank-lien', note('bank-lien-text', 'card.bank.loan.lien', { money: money(m.lien) }, 'danger'), 'danger'));
    if (m.creditFrozenUntil && s.clock.day < m.creditFrozenUntil) {
      root.appendChild(box('bank-frozen', note('bank-frozen-text', 'card.bank.loan.frozen', { day: m.creditFrozenUntil }, 'danger'), 'danger'));
    }
    var open = m.loan && m.loan.amount > 0;
    if (open) {
      root.appendChild(heading('act.bank.repay'));
      root.appendChild(note('bank-loan-current', m.loan.daysLeft <= 1 ? 'card.bank.loan.lastDay' : 'card.bank.loan.current',
        { money: money(m.loan.amount), days: m.loan.daysLeft }, m.loan.daysLeft <= Math.max.apply(null, L.warn) ? 'danger' : null));
      var canPay = Math.min(m.loan.amount, m.cash);
      if (canPay >= 1) {
        root.appendChild(amountForm({ id: 'bank-repay', action: 'bank.repay', max: canPay, value: canPay, ctx: M.ctx, M: M, autofocus: true,
          button: 'card.bank.loan.repayBtn', icon: 'repay',
          onCommit: function (n) { commit(M, 'bank.repay', { amount: n }); } }).el);
      } else {
        root.appendChild(note('bank-repay-none', 'reason.needCash', { money: money(1) }, 'danger'));
      }
    } else {
      root.appendChild(heading('act.bank.loan'));
      var limit = SR.rules.jobs.creditLimit(s);
      var best = SR.rules.jobs.bestTitle(s);
      root.appendChild(h('p', { class: 't-small', 'data-id': 'bank-loan-limit', style: { margin: '0', color: 'var(--ink-700)' } },
        h('strong', { 'data-id': 'bank-loan-none', style: { color: 'var(--ink-900)' } }, t('card.bank.loan.none')), ' ',
        t('card.bank.loan.limit', { money: money(limit), job: SR.text('job.' + (best || 'none')) })));
      root.appendChild(note('bank-loan-terms', 'card.bank.loan.terms', { days: L.days, pct: ratePct(m.rate + L.rateAdd), add: L.rateAdd }));
      var est = note('bank-loan-estimate', 'card.bank.loan.estimate', { money: money(limit), days: L.days, total: money(loanEstimate(limit, m.rate, L.days)) });
      var form = amountForm({ id: 'bank-borrow', action: 'bank.loan', max: Math.max(1, limit), value: limit, ctx: M.ctx, M: M, autofocus: !focusRepay,
        button: 'card.bank.loan.take', icon: 'loan', quick: ['10%', '50%', 'all'],
        onUpdate: function (n) { est.textContent = t('card.bank.loan.estimate', { money: money(n), days: L.days, total: money(loanEstimate(n, m.rate, L.days)) }); },
        onCommit: function (n) {
          SR.ui.confirm({ id: 'confirm-loan', title: 'card.bank.loan.confirmTitle', text: 'card.bank.loan.confirm', yes: 'card.bank.loan.confirmYes',
            vars: { money: money(n), days: L.days, pct: ratePct(m.rate + L.rateAdd) } })
            .then(function (yes) { if (yes && M.alive) commit(M, 'bank.loan', { amount: n }); });
        } });
      root.appendChild(form.el);
      root.appendChild(est);
    }
    root.appendChild(defaultLine(s));
  }
  SR.def.subscreen('bank.loan', Object.assign({ title: 'sub.bank.loan', p: 0 }, lifecycle(loanReg, buildLoan)));

  // ---- bank.rates ----------------------------------------------------------------------------------------

  var ratesReg = registry();
  function buildRates(M) {
    var s = M.ctx.state, root = M.root, m = s.money, b = B();
    var hist = (m.rateHist || []).slice(-(RATE_POINTS - 1)).concat([m.rate]);
    root.appendChild(h('div', { 'data-id': 'bank-rate', style: { display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', flexWrap: 'wrap' } },
      h('span', { class: 't-label' }, t('card.bank.rates.today')),
      h('span', { 'data-id': 'bank-rate-value', style: { font: '900 calc(28px * var(--ui-scale)) var(--font-display)', color: 'var(--money-ink)', fontVariantNumeric: 'tabular-nums' } },
        t('card.bank.rates.value', { pct: ratePct(m.rate) }))));
    root.appendChild(SR.ui.lineChart({ id: 'bank-rate-chart', label: t('card.bank.rates.chart', { n: hist.length }), w: CHART_W, h: CHART_H,
      series: [{ data: hist, kind: 'money', label: t('card.bank.rates.chart', { n: hist.length }) }],
      format: function (v) { return SR.text.num(v, 1); } }));
    // Seize the Bank (B-17): no interest while the decree stands (the rules' own reading of it).
    var e = s.election || {};
    var seized = (e.decrees || []).concat(e.decreesUsed || []).indexOf('seizeBank') >= 0;
    if (seized) root.appendChild(note('bank-rates-seized', 'card.bank.rates.seized', {}, 'danger'));
    else {
      var tonight = SR.rules.bank.interest(s);
      root.appendChild(note('bank-rates-tonight', tonight >= b.interestCap ? 'card.bank.rates.tonightCap' : 'card.bank.rates.tonight',
        { bank: money(m.bank), money: money(tonight) }));
    }
    root.appendChild(note('bank-rates-tiers', 'card.bank.rates.tiers', { t1: money(b.tiers.t1), t2: money(b.tiers.t2) }));
    root.appendChild(note('bank-rates-cap', 'card.bank.rates.cap', { money: money(b.interestCap) }));
    root.appendChild(note('bank-rates-loan', 'card.bank.rates.loan', { pct: ratePct(m.rate + b.loan.rateAdd) }));
    if (SR.features.homesPlus) root.appendChild(note('bank-rates-cds', 'card.bank.rates.cdLine', { pct: ratePct(m.rate * b.cd.rateMult), days: b.cd.days }));
    // Penny's rate forecast (GDD §6.2): the rate mean-reverts to rateStep.toward (B-09).
    var toward = b.rateStep.toward, band = b.rateStep.jitter[1] / b.rateStep.jitterDiv;
    var fk = m.rate > toward + band ? 'up' : m.rate < toward - band ? 'down' : 'mid';
    root.appendChild(note('bank-rates-forecast', 'card.bank.rates.' + fk, { pct: ratePct(toward) }));
  }
  var ratesDef = lifecycle(ratesReg, buildRates);
  delete ratesDef.back;
  SR.def.subscreen('bank.rates', Object.assign({ title: 'sub.bank.rates', p: 0 }, ratesDef));

  // ---- bank.cds (P1 `homesPlus`) ------------------------------------------------------------------------

  var cdsReg = registry();
  function buildCds(M) {
    var s = M.ctx.state, root = M.root, m = s.money, c = B().cd;
    root.appendChild(balances(s, false));
    root.appendChild(note('bank-cds-intro', 'card.bank.cds.intro', { min: money(c.min), days: c.days, pct: ratePct(m.rate * c.rateMult) }));
    root.appendChild(note('bank-cds-limits', 'card.bank.cds.limits', { n: c.maxOpen, money: money(c.maxPrincipal), penalty: SR.text.pct(c.breakPenalty) }));
    var room = Math.min(m.bank, c.maxPrincipal - SR.rules.bank.cdPrincipal(s));
    if ((m.cds || []).length < c.maxOpen && room >= c.min) {
      root.appendChild(amountForm({ id: 'bank-cd', action: 'bank.openCd', max: room, value: Math.max(c.min, Math.min(room, c.min)), ctx: M.ctx, M: M,
        button: 'card.bank.cds.open', icon: 'cd', autofocus: true, quick: ['50%', 'all'],
        onCommit: function (n) { commit(M, 'bank.openCd', { amount: n }); } }).el);
    }
    root.appendChild(heading('sub.bank.cds'));
    var list = h('div', { 'data-id': 'bank-cd-list', role: 'list' });
    (m.cds || []).forEach(function (cd, i) {
      var back = cd.amount - Math.floor(cd.amount * c.breakPenalty);
      var brk = SR.ui.button({ id: 'bank-cd-break-' + i, label: 'card.bank.cds.break', size: 's', variant: 'danger', onClick: function () {
        SR.ui.confirm({ id: 'confirm-cd', title: 'card.bank.cds.breakTitle', text: 'card.bank.cds.breakConfirm', vars: { money: money(back) }, danger: true })
          .then(function (yes) { if (yes && M.alive) commit(M, 'bank.breakCd', { index: i }); });
      } });
      list.appendChild(h('div', { role: 'listitem', 'data-id': 'bank-cd-' + i, style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
        padding: 'var(--sp-2) 0', borderBottom: 'var(--line-thin)' } },
      h('span', { class: 't-body', style: { flex: '1 1 auto' } }, t('card.bank.cds.row', { money: money(cd.amount), pct: ratePct(cd.rate), day: cd.dayOpened + c.days - 1 })), brk));
    });
    if (!(m.cds || []).length) list.appendChild(note('bank-cd-none', 'card.bank.cds.none'));
    root.appendChild(list);
  }
  SR.def.subscreen('bank.cds', Object.assign({ title: 'sub.bank.cds', p: 1, feature: 'homesPlus' }, lifecycle(cdsReg, buildCds)));
})();
