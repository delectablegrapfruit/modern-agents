// DOM overlay UI in the 550x400 stage space: the original's translucent blue panels, square icon
// buttons with bold labels, text buttons, modal messages, number inputs and stat pop-ups.
// Everything lives inside #ui, which is scaled together with the canvas.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var esc = SRPG.util.escape;

  var root = null;
  var modalStack = []; // { el, onKey }

  function uiRoot() {
    if (!root) root = document.getElementById('ui');
    return root;
  }

  function place(e, x, y, w, h) {
    if (x != null) e.style.left = x + 'px';
    if (y != null) e.style.top = y + 'px';
    if (w != null) e.style.width = w + 'px';
    if (h != null) e.style.height = h + 'px';
    return e;
  }

  var ui = (SRPG.ui = {
    // Remove every element the current scene put up (modals included).
    clear: function () {
      var r = uiRoot();
      while (r.firstChild) r.removeChild(r.firstChild);
      modalStack.length = 0;
    },

    el: function (tag, cls, parent, html) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html != null) e.innerHTML = html;
      (parent || uiRoot()).appendChild(e);
      return e;
    },

    // Plain absolutely positioned container.
    box: function (x, y, w, h, cls, parent) {
      return place(ui.el('div', 'box ' + (cls || ''), parent), x, y, w, h);
    },

    // The original's translucent blue rounded panel.
    panel: function (x, y, w, h, parent, cls) {
      return place(ui.el('div', 'fpanel ' + (cls || ''), parent), x, y, w, h);
    },

    // Centered bold black text inside a panel (the shopkeeper's "quote").
    quote: function (parent, html, x, y, w, cls) {
      var q = ui.el('div', 'quote ' + (cls || ''), parent, html);
      return place(q, x, y, w);
    },

    // Free text (HTML allowed, caller escapes user data).
    text: function (parent, html, x, y, w, cls) {
      return place(ui.el('div', 'ftext ' + (cls || ''), parent, html), x, y, w);
    },

    // Square icon tile + bold label, the building-menu button. opts: { icon, label (HTML),
    // x, y, w, disabled, title, size (icon px, default 34) }. Positions are relative to parent.
    iconButton: function (parent, opts, onClick) {
      var size = opts.size || 34;
      var b = ui.el('div', 'ibtn' + (opts.disabled ? ' disabled' : '') + (opts.cls ? ' ' + opts.cls : ''), parent);
      place(b, opts.x, opts.y, opts.w || 170);
      var tile = ui.el('div', 'ico', b);
      tile.style.width = size + 'px';
      tile.style.height = size + 'px';
      if (opts.icon && SRPG.icons) {
        var c = document.createElement('canvas');
        var dpr = 3;
        c.width = size * dpr;
        c.height = size * dpr;
        c.style.width = size + 'px';
        c.style.height = size + 'px';
        var cx = c.getContext('2d');
        cx.scale(dpr, dpr);
        try { SRPG.icons.draw(cx, opts.icon, size); } catch (e) { /* missing icon: blank tile */ }
        tile.appendChild(c);
      }
      var lbl = ui.el('div', 'lbl', b, opts.label || '');
      lbl.style.minHeight = size + 'px';
      if (opts.title) b.title = opts.title;
      if (opts.id) b.setAttribute('data-id', opts.id);
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (b.classList.contains('disabled')) return;
        onClick && onClick(e);
      });
      return b;
    },

    // Rounded text button ("OK", "DONE", "LEAVE" without icon...). opts: { x, y, w, cls }.
    button: function (parent, label, onClick, opts) {
      opts = opts || {};
      var b = ui.el('div', 'tbtn ' + (opts.cls || ''), parent, esc(label));
      place(b, opts.x, opts.y, opts.w);
      if (opts.id) b.setAttribute('data-id', opts.id);
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (b.classList.contains('disabled')) return;
        onClick && onClick(e);
      });
      return b;
    },

    // Single-line input (numbers or text) styled like the original's white edit boxes.
    input: function (parent, x, y, w, opts) {
      opts = opts || {};
      var i = ui.el('input', 'finput ' + (opts.cls || ''), parent);
      i.type = opts.type || 'text';
      if (opts.maxLength) i.maxLength = opts.maxLength;
      if (opts.value != null) i.value = opts.value;
      place(i, x, y, w);
      i.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter' && opts.onEnter) opts.onEnter(i.value);
      });
      i.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      return i;
    },

    // Modal message in a blue panel with an OK button. cb runs after it is closed.
    // opts: { title, html, ok, w, h, cls }
    message: function (text, cb, opts) {
      opts = opts || {};
      var overlay = ui.el('div', 'modal-overlay');
      var w = opts.w || 330;
      var box = ui.panel((SRPG.W - w) / 2, opts.y || 110, w, null, overlay, 'modal ' + (opts.cls || ''));
      if (opts.title) ui.el('div', 'modal-title', box, esc(opts.title));
      ui.el('div', 'modal-text', box, opts.html ? text : esc(text).replace(/\n/g, '<br>'));
      var row = ui.el('div', 'modal-buttons', box);
      var done = false;
      function close() {
        if (done) return;
        done = true;
        pop(overlay);
        cb && cb();
      }
      ui.button(row, opts.ok || 'OK', close, { cls: 'inline' });
      push(overlay, function (k) {
        if (k === 'Enter' || k === ' ' || k === 'Escape') close();
        return true;
      });
      return overlay;
    },

    confirm: function (text, yes, no, opts) {
      opts = opts || {};
      var overlay = ui.el('div', 'modal-overlay');
      var w = opts.w || 330;
      var box = ui.panel((SRPG.W - w) / 2, opts.y || 120, w, null, overlay, 'modal');
      ui.el('div', 'modal-text', box, opts.html ? text : esc(text).replace(/\n/g, '<br>'));
      var row = ui.el('div', 'modal-buttons', box);
      var done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        pop(overlay);
        if (ok) yes && yes();
        else no && no();
      }
      ui.button(row, opts.yes || 'YES', function () { finish(true); }, { cls: 'inline' });
      ui.button(row, opts.no || 'NO', function () { finish(false); }, { cls: 'inline' });
      push(overlay, function (k) {
        if (k === 'Enter' || k === 'y') finish(true);
        else if (k === 'Escape' || k === 'n') finish(false);
        return true;
      });
      return overlay;
    },

    // Big pop-up text like "CHARM INCREASED!!!" that rises and fades (about 1.2 s).
    popText: function (text, opts) {
      opts = opts || {};
      var t = ui.el('div', 'poptext ' + (opts.cls || ''));
      t.textContent = text;
      if (opts.color) t.style.color = opts.color;
      place(t, 0, opts.y != null ? opts.y : 170, SRPG.W);
      setTimeout(function () { t.classList.add('fade'); }, 700);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 1500);
      return t;
    },

    get modalOpen() { return modalStack.length > 0; },

    // Engine forwards keydowns here first; returns true when a modal consumed it.
    onKey: function (k, e) {
      var top = modalStack[modalStack.length - 1];
      if (!top) return false;
      return top.onKey(k, e) !== false;
    },

    // Programmatic modal registration for scenes that build their own overlays.
    pushModal: function (el, onKey) { push(el, onKey || function () { return true; }); },
    popModal: function (el) { pop(el); },
  });

  function push(el, onKey) { modalStack.push({ el: el, onKey: onKey }); }
  function pop(el) {
    for (var i = modalStack.length - 1; i >= 0; i--) {
      if (modalStack[i].el === el) { modalStack.splice(i, 1); break; }
    }
    if (el.parentNode) el.parentNode.removeChild(el);
  }

  // --- Flash's built-in keyboard focus ---------------------------------------------------------
  // The original never turns it off, so Tab walks a yellow focus box over the buttons on screen
  // (in stage order: top to bottom, then left to right) and Enter presses the focused one; held
  // down, the key repeat presses it again and again (the famous "Tab to DEPOSIT / the 500 chip and
  // hold Enter" tricks). Every clickable element in #ui carries a data-id, so those are the
  // buttons; disabled, hidden and inert ones are skipped.
  var lastFocusId = null;
  function focusables() {
    var list = Array.prototype.slice.call(uiRoot().querySelectorAll('[data-id]'));
    return list.filter(function (e) {
      if (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') return false;
      if (e.classList.contains('disabled') || e.classList.contains('static') || e.classList.contains('inert')) return false;
      var r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
    });
  }
  // Recomputed when Tab is pressed (engine.js) and after every Enter press.
  function refreshTabOrder() {
    var r = uiRoot();
    if (!r) return;
    var list = focusables().map(function (e) { return { e: e, r: e.getBoundingClientRect() }; });
    var keep = list.map(function (o) { return o.e; });
    Array.prototype.forEach.call(r.querySelectorAll('[tabindex]'), function (e) {
      if (e.tagName !== 'INPUT' && e.tagName !== 'TEXTAREA' && keep.indexOf(e) < 0) e.removeAttribute('tabindex');
    });
    list.sort(function (a, b) { return Math.abs(a.r.top - b.r.top) > 4 ? a.r.top - b.r.top : a.r.left - b.r.left; });
    list.forEach(function (o, i) { o.e.tabIndex = i + 1; });
    // a menu that rebuilt itself after the press keeps the focus on the same button
    var act = document.activeElement;
    if (lastFocusId && (!act || act === document.body || !r.contains(act))) {
      var again = r.querySelector('[data-id="' + lastFocusId.replace(/"/g, '') + '"]');
      if (again && again.tabIndex > 0) again.focus({ preventScroll: true });
    }
  }
  ui.pressFocused = function () {
    var a = document.activeElement;
    if (!a || !uiRoot().contains(a) || !a.getAttribute('data-id') || a.tagName === 'INPUT') return false;
    lastFocusId = a.getAttribute('data-id');
    a.click();
    Promise.resolve().then(refreshTabOrder);
    return true;
  };
  ui.refreshTabOrder = refreshTabOrder;
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    lastFocusId = t && t.getAttribute && uiRoot() && uiRoot().contains(t) ? t.getAttribute('data-id') : null;
  });
  document.addEventListener('mousedown', function () { lastFocusId = null; }, true);
})();
