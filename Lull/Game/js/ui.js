// Lull — DOM pieces: icons, toasts, modals, the Shop, Statistics, Settings, and the item pickers.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { fmt, fmtInt, fmtDuration, pct, Render, Pieces, ITEMS, ITEM_ORDER, COSMETICS, COSMETIC_LABELS, ACCENTS, Puzzles, Factory } = L;
  const { LINE } = L;

  // ---- DOM helper ---------------------------------------------------------------------------------------------------

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
    }
    return el;
  }

  // The icon set lives in js/icons.js: one family, one grid, one stroke.
  const ICONS = L.Icons.I;
  const icon = (name, cls) => h('span', { class: 'ico' + (cls ? ' ' + cls : ''), html: L.Icons.icon(name), 'aria-hidden': 'true' });

  // ---- toasts and modals ----------------------------------------------------------------------------------------------

  /** Plays a sound pack's sample; muted, it says why nothing is heard instead of leaving you wondering. */
  function listen(app, id) {
    if (app.settings.muted) toast('Muted', null, 1600);
    app.sound.preview(id);
  }

  function toast(msg, kind, ms, ico) {
    const box = document.getElementById('toasts');
    // Above a board tab's bars (status, items, controls, puzzle actions), never over them.
    const bar = document.querySelector('.view.active > .statusbar, .view.active > .puz-actions'), holder = box.offsetParent;
    box.style.bottom = bar && holder ? Math.max(14, Math.round(holder.getBoundingClientRect().bottom - bar.getBoundingClientRect().top + 8)) + 'px' : '';
    const el = h('div', { class: 'toast ' + (kind || '') }, ico ? icon(ico) : null, msg);
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms || 2600);
  }

  const modals = [];
  function openModal(opts) {
    const rootEl = document.getElementById('modal-root');
    const close = () => {
      const i = modals.indexOf(handle);
      if (i >= 0) modals.splice(i, 1);
      scrim.remove();
      if (L.app) L.app.postDragRegions();
      if (opts.onClose) opts.onClose();
    };
    const footer = opts.buttons && opts.buttons.length ? h('footer', null, opts.buttons.map((b) => h('button', {
      class: 'btn ' + (b.kind || ''), disabled: b.disabled,
      onclick: () => { if (b.onClick && b.onClick() === false) return; close(); },
    }, b.label))) : null;
    const modal = h('div', { class: 'modal' + (opts.cls ? ' ' + opts.cls : ''), role: 'dialog', style: opts.width ? { width: 'min(' + opts.width + 'px, calc(100% - 24px))' } : null },
      h('header', null, opts.icon ? icon(opts.icon) : null, opts.title || '', h('button', { class: 'icon-btn x', html: ICONS.close, 'aria-label': 'Close', onclick: close })),
      h('div', { class: 'body' }, opts.body),
      footer);
    const scrim = h('div', { class: 'scrim', onmousedown: (e) => { if (e.target === scrim) close(); } }, modal);
    rootEl.appendChild(scrim);
    const handle = { close, el: modal, opts };
    modals.push(handle);
    if (L.app) L.app.postDragRegions(); // a tall dialog covers the title bar: it must take its clicks
    const first = modal.querySelector('input, textarea');
    if (first) setTimeout(() => first.focus(), 30);
    return handle;
  }
  function modalOpen() { return modals.length > 0; }
  function closeTopModal() { const m = modals[modals.length - 1]; if (m) { m.close(); return true; } return false; }
  function submitTopModal() {
    const m = modals[modals.length - 1];
    if (!m) return false;
    const btn = m.el.querySelector('footer .btn.primary:not(:disabled)');
    if (btn) { btn.click(); return true; }
    return false;
  }

  function confirm(title, text, okLabel, onOk, kind, ico) {
    return openModal({ title, icon: ico, body: !text ? null : typeof text === 'string' ? h('p', null, text) : text, buttons: [{ label: 'Cancel' }, { label: okLabel || 'OK', kind: kind || 'primary', onClick: onOk }] });
  }

  // ---- small canvases -------------------------------------------------------------------------------------------------

  function canvasFor(w, h2, draw) {
    const c = h('canvas');
    const dpr = Math.min(3, root.devicePixelRatio || 1);
    c.width = Math.round(w * dpr); c.height = Math.round(h2 * dpr);
    c.style.width = w + 'px'; c.style.height = h2 + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.__dpr = dpr;
    draw(ctx, w, h2);
    return c;
  }

  function lookWith(app, kind, id) {
    const eq = Object.assign({}, app.store.state.equipped);
    if (kind) eq[kind] = id;
    return Render.makeLook(eq, app.theme, performance.now());
  }

  function drawMiniPiece(ctx, look, id, x, y, s, rot) {
    const t = Pieces.get(id);
    const cells = t.rots[rot || 0];
    const b = Pieces.boundsOf(cells);
    for (const [cx, cy] of cells) Render.drawCell(ctx, look.skin, look.colors[t.color], x + (cx - b.minX) * s, y + (b.maxY - cy) * s, s);
  }

  // Shop previews that move (Prism, Rainbow, a moving backdrop, every line clear) share one animation loop, which runs
  // only while such a preview is on screen and never under reduced motion.
  const live = new Set();
  let liveRaf = 0;
  function tickLive(t) {
    liveRaf = 0;
    for (const p of live) { if (!p.canvas.isConnected) { live.delete(p); continue; } p.paint(t); }
    if (live.size) liveRaf = requestAnimationFrame(tickLive);
  }
  function addLive(p) { live.add(p); if (!liveRaf) liveRaf = requestAnimationFrame(tickLive); }

  const PREVIEW_STACK = [[0, 3, 6], [1, 3, 6], [2, 3, 6], [0, 2, 6], [5, 3, 4], [6, 3, 4], [5, 2, 5], [4, 2, 5], [7, 3, 1], [7, 2, 1], [7, 1, 1], [3, 3, 7], [4, 3, 7], [6, 2, 3], [6, 1, 3], [5, 1, 3]];

  /** A live preview of one cosmetic, drawn in your current look: a small real well with a stack in it. */
  function cosmeticPreview(app, kind, id) {
    const w = 220, hh = 112;
    const still = app.reducedMotion();
    const look = Render.makeLook(Object.assign({}, app.store.state.equipped, { [kind]: id }), app.theme, 0, still);
    const theme = app.theme;
    const moving = !still && (look.animated || kind === 'effect');
    const cols = kind === 'skin' ? 7 : 9, rows = 4;
    const s = kind === 'skin' ? 22 : 20;
    const bw = s * cols, bh = s * rows, bx = Math.round((w - bw) / 2), by = Math.round((hh - bh) / 2) + 1;
    const board = { x: bx, y: by, w: bw, h: bh };
    const colour = kind === 'palette' || kind === 'skin' || kind === 'effect';
    let fx = null, fxAt = -1e9;
    const paint = (ctx, t) => {
      ctx.clearRect(0, 0, w, hh);
      ctx.__light = theme.name === 'light';
      if (look.prism && !still) look.colors = Render.forWell(Render.paletteColors(id, t), theme.name);
      const wr = Render.drawWell(ctx, look.backdrop, board, s, cols, rows, theme, still ? 0 : t);
      const col = (c) => look.colors[colour ? c : 8];
      if (kind === 'effect') {
        // A row that clears every two seconds (held for a beat first), over the rest of the stack.
        for (const [cx, cy, c] of PREVIEW_STACK) if (cy === 3) Render.drawCell(ctx, look.skin, col(c), bx + cx * s, by + cy * s, s);
        const period = 1700, hold = 650, cycle = still ? 0 : Math.floor(t / period), phase = still ? hold + 160 : t % period;
        if (phase < hold) for (let i = 0; i < cols; i++) Render.drawCell(ctx, look.skin, look.colors[(i % 7) + 1], bx + i * s, by + 2 * s, s);
        else {
          if (!fx || fx.cycle !== cycle) {
            fx = new Render.FX(); fx.cycle = cycle; fx.clock = 0; fx.light = theme.name === 'light';
            const cells = [];
            for (let i = 0; i < cols; i++) cells.push({ x: bx + i * s, y: by + 2 * s, color: look.colors[(i % 7) + 1] });
            fx.burst(id, cells, s, false);
            if (id === 'ripple') fx.ring(bx + bw / 2, by + 2.5 * s, theme.accent, s * cols * 0.7);
          }
          const target = (phase - hold) / 1000;
          while (fx.clock < target) { const dt = Math.min(1 / 60, target - fx.clock + 1e-6); fx.update(dt); fx.clock += dt; }
          ctx.save(); Render.rr(ctx, wr.x, wr.y, wr.w, wr.h, wr.r); ctx.clip(); fx.draw(ctx); ctx.restore();
        }
      } else {
        for (const [cx, cy, c] of PREVIEW_STACK) if (cx < cols) Render.drawCell(ctx, look.skin, col(c), bx + cx * s, by + cy * s, s);
        if (kind === 'ghost') {
          const g = look.colors[2];
          for (const [cx, cy] of [[3, 2], [4, 2], [3, 1], [4, 1]]) Render.ghostCell(ctx, id, g, bx + cx * s, by + cy * s, s);
        } else if (colour) {
          drawMiniPiece(ctx, look, 'O', bx + 3 * s, by, s, 0);
        } else drawMiniPiece(ctx, look, 'T', bx + 2 * s, by, s, 2);
      }
      Render.drawRim(ctx, wr, theme);
      Render.drawFrame(ctx, look.frame, wr, theme.accent, still ? 0 : t, theme);
    };
    // First drawn mid-clear, so a clear's preview says what it does before the loop starts.
    const t0 = performance.now(), mid = t0 - (t0 % 1700) + 650 + 150;
    const c = canvasFor(w, hh, (ctx) => paint(ctx, kind === 'effect' ? mid : t0));
    c.classList.add('look-prev');
    if (moving) { const ctx = c.getContext('2d'); addLive({ canvas: c, paint: (t) => { ctx.setTransform(ctx.__dpr, 0, 0, ctx.__dpr, 0, 0); paint(ctx, t); } }); }
    return c;
  }

  // ---- shop -----------------------------------------------------------------------------------------------------------
  //
  // The wallet opens it. Cosmetics only, one kind at a time: a row of kinds (a chevron at each end pages it when it does
  // not fit) picks which, and only that kind's tiles are shown (the list scrolls within it). A tile is a preview, a name and a price. Buying
  // is two calm clicks on the same spot — the price turns into Confirm for a few seconds — never a dialog.

  const SHOP_SHORT = { skin: 'Skins', effect: 'Clears' };
  const shopUI = { armed: null, timer: 0, jumpLeft: 0 };

  function disarmShop() {
    clearTimeout(shopUI.timer);
    const b = shopUI.armed;
    shopUI.armed = null;
    if (b && b.isConnected) { b.classList.remove('armed'); b.replaceChildren(...b._price); b.setAttribute('aria-label', b._label); }
  }

  /** A price button: the first click asks (the button says Confirm), the second buys. */
  function priceButton(app, price, label, buy) {
    const kids = () => [h('span', { class: 'gem' }, LINE), fmtInt(price)];
    const b = h('button', { class: 'price-btn', 'data-price': price, 'aria-label': label + ' for ' + fmtInt(price) + ' lines' }, kids());
    b._price = kids(); b._label = b.getAttribute('aria-label');
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (app.store.state.lines < price) { app.sound.play('error'); b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); return; }
      if (shopUI.armed === b) { disarmShop(); buy(); return; }
      disarmShop();
      shopUI.armed = b;
      b.classList.add('armed');
      b.replaceChildren('Confirm');
      b.setAttribute('aria-label', 'Confirm: ' + b._label);
      app.sound.play('rotate');
      shopUI.timer = setTimeout(disarmShop, 3200);
    });
    return b;
  }

  /** Keeps every price in step with the wallet without redrawing the previews. */
  function refreshShopPrices(app) {
    const n = app.store.state.lines;
    for (const b of document.querySelectorAll('#shop-body .price-btn')) b.classList.toggle('poor', n < Number(b.dataset.price));
  }

  function renderShop(app, kind) {
    const head = document.getElementById('shop-head'), body = document.getElementById('shop-body');
    const { COSMETICS, COSMETIC_LABELS } = L;
    const kinds = Object.keys(COSMETICS);
    // One kind at a time: the one asked for, else the one last looked at, else the first.
    if (!COSMETICS[kind]) kind = COSMETICS[app.settings.shopKind] ? app.settings.shopKind : kinds[0];
    const same = app.shopSub === kind && body.dataset.sub === kind;
    const keep = same ? body.scrollTop : 0;
    const refocus = head.contains(document.activeElement);
    app.shopSub = kind;
    if (app.settings.shopKind !== kind) { app.settings.shopKind = kind; app.store.touch(); }
    disarmShop();
    const st = app.store.state;
    const bought = (sel) => { const t = body.querySelector(sel); if (t) { t.classList.add('fresh'); setTimeout(() => t.classList.remove('fresh'), 900); } };
    const at = kinds.indexOf(kind);
    const go = (k) => { if (COSMETICS[k] && k !== kind) { app.sound.play('move'); renderShop(app, k); } };
    const step = (d) => go(kinds[at + d]);

    const cat = COSMETICS[kind], ids = Object.keys(cat);
    const owned = ids.filter((id) => app.store.owns(kind, id)).length;
    const tiles = ids.map((id) => {
      const c = cat[id], own = app.store.owns(kind, id), on = st.equipped[kind] === id;
      const equip = () => { app.store.equip(kind, id); app.sound.play('move'); app.applyLook(); };
      let action;
      if (on) action = h('span', { class: 'in-use' }, 'In use');
      else if (own) action = h('button', { class: 'use-btn', onclick: (e) => { e.stopPropagation(); equip(); } }, 'Use');
      else if (c.reward) action = h('span', { class: 'reward-tag', html: LOCK + '<span>Factory</span>' });
      else action = priceButton(app, c.price, 'Buy ' + c.name, () => {
        if (!app.store.buyCosmetic(kind, id)) return;
        app.sound.play('buy'); app.store.equip(kind, id); app.refreshWallet(true); app.applyLook();
        bought('[data-look="' + kind + ':' + id + '"]');
      });
      const preview = kind === 'sound'
        ? h('button', { class: 'preview listen', 'aria-label': 'Listen to ' + c.name, onclick: (e) => {
          e.stopPropagation(); listen(app, id);
          const p = e.currentTarget; p.classList.remove('playing'); void p.offsetWidth; p.classList.add('playing');
        } }, h('span', { class: 'play', html: PLAY }), h('span', { class: 'eq' }, [0, 1, 2, 3, 4].map(() => h('i'))))
        : h('div', { class: 'preview' }, cosmeticPreview(app, kind, id));
      const tip = c.reward && !own ? c.reward : null;
      return h('div', {
        class: 'shop-look' + (on ? ' on' : '') + (own ? ' own' : '') + (c.reward && !own ? ' locked' : ''), 'data-look': kind + ':' + id,
        'data-tip-title': tip ? c.name : null, 'data-tip': tip,
        onclick: own && !on ? equip : null,
      }, preview, h('div', { class: 'foot' }, h('span', { class: 'nm' }, c.name), action));
    });

    // The head: a chevron, the kinds (one lit), a chevron. Only the lit kind is shown below. The chevrons page the
    // row of kinds (when it does not all fit), they never pick one.
    const chev = (d, label) => h('button', {
      class: 'icon-btn shop-chev', 'data-dir': d < 0 ? 'prev' : 'next', 'aria-label': label,
      html: d < 0 ? CHEV_L : CHEV_R, onclick: () => page(d),
    });
    const jump = h('nav', { class: 'shop-jump', role: 'tablist', 'aria-label': 'Cosmetics', tabindex: '-1' }, kinds.map((k) =>
      h('button', {
        role: 'tab', 'data-sec': k, 'aria-selected': String(k === kind), 'aria-current': String(k === kind), tabindex: k === kind ? '0' : '-1',
        onclick: () => go(k),
      }, SHOP_SHORT[k] || COSMETIC_LABELS[k])));
    jump.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (!d) return;
      e.preventDefault(); e.stopPropagation();
      step(d);
    });
    jump.addEventListener('wheel', (e) => { if (jump.scrollWidth > jump.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { jump.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    const prevBtn = chev(-1, 'Scroll left'), nextBtn = chev(1, 'Scroll right');
    head.replaceChildren(prevBtn, jump, nextBtn);
    // One page of the row: its visible width, snapped so the first kind cut off (or hidden) on that side comes fully
    // into view just inside the faded edge.
    const page = (d) => {
      const view = jump.clientWidth, max = jump.scrollWidth - view, pad = 28, x0 = jump.getBoundingClientRect().left - jump.scrollLeft;
      const spans = Array.from(jump.children).map((b) => { const r = b.getBoundingClientRect(); return [r.left - x0, r.right - x0]; });
      let to;
      if (d > 0) {
        const edge = jump.scrollLeft + view - pad, cut = spans.find(([, r]) => r > edge + 1);
        to = cut ? Math.min(cut[0] - pad, jump.scrollLeft + view) : max;
      } else {
        const edge = jump.scrollLeft + pad, cut = spans.filter(([l]) => l < edge - 1).pop();
        to = cut ? Math.max(cut[1] + pad - view, jump.scrollLeft - view) : 0;
      }
      to = Math.max(0, Math.min(max, Math.round(to)));
      if (to === jump.scrollLeft) return;
      app.sound.play('move');
      jump.scrollTo({ left: to, behavior: app.settings.motion === 'reduced' ? 'auto' : 'smooth' });
    };

    body.dataset.sub = kind;
    body.replaceChildren(h('section', { class: 'shop-sec looks', 'data-sec': kind },
      h('h3', { class: 'shop-h' }, h('span', null, COSMETIC_LABELS[kind]), h('span', { class: 'n' }, owned + ' / ' + ids.length)),
      h('div', { class: 'shop-looks' }, tiles)));
    refreshShopPrices(app);
    body.scrollTop = keep;

    // A row that slides (a narrow window) keeps the lit kind in view, with a little of its neighbours.
    const lit = jump.querySelector('[aria-selected="true"]');
    if (jump.scrollWidth > jump.clientWidth) {
      const l = lit.offsetLeft - jump.offsetLeft, r = l + lit.offsetWidth, pad = 28;
      const prev = shopUI.jumpLeft || 0;
      jump.scrollLeft = prev;
      if (l - pad < jump.scrollLeft) jump.scrollLeft = l - pad;
      else if (r + pad > jump.scrollLeft + jump.clientWidth) jump.scrollLeft = r + pad - jump.clientWidth;
    }
    const edges = () => {
      shopUI.jumpLeft = jump.scrollLeft;
      jump.classList.toggle('fade-l', jump.scrollLeft > 1);
      jump.classList.toggle('fade-r', jump.scrollLeft + jump.clientWidth < jump.scrollWidth - 1);
      // The chevrons: off at the ends, gone (keeping their room) when the row fits.
      const fits = jump.scrollWidth <= jump.clientWidth + 1;
      prevBtn.disabled = fits || jump.scrollLeft <= 1;
      nextBtn.disabled = fits || jump.scrollLeft + jump.clientWidth >= jump.scrollWidth - 1;
      for (const b of [prevBtn, nextBtn]) b.style.visibility = fits ? 'hidden' : '';
    };
    edges();
    jump.addEventListener('scroll', edges, { passive: true });
    if (shopUI.ro) shopUI.ro.disconnect();
    if (root.ResizeObserver) { shopUI.ro = new ResizeObserver(edges); shopUI.ro.observe(jump); }
    if (refocus) lit.focus({ preventScroll: true });
  }

  const INFO = ICONS.info;
  const PLAY = ICONS.playIcon;
  const LOCK = ICONS.lock;
  const CHEV_L = ICONS.chevLeft;
  const CHEV_R = ICONS.chevRight;

  // Anywhere else, a price asking for confirmation goes back to its price.
  if (root.document) document.addEventListener('mousedown', (e) => { if (shopUI.armed && !shopUI.armed.contains(e.target)) disarmShop(); }, true);

  // ---- statistics -----------------------------------------------------------------------------------------------------

  function count(n) { return n < 1000 ? fmtInt(Math.floor(n)) : fmt(n); }
  function kpi(v, l) { return h('div', { class: 'kpi' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l)); }
  function table(rows, cls) { return h('table', { class: 'st ' + (cls || '') }, rows.map((r) => h('tr', null, r.map((c) => h('td', null, c))))); }
  function hbars(items, colorFn) {
    const max = Math.max(1, ...items.map((i) => i[1]));
    return h('div', { class: 'hbars' }, items.map(([label, v], i) => h('div', { class: 'hbar' },
      h('span', null, label),
      h('div', { class: 'track' }, h('i', { style: { width: (100 * v / max).toFixed(1) + '%', background: colorFn ? colorFn(i, label) : 'var(--accent)' } })),
      h('span', { class: 'n' }, fmtInt(v)))));
  }

  function historyChart(app, key, days) {
    const hist = app.store.state.history;
    const out = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const k = L.dateKey(d);
      out.push({ k, v: (hist[k] && hist[k][key]) || 0, label: i === 0 ? 'today' : String(d.getDate()), today: i === 0 });
    }
    const max = Math.max(1, ...out.map((o) => o.v));
    return h('div', { class: 'cols-chart' }, out.map((o) => h('div', { class: 'c' + (o.today ? ' today' : ''), title: o.k + ': ' + fmtInt(o.v) },
      h('i', { style: { height: (100 * o.v / max).toFixed(1) + '%' } }), h('span', null, o.label))));
  }

  /**
   * The Achievements tab: every milestone, earned or not, the legendary ones set apart. Each group folds away (its
   * header keeps the count), and a filter shows all of them, the ones still to do, or the earned ones.
   */
  function renderAchievements(app) {
    const st = app.state, S = st.stats, A = L.Achievements, got = st.achievements || {};
    const filter = app.achFilter || 'all', open = app.achOpen || (app.achOpen = {});
    const n = A.LIST.filter((a) => got[a.id]).length;
    const num = (v) => (v >= 10000 ? fmt(v).replace(/\.0+(?=\D)/, '') : fmtInt(v));
    const date = (when) => new Date(when).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const seg = h('div', { class: 'seg' }, [['all', 'All ' + A.LIST.length], ['left', 'To do ' + (A.LIST.length - n)], ['got', 'Earned ' + n]].map(([k, label]) =>
      h('button', { 'aria-pressed': String(filter === k), onclick: () => { app.achFilter = k; renderAchievements(app); } }, label)));
    const els = [
      h('div', { class: 'kpis three' },
        kpi(n + ' / ' + A.LIST.length, 'Earned'),
        kpi(h('span', null, fmtInt(S.lines.achievements || 0), ' ', h('span', { class: 'gem' }, LINE)), 'Lines earned'),
        kpi(h('span', null, fmtInt(A.total()), ' ', h('span', { class: 'gem' }, LINE)), 'Lines available')),
      h('div', { class: 'ach-tools' }, seg),
    ];
    const row = (a) => {
      const when = got[a.id], pr = !when && a.progress ? a.progress(st) : null;
      return h('div', { class: 'ach' + (when ? ' got' : '') + (a.tier === 'legend' ? ' legend' : '') },
        h('span', { class: 'ach-i', html: L.Icons.icon(a.tier === 'legend' ? 'legend' : when ? 'starOn' : 'star') }),
        h('div', { class: 'grow' },
          h('div', { class: 't' }, a.name, a.tier === 'legend' ? h('span', { class: 'tier' }, 'Legendary') : null),
          h('div', { class: 'd' }, a.desc),
          pr ? h('div', { class: 'ach-prog' }, h('div', { class: 'bar' }, h('i', { style: { width: (100 * Math.min(1, pr[0] / pr[1])).toFixed(1) + '%' } })), h('span', null, num(Math.min(pr[0], pr[1])) + ' / ' + num(pr[1]))) : null),
        h('div', { class: 'ach-side' },
          h('span', { class: 'ach-pay' }, '+' + fmtInt(a.pay) + ' ', h('span', { class: 'gem' }, LINE)),
          when ? h('span', { class: 'ach-when' }, date(when)) : null));
    };
    const shown = (a) => filter === 'all' || (filter === 'got') === !!got[a.id];
    for (const g of A.GROUPS) {
      // Easiest first, so each group reads upward in difficulty.
      const list = A.LIST.filter((a) => a.group === g.id).sort((x, y) => x.pay - y.pay);
      if (!list.length) continue;
      const have = list.filter((a) => got[a.id]), paid = have.reduce((t, a) => t + a.pay, 0), all = list.reduce((t, a) => t + a.pay, 0);
      const plain = list.filter((a) => a.tier !== 'legend' && shown(a)), leg = list.filter((a) => a.tier === 'legend' && shown(a));
      els.push(h('details', { class: 'ach-group', 'data-group': g.id, open: !!open[g.id], ontoggle: (e) => { open[g.id] = e.currentTarget.open; } },
        h('summary', null,
          h('span', { class: 'chev', html: ICONS.chevRight }),
          h('b', null, g.name),
          g.note ? h('span', { class: 'ach-info', tabindex: '0', 'aria-label': g.noteTitle + ': ' + g.note, 'data-tip-title': g.noteTitle, 'data-tip': g.note, html: INFO,
            onclick: (e) => { e.preventDefault(); e.stopPropagation(); } }) : null,
          h('span', { class: 'ach-count', 'data-tip': 'Earned ' + have.length + ' of ' + list.length }, have.length + ' / ' + list.length),
          h('div', { class: 'bar' }, h('i', { style: { width: (100 * have.length / list.length).toFixed(1) + '%' } })),
          h('span', { class: 'ach-pay', 'data-tip': 'Lines earned ' + fmtInt(paid) + ' / Lines available ' + fmtInt(all) }, num(paid) + ' / ' + num(all) + ' ', h('span', { class: 'gem' }, LINE))),
        plain.length ? h('div', { class: 'ach-list' }, plain.map((a) => row(a))) : null,
        leg.length ? h('div', { class: 'ach-list legend-list' }, leg.map((a) => row(a))) : null,
        plain.length || leg.length ? null : h('p', { class: 'ach-none' }, filter === 'got' ? 'None earned' : 'All earned')));
    }
    document.getElementById('ach-body').replaceChildren(...els);
  }

  function renderStats(app, sub) {
    const tabs = document.getElementById('stats-tabs');
    const body = document.getElementById('stats-body');
    const subs = [['overview', 'Overview'], ['free', 'Free Play'], ['classic', 'Classic'], ['puzzle', 'Puzzles'], ['factory', 'Factory'], ['items', 'Shop']];
    tabs.replaceChildren(...subs.map(([k, label]) => h('button', { 'aria-selected': String(k === sub), onclick: () => { app.statsSub = k; renderStats(app, k); } }, label)));
    const st = app.store.state, S = st.stats;
    const look = lookWith(app);
    const els = [];
    const pz = S.puzzle;
    const solvedAll = pz.E.solved + pz.M.solved + pz.H.solved;
    if (sub === 'overview') {
      els.push(h('div', { class: 'kpis four' },
        kpi(fmtInt(st.lines), 'Wallet'),
        kpi(fmtInt(S.lines.earned), 'Lines earned'),
        kpi(fmtInt(S.free.lines), 'Lines cleared'),
        kpi(fmtInt(solvedAll), 'Puzzles solved'),
        kpi(count(st.factory.stats.minos), 'Minos made'),
        kpi(fmtDuration(S.timeMs.total), 'Time played'),
        kpi(fmtInt(S.sessions), 'Sessions'),
        kpi(fmtInt(S.days || 0), 'Days played')));
      els.push(h('h4', null, 'Lines earned · 14 days'), historyChart(app, 'lines', 14));
      els.push(h('h4', null, 'Lines by source'), hbars([['Free Play', S.lines.play], ['Combos', S.lines.combos || 0], ['Puzzles', S.lines.puzzles], ['Factory', S.lines.factory], ['Achievements', S.lines.achievements || 0]].concat(S.lines.luck ? [['Jackpot', S.lines.luck]] : [])));
      els.push(h('h4', null, 'Time by mode'), table([
        ['Free Play', fmtDuration(S.timeMs.play)], ['Classic', fmtDuration(S.timeMs.classic || 0)], ['Puzzles', fmtDuration(S.timeMs.puzzle)], ['Factory', fmtDuration(S.timeMs.factory)],
      ]));
    } else if (sub === 'classic') {
      const C = S.classic;
      els.push(h('div', { class: 'kpis' }, kpi(fmtInt(C.best), 'Best score'), kpi(String(C.bestLevel || '—'), 'Best level'), kpi(fmtInt(C.bestLines), 'Best lines'),
        kpi(fmtInt(C.games), 'Games'), kpi(fmtInt(C.lines), 'Lines'), kpi(fmtInt(C.pieces), 'Pieces'), kpi(fmtDuration(S.timeMs.classic || 0), 'Time played')));
    } else if (sub === 'free') {
      const F = S.free;
      const ppm = S.timeMs.play > 60000 ? F.pieces / (S.timeMs.play / 60000) : 0;
      els.push(h('div', { class: 'kpis' },
        kpi(fmtInt(F.pieces), 'Pieces'), kpi(fmtInt(F.lines), 'Lines'), kpi(fmtInt(F.bestScore), 'Best score'),
        kpi(fmtInt(F.bestLines), 'Best lines'), kpi(ppm ? ppm.toFixed(1) : '—', 'Pieces / min'), kpi(F.pieces ? (F.lines / F.pieces * 2.5).toFixed(2) : '—', h('span', { title: '1.00 = all quads' }, 'Efficiency'))));
      els.push(h('h4', null, 'Clears'), hbars([['Single', F.clears[1]], ['Double', F.clears[2]], ['Triple', F.clears[3]], ['Quad', F.clears[4]], ['5+', F.clears[5]]]));
      els.push(h('h4', null, 'Pieces placed'), hbars(Pieces.TETROMINOES.map((id) => [id, F.byType[id] || 0]).concat(Object.keys(F.byType).filter((k) => !Pieces.TETROMINOES.includes(k)).map((k) => [k, F.byType[k]])),
        (i, label) => look.colors[(Pieces.TYPES[label] && Pieces.TYPES[label].color) || 15]));
      els.push(h('h4', null, 'Technique'), table([
        ['T-spins', fmtInt(F.tspins)], ['Lines from T-spins', fmtInt(F.tspinLines)], ['Perfect clears', fmtInt(F.perfect)],
        ['Longest combo', fmtInt(F.maxCombo)], ['Longest back-to-back', fmtInt(Math.max(0, F.maxB2B))],
        ['Longest chain', fmtInt(F.bestChain || 0)], ['Best multiplier', L.Chain.fmt(F.bestMult || 1)],
        ['Holds', fmtInt(F.holds)], ['Turns', fmtInt(F.rotations)], ['Moves', fmtInt(F.moves)], ['Lowers', fmtInt(F.lowers)], ['Hard drops', fmtInt(F.drops)],
        ['Boards started', fmtInt(F.boards)], ['Boards filled', fmtInt(F.topouts)],
        ['Inputs per piece', F.pieces ? ((F.moves + F.rotations + F.lowers + F.drops + F.holds) / F.pieces).toFixed(2) : '—'],
      ]));
      // Combos: the ones found so far, with what to do and what they paid; the rest are a question mark until then.
      const book = st.combos || {}, list = L.Combos.LIST, found = list.filter((c) => book[c.id]).length;
      els.push(h('h4', null, 'Combos found · ' + found + ' / ' + list.length), h('div', { class: 'combo-list' }, list.map((c) => {
        const b = book[c.id];
        if (!b) return h('div', { class: 'combo unknown' }, h('b', null, '?'), h('span', null, c.kind === 'skill' ? 'Not found' : 'Not found · power-up'));
        const rw = L.Combos.reward(c, 0);
        const pays = [rw.lines ? rw.lines + ' ' + LINE : null, rw.boost ? L.Chain.fmt(rw.boost.x) + ' for ' + rw.boost.clears + ' clears' : null, fmtInt(rw.score) + ' points'].filter(Boolean).join(' · ');
        return h('div', { class: 'combo' }, h('b', null, c.name), h('span', null, c.how), h('i', null, pays + ' · ×' + fmtInt(b.n)));
      })));
      const log = F.boardLog || [];
      if (log.length) {
        els.push(h('h4', null, 'Past boards'), h('table', { class: 'st cols' },
          h('tr', null, ['Retired', 'Lived', 'Lines', 'Score', 'Pieces', 'Power-ups'].map((c) => h('th', null, c))),
          log.slice(0, 15).map((b) => h('tr', null,
            h('td', null, new Date(b.at).toLocaleDateString([], { month: 'short', day: 'numeric' }) + (b.reason === 'full' ? ' · full' : '')),
            h('td', null, b.life ? fmtDuration(b.life) : '—'), h('td', null, fmtInt(b.lines)), h('td', null, fmtInt(b.score)), h('td', null, fmtInt(b.pieces)), h('td', null, fmtInt(b.items))))));
      }
    } else if (sub === 'puzzle') {
      const rows = [['', 'Solved', '1st try', 'Tries', 'Best', 'Streak']];
      for (const d of ['E', 'M', 'H']) {
        const p = pz[d];
        rows.push([Puzzles.DIFFS[d].name, fmtInt(p.solved), p.solved ? pct(p.firstTry / p.solved) : '—', p.solved ? (p.attempts / p.solved).toFixed(1) : '—', p.bestMs ? L.fmtClock(p.bestMs) : '—', p.bestStreak + '']);
      }
      els.push(h('div', { class: 'kpis' }, kpi(fmtInt(solvedAll), 'Solved'), kpi(fmtInt(pz.E.played + pz.M.played + pz.H.played), 'Played'),
        kpi(fmtInt(pz.daily), 'Dailies'), kpi(fmtInt(pz.E.hints + pz.M.hints + pz.H.hints), 'Hints'),
        kpi(fmtInt(pz.E.fails + pz.M.fails + pz.H.fails), 'Retries')));
      els.push(h('h4', null, 'By difficulty'), h('table', { class: 'st cols' }, rows.map((r, i) => h('tr', null, r.map((c) => h(i ? 'td' : 'th', null, c))))));
      if (app.modes.puzzle) els.push(h('p', { class: 'pz-volume' }, app.modes.puzzle.volume()));
      const modRows = Object.keys(Puzzles.MODS).map((m) => { const r = pz.mods[m] || { seen: 0, solved: 0 }; return [h('span', null, icon('mod-' + m), Puzzles.MODS[m].name), r.solved + ' / ' + r.seen]; });
      els.push(h('h4', null, 'Wildcards · solved / seen'), table(modRows));
      els.push(h('h4', null, 'Puzzles solved · 14 days'), historyChart(app, 'puzzles', 14));
    } else if (sub === 'factory') {
      const f = st.factory, fs = f.stats;
      els.push(h('div', { class: 'kpis three' },
        kpi(Factory.quarters(Factory.perHour(f) / 4) + ' ' + LINE, 'Lines / hour'), kpi(fmtInt(fs.lines), 'Lines collected'), kpi(count(fs.minos), 'Minos made'),
        kpi(fmtInt(fs.pieces), 'Pieces'), kpi(fmtInt(fs.collects), 'Collects'), kpi(fmtInt(fs.best), 'Best collect')));
      els.push(h('h4', null, 'Minos by press'), hbars(Factory.MOLDS.map((n, k) => [String(n), (fs.byPress[k] || 0) * n]))); // byPress counts pieces
      // Every shape of each size: the ones pressed in colour, the rest faint.
      for (const n of [5, 6, 7]) {
        const list = Factory.shapes(n), seen = fs.seen[n] || '';
        els.push(h('h4', null, 'Shapes pressed · ' + Factory.NAMES[n].toLowerCase() + 'es ' + Factory.seenCount(f, n) + ' / ' + list.length),
          h('div', { class: 'catalog sm' }, list.map((c, s) => { const cv = L.FactoryArt.shapeCanvas(look, c, 30, look.colors[1 + (s % 7)], seen[s] === '1'); cv.title = Factory.shapeName(n, s); return cv; })));
      }
      const rows = [
        ['Days collected', fmtInt(fs.days)], ['Minos made away', count(fs.away)], ['Time full', fmtDuration(fs.fullMs)],
        ['Lines spent', fmtInt(fs.spent)], ['Time watched', fmtDuration(S.timeMs.factory)],
      ];
      els.push(h('h4', null, 'Totals'), table(rows));
    } else {
      const got = S.items.got, bought = S.items.bought, used = S.items.used;
      els.push(h('div', { class: 'kpis' }, kpi(fmtInt(S.lines.spent), 'Lines spent'), kpi(fmtInt(S.cosmetics.bought), 'Cosmetics'),
        kpi(fmtInt(Object.values(used).reduce((a, b) => a + b, 0)), 'Power-ups used'), kpi(fmtInt(S.lines.rewound), 'Lines rewound')));
      els.push(h('h4', null, 'Power-ups'), h('table', { class: 'st cols' },
        h('tr', null, h('th', null, ''), h('th', null, 'Bought'), h('th', null, 'Given'), h('th', null, 'Used'), h('th', null, 'Have')),
        ITEM_ORDER.map((id) => h('tr', null, h('td', null, icon('item-' + id), ITEMS[id].name), h('td', null, fmtInt(bought[id] || 0)), h('td', null, fmtInt(got[id] || 0)), h('td', null, fmtInt(used[id] || 0)), h('td', null, fmtInt(st.inventory[id] || 0))))));
      const ownedRows = Object.keys(COSMETICS).map((k) => [COSMETIC_LABELS[k], st.owned[k].length + ' / ' + Object.keys(COSMETICS[k]).length]);
      els.push(h('h4', null, 'Collection'), table(ownedRows));
    }
    body.replaceChildren(...els);
  }

  // ---- settings -------------------------------------------------------------------------------------------------------

  function openSettings(app, section) {
    const s = app.store.state.settings;
    const isNative = L.native.available;
    const set = (k, v) => { s[k] = v; app.store.touch(); app.applySettings(); };
    const row = (label, hint, control) => h('div', { class: 'set-row' }, h('div', { class: 'lbl' }, label, hint ? h('span', { class: 'hint' }, hint) : null), control);
    const card = (title, ...rows) => h('div', { class: 'set-card' }, title ? h('div', { class: 'set-card-title' }, title) : null, rows);
    const toggle = (k, onChange) => {
      const b = h('button', { class: 'switch', role: 'switch', 'data-setting': k, 'aria-checked': String(!!s[k]), onclick: () => { set(k, !s[k]); b.setAttribute('aria-checked', String(!!s[k])); if (onChange) onChange(); } });
      return b;
    };
    const range = (k, min, max, step, unit, scale) => {
      scale = scale || 1;
      const val = h('span', { class: 'val' }, Math.round(s[k] * scale) + unit);
      // The track fills to the value (--p), so a slider reads at a glance.
      const fill = (el) => el.style.setProperty('--p', (100 * (el.value - min) / (max - min)).toFixed(1) + '%');
      const input = h('input', { type: 'range', min, max, step, value: s[k] * scale, oninput: (e) => { set(k, Number(e.target.value) / scale); val.textContent = Math.round(s[k] * scale) + unit; fill(e.target); } });
      fill(input);
      return h('div', { class: 'range' }, input, val);
    };
    const tiles = (k, options, cls, onChange) => {
      const wrap = h('div', { class: 'tiles ' + (cls || '') });
      options.forEach(([v, label, preview]) => {
        const b = h('button', { class: 'tile', 'aria-pressed': String(s[k] === v), onclick: () => { set(k, v); wrap.querySelectorAll('.tile').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); if (onChange) onChange(); } }, preview, h('span', null, label));
        wrap.appendChild(b);
      });
      return wrap;
    };
    const bgPreview = (mode) => h('span', { class: 'tile-prev bgp bgp-' + mode }, h('i'));
    const themePreview = (t) => h('span', { class: 'tile-prev thp thp-' + t }, h('i'), h('i'), h('i'));

    const sections = {
      look: {
        icon: 'look', label: 'Look',
        body: () => {
          // Tint strength only means something on the Tint background: elsewhere it is there, but off.
          const tint = row('Tint strength', null, range('tint', 20, 98, 1, '%', 100));
          const tintOn = () => { const on = s.bg === 'tint'; tint.classList.toggle('off', !on); tint.querySelector('input').disabled = !on; };
          tintOn();
          return [
          card('Window background',
            tiles('bg', [['clear', 'Clear', bgPreview('clear')], ['glass', 'Glass', bgPreview('glass')], ['tint', 'Tint', bgPreview('tint')], ['solid', 'Solid', bgPreview('solid')]], '', tintOn),
            tint),
          card('Theme', tiles('theme', [['dark', 'Dark', themePreview('dark')], ['light', 'Light', themePreview('light')], ['auto', 'Auto', themePreview('auto')]])),
          card('Accent', (() => {
            const sw = h('div', { class: 'swatches big' });
            ACCENTS.forEach((c) => {
              const b = h('button', { class: 'swatch', style: { background: c }, 'aria-pressed': String(s.accent === c), title: c, onclick: () => { set('accent', c); sw.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); } });
              sw.appendChild(b);
            });
            return sw;
          })()),
          card('Motion', row('Effects', null, tiles('motion', [['full', 'Full', null], ['reduced', 'Reduced', null]], 'small'))),
          ];
        },
      },
      window: isNative ? {
        icon: 'window', label: 'Window',
        body: () => [card(null,
          row('Float above other windows', null, toggle('onTop')),
          row('Fade when the pointer leaves', null, toggle('fadeAway')),
          row('Show and hide', null, h('kbd', { class: 'big' }, '⌥⌘L')))],
      } : null,
      controls: {
        icon: 'controls', label: 'Controls',
        body: () => [
          card('Keyboard',
            row('Repeat delay', null, range('das', 60, 400, 5, ' ms')),
            row('Repeat rate', null, range('arr', 0, 150, 5, ' ms')),
            row('Lower repeat', null, range('lowerRepeat', 0, 150, 5, ' ms'))),
          card('Mouse',
            row('Mouse control', null, toggle('mouse'))),
          card('Board', row('Next pieces shown', null, range('preview', 1, 6, 1, '')),
            row('Control hints', null, toggle('hints'))),
          card('Classic',
            row('Pause when the pointer leaves', null, toggle('pauseAway'))),
          card('Puzzles',
            row('Counter-clockwise puzzles', 'New puzzles use Z and A', toggle('ccwPuzzles', () => { const pm = app.modes.puzzle; if (pm && pm.puzzle && !pm.done) pm.loadNumbered(pm.ps.diff); else if (pm && pm.puzzle) pm.renderNav(); }))),
        ],
      },
      sound: {
        icon: 'sound', label: 'Sound',
        body: () => [card(null,
          row('Mute', null, toggle('muted')),
          row('Sound effects', null, toggle('sound')),
          row('Volume', null, range('volume', 0, 100, 1, '%', 100)),
          row('Classic music', null, toggle('music', () => app.modes.classic && app.modes.classic.renderControls())),
          row('Announcer', null, toggle('announcer')),
          row('Announcer in Relaxed', null, toggle('announcerRelaxed')),
          row('Music volume', null, range('musicVolume', 0, 60, 1, '%', 100)),
          row('Announcer volume', null, range('announcerVolume', 0, 100, 1, '%', 100)),
          row('Sound pack', (L.SOUNDS[app.state.equipped.sound] || L.SOUNDS.soft).name, h('button', { class: 'btn sm', onclick: () => listen(app, app.state.equipped.sound) }, icon('playIcon'), 'Listen')))],
      },
      keys: {
        icon: 'keys', label: 'Keys',
        body: () => [card(null, h('div', { class: 'keys' }, L.KEY_HELP.map(([k, d]) => [h('span', { class: 'k' }, h('kbd', null, k)), h('span', null, d)])))],
      },
      data: {
        icon: 'data', label: 'Data',
        body: () => [
          card('Save', row('Progress', null,
            h('div', { class: 'btns' }, h('button', { class: 'btn sm', onclick: () => openExport(app) }, 'Export'), h('button', { class: 'btn sm', onclick: () => openImport(app) }, 'Import')))),
          card('Reset', row('Reset everything', null,
            h('button', { class: 'btn sm danger', onclick: () => confirm('Reset everything?', 'Deletes all progress. Settings are kept.', 'Reset', () => { app.store.reset(); location.reload(); }, 'danger') }, 'Reset…'))),
          h('p', { class: 'set-about' }, 'Lull ' + (L.VERSION || '') + ' · puzzle generator v' + Puzzles.GEN_VERSION),
        ],
      },
    };
    const ids = Object.keys(sections).filter((k) => sections[k]);
    let cur = section && sections[section] ? section : 'look';
    const pane = h('div', { class: 'set-pane scroll' });
    const nav = h('nav', { class: 'set-nav' });
    const show = (id) => {
      cur = id;
      nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === id)));
      pane.replaceChildren(...sections[id].body());
      pane.scrollTop = 0;
    };
    ids.forEach((id) => nav.appendChild(h('button', { 'data-id': id, onclick: () => show(id) }, h('span', { class: 'ni', html: L.Icons.icon(sections[id].icon) }), h('span', null, sections[id].label))));
    const body = h('div', { class: 'settings' }, nav, pane);
    const handle = openModal({ title: 'Settings', body, width: 620 });
    handle.el.classList.add('modal-settings');
    show(cur);
  }

  function openExport(app) {
    app.store.save();
    const ta = h('textarea', { readonly: true }, app.store.serialize());
    openModal({
      title: 'Export save', body: h('div', null, ta),
      buttons: [{ label: 'Close' }, { label: 'Copy', kind: 'primary', onClick: () => { ta.select(); copyText(ta.value); toast('Save copied', 'good'); return false; } }],
    });
  }

  function openImport(app) {
    const ta = h('textarea', { placeholder: 'Paste a Lull save here' });
    openModal({
      title: 'Import save', body: h('div', null, h('p', null, 'Replaces current progress.'), ta),
      buttons: [{ label: 'Cancel' }, { label: 'Import', kind: 'primary', onClick: () => {
        try { app.store.importJSON(ta.value); location.reload(); } catch (e) { toast('Not a Lull save', 'bad'); return false; }
      } }],
    });
  }

  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).catch(() => fallbackCopy(text)); return; }
    } catch (e) { /* fall through */ }
    fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* nothing more to try */ }
    ta.remove();
  }

  // ---- item pickers ---------------------------------------------------------------------------------------------------

  function openOrderSlip(app, onPick) {
    const look = lookWith(app);
    const ids = Pieces.TETROMINOES.concat(['I3', 'V3', 'D2']);
    let picked = false, handle = null;
    const choose = (id) => { picked = true; handle.close(); onPick(id); };
    const grid = h('div', { class: 'picker' }, ids.map((id) => h('button', { title: Pieces.TYPES[id].name, onclick: () => choose(id) },
      canvasFor(56, 54, (ctx) => { const t = Pieces.TYPES[id]; const b = Pieces.boundsOf(t.rots[0]); const s = Math.floor(Math.min(46 / b.w, 40 / b.h, 13)); drawMiniPiece(ctx, look, id, (56 - b.w * s) / 2, (54 - b.h * s) / 2, s, 0); }))));
    handle = openModal({ title: 'Order Slip', body: grid, onClose: () => { if (!picked) onPick(null); } });
  }

  /** Pick of Three: the next three pieces in line; onPick gets the index of the one chosen (or null). */
  function openPickOfThree(app, entries, onPick) {
    const look = lookWith(app);
    let picked = false, handle = null;
    const choose = (i) => { picked = true; handle.close(); onPick(i); };
    const grid = h('div', { class: 'picker three' }, entries.map((e, i) => h('button', { title: (Pieces.TYPES[e.id] || { name: e.id }).name, 'data-pick': i, onclick: () => choose(i) },
      canvasFor(64, 58, (ctx) => { const t = Pieces.get(e.id); const b = Pieces.boundsOf(t.rots[0]); const s = Math.floor(Math.min(54 / b.w, 46 / b.h, 14)); drawMiniPiece(ctx, look, e.id, (64 - b.w * s) / 2, (58 - b.h * s) / 2, s, 0); }))));
    handle = openModal({ title: 'Pick of Three', body: grid, onClose: () => { if (!picked) onPick(null); } });
  }

  function openBlueprint(app, onDone) {
    const N = 5;
    const on = new Set(['1,2', '2,2', '3,2', '2,1']);
    const status = h('div', { class: 'bp-status' });
    let handle = null;
    const cells = () => Array.from(on).map((k) => k.split(',').map(Number)).map(([x, y]) => [x, N - 1 - y]);
    const check = () => {
      const c = cells();
      let msg = '', ok = false;
      if (!c.length) msg = 'Draw a piece';
      else if (c.length > 6) msg = 'Six blocks at most';
      else if (!Pieces.isConnected(c)) msg = 'Blocks must touch';
      else { ok = true; msg = c.length + ' block' + (c.length > 1 ? 's' : ''); }
      status.textContent = msg; status.className = 'bp-status ' + (ok ? 'ok' : 'bad');
      if (handle) handle.el.querySelector('footer .btn.primary').disabled = !ok;
      return ok;
    };
    const grid = h('div', { class: 'bp-grid' });
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const k = x + ',' + y;
      const b = h('button', { class: on.has(k) ? 'on' : '', onclick: () => { if (on.has(k)) on.delete(k); else on.add(k); b.className = on.has(k) ? 'on' : ''; check(); } });
      grid.appendChild(b);
    }
    let done = false;
    handle = openModal({
      title: 'Blueprint', body: h('div', null, grid, status),
      buttons: [{ label: 'Cancel' }, { label: 'Build it', kind: 'primary', onClick: () => { if (!check()) return false; done = true; onDone(cells()); } }],
      onClose: () => { if (!done) onDone(null); },
    });
    check();
  }

  // ---- tooltips: any element with data-tip (and optional data-tip-title / data-tip-foot) --------------------------

  function initTooltips() {
    const app = document.getElementById('app');
    const tip = h('div', { class: 'tip hidden', role: 'tooltip' });
    app.appendChild(tip);
    let timer = null, cur = null;
    const hide = () => { clearTimeout(timer); tip.classList.add('hidden'); };
    const show = (el) => {
      if (!el.isConnected) return;
      // (replaceChildren would print a null, so the missing parts are left out.)
      tip.replaceChildren(...[
        el.dataset.tipTitle ? h('div', { class: 'tip-title' }, el.dataset.tipIcon ? icon(el.dataset.tipIcon) : null, el.dataset.tipTitle) : null,
        h('div', { class: 'tip-body' }, el.dataset.tip),
        el.dataset.tipFoot ? h('div', { class: 'tip-foot' }, el.dataset.tipFoot) : null].filter(Boolean));
      // A name and a key (the title bar's small buttons) fit on one short line.
      tip.classList.toggle('compact', !el.dataset.tipTitle && el.dataset.tip.length < 32);
      tip.classList.remove('hidden');
      const a = app.getBoundingClientRect(), r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
      let x = r.left + r.width / 2 - t.width / 2 - a.left;
      x = Math.max(6, Math.min(a.width - t.width - 6, x));
      let y = r.top - t.height - 8 - a.top;
      if (y < 44) y = r.bottom + 8 - a.top;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    };
    document.addEventListener('mouseover', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
      if (el === cur) return;
      cur = el;
      hide();
      if (el) timer = setTimeout(() => show(el), 260);
    });
    document.addEventListener('mousedown', hide, true);
    document.addEventListener('keydown', hide, true);
  }

  L.UI = { initTooltips, h, ICONS, icon, toast, openModal, modalOpen, closeTopModal, submitTopModal, confirm, canvasFor, renderShop, refreshShopPrices, renderStats, renderAchievements, openSettings, openOrderSlip, openPickOfThree, openBlueprint, copyText, lookWith, drawMiniPiece };
})(typeof globalThis !== 'undefined' ? globalThis : this);
