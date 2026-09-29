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

  /**
   * A small note above the bars that goes away by itself. With opts.onClick it is a button (the achievement ones: it
   * opens the thing it tells of): the whole pill takes a click or Enter, then goes; it stays while pointed at (for a
   * while) or focused (see syncToasts for when it lets the pointer through; the keyboard can always reach it).
   * opts.area (an achievement's place to play) gives it that place's colour.
   */
  function toast(msg, kind, ms, ico, opts) {
    const box = document.getElementById('toasts');
    // Above a board tab's bars (status, items, controls, puzzle actions), never over them. On a phone held upright the
    // well fills the middle of the screen, where the thumb works: there toasts come in at the top, under the title bar.
    const bar = document.querySelector('.view.active > .statusbar, .view.active > .puz-actions'), holder = box.offsetParent;
    const top = !!(root.matchMedia && root.matchMedia('(hover: none) and (pointer: coarse) and (orientation: portrait)').matches);
    const main = document.getElementById('main');
    box.classList.toggle('top', top);
    box.style.top = top && main && holder ? Math.round(main.getBoundingClientRect().top - holder.getBoundingClientRect().top + 8) + 'px' : '';
    box.style.bottom = !top && bar && holder ? Math.max(14, Math.round(holder.getBoundingClientRect().bottom - bar.getBoundingClientRect().top + 8)) + 'px' : '';
    const go = opts && opts.onClick;
    const el = h('div', { class: 'toast ' + (kind || '') + (go ? ' link' : ''), 'data-area': (opts && opts.area) || null }, ico ? icon(ico) : null, h('span', { class: 'toast-t' }, msg), go ? icon('chevRight', 'toast-go') : null);
    let timer = 0;
    const gone = () => { if (el.classList.contains('out')) return; clearTimeout(timer); el.classList.add('out'); setTimeout(() => el.remove(), 300); };
    const later = (t) => { clearTimeout(timer); timer = setTimeout(gone, t); };
    if (go) {
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', opts.label || el.textContent);
      const fire = () => { if (el.classList.contains('out') || modalOpen()) return; el.remove(); clearTimeout(timer); go(); };
      el.addEventListener('click', (e) => { e.stopPropagation(); fire(); });
      // Enter or Space on the focused toast opens it, and never reaches the game (Space would drop a piece).
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) fire(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); gone(); }
      });
      // Focused, it waits; pointed at, it waits up to twice its time (a pointer left resting where it appeared does not
      // keep it for good); let go, it leaves a little later.
      const cap = Date.now() + 2 * (ms || 2600), left = () => Math.max(0, cap - Date.now());
      const hold = () => { if (document.activeElement === el) clearTimeout(timer); else later(left()); };
      const release = () => { if (document.activeElement !== el) later(el.matches(':hover') ? left() : Math.min(1600, left()) || 1600); };
      el.addEventListener('mouseenter', hold);
      el.addEventListener('focus', hold);
      el.addEventListener('mouseleave', release);
      el.addEventListener('blur', release);
    }
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    syncToasts();
    later(ms || 2600);
    return el;
  }
  /**
   * A dialog open, the toasts let the pointer through (and never jump behind it). Over a live board with mouse control
   * a click sets a piece, so there a toast takes the pointer only once it has rested on it a moment (ARM_MS) without
   * playing; a click made on the way is the board's. A finger has no hover to rest with: a touch player's toast is
   * tapped straight away, except while a board is being touched and for a moment after (L.Touch.boardBusy), so a
   * toast that turns up under a swipe never takes it.
   */
  const ARM_MS = 350;
  let ptr = null, armTimer = 0;
  function liveBoard() {
    const app = L.app, m = app && app.modes && app.modes[app.tab];
    return !!(m && m.canvas && m.game && app.settings.mouse && !m.blocked());
  }
  function syncToasts(e) {
    if (e && e.clientX != null) ptr = [e.clientX, e.clientY];
    const box = root.document && document.getElementById('toasts'), links = box ? box.querySelectorAll('.toast.link') : [];
    if (!links.length) return;
    const modal = modalOpen(), touch = !!(L.Touch && L.Touch.using);
    const board = !modal && !touch && liveBoard();
    box.classList.toggle('through', modal || board || (touch && L.Touch.boardBusy()));
    const now = performance.now();
    for (const t of links) {
      const r = t.getBoundingClientRect(), on = board && ptr && ptr[0] >= r.left && ptr[0] <= r.right && ptr[1] >= r.top && ptr[1] <= r.bottom;
      if (!on || (e && (e.type === 'mousedown' || e.type === 'pointerdown') && !t.classList.contains('armed'))) { t.armAt = on ? now : 0; t.classList.remove('armed'); continue; }
      if (t.classList.contains('armed')) continue;
      if (!t.armAt) t.armAt = now;
      if (now - t.armAt >= ARM_MS) t.classList.add('armed');
      else { clearTimeout(armTimer); armTimer = setTimeout(syncToasts, ARM_MS - (now - t.armAt) + 5); }
    }
  }
  if (root.document) {
    const mouseOnly = (e) => { if ((e.pointerType || 'mouse') === 'mouse' && !(L.Touch && L.Touch.recent())) syncToasts(e); else syncToasts(); };
    document.addEventListener('pointermove', mouseOnly, { capture: true, passive: true });
    document.addEventListener('pointerdown', mouseOnly, { capture: true, passive: true });
  }

  const modals = [];
  // Only the top window takes focus, clicks and Tab: everything under it (the app, lower windows) is inert.
  function settleInert() {
    for (const id of ['titlebar', 'main']) { const el = document.getElementById(id); if (el) el.inert = modals.length > 0; }
    // Toasts stay in sight over a window but out of its Tab order (and let its clicks through: syncToasts).
    const tb = document.getElementById('toasts'); if (tb) tb.inert = modals.length > 0;
    modals.forEach((m, i) => { m.scrim.inert = i < modals.length - 1; });
  }
  /** Focus into a window: its first field; else its first footer button that is not a danger one; else the window. */
  function focusInto(modal) {
    if (modal.contains(document.activeElement)) return;
    const f = modal.querySelector('input, textarea') || [...modal.querySelectorAll('footer .btn:not(:disabled)')].find((b) => !b.classList.contains('danger')) || modal;
    f.focus({ preventScroll: true });
  }
  function openModal(opts) {
    const rootEl = document.getElementById('modal-root');
    const before = document.activeElement;
    const close = () => {
      const i = modals.indexOf(handle);
      if (i < 0) return;
      modals.splice(i, 1);
      scrim.remove();
      settleInert();
      // Back to the window underneath, where focus was when this one opened (or into it, if that is gone).
      const top = modals[modals.length - 1];
      if (top && !top.el.contains(document.activeElement)) {
        if (before && before.isConnected && top.el.contains(before)) before.focus({ preventScroll: true }); else focusInto(top.el);
      }
      if (L.app) L.app.postDragRegions();
      syncToasts();
      if (opts.onClose) opts.onClose();
    };
    const footer = opts.buttons && opts.buttons.length ? h('footer', null, opts.buttons.map((b) => h('button', {
      class: 'btn ' + (b.kind || ''), disabled: b.disabled,
      onclick: () => { if (b.onClick && b.onClick() === false) return; close(); },
    }, b.label))) : null;
    const modal = h('div', { class: 'modal' + (opts.cls ? ' ' + opts.cls : ''), role: 'dialog', 'aria-modal': 'true', tabindex: '-1', 'aria-label': typeof opts.title === 'string' ? opts.title : null, style: opts.width ? { width: 'min(' + opts.width + 'px, calc(100% - 24px))' } : null },
      h('header', null, opts.icon ? icon(opts.icon) : null, h('span', { class: 'ttl' }, opts.title || ''), h('button', { class: 'icon-btn x', html: ICONS.close, 'aria-label': 'Close', onclick: close })),
      h('div', { class: 'body' }, opts.body),
      footer);
    const scrim = h('div', { class: 'scrim', onpointerdown: (e) => { if (e.target === scrim) close(); } }, modal);
    rootEl.appendChild(scrim);
    const handle = { close, el: modal, scrim, opts };
    modals.push(handle);
    settleInert();
    if (L.app) L.app.postDragRegions(); // a tall dialog covers the title bar: it must take its clicks
    // Focus goes into the new window at once (a key meant for it never lands on what is underneath); a field again a
    // moment later, once the window has settled, unless the caller has put focus somewhere in it already.
    focusInto(modal);
    syncToasts();
    const first = modal.querySelector('input, textarea');
    if (first) setTimeout(() => { if (modals[modals.length - 1] === handle && (document.activeElement === modal || !modal.contains(document.activeElement))) first.focus(); }, 30);
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
  if (root.document) document.addEventListener('pointerdown', (e) => { if (shopUI.armed && !shopUI.armed.contains(e.target)) disarmShop(); }, true);

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
   * header keeps the count), and a filter shows all of them, the ones still to do, or the earned ones. Every group, row,
   * Recent entry and toast carries its place to play as data-area: the CSS gives it that place's colour, and the
   * header, Recent and the toast that place's tab icon.
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
      h('div', { class: 'ach-tools' }, recentControl(app), seg),
    ];
    const row = (a) => {
      const when = got[a.id], pr = !when && a.progress ? a.progress(st) : null;
      return h('div', { class: 'ach' + (when ? ' got' : '') + (a.tier === 'legend' ? ' legend' : ''), 'data-id': a.id, 'data-area': a.group },
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
      els.push(h('details', { class: 'ach-group', 'data-group': g.id, 'data-area': g.id, open: !!open[g.id], ontoggle: (e) => { open[g.id] = e.currentTarget.open; } },
        h('summary', null,
          h('span', { class: 'chev', html: ICONS.chevRight }),
          h('span', { class: 'ach-area', html: L.Icons.icon(g.icon), 'aria-hidden': 'true' }),
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
    // Drawn again under the Recent list (one earned meanwhile): focus stays where it was in it.
    const was = document.activeElement, inRecent = was && was.closest && was.closest('.ach-recent');
    const sel = !inRecent ? null : was.dataset.id ? '.ach-menu [data-id="' + was.dataset.id + '"]' : was.classList.contains('ach-recent-more') ? '.ach-recent-more' : '.ach-recent-go';
    const body = document.getElementById('ach-body');
    body.replaceChildren(...els);
    if (sel) { const t = body.querySelector('.ach-recent ' + sel) || body.querySelector('.ach-menu [role="menuitem"]') || body.querySelector('.ach-recent-more'); if (t) t.focus({ preventScroll: true }); }
  }

  /**
   * Recent, left of the filter: the latest earned (its icon and name; a click goes to it) and a chevron that lists the
   * last few, newest first, with how long ago. Nothing earned yet: nothing shown.
   */
  const RECENT_N = 6;
  function recentControl(app) {
    const list = L.Achievements.recent(app.state, RECENT_N);
    if (!list.length) { app.achMenu = false; return null; }
    // Each one by its place's icon, in its colour; a legendary one also has the small gold diamond after its name.
    const latest = list[0].a, place = (a) => icon(L.Achievements.groupOf(a).icon, 'area-i');
    const gem = (a) => (a.tier === 'legend' ? icon('legend', 'leg-i') : null);
    const open = !!app.achMenu;
    const toggle = (on) => {
      app.achMenu = on;
      const next = recentControl(app);
      ctl.replaceWith(next);
      if (on) { const first = next.querySelector('.ach-menu [role="menuitem"]'); if (first) first.focus(); }
      else next.querySelector('.ach-recent-more').focus({ preventScroll: true });
    };
    const menu = open ? h('div', { class: 'ach-menu', role: 'menu', 'aria-label': 'Recent' },
      list.map(({ a, when }) => h('button', { role: 'menuitem', class: a.tier === 'legend' ? 'legend' : null, 'data-id': a.id, 'data-area': a.group, onclick: () => showAchievement(app, a.id) },
        place(a), h('span', { class: 'nm' }, a.name), gem(a), h('span', { class: 'ago' }, L.fmtAgo(when))))) : null;
    const ctl = h('div', { class: 'ach-recent' + (latest.tier === 'legend' ? ' legend' : '') + (open ? ' open' : '') },
      h('button', { class: 'ach-recent-go', 'data-area': latest.group, 'aria-label': 'Latest: ' + latest.name, 'data-tip': open ? null : 'Latest', onclick: () => showAchievement(app, latest.id) },
        place(latest), h('span', { class: 'nm' }, latest.name), gem(latest), h('span', { class: 'short' }, 'Latest')),
      h('button', { class: 'ach-recent-more', 'aria-label': 'Recent', 'aria-haspopup': 'menu', 'aria-expanded': String(open), 'data-tip': open ? null : 'Recent', html: ICONS.chevDown,
        onclick: () => toggle(!app.achMenu) }),
      menu);
    // The menu's keys: arrows move, Esc or Tab closes; none of them reach the game or the window.
    if (menu) menu.addEventListener('keydown', (e) => {
      const items = Array.from(menu.querySelectorAll('[role="menuitem"]')), i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
      else if (e.key === 'Home' || e.key === 'End') items[e.key === 'Home' ? 0 : items.length - 1].focus();
      else if (e.key === 'Escape' || e.key === 'Tab') toggle(false);
      else return;
      e.preventDefault(); e.stopPropagation();
    });
    return ctl;
  }
  // A click anywhere else, or Esc wherever focus is, closes the Recent menu.
  function closeRecent(app) {
    if (!app || !app.achMenu) return false;
    app.achMenu = false;
    const ctl = document.querySelector('.ach-recent');
    if (!ctl) return true;
    const had = ctl.contains(document.activeElement), next = recentControl(app) || h('span');
    ctl.replaceWith(next);
    const more = had && next.querySelector && next.querySelector('.ach-recent-more');
    if (more) more.focus({ preventScroll: true });
    return true;
  }
  if (root.document) {
    document.addEventListener('pointerdown', (e) => { if (L.app && L.app.achMenu && !(e.target.closest && e.target.closest('.ach-recent'))) closeRecent(L.app); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && L.app && L.app.achMenu && !modalOpen() && closeRecent(L.app)) { e.preventDefault(); e.stopPropagation(); } }, true);
  }

  /**
   * Goes to an achievement: the Achievements tab, a filter that shows it, its group open, the row scrolled into the
   * middle of the list (the list scrolls, never the window) and lit for a moment. With no id, the tab opens at Recent.
   * The one way in for a toast, the Recent button and its menu.
   */
  function showAchievement(app, id) {
    const A = L.Achievements, a = id ? A.LIST.find((x) => x.id === id) : null;
    const got = app.state.achievements || {};
    app.achMenu = !a && A.recent(app.state, 1).length > 0;
    if (a) {
      const f = app.achFilter || 'all';
      if (!(f === 'all' || (f === 'got') === !!got[a.id])) app.achFilter = 'all';
      (app.achOpen || (app.achOpen = {}))[a.group] = true;
    }
    if (app.tab !== 'achievements') app.setTab('achievements');
    else renderAchievements(app);
    const body = document.getElementById('ach-body'), still = app.reducedMotion();
    if (!a) {
      body.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
      const first = body.querySelector('.ach-menu [role="menuitem"]');
      if (first) first.focus({ preventScroll: true });
      return null;
    }
    const row = body.querySelector('.ach[data-id="' + a.id + '"]');
    if (!row) return null;
    const b = body.getBoundingClientRect(), r = row.getBoundingClientRect();
    const top = Math.max(0, Math.min(body.scrollHeight - body.clientHeight, body.scrollTop + r.top - b.top - Math.max(12, (b.height - r.height) / 2)));
    body.scrollTo({ top, behavior: still ? 'auto' : 'smooth' });
    for (const o of body.querySelectorAll('.ach.flash')) o.classList.remove('flash', 'still');
    row.classList.add('flash');
    if (still) row.classList.add('still');
    row.setAttribute('tabindex', '-1');
    row.focus({ preventScroll: true });
    clearTimeout(showAchievement.timer);
    showAchievement.timer = setTimeout(() => row.classList.remove('flash', 'still'), 2800);
    return row;
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
        kpi(fmtInt(fs.lines), 'Lines collected'), kpi(fmtInt(fs.minos), 'Minos made'), kpi(fmtInt(fs.pieces), 'Pieces'),
        kpi(fmtInt(fs.collects), 'Collects'), kpi(fmtInt(fs.best), 'Best collect'), kpi(fmtInt(fs.days), 'Days collected')));
      els.push(h('h4', null, 'Minos by press'), hbars(Factory.MOLDS.map((n, k) => [Factory.NAMES[n], (fs.byPress[k] || 0) * n]))); // byPress counts pieces
      // Every shape of each size: the ones pressed first, in colour; the rest a quiet fill.
      for (const n of [5, 6, 7]) {
        const list = Factory.shapes(n), seen = fs.seen[n] || '';
        const order = list.map((c, s) => s).sort((a, b) => (seen[b] === '1') - (seen[a] === '1') || a - b);
        els.push(h('h4', null, Factory.NAMES[n] + 'es · ' + Factory.seenCount(f, n) + ' / ' + list.length),
          h('div', { class: 'catalog sm' }, order.map((s) => h('div', { class: 'fac-shape', title: Factory.shapeName(n, s) }, L.FactoryArt.shapeCanvas(look, list[s], 26, look.colors[1 + (s % 7)], seen[s] === '1', 0.18)))));
      }
      const rows = [
        ['Minos made away', fmtInt(fs.away)], ['Time full', fmtDuration(fs.fullMs)],
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
    /** A segmented control: one choice of a few, the chosen one raised. */
    const seg = (k, options, onChange) => {
      const wrap = h('div', { class: 'seg set-seg', role: 'group' });
      options.forEach(([v, label]) => {
        const b = h('button', { 'data-v': String(v), 'aria-pressed': String(s[k] === v), onclick: () => { set(k, v); wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); if (onChange) onChange(); } }, label);
        wrap.appendChild(b);
      });
      return wrap;
    };
    // What the device can do, read afresh each time a section is drawn (a trackpad or a keyboard can come and go while
    // Settings is open): a touch screen gets the Touch card; touch alone (no mouse or trackpad) loses the pointer's
    // settings and the window background; touch with no key pressed yet loses the keyboard's too, and Keys becomes
    // Gestures. The macOS app is never touch alone.
    let touchy, only, keyless;
    const readDevice = () => {
      const T = L.Touch;
      only = !!(T && T.only); keyless = !!(T && T.keyless);
      touchy = !!(T && T.available()) || only;
    };
    readDevice();
    const bgPreview = (mode) => h('span', { class: 'tile-prev bgp bgp-' + mode }, h('i'));
    const themePreview = (t) => h('span', { class: 'tile-prev thp thp-' + t }, h('i'), h('i'), h('i'));
    // Counter-clockwise puzzles need the other turn or a half turn: named the way this player turns.
    const ccwHint = () => (!keyless ? 'New puzzles use Z and A' : s.tapTurn === 'cw' ? 'New puzzles use two-finger taps' : 'New puzzles use tap left and two fingers');
    const gestureList = () => h('div', { class: 'keys gestures' }, L.Touch.help(s).map(([k, d]) => [h('span', { class: 'k' }, h('span', { class: 'gest' }, k)), h('span', null, d)]));

    const sections = {
      look: {
        icon: 'look', label: 'Look',
        body: () => {
          // Tint strength only means something on the Tint background: elsewhere it is there, but off.
          const tint = row('Tint strength', null, range('tint', 20, 98, 1, '%', 100));
          const tintOn = () => { const on = s.bg === 'tint'; tint.classList.toggle('off', !on); tint.querySelector('input').disabled = !on; };
          tintOn();
          return [
          // The window over the desktop (the app, a browser's desk): by touch alone the page is the whole screen, solid.
          only ? null : card('Window background',
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
        body: () => {
          // Lower repeat also paces Classic's finger resting down the board: with no keyboard it goes with the gestures.
          const lower = row('Lower repeat', null, range('lowerRepeat', 0, 150, 5, ' ms'));
          const puzzles = row('Counter-clockwise puzzles', ccwHint(), toggle('ccwPuzzles', () => { const pm = app.modes.puzzle; if (pm && pm.puzzle && !pm.done) pm.loadNumbered(pm.ps.diff); else if (pm && pm.puzzle) pm.renderNav(); }));
          const hint = puzzles.querySelector('.hint');
          return [
          keyless ? null : card('Keyboard',
            row('Repeat delay', null, range('das', 60, 400, 5, ' ms')),
            row('Repeat rate', null, range('arr', 0, 150, 5, ' ms')),
            lower),
          touchy ? card('Touch',
            row('Touch controls', null, toggle('touch')),
            row('Drag sensitivity', null, range('touchSens', 1, 10, 1, '')),
            row('Hard drop swipe', null, seg('touchFlick', [[0, 'Light'], [1, 'Medium'], [2, 'Firm']])),
            row('Tap to turn', null, seg('tapTurn', [['sides', 'Sides'], ['cw', 'Clockwise']], () => { if (hint) hint.textContent = ccwHint(); })),
            keyless ? lower : null,
            root.navigator && 'vibrate' in root.navigator ? row('Haptics', null, toggle('haptics')) : null) : null,
          only ? null : card('Mouse',
            row('Mouse control', null, toggle('mouse'))),
          card('Board', row('Next pieces shown', null, range('preview', 1, 6, 1, '')),
            row('Control hints', null, toggle('hints'))),
          only ? null : card('Classic',
            row('Pause when the pointer leaves', null, toggle('pauseAway'))),
          card('Puzzles', puzzles),
          ];
        },
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
      // The keys, or by touch alone the gestures: the same place in the list, named for what is there.
      keys: {
        get icon() { return keyless ? 'gestures' : 'keys'; },
        get label() { return keyless ? 'Gestures' : 'Keys'; },
        body: () => {
          if (keyless) return [card(null, gestureList())];
          // No mouse or trackpad: none of its lines. Nothing to roll up: no ⌘J.
          const keys = L.KEY_HELP.filter(([k]) => !(only && (/^(Mouse|Left click|Right click|Wheel|Click HOLD)/.test(k) || k === '⌘J')));
          return [
            touchy ? card('Touch', gestureList()) : null,
            card(touchy ? 'Keyboard' : null, h('div', { class: 'keys' }, keys.map(([k, d]) => [h('span', { class: 'k' }, h('kbd', null, k)), h('span', null, d)])))];
        },
      },
      data: {
        icon: 'data', label: 'Data',
        body: () => [
          card('Save', row('Progress', null,
            h('div', { class: 'btns' }, h('button', { class: 'btn sm', onclick: () => openExport(app) }, 'Export'), h('button', { class: 'btn sm', onclick: () => openImport(app) }, 'Import')))),
          card('Reset', row('Reset everything', null,
            h('button', { class: 'btn sm danger', onclick: () => confirm('Reset everything?', 'Deletes all progress. Settings are kept.', 'Reset', () => { app.store.reset(); app.store.restart(); }, 'danger') }, 'Reset…'))),
          h('p', { class: 'set-about' }, 'Lull ' + (L.VERSION || '') + ' · puzzle generator v' + Puzzles.GEN_VERSION),
        ],
      },
    };
    let cur = section && sections[section] ? section : 'look';
    const pane = h('div', { class: 'set-pane scroll' });
    const nav = h('nav', { class: 'set-nav' });
    // A section is listed only with something in it.
    const bodyOf = (id) => sections[id].body().filter(Boolean);
    const show = (id, keepScroll) => {
      cur = id;
      nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === id)));
      const top = pane.scrollTop;
      pane.replaceChildren(...bodyOf(id));
      pane.scrollTop = keepScroll ? top : 0;
    };
    const build = () => {
      const ids = Object.keys(sections).filter((k) => sections[k] && bodyOf(k).length);
      if (!ids.includes(cur)) cur = ids[0];
      nav.replaceChildren(...ids.map((id) => h('button', { 'data-id': id, onclick: () => show(id) }, h('span', { class: 'ni', html: L.Icons.icon(sections[id].icon) }), h('span', null, sections[id].label))));
    };
    build();
    const body = h('div', { class: 'settings' }, nav, pane);
    // A trackpad or a keyboard attached or taken away while Settings is open: the list and the section follow, and focus
    // stays on the same control (or its twin in the redrawn section).
    let handle = null;
    const redraw = () => {
      if (!handle || !handle.el.isConnected) return;
      const a = document.activeElement;
      let find = null;
      if (a && nav.contains(a) && a.dataset.id) find = () => nav.querySelector('button[data-id="' + a.dataset.id + '"]');
      else if (a && pane.contains(a)) {
        const all = () => [...pane.querySelectorAll('button, input, select, textarea, [tabindex]')];
        const i = all().indexOf(a), k = a.dataset.setting;
        find = () => (k && pane.querySelector('[data-setting="' + k + '"]')) || all()[i];
      }
      readDevice(); build(); show(cur, true);
      if (a && !a.isConnected && find) { const b = find(); (b || handle.el).focus({ preventScroll: true }); }
    };
    // Pressed by a first key (a keyboard just attached): that key finishes first (Tab moves on, Space and Enter press
    // what has focus, on its way up), then the redraw.
    const off = L.bus.on('input', (e) => {
      if (!e || !e.byKey) { redraw(); return; }
      let done = false;
      const go = () => { if (done) return; done = true; document.removeEventListener('keyup', up, true); clearTimeout(t); setTimeout(redraw, 0); };
      const up = () => go();
      document.addEventListener('keyup', up, true);
      const t = setTimeout(go, 800);
    });
    handle = openModal({ title: 'Settings', body, width: 620, onClose: off });
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
        try { app.store.importJSON(ta.value); app.store.restart(); } catch (e) { toast('Not a Lull save', 'bad'); return false; }
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
    // The foot names a key; to a touch player, the gesture instead (data-tip-touch), or nothing.
    // With no keyboard at all (touch alone, no key pressed yet), never a key.
    const foot = (el) => (L.Touch && (L.Touch.using || L.Touch.keyless) ? el.dataset.tipTouch : el.dataset.tipFoot);
    const hide = () => { clearTimeout(timer); tip.classList.add('hidden'); };
    const show = (el) => {
      if (!el.isConnected) return;
      // (replaceChildren would print a null, so the missing parts are left out.)
      tip.replaceChildren(...[
        el.dataset.tipTitle ? h('div', { class: 'tip-title' }, el.dataset.tipIcon ? icon(el.dataset.tipIcon) : null, el.dataset.tipTitle) : null,
        h('div', { class: 'tip-body' }, el.dataset.tip),
        foot(el) ? h('div', { class: 'tip-foot' }, foot(el)) : null].filter(Boolean));
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
    // A mouse's hover only: a tap's emulated mouseover (iOS: "the first tap is a hover") never shows one.
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse' || (L.Touch && L.Touch.recent())) return;
      const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
      if (el === cur) return;
      cur = el;
      hide();
      if (el) timer = setTimeout(() => show(el), 260);
    });
    // A finger: a long press on anything with a tip shows it, until the next touch or three seconds (never on a board,
    // where a finger at rest is play). The tap that ends a long press does not press the button too.
    let press = null, swallow = 0;
    const endPress = () => { if (press) clearTimeout(press.timer); press = null; };
    document.addEventListener('pointerdown', (e) => {
      hide(); cur = null;
      endPress();
      if (e.pointerType === 'mouse') return;
      const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!el || e.target.closest('canvas') || !el.dataset.tip) return;
      press = { el, id: e.pointerId, x: e.clientX, y: e.clientY, timer: setTimeout(() => {
        if (!press || !el.isConnected) return;
        show(el); cur = el; press.shown = true;
        clearTimeout(timer); timer = setTimeout(hide, 3000);
      }, L.Touch ? L.Touch.T.LONG_PRESS : 500) };
    }, true);
    document.addEventListener('pointermove', (e) => { if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) >= 10) endPress(); }, true);
    document.addEventListener('pointerup', (e) => { if (press && press.shown) swallow = performance.now(); endPress(); }, true);
    document.addEventListener('pointercancel', endPress, true);
    document.addEventListener('click', (e) => { if (swallow && performance.now() - swallow < 400) { swallow = 0; e.preventDefault(); e.stopPropagation(); } }, true);
    document.addEventListener('keydown', hide, true);
  }

  L.UI = { initTooltips, h, ICONS, icon, toast, syncToasts, openModal, modalOpen, closeTopModal, submitTopModal, confirm, canvasFor, renderShop, refreshShopPrices, renderStats, renderAchievements, showAchievement, openSettings, openOrderSlip, openPickOfThree, openBlueprint, copyText, lookWith, drawMiniPiece };
})(typeof globalThis !== 'undefined' ? globalThis : this);
