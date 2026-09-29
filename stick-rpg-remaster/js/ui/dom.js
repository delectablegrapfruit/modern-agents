// js/ui/dom.js — owner: W1-D. SR.ui.dom: the DOM builder h() and the helpers every UI file
// shares: text, CSS tokens for canvas, palette keys, icons, UI layers, the #aria announcer,
// guarded sounds and haptics, and the accessibility root classes driven by SR.settings
// (UI.md §2.1, §8; ARCHITECTURE §13, §16). No colour literals: colours come from css/tokens.css
// (read with token()) or SR.art.palette (read with paint()).
// Load-time rule: defines functions only; the settings binding runs in a prio-50 boot hook.
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  // Settings defaults (ARCHITECTURE §16) used only to read values while SR.settings is a stub.
  var SETTING_DEFAULTS = {
    'game.clock24': true, 'game.holdRepeat': true, 'game.confirmSpendOver': 1000,
    'game.alwaysAuto': false, 'game.minimalHud': false, 'game.rightClickBack': false,
    'access.textScale': 1, 'access.highContrast': false, 'access.colorblind': 'none',
    'access.reducedMotion': 'system', 'access.flashReduction': false, 'access.captions': false,
    'access.typewriterCps': 60, 'access.haptics': true, 'display.screenShake': true,
  };

  function appendChild(el, c) {
    if (c === null || c === undefined || c === false || c === true) return;
    if (Array.isArray(c)) { for (var i = 0; i < c.length; i++) appendChild(el, c[i]); return; }
    if (typeof c === 'string' || typeof c === 'number') { el.appendChild(document.createTextNode(String(c))); return; }
    el.appendChild(c);
  }

  function setAttrs(el, attrs, svg) {
    if (!attrs) return;
    for (var k in attrs) {
      if (!hasOwn.call(attrs, k)) continue;
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class' || k === 'className') {
        if (svg) el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
        else el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      } else if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else for (var s in v) if (hasOwn.call(v, s) && v[s] !== null && v[s] !== undefined) {
          if (s.indexOf('--') === 0) el.style.setProperty(s, v[s]); else el.style[s] = v[s];
        }
      } else if (k === 'on') {
        for (var ev in v) if (hasOwn.call(v, ev)) el.addEventListener(ev, v[ev]);
      } else if (k === 'text') {
        el.textContent = String(v);
      } else if (k === 'dataset') {
        for (var d in v) if (hasOwn.call(v, d)) el.dataset[d] = v[d];
      } else if (v === true) {
        el.setAttribute(k, '');
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }

  /**
   * Builds an element: h('button', { class: 'btn', 'data-id': 'ok', on: { click: fn } }, 'OK').
   * attrs: class (string or array), style (string or object; '--x' keys set custom properties),
   * on ({ event: fn }), text, dataset, and plain attributes (true = present, false/null = absent).
   * @param {string} tag
   * @param {object=} attrs
   * @param {...*} children strings, numbers, nodes or arrays (null/false skipped)
   * @returns {HTMLElement}
   */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    setAttrs(el, attrs, false);
    for (var i = 2; i < arguments.length; i++) appendChild(el, arguments[i]);
    return el;
  }

  /** Builds an SVG element (same arguments as h). @returns {SVGElement} */
  function svg(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    setAttrs(el, attrs, true);
    for (var i = 2; i < arguments.length; i++) appendChild(el, arguments[i]);
    return el;
  }

  /** Removes every child of el. @returns {HTMLElement} el */
  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }

  /** Adds a listener. @returns {function()} remove */
  function on(el, type, fn, opts) {
    el.addEventListener(type, fn, opts);
    return function () { el.removeEventListener(type, fn, opts); };
  }

  /**
   * Text for a key, or a literal: t('ui.leave'), t({ key, vars }), t('Plain') for strings that
   * are not keys. A string counts as a key when it contains a dot and no space.
   * @returns {string}
   */
  function t(key, vars) {
    if (key === null || key === undefined) return '';
    if (typeof key === 'object' && key.key) return t(key.key, key.vars || vars);
    key = String(key);
    if (!SR.text) return key;
    if (/^[\w-]+(\.[\w-]+)+$/.test(key) && key.indexOf(' ') < 0) return SR.text(key, vars);
    return vars ? SR.util.fmt(key, vars) : key;
  }

  /** @returns {*} SR.settings.get(key), or the ARCHITECTURE §16 default while settings is a stub. */
  function setting(key, dflt) {
    if (SR.settings && typeof SR.settings.get === 'function') {
      try {
        var v = SR.settings.get(key);
        if (v !== undefined) return v;
      } catch (e) { /* unknown key: fall through to the default */ }
    }
    if (dflt !== undefined) return dflt;
    return SETTING_DEFAULTS[key];
  }

  var tokenCache = {};
  var tokenEpoch = 0;
  /**
   * The value of a CSS custom property of css/tokens.css on :root (for canvas drawing), following
   * the high-contrast and colour-blind swaps. Cached until the root classes change.
   * @param {string} name '--hp' or 'hp'
   * @returns {string}
   */
  function token(name) {
    if (name.indexOf('--') !== 0) name = '--' + name;
    var k = tokenEpoch + name;
    if (hasOwn.call(tokenCache, k)) return tokenCache[k];
    var v = '';
    if (typeof document !== 'undefined' && window.getComputedStyle) {
      v = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }
    tokenCache[k] = v;
    return v;
  }
  function invalidateTokens() { tokenCache = {}; tokenEpoch++; }

  /**
   * Resolves a palette key (CONTRACT D32): 'bld.bank.walls', 'karma.good.3', 'fighter.7'.
   * @returns {string|null} a CSS colour string from js/art/palette.js, or null
   */
  function paint(key) {
    var p = SR.art && SR.art.palette;
    if (!p || !key) return null;
    var parts = String(key).split('.');
    for (var i = 0; i < parts.length && p !== null && p !== undefined; i++) p = p[parts[i]];
    return typeof p === 'string' ? p : null;
  }

  /** @returns {boolean} animations should collapse (Reduced Motion, or SR.debug fast mode). */
  function reduced() {
    return fast() || (typeof document !== 'undefined' && document.documentElement.classList.contains('rm'));
  }
  /** @returns {boolean} SR.debug.fast(true) is on (skip animations and typewriters; html.sr-fast). */
  function fast() {
    if (SR.debug && typeof SR.debug.fast === 'function') {
      try { return SR.debug.fast() === true; } catch (e) { return false; }
    }
    return false;
  }

  /** @returns {HTMLElement|null} #ui (the scaled UI box), or null outside the game page. */
  function uiRoot() { return typeof document !== 'undefined' ? document.getElementById('ui') : null; }

  /**
   * A persistent UI layer inside #ui (or document.body when there is no #ui): 'toast', 'stamp',
   * 'tip', 'caption'. Layers cover the UI box and pass pointer events through.
   * @returns {HTMLElement}
   */
  function layer(name) {
    var host = uiRoot() || document.body;
    var el = host.querySelector(':scope > .ui-layer[data-layer="' + name + '"]');
    if (!el) {
      el = h('div', { class: 'ui-layer ui-layer--' + name, 'data-layer': name });
      host.appendChild(el);
    }
    return el;
  }

  var ariaTimer = null;
  var ariaQueue = [];
  /**
   * Speaks text through the #aria live region (UI.md §8). Messages raised together (a toast, a
   * stamp and the Result summary of one action) are joined into one announcement instead of the
   * last one replacing the others.
   */
  function announce(text) {
    if (typeof document === 'undefined' || !text) return;
    var el = document.getElementById('aria');
    if (!el) return;
    text = String(text);
    if (ariaQueue.indexOf(text) < 0) ariaQueue.push(text);
    // Clear then set on the next task so a repeated message is announced again.
    el.textContent = '';
    if (ariaTimer) clearTimeout(ariaTimer);
    ariaTimer = setTimeout(function () {
      el.textContent = ariaQueue.join('. ');
      ariaQueue = [];
      ariaTimer = null;
    }, 30);
    el.setAttribute('data-last', text);
  }

  /** Plays a UI sound if the audio module and the recipe exist. @returns {object|null} the handle */
  function sfx(name, opts) {
    if (!SR.audio || typeof SR.audio.sfx !== 'function') return null;
    if (SR.reg.sfx && !hasOwn.call(SR.reg.sfx, name)) return null;
    try { return SR.audio.sfx(name, opts || {}); } catch (e) { SR.util.warnOnce('ui.sfx.' + name, 'SR.ui: sfx "' + name + '" failed: ' + e.message); return null; }
  }

  /** A short vibration on hits and rewards (UI.md §6), when the setting allows. */
  function haptic(ms) {
    if (!setting('access.haptics')) return;
    try { if (navigator.vibrate) navigator.vibrate(ms || 30); } catch (e) { /* not supported */ }
  }

  /**
   * An icon for DOM use: an <img> from SR.art.iconURL(name, size) once W1-A's icons land, else a
   * placeholder square (BUILD_PLAN §3.5). Decorative: labels carry the meaning (UI.md §1.4).
   * @returns {HTMLElement}
   */
  function icon(name, size, cls) {
    size = size || 24;
    var style = { width: size + 'px', height: size + 'px' };
    var url = null;
    if (name && SR.art && typeof SR.art.iconURL === 'function' && (!SR.reg.icon || hasOwn.call(SR.reg.icon, name))) {
      try { url = SR.art.iconURL(name, size); } catch (e) { url = null; }
    }
    if (url) return h('img', { class: ['ico', cls], src: url, alt: '', 'aria-hidden': 'true', draggable: 'false', style: style, 'data-icon': name });
    return h('span', { class: ['ico', 'ico--ph', cls], 'aria-hidden': 'true', style: style, 'data-icon': name || '' });
  }

  /**
   * @returns {number} wall-clock milliseconds for cosmetic DOM timing (typewriters, toasts, tweens
   * that CSS also runs on the wall clock). Input-driven timing (hold-to-repeat) uses scene
   * update(dt) instead, so tests can step it.
   */
  function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

  /**
   * The factor that turns client pixels into #ui logical pixels for el's UI root (CSS zoom on
   * #ui; ARCHITECTURE §2). @returns {{root: HTMLElement, k: number, rect: DOMRect}}
   */
  function frame(el) {
    var root = (el && el.closest && el.closest('#ui, .sr-ui')) || uiRoot() || document.body;
    var rect = root.getBoundingClientRect();
    var k = root.offsetWidth ? rect.width / root.offsetWidth : 1;
    return { root: root, k: k || 1, rect: rect };
  }

  /** @returns {{x: number, y: number, w: number, h: number}} el's rect in its UI root's logical px. */
  function logicalRect(el, fr) {
    fr = fr || frame(el);
    var r = el.getBoundingClientRect();
    return { x: (r.left - fr.rect.left) / fr.k, y: (r.top - fr.rect.top) / fr.k, w: r.width / fr.k, h: r.height / fr.k };
  }

  /** Error feedback for a refused activation: the error sound and a 120 ms shake (UI.md §2.3). */
  function refuse(el, reasonText) {
    sfx('error');
    if (el && !reduced()) {
      el.classList.remove('is-shaking');
      void el.offsetWidth;          // restart the animation
      el.classList.add('is-shaking');
      setTimeout(function () { el.classList.remove('is-shaking'); }, 160);
    }
    if (reasonText) announce(reasonText);
  }

  // ---- the accessibility root classes (UI.md §2.1, §8) ----
  var rmQuery = null;
  /** Applies text size, high contrast, colour-blind, reduced motion and flash reduction to <html>. */
  function applySettings() {
    if (typeof document === 'undefined') return;
    var root = document.documentElement;
    var scale = Number(setting('access.textScale')) || 1;
    root.style.setProperty('--ui-scale', String(scale));
    root.classList.toggle('hc', !!setting('access.highContrast'));
    var cb = setting('access.colorblind');
    if (cb && cb !== 'none') root.setAttribute('data-cb', cb); else root.removeAttribute('data-cb');
    var rm = setting('access.reducedMotion');
    var sys = false;
    if (rm === 'system' || rm === undefined || rm === null) {
      if (!rmQuery && window.matchMedia) rmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      sys = !!(rmQuery && rmQuery.matches);
    }
    root.classList.toggle('rm', rm === true || rm === 'on' || sys);
    root.classList.toggle('fr', !!setting('access.flashReduction'));
    invalidateTokens();
  }

  /** Marks the input device on <html data-device> (KeyHints hide on touch) and the compact layout. */
  function applyDevice(dev) {
    if (typeof document === 'undefined') return;
    var d = dev || (SR.input && SR.input.last) || 'kb';
    document.documentElement.setAttribute('data-device', d);
  }
  function applyCompact(compact) {
    if (typeof document === 'undefined') return;
    if (compact === undefined) compact = !!(SR.stage && SR.stage.compact);
    document.documentElement.classList.toggle('touch-compact', !!compact);
  }

  SR.ui.dom = {
    h: h,
    svg: svg,
    clear: clear,
    on: on,
    t: t,
    setting: setting,
    token: token,
    paint: paint,
    reduced: reduced,
    fast: fast,
    uiRoot: uiRoot,
    layer: layer,
    announce: announce,
    sfx: sfx,
    haptic: haptic,
    icon: icon,
    now: now,
    frame: frame,
    logicalRect: logicalRect,
    refuse: refuse,
    applySettings: applySettings,
    invalidateTokens: invalidateTokens,
  };

  SR.onBoot(50, function () {
    if (typeof document === 'undefined') return;
    // Follow the system's Reduced Motion even when the setting is 'on' / 'off' at boot and is
    // switched to 'system' later.
    if (!rmQuery && window.matchMedia) rmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    applySettings();
    applyDevice();
    applyCompact();
    SR.events.on('settings:changed', function (p) {
      var key = p && p.key ? String(p.key) : '';
      // '*' is SR.settings.reset() of every key (CONTRACT D35).
      if (!key || key === '*' || key === 'access' || key.indexOf('access.') === 0) applySettings();
    });
    SR.events.on('input:device', function (p) { applyDevice(p && p.device); });
    SR.events.on('stage:resized', function (p) { applyCompact(p && p.compact); });
    if (rmQuery && rmQuery.addEventListener) rmQuery.addEventListener('change', applySettings);
  });
})();
