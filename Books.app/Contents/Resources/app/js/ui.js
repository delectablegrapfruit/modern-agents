/* UI primitives with macOS behaviour: context menus (with submenus + keyboard), popovers, sheets/alerts, toasts. */
(function (global) {
  'use strict';
  const host = () => document.getElementById('overlays');
  const stack = []; // open transient layers, topmost last: { el, close, kind }

  function push(layer) { stack.push(layer); return layer; }
  function remove(layer) { const i = stack.indexOf(layer); if (i >= 0) stack.splice(i, 1); }
  function closeAll(kind) { for (const l of [...stack].reverse()) if (!kind || l.kind === kind) l.close(); }
  function hasOpen(kind) { return stack.some(l => !kind || l.kind === kind); }
  function topmost() { return stack[stack.length - 1] || null; }

  // Outside pointerdown closes menus & popovers (not sheets).
  document.addEventListener('pointerdown', e => {
    for (const l of [...stack].reverse()) {
      if (l.kind === 'sheet') break;
      if (l.el.contains(e.target) || (l.anchor && l.anchor.contains(e.target)) || (l.related && l.related.some(r => r.contains(e.target)))) continue;
      l.close();
    }
  }, true);
  window.addEventListener('blur', () => closeAll('menu'));
  window.addEventListener('resize', () => closeAll('menu'));

  function keepOnScreen(el, x, y, opts = {}) {
    const pad = 8, vw = window.innerWidth, vh = window.innerHeight;
    const r = el.getBoundingClientRect();
    let left = x, top = y;
    if (left + r.width > vw - pad) left = opts.flipX ? Math.max(pad, x - r.width - (opts.flipXOffset || 0)) : Math.max(pad, vw - pad - r.width);
    if (top + r.height > vh - pad) top = Math.max(pad, vh - pad - r.height);
    el.style.left = left + 'px'; el.style.top = top + 'px';
  }

  /* ---------------- Menus ---------------- */
  function buildMenu(items, layer, depth) {
    const el = U.el('div.menu', { role: 'menu', tabindex: -1 });
    let hoverIdx = -1;
    const rows = [];
    for (const item of items) {
      if (!item) continue;
      if (item.separator) { el.appendChild(U.el('div.menu-sep')); continue; }
      if (item.title) { el.appendChild(U.el('div.menu-title', item.title)); continue; }
      const row = U.el('div.menu-item', { role: 'menuitem', class: (item.disabled ? 'disabled ' : '') + (item.danger ? 'danger' : '') });
      if (item.checked) row.appendChild(U.svg(Icons.icon('check', { size: 12, className: 'check', stroke: 2.4 })));
      if (item.swatch) row.appendChild(U.el('span.swatch', { style: { background: item.swatch } }));
      if (item.icon) row.appendChild(U.svg(Icons.icon(item.icon, { size: 16 })));
      row.appendChild(U.el('span.label', { style: item.font ? { fontFamily: item.font } : null }, item.label));
      if (item.shortcut) row.appendChild(U.el('span.shortcut', item.shortcut));
      if (item.submenu) row.appendChild(U.svg(Icons.icon('chevronRight', { size: 12, className: 'submenu-arrow', stroke: 2.2 })));
      row._item = item;
      rows.push(row);
      el.appendChild(row);
    }
    let sub = null, subTimer = null;
    const closeSub = () => { if (sub) { sub.el.remove(); sub = null; } for (const r of rows) r.classList.remove('open'); };
    const openSub = row => {
      closeSub();
      const item = row._item;
      if (!item.submenu || item.disabled) return;
      row.classList.add('open');
      const s = buildMenu(item.submenu, layer, depth + 1);
      host().appendChild(s.el);
      const r = row.getBoundingClientRect();
      keepOnScreen(s.el, r.right - 2, r.top - 5, { flipX: true, flipXOffset: r.width - 4 });
      sub = s;
      layer.related.push(s.el);
    };
    const setHover = (idx, viaKeyboard) => {
      rows.forEach((r, i) => r.classList.toggle('hover', i === idx));
      hoverIdx = idx;
      clearTimeout(subTimer);
      if (idx >= 0 && rows[idx]._item.submenu && !rows[idx]._item.disabled) { subTimer = setTimeout(() => openSub(rows[idx]), viaKeyboard ? 0 : 160); }
      else if (idx >= 0) subTimer = setTimeout(closeSub, 220);
    };
    rows.forEach((row, i) => {
      row.addEventListener('mouseenter', () => setHover(i, false));
      row.addEventListener('mouseleave', () => { if (!row._item.submenu) row.classList.remove('hover'); });
      row.addEventListener('mouseup', e => { e.stopPropagation(); if (!row._item.disabled && !row._item.submenu) layer.select(row._item); });
      row.addEventListener('click', e => { e.stopPropagation(); if (!row._item.disabled && !row._item.submenu) layer.select(row._item); });
    });
    el.addEventListener('mouseleave', () => { if (!sub) setHover(-1); });
    el.addEventListener('keydown', e => {
      const enabled = rows.map((r, i) => (r._item.disabled ? -1 : i)).filter(i => i >= 0);
      if (!enabled.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const pos = enabled.indexOf(hoverIdx);
        const next = e.key === 'ArrowDown' ? enabled[(pos + 1) % enabled.length] : enabled[(pos - 1 + enabled.length) % enabled.length];
        setHover(next, true);
      } else if (e.key === 'ArrowRight' && hoverIdx >= 0 && rows[hoverIdx]._item.submenu) { e.preventDefault(); openSub(rows[hoverIdx]); sub && sub.el.focus(); sub && sub.setHover(sub.firstEnabled(), true); }
      else if (e.key === 'ArrowLeft' && depth > 0) { e.preventDefault(); layer.focusParent(el); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (hoverIdx >= 0 && !rows[hoverIdx]._item.submenu) layer.select(rows[hoverIdx]._item); }
    });
    return { el, setHover, firstEnabled: () => rows.findIndex(r => !r._item.disabled), closeSub };
  }

  /** Show a context menu at (x, y) or anchored to an element. Resolves with the chosen item (or null). */
  function menu(items, opts = {}) {
    closeAll('menu');
    return new Promise(resolve => {
      const layer = { kind: 'menu', related: [], anchor: opts.anchor || null };
      layer.select = item => { layer.close(); if (item.action) item.action(); resolve(item); };
      layer.close = () => { remove(layer); root.el.remove(); for (const r of layer.related) r.remove(); if (layer.anchor) layer.anchor.classList.remove('active', 'open'); resolve(null); };
      layer.focusParent = childEl => { const idx = layer.related.indexOf(childEl); if (idx >= 0) { childEl.remove(); layer.related.splice(idx, 1); } root.el.focus(); };
      const root = buildMenu(items, layer, 0);
      layer.el = root.el;
      host().appendChild(root.el);
      let x = opts.x, y = opts.y;
      if (opts.anchor) {
        const r = opts.anchor.getBoundingClientRect();
        x = opts.align === 'end' ? r.right - root.el.offsetWidth : r.left; y = r.bottom + 4;
        opts.anchor.classList.add('open');
        if (opts.matchWidth) root.el.style.minWidth = r.width + 'px';
      }
      keepOnScreen(root.el, x, y);
      push(layer);
      root.el.focus({ preventScroll: true });
    });
  }

  /* ---------------- Popovers ---------------- */
  function popover(anchor, content, opts = {}) {
    if (anchor && anchor._popover) { anchor._popover.close(); return null; }
    const el = U.el('div.popover', { class: opts.className || '' });
    const arrow = U.el('div.popover-arrow');
    const body = U.el('div.popover-body');
    body.appendChild(content);
    el.appendChild(arrow); el.appendChild(body);
    host().appendChild(el);
    const layer = { kind: 'popover', el, anchor, related: [] };
    layer.close = () => {
      if (!layer.open) return; layer.open = false;
      remove(layer); el.remove();
      if (anchor) { anchor.classList.remove('active'); anchor._popover = null; }
      if (opts.onClose) opts.onClose();
    };
    layer.open = true;
    const position = () => {
      const pad = 8, vw = window.innerWidth, vh = window.innerHeight;
      const r = anchor ? anchor.getBoundingClientRect() : { left: vw / 2, right: vw / 2, top: vh / 2, bottom: vh / 2, width: 0 };
      const w = el.offsetWidth, h = el.offsetHeight;
      let place = opts.placement || 'bottom';
      if (place === 'bottom' && r.bottom + 12 + h > vh - pad && r.top - 12 - h > pad) place = 'top';
      el.classList.remove('place-top', 'place-bottom'); el.classList.add('place-' + place);
      const cx = r.left + r.width / 2;
      let left = opts.align === 'start' ? r.left : opts.align === 'end' ? r.right - w : cx - w / 2;
      left = U.clamp(left, pad, vw - pad - w);
      const top = place === 'bottom' ? r.bottom + 12 : r.top - 12 - h;
      el.style.left = left + 'px'; el.style.top = Math.max(pad, top) + 'px';
      arrow.style.left = U.clamp(cx - left - 7, 14, w - 28) + 'px';
      if (place === 'bottom' && top + h > vh - pad) { el.style.maxHeight = (vh - pad - top) + 'px'; body.style.maxHeight = (vh - pad - top) + 'px'; body.style.overflow = 'auto'; }
    };
    position();
    if (anchor) { anchor.classList.add('active'); anchor._popover = layer; }
    push(layer);
    layer.reposition = position;
    const onResize = () => { if (layer.open) position(); };
    window.addEventListener('resize', onResize);
    const origClose = layer.close; layer.close = () => { window.removeEventListener('resize', onResize); origClose(); };
    return layer;
  }

  /* ---------------- Sheets ---------------- */
  function sheet(opts = {}) {
    return new Promise(resolve => {
      const backdrop = U.el('div.sheet-backdrop');
      const el = U.el('div.sheet', { class: opts.className || '', role: 'dialog', 'aria-modal': 'true', tabindex: -1 });
      if (opts.alert) el.classList.add('alert');
      if (opts.icon !== false && opts.alert) el.appendChild(U.el('div.sheet-icon', U.svg(Icons.icon(opts.icon || 'bookOpen', { size: 38, stroke: 1.6 }))));
      if (opts.title) el.appendChild(U.el('h2', opts.title));
      if (opts.message) el.appendChild(U.el('p.msg', opts.message));
      if (opts.body) el.appendChild(U.el('div.sheet-body', opts.body));
      const buttons = U.el('div.buttons');
      const layer = { kind: 'sheet', el: backdrop, related: [] };
      const finish = value => { remove(layer); backdrop.remove(); resolve(value); };
      layer.close = () => finish(opts.cancelValue !== undefined ? opts.cancelValue : null);
      for (const b of opts.buttons || [{ label: 'OK', primary: true, value: true }]) {
        const btn = U.el('button.btn', { type: 'button', class: (b.primary ? 'primary ' : '') + (b.danger ? 'danger' : ''), onclick: () => { const v = typeof b.value === 'function' ? b.value() : b.value; if (v === UI.KEEP_OPEN) return; finish(v); } }, b.label);
        if (b.primary) btn.dataset.primary = '1';
        buttons.appendChild(btn);
      }
      el.appendChild(buttons);
      backdrop.appendChild(el);
      host().appendChild(backdrop);
      push(layer);
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) { const p = buttons.querySelector('[data-primary]'); if (p) { e.preventDefault(); p.click(); } }
      });
      const focusable = el.querySelector('input, textarea, select, [data-primary]');
      setTimeout(() => (focusable || el).focus(), 20);
      if (opts.onOpen) opts.onOpen(el);
    });
  }
  const KEEP_OPEN = Symbol('keep-open');

  async function prompt(opts = {}) {
    const input = U.el('input.field', { type: 'text', value: opts.value || '', placeholder: opts.placeholder || '', autocomplete: 'off', spellcheck: false });
    const value = await sheet({
      alert: true, icon: opts.icon, title: opts.title, message: opts.message, body: input,
      buttons: [{ label: opts.confirmLabel || 'OK', primary: true, value: () => input.value.trim() || KEEP_OPEN }, { label: 'Cancel', value: null }],
      onOpen: () => { input.focus(); input.select(); },
    });
    return value;
  }
  async function confirm(opts = {}) {
    return !!(await sheet({
      alert: true, icon: opts.icon, title: opts.title, message: opts.message,
      buttons: [{ label: opts.confirmLabel || 'OK', primary: !opts.danger, danger: !!opts.danger, value: true }, { label: opts.cancelLabel || 'Cancel', primary: !!opts.danger, value: false }],
      cancelValue: false,
    }));
  }

  /* ---------------- Toasts ---------------- */
  let toastHost = null;
  function toast(message, opts = {}) {
    if (!toastHost) { toastHost = U.el('div.toast-host'); host().appendChild(toastHost); }
    const t = U.el('div.toast', opts.icon ? U.svg(Icons.icon(opts.icon, { size: 16 })) : null, U.el('span', message));
    toastHost.appendChild(t);
    setTimeout(() => { t.classList.add('leaving'); setTimeout(() => t.remove(), 220); }, opts.duration || 2400);
    return t;
  }

  /* ---------------- Controls ---------------- */
  function switchEl(checked, onchange, opts = {}) {
    const input = U.el('input', { type: 'checkbox', checked: !!checked, 'aria-label': opts.label || '' });
    input.addEventListener('change', () => onchange(input.checked));
    return U.el('label.switch', input, U.el('span.knob'));
  }
  function segmented(options, value, onchange, opts = {}) {
    const el = U.el('div.segmented', { class: opts.className || '', role: 'group' });
    for (const o of options) {
      const b = U.el('button', { type: 'button', class: o.value === value ? 'active' : '', title: o.title || '' });
      if (o.icon) b.appendChild(U.svg(Icons.icon(o.icon, { size: o.iconSize || 16 })));
      if (o.label) b.appendChild(U.el('span', { style: o.style || null }, o.label));
      b.addEventListener('click', () => { [...el.children].forEach(c => c.classList.remove('active')); b.classList.add('active'); onchange(o.value); });
      el.appendChild(b);
    }
    return el;
  }
  function stepper(value, min, max, onchange, opts = {}) {
    const input = U.el('input.field', { type: 'number', min, max, value, step: opts.step || 1 });
    const set = v => { v = U.clamp(Math.round(Number(v) || min), min, max); input.value = v; onchange(v); };
    input.addEventListener('change', () => set(input.value));
    return U.el('div.stepper',
      U.el('button', { type: 'button', 'aria-label': 'Decrease', onclick: () => set(Number(input.value) - (opts.step || 1)) }, U.svg(Icons.icon('minus', { size: 12, stroke: 2.2 }))),
      input,
      U.el('button', { type: 'button', 'aria-label': 'Increase', onclick: () => set(Number(input.value) + (opts.step || 1)) }, U.svg(Icons.icon('plus', { size: 12, stroke: 2.2 }))));
  }

  // Escape closes the topmost layer.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !stack.length) return;
    const top = topmost();
    e.preventDefault(); e.stopPropagation();
    top.close();
  }, true);

  global.UI = { menu, popover, sheet, prompt, confirm, toast, switchEl, segmented, stepper, closeAll, hasOpen, topmost, KEEP_OPEN, keepOnScreen };
})(window);
