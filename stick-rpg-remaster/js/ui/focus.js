// js/ui/focus.js — owner: W1-D. SR.ui.focus: focus scopes (card, modal, dialog, notebook) and
// spatial navigation over [data-nav] elements (UI.md §6; ARCHITECTURE §11).
//
// Input model. Scenes receive input actions from SR.input through onAction (CONTRACT §12) and
// hand them to SR.ui.focus.handle(action, ev) first: up / down / left / right move focus to the
// nearest [data-nav] in that direction inside the current scope (a focused control may consume
// them first, e.g. a Segmented or a Slider), and confirm activates the focused control. So the
// keyboard, the gamepad and injected touch actions all take one path, and native Enter / Space
// activation of focused controls is suppressed while SR.input is live (no double activation).
// Tab / Shift+Tab move focus in DOM order and wrap inside the current scope. Pointer input is
// plain DOM (click, pointer events).
// Load-time rule: defines functions only; the document listeners are added in a prio-50 hook.
(function () {
  'use strict';
  var SR = window.SR;

  var scopes = [];               // { id, root, restore, trap, opts }
  var handlers = new WeakMap();  // element -> fn(action, ev) → boolean (consumed)
  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function isVisible(el) {
    if (!el.isConnected) return false;
    if (el.closest('[hidden], [inert], .is-hidden')) return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    var cs = window.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  /** @returns {HTMLElement[]} the visible [data-nav] elements of root, in DOM order. */
  function navigables(root) {
    if (!root) return [];
    var list = root.querySelectorAll('[data-nav]');
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      // Elements inside a nested scope root (an open modal over a card) belong to that scope.
      var inner = el.parentElement ? el.parentElement.closest('[data-focus-scope]') : null;
      if (inner && inner !== root && root.contains(inner)) continue;
      if (isVisible(el)) out.push(el);
    }
    return out;
  }

  /** @returns {object|null} the top focus scope. */
  function current() { return scopes.length ? scopes[scopes.length - 1] : null; }

  /** Focuses el without scrolling the page, then scrolls it into view inside its container. */
  function focus(el) {
    if (!el) return false;
    if (!el.hasAttribute('tabindex') && !/^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    if (el.scrollIntoView) {
      try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e2) { el.scrollIntoView(false); }
    }
    return document.activeElement === el;
  }

  /** Focuses the preferred element of the scope: opts.initial, [data-autofocus], else the first. */
  function first(scope) {
    scope = scope || current();
    if (!scope) return false;
    var list = navigables(scope.root);
    var pick = null;
    if (scope.opts.initial) {
      pick = typeof scope.opts.initial === 'string' ? scope.root.querySelector(scope.opts.initial) : scope.opts.initial;
      if (pick && list.indexOf(pick) < 0) pick = null;
    }
    if (!pick) pick = scope.root.querySelector('[data-autofocus][data-nav]');
    if (pick && list.indexOf(pick) < 0) pick = null;
    return focus(pick || list[0]);
  }

  /**
   * Opens a focus scope: navigation, Tab and activation stay inside root until pop().
   * @param {HTMLElement} root
   * @param {{id: string, initial: (HTMLElement|string), restore: boolean, autofocus: boolean}=} opts
   *   restore (default true): refocus the element that had focus before; autofocus (default true)
   * @returns {object} the scope handle (pass it to pop)
   */
  function push(root, opts) {
    opts = opts || {};
    var scope = { id: opts.id || 'scope' + scopes.length, root: root, restore: document.activeElement, opts: opts };
    root.setAttribute('data-focus-scope', scope.id);
    scopes.push(scope);
    if (opts.autofocus !== false) first(scope);
    return scope;
  }

  /** Closes a scope (default: the top one) and restores the previous focus. */
  function pop(scope) {
    var i = scope ? scopes.indexOf(scope) : scopes.length - 1;
    if (i < 0) return;
    var s = scopes.splice(i, 1)[0];
    if (s.root && s.root.getAttribute('data-focus-scope') === s.id) s.root.removeAttribute('data-focus-scope');
    if (i === scopes.length && s.opts.restore !== false) {
      var back = s.restore;
      var top = current();
      if (back && back.isConnected && (!top || top.root.contains(back))) focus(back);
      else if (top) first(top);
    }
  }

  /** @returns {HTMLElement|null} the focused element if it is inside the current scope. */
  function focused() {
    var s = current();
    var a = document.activeElement;
    if (!s || !a || a === document.body) return null;
    return s.root.contains(a) ? a : null;
  }

  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  /**
   * Moves focus to the nearest [data-nav] in a direction inside the current scope.
   * @param {'up'|'down'|'left'|'right'} dir
   * @returns {boolean} focus moved
   */
  function move(dir) {
    var s = current();
    var d = DIRS[dir];
    if (!s || !d) return false;
    var list = navigables(s.root);
    if (!list.length) return false;
    var cur = focused();
    if (!cur || list.indexOf(cur) < 0) {
      // Nothing focused yet: arrows land on the first (down/right) or last (up/left) element.
      return focus(dir === 'up' || dir === 'left' ? list[list.length - 1] : list[0]);
    }
    var cr = cur.getBoundingClientRect(), cc = center(cr);
    var best = null, bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === cur || el.contains(cur) || cur.contains(el)) continue;
      var r = el.getBoundingClientRect(), c = center(r);
      var dx = c.x - cc.x, dy = c.y - cc.y;
      var along = dx * d[0] + dy * d[1];
      // Must lie in the direction: past the current element's edge (with 1 px tolerance).
      var edge = d[0] ? (d[0] > 0 ? r.left >= cr.right - 1 || c.x > cr.right : r.right <= cr.left + 1 || c.x < cr.left)
                      : (d[1] > 0 ? r.top >= cr.bottom - 1 || c.y > cr.bottom : r.bottom <= cr.top + 1 || c.y < cr.top);
      if (along <= 0 || !edge) continue;
      // Perpendicular offset measured between the rects' spans (0 when they overlap).
      var across;
      if (d[0]) across = Math.max(0, Math.max(r.top, cr.top) - Math.min(r.bottom, cr.bottom));
      else across = Math.max(0, Math.max(r.left, cr.left) - Math.min(r.right, cr.right));
      var score = along + across * 3 + Math.abs(d[0] ? dy : dx) * 0.1;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    return best ? focus(best) : false;
  }

  /** Moves focus in DOM order inside the current scope, wrapping (Tab / Shift+Tab). */
  function tab(back) {
    var s = current();
    if (!s) return false;
    var list = navigables(s.root);
    if (!list.length) return false;
    var i = list.indexOf(focused());
    var n = i < 0 ? (back ? list.length - 1 : 0) : (i + (back ? -1 : 1) + list.length) % list.length;
    return focus(list[n]);
  }

  /**
   * Registers a control's own action handler: fn(action, ev) returns true when it consumed the
   * action (a Segmented consumes left/right; a TextField consumes confirm and back).
   */
  function setHandler(el, fn) { if (el) handlers.set(el, fn); }

  function ownHandler(el, action, ev) {
    for (var node = el; node && node !== document.body; node = node.parentElement) {
      var fn = handlers.get(node);
      if (fn && fn(action, ev) === true) return true;
      if (node.hasAttribute && node.hasAttribute('data-focus-scope')) break;
    }
    return false;
  }

  /** Activates a control as a click would (disabled controls refuse with feedback themselves). */
  function activate(el) {
    if (!el) return false;
    if (typeof el.click === 'function') el.click();
    return true;
  }

  /**
   * Offers an input action to focus navigation. Scenes call this first from onAction.
   * @param {string} action an SR.input action ('up', 'down', 'left', 'right', 'confirm', ...)
   * @param {object=} ev the SR.input event
   * @returns {boolean} consumed
   */
  function handle(action, ev) {
    var s = current();
    if (!s) return false;
    var el = focused();
    if (el && ownHandler(el, action, ev || {})) return true;
    if (DIRS[action]) {
      if (ev && ev.down === false) return false;
      return move(action) || !!el;   // a focused scope swallows arrows at its edges
    }
    if (action === 'confirm') {
      if (ev && (ev.down === false || ev.repeat)) return !!el;
      if (!el) return first(s);
      return activate(el);
    }
    return false;
  }

  function isTextTarget(el) {
    if (!el || !el.tagName) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    if (el.tagName !== 'INPUT') return false;
    return !/^(button|checkbox|radio|range|submit|reset|color|file|image)$/i.test(el.type || 'text');
  }

  function inputLive() { return !!(SR.input && typeof SR.input.on === 'function'); }

  function onKeyDown(e) {
    if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey && current()) {
      e.preventDefault();
      tab(e.shiftKey);
      return;
    }
    // Enter / Space on a focused control would click it natively as well as fire SR.input's
    // confirm, which focus.handle turns into a click: keep the single action path.
    if ((e.key === 'Enter' || e.key === ' ' || e.code === 'Space') && inputLive()) {
      var t = e.target;
      if (t && t !== document.body && !isTextTarget(t) && t.closest && t.closest('#ui, .sr-ui')) e.preventDefault();
    }
  }
  function onKeyUp(e) {
    if ((e.key === ' ' || e.code === 'Space') && inputLive()) {
      var t = e.target;
      if (t && !isTextTarget(t) && t.closest && t.closest('#ui, .sr-ui')) e.preventDefault();
    }
  }

  SR.ui.focus = {
    push: push,
    pop: pop,
    current: current,
    focused: focused,
    first: first,
    focus: focus,
    move: move,
    tab: tab,
    handle: handle,
    activate: activate,
    navigables: navigables,
    setHandler: setHandler,
    isTextTarget: isTextTarget,
    /** @returns {number} open scopes (tests). */
    depth: function () { return scopes.length; },
  };

  SR.onBoot(50, function () {
    if (typeof document === 'undefined') return;
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
  });
})();
