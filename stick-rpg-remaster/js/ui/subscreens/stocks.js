// js/ui/subscreens/stocks.js — owner: W2-Home. The sub-screen home.stocks (UI §5.6; GDD §4.9;
// BALANCE B-10): the home computer's trading app (the phone shows the same screen with the P1
// Workstation). The list: the six tickers with price, the last night's change, a 30-night
// sparkline and your holding; the day's tip banner (P1 `stockTips`) only once a source revealed it
// ("NLI ▲ · seen on TV · reliability 62 %"), else "No tip yet today". A ticker's page: the chart,
// held, average cost and P/L, a NumberField of whole shares, Buy (price × 1.005 + $5, within the
// position cap) and Sell (only what you hold: no shorts), each through ctx.act('home.stockBuy' /
// 'home.stockSell') with its preview's reason when refused. Node-loadable: no DOM until mount.
(function () {
  'use strict';
  var SR = window.SR;

  var CHART_W = 400, CHART_H = 140;   // the ticker page's LineChart (fits the 472 px card body)
  var SPARK_W = 72;
  var S = null;                       // { root, ctx, ticker, n } while mounted

  function D() { return SR.ui.dom; }
  function t(k, v) { return D().t(k, v); }
  function T() { return SR.tuning.stocks; }
  function R() { return SR.rules.stocks; }
  function money(n, o) { return SR.text.money(n, o); }
  /** @returns {string} where a trade happens (the buy / sell event's `where`): the home computer or the phone (P1). */
  function where() { return S && S.ctx.host === 'pocket' ? 'phone' : 'home'; }

  /** @returns {number} the last night's change in percent. */
  function change(st) { return st.prev ? (st.price - st.prev) / st.prev * 100 : 0; }
  function changeText(pct) {
    var p = SR.text.num(Math.abs(pct), 1);
    return Math.abs(pct) < 0.05 ? t('sub.home.stocks.flat') : t(pct > 0 ? 'sub.home.stocks.up' : 'sub.home.stocks.down', { pct: p });
  }
  function changeColour(pct) { return Math.abs(pct) < 0.05 ? 'var(--ink-700)' : pct > 0 ? 'var(--money-ink)' : 'var(--hp-ink)'; }

  /** @returns {{fill: number, cost: function, proceeds: function, max: number}} the trade maths of B-10. */
  function trade(s, ticker) {
    var st = s.stocks[ticker], spread = R().spread(s), fee = T().fee;
    var fill = st.price * (1 + spread);
    var capRoom = Math.max(0, R().cap(s) - st.basis);
    var byCap = Math.floor(capRoom / fill + 1e-9), byCash = Math.floor(Math.max(0, s.money.cash - fee) / fill);
    var byMax = Math.max(0, T().maxShares - st.held);
    return {
      fill: fill, fee: fee, spread: spread,
      cost: function (n) { return Math.round(n * fill) + fee; },
      proceeds: function (n) { return Math.max(0, Math.round(n * st.price * (1 - spread)) - fee); },
      max: Math.max(0, Math.min(byCap, byCash, byMax)),
    };
  }

  function tipBanner(s) {
    var h = D().h, tip = s.tip;
    var shown = tip && tip.day === s.clock.day && R().revealed(s);
    var text;
    if (shown) {
      var src = R().TIP_SOURCES.filter(function (k) { return tip.revealed && tip.revealed[k]; })[0];
      text = t('sub.home.stocks.tip', { ticker: tip.ticker, arrow: tip.dir === 'up' ? '▲' : '▼',
        source: t('sub.home.stocks.source.' + src), pct: SR.text.pct(tip.reliability) });
    } else text = t('sub.home.stocks.tipNone');
    return h('div', { class: 't-small', 'data-id': 'stock-tip', role: 'note',
      style: { padding: 'var(--sp-2) var(--sp-3)', borderRadius: 'var(--r-s)', marginBottom: 'var(--sp-3)', fontWeight: '700',
        background: shown ? 'var(--money-100)' : 'var(--paper-2)', color: shown ? 'var(--money-ink)' : 'var(--ink-700)' } }, text);
  }

  function notes(s, ticker) {
    var h = D().h, st = ticker ? s.stocks[ticker] : null;
    var lines = [];
    if (st) lines.push(t('sub.home.stocks.cap', { cap: money(R().cap(s)), used: money(Math.round(st.basis)) }));
    lines.push(t('sub.home.stocks.costs', { fee: money(T().fee), spread: SR.text.pct(R().spread(s), 1) }));
    lines.push(t('sub.home.stocks.markets'));
    return h('div', { class: 't-small', 'data-id': 'stock-notes', style: { color: 'var(--ink-700)', marginTop: 'var(--sp-3)' } },
      lines.map(function (l) { return h('p', { style: { margin: '2px 0' } }, l); }));
  }

  function renderList() {
    var h = D().h, s = S.ctx.state, root = S.root;
    if (SR.features.stockTips) root.appendChild(tipBanner(s));
    root.appendChild(h('h3', { class: 'bcard-group' }, t('sub.home.stocks.tickers')));
    var list = h('div', { 'data-id': 'stock-list', role: 'list' });
    R().tickers().forEach(function (tk) {
      var st = s.stocks[tk], pct = change(st), def = SR.reg.stock[tk] || {};
      var b = h('button', { type: 'button', class: 'arow-main nav-inset', 'data-nav': '', 'data-id': 'stock-' + tk, role: 'listitem',
        'aria-label': tk + ', ' + money(st.price, { cents: true }) + ', ' + changeText(pct) + ', ' +
          (st.held ? t('sub.home.stocks.held', { n: SR.text.num(st.held) }) : t('sub.home.stocks.none')),
        style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center', columnGap: 'var(--sp-3)',
          width: '100%', textAlign: 'left', padding: 'var(--sp-2) var(--sp-3)', borderBottom: 'var(--line-thin)', background: 'transparent' } },
        h('span', { style: { minWidth: '0' } },
          h('span', { style: { fontWeight: '900', fontVariantNumeric: 'tabular-nums' } }, tk),
          h('span', { class: 't-small', style: { display: 'block', color: 'var(--ink-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
            def.company ? t(def.company) : tk)),
        SR.ui.sparkline({ data: (st.hist || []).slice(), kind: 'money', w: SPARK_W, h: 24, label: tk }),
        h('span', { style: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' } },
          h('span', { style: { display: 'block', fontWeight: '700' } }, money(st.price, { cents: true })),
          h('span', { class: 't-small', style: { display: 'block', color: changeColour(pct), fontWeight: '700' } }, changeText(pct)),
          h('span', { class: 't-small', style: { display: 'block', color: 'var(--ink-700)' } },
            st.held ? t('sub.home.stocks.held', { n: SR.text.num(st.held) }) : t('sub.home.stocks.none'))));
      b.addEventListener('click', function () { S.ticker = tk; S.n = 1; render(); });
      list.appendChild(b);
    });
    root.appendChild(list);
    root.appendChild(notes(s, null));
  }

  function renderTicker() {
    var h = D().h, s = S.ctx.state, root = S.root, tk = S.ticker, st = s.stocks[tk], def = SR.reg.stock[tk] || {};
    var tr = trade(s, tk), pct = change(st);
    var hist = (st.hist || []).slice();
    if (SR.features.stockTips) root.appendChild(tipBanner(s));
    root.appendChild(h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', flexWrap: 'wrap' } },
      h('span', { class: 't-h3', 'data-id': 'stock-title' }, tk),
      h('span', { class: 't-small', style: { color: 'var(--ink-700)' } }, def.company ? t(def.company) : ''),
      h('span', { class: 't-label', 'data-id': 'stock-price', style: { marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' } }, money(st.price, { cents: true })),
      h('span', { class: 't-small', style: { color: changeColour(pct), fontWeight: '700' } }, changeText(pct))));
    if (hist.length) {
      root.appendChild(SR.ui.lineChart({ id: 'stock-chart', label: t('sub.home.stocks.chart', { n: hist.length }), w: CHART_W, h: CHART_H,
        series: [{ data: hist, kind: 'money', label: t('sub.home.stocks.chart', { n: hist.length }) }],
        format: function (v) { return money(v, { cents: v < 100 }); } }));
    }
    var pl = st.held * st.price - st.basis;
    root.appendChild(h('p', { class: 't-body', 'data-id': 'stock-holding', style: { margin: 'var(--sp-2) 0', fontVariantNumeric: 'tabular-nums' } },
      st.held ? [t('sub.home.stocks.held', { n: SR.text.num(st.held) }), t('sub.home.stocks.avg', { money: money(st.basis / st.held, { cents: true }) }),
        t('sub.home.stocks.pl', { money: money(Math.round(pl), { sign: true }) })].join(' · ') : t('sub.home.stocks.none')));
    var maxN = Math.max(1, tr.max, st.held);
    S.n = Math.max(1, Math.min(S.n || 1, maxN));
    var buyBtn, sellBtn;
    var field = SR.ui.numberField({ id: 'stock-n', label: 'sub.home.stocks.shares', value: S.n, min: 1, max: maxN, step: 1,
      quick: ['+10', '+100', { label: 'sub.home.stocks.max', set: Math.max(1, tr.max) }],
      onChange: function (v) { S.n = v; update(); }, onSubmit: function () { buy(); } });
    root.appendChild(field);
    buyBtn = SR.ui.button({ id: 'stock-buy', label: 'sub.home.stocks.buy', vars: { n: SR.text.num(S.n) }, variant: 'primary', icon: 'money', onClick: buy });
    sellBtn = SR.ui.button({ id: 'stock-sell', label: 'sub.home.stocks.sell', vars: { n: SR.text.num(S.n) }, icon: 'sell', onClick: sell });
    var costLine = h('p', { class: 't-small', 'data-id': 'stock-quote', style: { margin: 'var(--sp-2) 0 0', color: 'var(--ink-700)', fontVariantNumeric: 'tabular-nums' } });
    root.appendChild(h('div', { style: { display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' } }, buyBtn, sellBtn));
    root.appendChild(costLine);
    root.appendChild(notes(s, tk));

    function update() {
      var pb = S.ctx.preview('home.stockBuy', { ticker: tk, n: S.n, where: where() });
      var ps = S.ctx.preview('home.stockSell', { ticker: tk, n: S.n, where: where() });
      buyBtn.update({ vars: { n: SR.text.num(S.n) }, disabled: !(pb && pb.ok), reason: pb && pb.reason, reasonVars: pb && pb.vars });
      sellBtn.update({ vars: { n: SR.text.num(S.n) }, disabled: !(ps && ps.ok), reason: ps && ps.reason, reasonVars: ps && ps.vars });
      costLine.textContent = t('sub.home.stocks.buyCost', { money: money(tr.cost(S.n)) }) + ' · ' +
        t('sub.home.stocks.sellGets', { money: money(S.n <= st.held ? tr.proceeds(S.n) : 0) });
    }
    function buy() { S.ctx.act('home.stockBuy', { ticker: tk, n: S.n, where: where() }); }
    function sell() { S.ctx.act('home.stockSell', { ticker: tk, n: S.n, where: where() }); }
    update();
  }

  function render() {
    if (!S) return;
    var root = S.root, a = document.activeElement;
    var inside = !!(a && root.contains(a));
    var had = inside ? a.getAttribute('data-id') : null;
    D().clear(root);
    if (S.ticker) renderTicker(); else renderList();
    if (!inside && document.activeElement && document.activeElement !== document.body) return;
    var el = (had && root.querySelector('[data-id="' + had + '"][data-nav]')) || root.querySelector('[data-nav]');
    if (el) SR.ui.focus.focus(el);
  }

  SR.def.subscreen('home.stocks', {
    title: 'sub.home.stocks',
    p: 0,
    mount: function (root, ctx) {
      S = { root: root, ctx: ctx, ticker: ctx.params && R().tickers().indexOf(ctx.params.ticker) >= 0 ? ctx.params.ticker : null, n: 1 };
      render();
    },
    refresh: function (ctx) { if (S) { S.ctx = ctx; render(); } },
    unmount: function () { S = null; },
    onAction: function (action, ev) {
      if (!S || (ev && ev.down === false)) return false;
      if (action === 'back' && S.ticker) {
        var from = S.ticker;
        S.ticker = null;
        render();
        var b = S.root.querySelector('[data-id="stock-' + from + '"]');
        if (b) SR.ui.focus.focus(b);
        return true;
      }
      return false;
    },
  });
})();
