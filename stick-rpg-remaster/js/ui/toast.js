// js/ui/toast.js — owner: W1-D. SR.ui.toast: the Toast component and its lane (UI.md §2.3,
// §2.2: x 560-960, y 104-280, a stack of 3, 3.5 s; kinds info, reward (icon + chips), warning,
// achievement (gold edge); enters from the top in 200 ms; read out through #aria), plus the sound
// captions of UI.md §8 ("[car horn ←]") shown from SR.audio's `caption` events.
// Load-time rule: defines functions only; the caption listener is added in a prio-50 hook.
(function () {
  'use strict';
  var SR = window.SR;

  var TOAST_MS = 3500;       // UI.md §2.3
  var MAX_TOASTS = 3;        // UI.md §2.2
  var CAPTION_MS = 2500;
  var CAPTION_MAX = 3;
  var KIND_ICON = { info: 'info', reward: 'star', warning: 'warning', achievement: 'trophy' };

  var live = [];             // { el, text, kind, timer }

  function D() { return SR.ui.dom; }

  function lane() {
    var layer = D().layer('toast');
    var l = layer.querySelector('.toast-lane');
    if (!l) { l = D().h('div', { class: 'toast-lane', 'data-id': 'toast-lane' }); layer.appendChild(l); }
    return l;
  }

  function build(o) {
    var kind = o.kind || 'info';
    var text = o.text !== undefined ? D().t(o.text, o.vars) : D().t(o.key, o.vars);
    var chips = (o.chips || []).map(function (c) { return c && c.nodeType ? c : SR.ui.chip(c); });
    var el = D().h('div', { class: ['toast', 'toast--' + kind, 'paper'], role: kind === 'warning' ? 'alert' : 'status',
      'data-id': o.id || 'toast', 'data-kind': kind },
      D().h('span', { class: 'toast-ico' }, D().icon(o.icon || KIND_ICON[kind] || 'info', 24)),
      D().h('span', { class: 'toast-body' },
        D().h('span', { class: 'toast-text' }, text),
        chips.length ? D().h('span', { class: 'toast-chips' }, chips) : null));
    el.toastText = text;
    return el;
  }

  function remove(entry) {
    var i = live.indexOf(entry);
    if (i >= 0) live.splice(i, 1);
    if (entry.timer) clearTimeout(entry.timer);
    var el = entry.el;
    if (!el.parentNode) return;
    if (D().reduced()) { el.parentNode.removeChild(el); return; }
    el.classList.add('is-leaving');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
  }

  /**
   * Shows a toast in the lane (or builds a static one for a gallery).
   * @param {{key: string, vars: object, text: string, kind: string, icon: string,
   *   chips: (object|HTMLElement)[], id: string, static: boolean, duration: number}} o
   *   kind: info | reward | warning | achievement; static: return the element only
   * @returns {HTMLElement}
   */
  function toast(o) {
    o = o || {};
    var el = build(o);
    if (o.static) return el;
    var entry = { el: el, text: el.toastText, kind: o.kind || 'info', timer: 0 };
    var l = lane();
    l.insertBefore(el, l.firstChild);
    live.unshift(entry);
    while (live.length > MAX_TOASTS) remove(live[live.length - 1]);
    entry.timer = setTimeout(function () { remove(entry); }, o.duration || TOAST_MS);
    el.addEventListener('click', function () { remove(entry); });
    D().announce(entry.text);
    if (entry.kind === 'reward' || entry.kind === 'achievement') D().haptic(30);
    return el;
  }

  /** @returns {{kind: string, text: string}[]} the toasts on screen, newest first (SR.debug.ui). */
  toast.list = function () { return live.map(function (e) { return { kind: e.kind, text: e.text }; }); };
  /** Removes every toast. */
  toast.clear = function () { live.slice().forEach(remove); };

  // ---- captions (UI.md §8) ----
  function arrow(dir) {
    if (typeof dir === 'string') return dir === 'left' ? ' ←' : dir === 'right' ? ' →' : '';
    if (typeof dir === 'number') return dir < -0.2 ? ' ←' : dir > 0.2 ? ' →' : '';
    return '';
  }
  /**
   * Shows a sound caption ("[car horn ←]") when the Captions setting is on.
   * @param {{key: string, dir: (number|string)}} p the `caption` event payload
   * @returns {HTMLElement|null}
   */
  toast.caption = function (p) {
    if (!p || !p.key || !D().setting('access.captions')) return null;
    var layer = D().layer('caption');
    var box = layer.querySelector('.caption-lane');
    if (!box) { box = D().h('div', { class: 'caption-lane', 'data-id': 'caption-lane' }); layer.appendChild(box); }
    var text = D().t('ui.caption', { text: D().t(p.key), arrow: arrow(p.dir) });
    var el = D().h('div', { class: 'caption', 'data-id': 'caption' }, text);
    box.appendChild(el);
    while (box.children.length > CAPTION_MAX) box.removeChild(box.firstChild);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, CAPTION_MS);
    D().announce(text);
    return el;
  };

  SR.ui.toast = toast;

  SR.onBoot(50, function () {
    if (typeof document === 'undefined') return;
    SR.events.on('caption', function (p) { toast.caption(p); });
  });
})();
