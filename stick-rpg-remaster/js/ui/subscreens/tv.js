// js/ui/subscreens/tv.js — owner: W2-Home. The sub-screen home.tv (UI §5.6; GDD §4.5, §6.8): the
// channel list (News with the TV; Fitness and Dating with the satellite; Market Watch with the
// SkyDish, P1 `stockTips`) with today's viewings left, each a row that runs home.tvNews ...
// home.tvMarket through ctx.act, and the screen above it where the show plays as a 2 s animated
// card: the TV news leads with yesterday's heaviest log entry (SR.rules.news.tvStory, the same
// entry as the morning headline), else one of the 30 stories; Fitness and Dating pick one of their
// 10 shows, Market Watch one of 8 segments. A viewing that revealed today's tip or tomorrow's
// forecast (P1) says so on the screen. Node-loadable: nothing touches the DOM until mount.
(function () {
  'use strict';
  var SR = window.SR;

  var CHANNELS = [
    { id: 'news', action: 'home.tvNews', row: 'tvNews', icon: 'news', source: 'tv' },
    { id: 'fitness', action: 'home.tvFitness', row: 'tvFitness', icon: 'str' },
    { id: 'dating', action: 'home.tvDating', row: 'tvDating', icon: 'cha' },
    { id: 'market', action: 'home.tvMarket', row: 'tvMarket', icon: 'rateboard', source: 'market' },
  ];
  var SHOW_MS = 2000;           // UI §5.6: the show plays as a 2 s animated card
  var VARIANT_SPACE = 1000;     // text variants are picked modulo their count (SR.text)

  var S = null;                 // { root, ctx, screen, list, rows, last } while mounted

  function D() { return SR.ui.dom; }
  function t(k, v) { return D().t(k, v); }

  /** @returns {number} viewings of a channel today (B-03 daily limits; SR.rules.training counts them). */
  function used(st, row) { return (st.daily.tv && st.daily.tv[row]) || 0; }

  /** @returns {object} display vars for a news template (the report layout's helper when loaded). */
  function newsVars(vars) {
    var R = SR.ui.report;
    return R && typeof R.newsVars === 'function' ? R.newsVars(vars) : vars;
  }

  /**
   * What a viewing shows (pure: a stable pick from the seed, the day, the channel and the viewing).
   * @returns {{title: string, text: string, extra: string[]}}
   */
  function show(st, ch) {
    var n = used(st, ch.row);
    var v = SR.util.hash(st.seed, st.clock.day, ch.id, n) % VARIANT_SPACE;
    var out = { title: t('tv.show.' + ch.id), text: '', extra: [] };
    if (ch.id === 'news') {
      var story = SR.rules.news.tvStory(st);
      out.text = n <= 1 && story.lead ? t(story.key, newsVars(story.vars)) : t('news.story', { variant: v });
    } else {
      out.text = t('tv.' + ch.id, { variant: v });
    }
    if (ch.source) {
      var tip = st.tip;
      // TV News shows the tip on the viewings that revealed it; Market Watch is a sure source
      // (B-10), so it also names a tip another source revealed first (stocks.maybeReveal then
      // leaves revealed.market unset).
      var known = tip && tip.revealed && (tip.revealed[ch.source] || (ch.id === 'market' && SR.rules.stocks.revealed(st)));
      if (SR.features.stockTips && tip && tip.day === st.clock.day && known) {
        out.extra.push(t('sub.home.tv.tip', { ticker: tip.ticker, arrow: tip.dir === 'up' ? '▲' : '▼', pct: SR.text.pct(tip.reliability) }));
      }
      if (SR.features.weather && st.daily.forecastSeen && st.world.forecast) {
        out.extra.push(t('sub.home.tv.forecast', { weather: t('sub.home.tv.weather.' + st.world.forecast) }));
      }
    }
    return out;
  }

  function screenBox() {
    return D().h('div', { class: 'tv-screen', 'data-id': 'tv-screen', role: 'status', 'aria-live': 'polite',
      style: { background: 'var(--ink-900)', color: 'var(--paper-0)', border: 'var(--line)', borderRadius: 'var(--r-m)',
        padding: 'var(--sp-3) var(--sp-4)', minHeight: 'calc(120px * var(--ui-scale))', marginBottom: 'var(--sp-3)',
        boxShadow: 'var(--e-1)', overflow: 'hidden' } });
  }

  function renderScreen() {
    var h = D().h, box = S.screen;
    D().clear(box);
    if (!S.last) {
      box.appendChild(h('p', { class: 't-body', 'data-id': 'tv-off', style: { margin: '0', opacity: '0.85' } }, t('sub.home.tv.off')));
      return;
    }
    var inner = h('div', { class: 'tv-show', 'data-id': 'tv-show-' + S.last.channel },
      h('div', { class: 't-small', style: { textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--focus)', fontWeight: '700' } },
        t('sub.home.tv.onAir') + ' · ' + S.last.show.title),
      h('p', { class: 't-body', 'data-id': 'tv-text', style: { margin: 'var(--sp-2) 0 0', lineHeight: 'var(--lh-body)' } }, S.last.show.text),
      S.last.show.extra.map(function (x, i) {
        return h('p', { class: 't-small', 'data-id': 'tv-extra-' + i, style: { margin: 'var(--sp-2) 0 0', fontWeight: '700' } }, x);
      }));
    box.appendChild(inner);
    if (!D().reduced() && !D().fast() && typeof inner.animate === 'function') {
      // A 2 s show: the picture rolls in with a flicker, holds, and the headline settles.
      inner.animate([
        { opacity: 0, transform: 'translateY(8px) scaleY(0.2)' },
        { opacity: 0.6, transform: 'translateY(0) scaleY(1.04)', offset: 0.12 },
        { opacity: 0.3, offset: 0.18 },
        { opacity: 1, transform: 'translateY(0) scaleY(1)', offset: 0.3 },
        { opacity: 1, transform: 'translateY(0) scaleY(1)' },
      ], { duration: SHOW_MS, easing: 'ease-out' });
    }
  }

  function renderList() {
    var ctx = S.ctx, st = ctx.state, list = S.list;
    var had = document.activeElement && list.contains(document.activeElement) ? document.activeElement.getAttribute('data-id') : null;
    D().clear(list);
    S.rows = [];
    CHANNELS.forEach(function (ch) {
      var pv = ctx.preview(ch.action, {});
      if (!pv || pv.hidden) return;
      var row = SR.tuning.training[ch.row] || {};
      var left = Math.max(0, (row.daily || 0) - used(st, ch.row));
      var el = SR.ui.actionRow({
        id: ch.action, hotkey: S.rows.length + 1, icon: ch.icon, label: 'act.' + ch.action,
        gains: SR.ui.chip.gains(pv), costs: SR.ui.chip.costs(pv, { def: SR.reg.action[ch.action] }),
        badges: [left > 0 ? t('sub.home.tv.left', { n: left }) : t('sub.home.tv.none')],
        disabled: !pv.ok, reason: pv.reason, reasonVars: pv.vars,
        onRun: function () { watch(ch); },
      });
      S.rows.push({ ch: ch, el: el });
      list.appendChild(el);
    });
    if (had) {
      var again = list.querySelector('[data-id="' + had + '"]');
      if (again) SR.ui.focus.focus(again);
    }
  }

  /** Watches a channel: the viewing is an action (its time, gain and daily count); then the show plays. */
  function watch(ch) {
    if (!S) return;
    var res = S.ctx.act(ch.action, {});
    if (!S || !res || !res.ok) return;
    S.last = { channel: ch.id, show: show(S.ctx.state, ch) };
    renderScreen();
    D().announce(S.last.show.title + '. ' + S.last.show.text + (S.last.show.extra.length ? ' ' + S.last.show.extra.join(' ') : ''));
  }

  SR.def.subscreen('home.tv', {
    title: 'sub.home.tv',
    p: 0,
    mount: function (root, ctx) {
      var h = D().h;
      S = { root: root, ctx: ctx, screen: screenBox(), list: h('div', { class: 'tv-channels', 'data-id': 'tv-channels' }), rows: [], last: null };
      root.appendChild(S.screen);
      root.appendChild(h('h3', { class: 'bcard-group' }, t('sub.home.tv.channels')));
      root.appendChild(S.list);
      renderScreen();
      renderList();
    },
    refresh: function (ctx) { if (S) { S.ctx = ctx; renderList(); } },
    unmount: function () { S = null; },
    onAction: function (action, ev) {
      var m = /^row(\d)$/.exec(action);
      if (!m || !S || (ev && ev.repeat)) return false;
      var r = S.rows[Number(m[1]) - 1];
      if (!r) return true;
      SR.ui.focus.focus(r.el.main);
      if (r.el.classList.contains('is-disabled')) D().refuse(r.el.main, '');
      else watch(r.ch);
      return true;
    },
  });
})();
