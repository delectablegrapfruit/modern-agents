// js/ui/subscreens/bus.js — owner: W2-Transit (W3-Crime in wave 3). The sub-screen `bus.board` (UI
// §5.6; GDD §4.11, §6.1; CONTRACT §10): the depot's destination board. The departure clock on top
// ("Next red-eye in 9h 30m"), what you carry, a buyer still waiting for your answer (a trip's offer
// survives a reload), then one departure-board row per city (the order of data/cities.js): the
// city, what its buyers want, the ticket chip, [Red-eye 00:00] (disabled with its reason until
// 00:00) and, with the P1 `tours` flag, today's demand, your reputation, a "toured this week" tick,
// [Tour 06-10] and "Wait for the tour bus" before 06:00.
// Boarding asks to confirm, then hands over to the trip scene (`bustrip`), which commits the row
// (trip.redeye / trip.tour) and plays the ride; the board itself never mutates the state (the wait
// row commits through ctx.act). Hotkeys 1-6 board the red-eye of the row with that number.
// Node-loadable registration: the DOM is built only inside mount / refresh.
(function () {
  'use strict';
  var SR = window.SR;

  var ui = null;   // { root, ctx, rows: [{ id, redeye, tour, ticket, meta }], clock, carry, waiting, wait }

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function t(k, v) { return D().t(k, v); }
  function cityName(id) { return SR.text.has('city.' + id + '.name') ? SR.text('city.' + id + '.name') : id; }
  function cityIds() { return SR.rules.trade && SR.rules.trade.cityIds ? SR.rules.trade.cityIds() : Object.keys(SR.tuning.bus.cities); }
  function tours() { return !!(SR.features && SR.features.tours); }

  // A departure-board row: the city in board letters and the ticket on top, what the buyers want
  // (and the P1 demand, reputation and tour tick) with the buttons below.
  var BOARD_ROW = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 'var(--sp-1) var(--sp-2)', alignItems: 'center',
    padding: 'var(--sp-2) var(--sp-3)', borderRadius: 'var(--r-m)', background: 'var(--ink-900)', color: 'var(--paper-0)', border: 'var(--line)' };
  var CITY_NAME = { fontFamily: 'var(--font-display)', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '.06em',
    color: 'var(--focus)', fontSize: 'calc(var(--fs-16) * var(--ui-scale))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  var META = { fontSize: 'calc(var(--fs-14) * var(--ui-scale))', color: 'var(--paper-2)', minWidth: '0' };
  var BUTTONS = { display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' };

  /** @returns {object} the Preview of boarding a city ('smuggle' or 'tour'). */
  function pv(ctx, kind, id) {
    return ctx.preview(kind === 'tour' ? 'trip.tour' : 'trip.redeye', { city: id, kind: kind });
  }

  /** The departure clock line (and how to catch the bus). */
  function clockText(s) {
    var T = SR.tuning.time, now = s.clock.min, dep = SR.text.time(T.redEyeDeparts);
    if (now === T.redEyeDeparts) return { main: t('card.bus.boarding', { time: dep }), hint: '' };
    if (now >= T.dayEnd) return { main: t('card.bus.gone', { time: dep }), hint: t('card.bus.wake', { time: dep }) };
    return { main: t('card.bus.next', { left: SR.text.dur(T.dayEnd - now), time: dep }), hint: t('card.bus.wake', { time: dep }) };
  }

  /** Boards: asks to confirm, then the trip scene commits and rides. */
  function board(ctx, kind, id, btn) {
    var p = pv(ctx, kind, id);
    if (!p || p.hidden) return;
    if (!p.ok) { D().refuse(btn, p.reason ? t(p.reason, p.vars) : ''); return; }
    var def = SR.reg.action[kind === 'tour' ? 'trip.tour' : 'trip.redeye'];
    SR.ui.confirm({ id: 'confirm-board', title: def.label, text: def.confirm, vars: { city: cityName(id), money: SR.text.money(p.cost.cash) } })
      .then(function (yes) {
        if (!yes || !SR.reg.scene.bustrip) return;
        SR.scenes.go('bustrip', { city: id, kind: kind, from: 'bus' }, { transition: 'fade' });
      });
  }

  function buildRow(ctx, id, i) {
    var row = { id: id };
    var tuning = SR.tuning.bus.cities[id] || {};
    row.meta = h('span', { style: META });
    row.ticket = h('span', { 'data-id': 'bus-ticket-' + id });
    row.redeye = SR.ui.button({ id: 'bus-redeye-' + id, label: 'act.trip.redeye', icon: 'redeye', variant: 'primary', size: 's', hotkey: i + 1,
      onClick: function () { board(ctx, 'smuggle', id, row.redeye); } });
    row.tour = SR.ui.button({ id: 'bus-tour-' + id, label: 'act.trip.tour', icon: 'tour', variant: 'secondary', size: 's',
      onClick: function () { board(ctx, 'tour', id, row.tour); } });
    row.tourSlot = h('span', null, row.tour);
    var wants = t('card.bus.wants', { goods: t('card.bus.goods.' + (tuning.wants || 'either')) });
    row.el = h('li', { 'data-id': 'bus-city-' + id, 'data-city': id, style: BOARD_ROW },
      h('div', { style: CITY_NAME, title: cityName(id) }, cityName(id)),
      row.ticket,
      h('div', { style: META }, wants, ' ', row.meta),
      h('div', { style: BUTTONS }, row.redeye, row.tourSlot));
    return row;
  }

  function refreshRow(ctx, row) {
    var s = ctx.state;
    var p = pv(ctx, 'smuggle', row.id);
    D().clear(row.ticket);
    if (p && p.cost) row.ticket.appendChild(SR.ui.chip({ kind: 'money', n: p.cost.cash, cost: true, short: s.money.cash < p.cost.cash }));
    row.redeye.update({ disabled: !(p && p.ok), reason: p && !p.ok ? p.reason : null, reasonVars: p && p.vars });
    var on = tours();
    row.tourSlot.hidden = !on;
    var meta = [];
    if (on && SR.rules.trade) {
      meta.push(t('card.bus.demand', { pct: SR.text.pct(SR.rules.trade.dailyDemand(s, row.id)) }));
      meta.push(t('card.bus.rep', { n: SR.rules.trade.reputation(s, row.id) }));
      var tw = (s.trade && s.trade.tourWeek) || {};
      if (tw[row.id] === SR.rules.time.week(s)) meta.push(t('card.bus.toured'));
      var tp = pv(ctx, 'tour', row.id);
      row.tour.update({ disabled: !(tp && tp.ok), reason: tp && !tp.ok ? tp.reason : null, reasonVars: tp && tp.vars });
    }
    row.meta.textContent = meta.length ? '· ' + meta.join(' · ') : '';
  }

  function refresh(ctx) {
    if (!ui || !ctx.state) return;
    var s = ctx.state;
    var c = clockText(s);
    ui.clock.textContent = c.main;
    ui.hint.textContent = c.hint;
    ui.carry.textContent = t('card.bus.carry', { booze: s.items.booze || 0, snow: s.items.snow || 0 });
    var off = SR.rules.trade && SR.rules.trade.pending ? SR.rules.trade.pending(s) : null;
    ui.waiting.hidden = !(off && off.kind === 'smuggle' && off.outcome === 'offer');
    if (!ui.waiting.hidden) ui.waitingText.textContent = t('card.bus.waiting', { city: cityName(off.city) });
    ui.rows.forEach(function (r) { refreshRow(ctx, r); });
    var w = ctx.preview('bus.wait', {});
    ui.waitSlot.hidden = !w || !!w.hidden;
    if (!ui.waitSlot.hidden) ui.wait.update({ disabled: !w.ok, reason: w.ok ? null : w.reason, reasonVars: w.vars });
  }

  SR.def.subscreen('bus.board', {
    title: 'sub.bus.board',
    p: 0,
    mount: function (root, ctx) {
      ui = { root: root, ctx: ctx, rows: [] };
      ui.clock = h('p', { class: 't-label', 'data-id': 'bus-clock', style: { margin: '0' } });
      ui.hint = h('p', { class: 't-small', 'data-id': 'bus-hint', style: { margin: '0', color: 'var(--ink-700)' } });
      ui.carry = h('p', { class: 't-body', 'data-id': 'bus-carry', style: { margin: '0' } });
      ui.waitingText = h('span', null);
      ui.waiting = h('div', { 'data-id': 'bus-waiting', style: { display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', justifyContent: 'space-between',
        padding: 'var(--sp-2) var(--sp-3)', background: 'var(--money-100)', border: 'var(--line)', borderRadius: 'var(--r-m)' } },
      ui.waitingText,
      SR.ui.button({ id: 'bus-resume', label: 'card.bus.resume', variant: 'primary', size: 's',
        onClick: function () { if (SR.reg.scene.bustrip) SR.scenes.go('bustrip', { resume: true, from: 'bus' }, { transition: 'fade' }); } }));
      ui.wait = SR.ui.button({ id: 'bus-wait', label: 'act.bus.wait', icon: 'time', variant: 'secondary', size: 's',
        onClick: function () { var r = ctx.act('bus.wait', {}); if (r && r.ok) refresh(ctx); } });
      ui.waitSlot = h('div', null, ui.wait);
      var list = h('ul', { 'data-id': 'bus-cities', 'aria-label': t('sub.bus.board'),
        style: { listStyle: 'none', margin: '0', padding: '0', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } });
      cityIds().forEach(function (id, i) {
        var row = buildRow(ctx, id, i);
        ui.rows.push(row);
        list.appendChild(row.el);
      });
      root.appendChild(h('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' } }, ui.clock, ui.hint, ui.carry));
      root.appendChild(ui.waiting);
      root.appendChild(list);
      root.appendChild(ui.waitSlot);
      refresh(ctx);
    },
    refresh: function (ctx) { refresh(ctx); },
    unmount: function () { ui = null; },
    onAction: function (action, ev, ctx) {
      var m = /^row(\d)$/.exec(action);
      if (!m || !ui || (ev && (ev.down === false || ev.repeat))) return false;
      var row = ui.rows[Number(m[1]) - 1];
      if (!row) return false;
      SR.ui.focus.focus(row.redeye);
      board(ctx, 'smuggle', row.id, row.redeye);
      return true;
    },
  });
})();
