// js/ui/screens/jail.js — owner: W2-Transit. The Jail Day card (UI §5.12; GDD §4.10, §6.6): a Card
// (UI §2.3) at the card's place (776-1248 × 72-704) over the barred backdrop, with the guard's gag
// line of the day in the speech bubble, "Day 2 of 5", why you are here, a one-line summary of last
// night ("Interest +$42 · NLI ▲ 2 % · 1 message", from the jail night's Report), the four Jail Day
// choices as ActionRows with their gain chips from SR.preview (hotkeys 1-4), Bail (P1 `police`) with
// its price, and the footer button, which stays refused while you serve and becomes "Walk out" on
// release (or "Read the Final Edition" when the story ends in jail).
//   SR.ui.jail.card({ onChoose(choice, row), onBail(row), onLeave() }) → element with
//     el.render(view) and el.rows (the ActionRows by choice id, 'bail' included)
//   SR.ui.jail.view(state, report, extra) → the view the card renders (also read by tests)
//   SR.ui.jail.booked(days, reason) → "Booked for 5 days: the Five-O hold-up." (the trip card's too)
//   SR.ui.jail.CHOICES: the choices in card order ('str', 'int', 'cha', 'hp')
// DOM is built only when card() is called (the scene's ui.mount).
(function () {
  'use strict';
  var SR = window.SR;

  var CHOICES = ['str', 'int', 'cha', 'hp'];
  var ICONS = { str: 'str', int: 'int', cha: 'cha', hp: 'hp' };

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function t(k, v) { return D().t(k, v); }

  /**
   * The one-line summary of a jail night, as UI §5.12 shows it ("Interest +$42 · NLI ▲ 2 % · 1
   * message"): the interest the night earned (its report.interest lines), the biggest market mover and
   * the unread messages (the night's jail line, section 'jail'), or "a quiet night"; then any election
   * lines (jail days are campaign days). The days to go are the card's "Day 2 of 5", not repeated here.
   * @returns {string} '' when there is no report (or it is not a jail night's)
   */
  function summary(report) {
    if (!report || !Array.isArray(report.lines)) return '';
    var parts = [], jail = null, got = 0;
    report.lines.forEach(function (l) {
      if (!l) return;
      if (l.section === 'jail' && !jail) jail = l;
      if (l.key === 'report.interest' && l.vars && typeof l.vars.n === 'number') got += l.vars.n;
    });
    if (jail) {
      var v = jail.vars || {}, unread = Number(v.msgs) || 0;
      if (got > 0) parts.push(SR.text('card.jail.sum.interest', { n: got, money: SR.text.money(got) }));
      if (v.ticker) parts.push(SR.text('card.jail.sum.market', { ticker: v.ticker, arrow: v.arrow || '', pct: v.pct }));
      if (unread > 0) parts.push(SR.text(unread === 1 ? 'card.jail.sum.msgOne' : 'card.jail.sum.msgs', { n: unread }));
      if (!parts.length) parts.push(SR.text('card.jail.quiet'));
    }
    report.lines.forEach(function (l) { if (l && l.section === 'election') parts.push(SR.text(l.key, l.vars)); });
    return parts.join(' · ');
  }

  /** @returns {string} why you are here: the reason's text key (a reason without one reads 'other'). */
  function reasonKey(reason) {
    return SR.text.has('card.jail.reason.' + reason) ? 'card.jail.reason.' + reason : 'card.jail.reason.other';
  }

  /**
   * "Booked for 5 days: the Five-O hold-up." (one day reads "1 day"; the trip card uses it too).
   * @returns {string}
   */
  function booked(days, reason) {
    return t(days === 1 ? 'card.jail.bookedOne' : 'card.jail.booked', { days: days, reason: t(reasonKey(reason)) });
  }

  /**
   * The card's view of the state.
   * @param {object} s the state
   * @param {object=} report the latest jail night's Report
   * @param {{reason: string, days: number, released: boolean, bailed: boolean, over: boolean}=} extra
   *   what the scene knows beyond the state (the arrest's reason and length after a release)
   * @returns {object} { mode: 'day'|'released'|'over', day, days, daysLeft, reason, summary, gag,
   *   heat, time, bail: Preview|null, choices: [{ choice, preview }] }
   */
  function view(s, report, extra) {
    extra = extra || {};
    var j = s && s.jail;
    var v = { mode: 'day', day: 0, days: extra.days || 0, daysLeft: 0, reason: extra.reason || (j && j.reason) || 'police',
      summary: summary(report), heat: s ? s.stats.heat : 0, time: s ? SR.text.time(s.clock.min) : '', bail: null, choices: [],
      bailed: !!extra.bailed };
    if (j) {
      v.days = (j.served || 0) + Math.max(0, j.daysLeft);
      v.day = Math.min(v.days, (j.served || 0) + 1);
      v.daysLeft = Math.max(0, j.daysLeft);
    }
    if (s && s.over && !(s.mode && s.mode.keepPlaying)) v.mode = 'over';
    else if (!j) v.mode = 'released';
    v.gag = { key: 'card.jail.gag', vars: { variant: s ? s.clock.day : 0 } };
    if (v.mode === 'day' && typeof SR.preview === 'function') {
      v.choices = CHOICES.map(function (c) { return { choice: c, preview: SR.preview('jail.day', { choice: c }) }; });
      var b = SR.preview('jail.bail', {});
      v.bail = b && !b.hidden ? b : null;
    }
    return v;
  }

  /**
   * The chips of a choice: only the day's own gain (the night's interest belongs to the summary). At
   * full HP the rest gains nothing, which reads "+10 HP (full)" (UI §2.3: a capped gain says so).
   */
  function choiceChips(pv, choice) {
    if (!pv || !pv.gains) return [];
    var own = pv.gains.filter(function (g) { return choice === 'hp' ? g.kind === 'hp' : g.kind === 'stat' && g.key === choice; });
    if (!own.length && choice === 'hp' && pv.ok) {
      return [SR.ui.chip({ kind: 'hp', n: SR.tuning.crime.jail.day.hp, capped: true })];
    }
    return SR.ui.chip.gains({ gains: own, chance: null });
  }

  /**
   * Builds the Jail Day card.
   * @param {{onChoose: function(string, HTMLElement), onBail: function(HTMLElement), onLeave: function()}} o
   * @returns {HTMLElement} el.render(view), el.rows
   */
  function card(o) {
    o = o || {};
    var el = SR.ui.card({ id: 'jail-card', title: 'card.jail.title', brand: D().paint('int.jail.trim'), portrait: 'officer',
      onLeave: function () { if (o.onLeave) o.onLeave(); } });
    var day = h('h3', { class: 't-h3', 'data-id': 'jail-day', style: { margin: '0' } });
    var why = h('p', { class: 't-body', 'data-id': 'jail-reason', style: { margin: '0' } });
    var last = h('p', { class: 't-body', 'data-id': 'jail-summary', style: { margin: '0', color: 'var(--ink-700)' } });
    var head = h('h3', { class: 'bcard-group', 'data-id': 'jail-choose' }, t('card.jail.choose'));
    var rowsEl = h('div', { class: 'bcard-rows', 'data-id': 'jail-rows' });
    var done = h('div', { 'data-id': 'jail-done', style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } });
    el.body.appendChild(h('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', padding: 'var(--sp-3) var(--sp-4)' } },
      day, why, last, done));
    el.body.appendChild(head);
    el.body.appendChild(rowsEl);
    el.rows = {};
    CHOICES.concat(['bail']).forEach(function (c, i) {
      var r = SR.ui.actionRow({ id: c === 'bail' ? 'jail.bail' : 'jail.' + c, hotkey: c === 'bail' ? 5 : i + 1, icon: c === 'bail' ? 'bail' : ICONS[c],
        label: 'act.jail.' + c, gains: [], costs: [],
        onRun: function () { if (c === 'bail') { if (o.onBail) o.onBail(r); } else if (o.onChoose) o.onChoose(c, r); } });
      el.rows[c] = r;
      rowsEl.appendChild(r);
    });

    el.render = function (v) {
      var dayMode = v.mode === 'day';
      day.textContent = dayMode ? t('card.jail.day', { day: v.day, days: v.days }) : v.mode === 'released' ? t('card.jail.released', { time: v.time, heat: v.heat }) : t('card.jail.over');
      why.textContent = v.days ? booked(v.days, v.reason) : '';
      last.textContent = v.summary ? t('card.jail.lastNight', { summary: v.summary }) : '';
      last.hidden = !v.summary;
      D().clear(done);
      if (v.mode === 'released') done.appendChild(h('p', { class: 't-body', style: { margin: '0' } }, t(v.bailed ? 'card.jail.bailed' : 'card.jail.releasedGag')));
      head.hidden = !dayMode;
      rowsEl.hidden = !dayMode;
      if (dayMode) {
        v.choices.forEach(function (c) {
          var pv = c.preview || {};
          el.rows[c.choice].update({ gains: choiceChips(pv, c.choice), disabled: !pv.ok, reason: pv.ok ? null : pv.reason, reasonVars: pv.vars });
        });
        var br = el.rows.bail;
        br.hidden = !v.bail;
        if (v.bail) {
          var cost = SR.rules.crime && SR.state ? SR.rules.crime.bail(SR.state) : 0;
          br.update({ costs: [SR.ui.chip({ kind: 'money', n: cost, cost: true, short: !v.bail.ok })], gains: [],
            disabled: !v.bail.ok, reason: v.bail.ok ? null : v.bail.reason, reasonVars: v.bail.vars });
        }
      }
      el.setGreeting(dayMode ? v.gag.key : null, v.gag.vars);
      el.leave.update(dayMode
        ? { label: 'card.jail.walkOut', variant: 'secondary', disabled: true, reason: v.daysLeft === 1 ? 'card.jail.servingOne' : 'card.jail.serving',
          reasonVars: { days: v.daysLeft } }
        : { label: v.mode === 'over' ? 'card.jail.final' : 'card.jail.walkOut', variant: 'primary', disabled: false, reason: null });
      var s = SR.state;
      el.setReadout(s ? t('ui.cardReadout', { money: SR.text.money(s.money.cash), time: SR.text.time(s.clock.min) }) : '');
    };
    return el;
  }

  SR.ui.jail = { card: card, view: view, summary: summary, booked: booked, CHOICES: CHOICES.slice() };
})();
