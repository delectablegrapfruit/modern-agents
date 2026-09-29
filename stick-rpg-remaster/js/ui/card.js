// js/ui/card.js — owner: W1-D. The building card (UI.md §5.6) and the sub-screen host
// (ARCHITECTURE §7.1; CONTRACT §10):
//   SR.ui.card(opts)                     the Card component (UI.md §2.3)
//   SR.ui.card.open(buildingId, { params, screen, screenParams })   enter a building (and a sub-screen)
//   SR.ui.card.refresh(), push(id, params), pop(result), replace(id, params)
//   SR.ui.card.feedback(result, originEl) the feedback of UI.md §4.3 (any host may use it)
//   SR.ui.card.rows()                    a summary of the visible rows (SR.debug.ui)
//   SR.ui.card.mount / unmount / onAction / update   used by js/scenes/building.js
//   SR.ui.subhost.create(root, { onClose }) a sub-screen host in any DOM root (the Pocket uses it)
// Rows come from SR.preview for every action of the building (hidden and feature-off rows are
// dropped), grouped Eat · Buy · Work · Train · Services · Crime · Special, with hotkeys 1-9,
// ghost deltas on the HUD, R to repeat and hold-confirm to repeat `repeatable` rows every
// tuning.time.repeatHoldMs (never a row with confirm, minigame or screen).
// Load-time rule: defines functions only.
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;

  var GROUPS = ['eat', 'buy', 'work', 'train', 'services', 'crime', 'special'];
  var REPEAT_HOLD_FALLBACK_MS = 350;   // BALANCE B-01 time.repeatHoldMs, until tuning.js lands
  var LONG_PRESS_MS = 500;             // touch long-press starts the repeat (UI.md §6)
  var FLY_MS = 200;                    // chips fly to the HUD (UI.md §4.3)
  var FLY_STAGGER_MS = 60;
  var FLY_MAX = 6;
  var STAT_STAMP_MIN = 2;              // a Stamp for stat gains ≥ 2 (UI.md §4.3)

  function D() { return SR.ui.dom; }
  function t(k, v) { return D().t(k, v); }
  function assign(a) {
    for (var i = 1; i < arguments.length; i++) {
      var b = arguments[i];
      if (b) for (var k in b) if (hasOwn.call(b, k)) a[k] = b[k];
    }
    return a;
  }

  // ------------------------------------------------------------------ rules access (guarded)
  function preview(id, params) {
    if (typeof SR.preview === 'function') {
      try { return SR.preview(id, params) || { ok: false, reason: 'ui.rulesPending' }; } catch (e) {
        SR.util.warnOnce('ui.preview.' + id, 'SR.ui.card: preview("' + id + '") threw: ' + e.message);
        return { ok: false, reason: 'ui.rulesPending' };
      }
    }
    var def = SR.reg.action[id];
    if (def && def.feature && !(SR.features && SR.features[def.feature])) return { hidden: true };
    return { ok: false, reason: 'ui.rulesPending', cost: def && def.cost && typeof def.cost.cash === 'number' ? { cash: def.cost.cash } : {} };
  }
  function act(id, params) {
    if (typeof SR.act !== 'function') return { ok: false, id: id, reason: 'ui.rulesPending' };
    return SR.act(id, params) || { ok: false, id: id, reason: 'ui.rulesPending' };
  }
  function repeatMs() {
    var tm = SR.tuning && SR.tuning.time;
    return tm && typeof tm.repeatHoldMs === 'number' ? tm.repeatHoldMs : REPEAT_HOLD_FALLBACK_MS;
  }
  function isRepeatable(def) { return !!(def && def.repeatable && !def.confirm && !def.minigame && !def.screen); }

  // ------------------------------------------------------------------ read-only state view
  var roCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function readOnly(o) {
    if (!o || typeof o !== 'object' || typeof Proxy !== 'function' || !roCache) return o;
    var p = roCache.get(o);
    if (p) return p;
    var deny = function () { throw new TypeError('sub-screen state is read-only: commit through ctx.act'); };
    p = new Proxy(o, {
      get: function (tg, k) { var v = tg[k]; return v && typeof v === 'object' ? readOnly(v) : v; },
      set: deny, deleteProperty: deny, defineProperty: deny,
    });
    roCache.set(o, p);
    return p;
  }

  // ------------------------------------------------------------------ the Card component
  /**
   * The Card (UI.md §2.3): radius --r-l, --line, --e-2, paper grain; an 8 px header strip in the
   * building's brand colour; title (h3), owner Portrait 56, SpeechBubble; a body that scrolls after
   * 8 rows; a footer with Leave and a mini readout. Enters sliding 24 px from the right (350 ms).
   * @param {{id: string, title: string, brand: string, portrait: string, greeting: string,
   *   greetingVars: object, voice: (number|string), onLeave: function, readout: string}} o brand: a CSS
   *   colour from SR.art.palette (a palette key's value) or a token var()
   * @returns {HTMLElement} el.body, el.setGreeting(text, vars), el.setReadout(text), el.leave (button)
   */
  function card(o) {
    o = o || {};
    var h = D().h;
    var title = t(o.title);
    var el = h('section', { class: 'bcard paper', 'data-id': o.id || 'card', role: 'region', 'aria-label': title,
      style: o.brand ? { '--brand': o.brand } : null });
    el.appendChild(h('div', { class: 'bcard-strip', 'aria-hidden': 'true' }));
    var head = h('header', { class: 'bcard-head' }, h('h2', { class: 'bcard-title t-h3', 'data-id': 'card-title' }, title));
    if (o.portrait) head.appendChild(SR.ui.portrait({ id: 'card-portrait', person: o.portrait, size: 56 }));
    el.appendChild(head);
    var bubbleSlot = h('div', { class: 'bcard-speech' });
    el.appendChild(bubbleSlot);
    el.body = h('div', { class: 'bcard-body scroll-y', 'data-id': 'card-body' });
    el.appendChild(el.body);
    var readout = h('span', { class: 'bcard-readout t-small', 'data-id': 'card-readout' }, o.readout || '');
    el.leave = SR.ui.button({ id: 'card-leave', label: 'ui.leave', hint: 'back', variant: 'secondary', size: 's',
      onClick: function () { if (o.onLeave) o.onLeave(); } });
    el.appendChild(h('footer', { class: 'bcard-foot' }, el.leave, readout));
    el.speech = null;
    el.setGreeting = function (text, vars) {
      D().clear(bubbleSlot);
      el.speech = null;
      if (!text) { bubbleSlot.hidden = true; return null; }
      bubbleSlot.hidden = false;
      el.speech = SR.ui.speech({ id: 'card-greeting', text: text, vars: vars, voice: o.voice, tail: 'right' });
      bubbleSlot.appendChild(el.speech);
      return el.speech;
    };
    el.setReadout = function (text) { readout.textContent = text; };
    el.setGreeting(o.greeting, o.greetingVars);
    return el;
  }

  // ------------------------------------------------------------------ feedback (UI.md §4.3)
  function statStampKind(key) { return SR.ui.STATS.indexOf(key) >= 0 ? key : 'ink'; }

  function flyChips(deltas, origin) {
    if (!origin || !origin.isConnected || D().reduced() || !SR.ui.hud.el()) return;
    var layer = D().layer('fly');
    var fr = D().frame(layer);
    var from = D().logicalRect(origin, fr);
    var n = 0;
    (deltas || []).forEach(function (d) {
      if (n >= FLY_MAX || !d || !d.n) return;
      var tgt = SR.ui.hud.target(d.kind, d.key);
      var c = SR.ui.chip.fromDelta(d);
      if (!tgt || !c) return;
      var to = D().logicalRect(tgt, fr);
      c.classList.add('chip--fly');
      c.style.left = (from.x + from.w - 140 - n * 12) + 'px';
      c.style.top = (from.y + from.h / 2 - 12) + 'px';
      layer.appendChild(c);
      var dx = to.x + to.w / 2 - (from.x + from.w - 140 - n * 12) - 30, dy = to.y + to.h / 2 - (from.y + from.h / 2);
      var delay = n * FLY_STAGGER_MS;
      n++;
      if (typeof c.animate === 'function') {
        var anim = c.animate([
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(.8)', opacity: 0.2 },
        ], { duration: FLY_MS, delay: delay, easing: 'cubic-bezier(.65, 0, .35, 1)', fill: 'forwards' });
        anim.onfinish = function () { if (c.parentNode) c.parentNode.removeChild(c); SR.ui.hud.pulse(d.kind, d.key); };
      } else setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, FLY_MS + delay);
    });
  }

  function summary(res) {
    var parts = [];
    (res.deltas || []).forEach(function (d) {
      if (!d || !d.n || d.kind === 'time') return;
      var c = SR.ui.chip.fromDelta(d);
      if (c) parts.push(c.textContent);
    });
    return parts.join(', ');
  }

  /**
   * Plays a Result's feedback (UI.md §4.3): the row flash, chips flying to the HUD, toasts,
   * stamps (stat gains ≥ 2 and the rules' stamps), sounds, and the #aria summary. A refused
   * Result shakes the origin, plays the error sound and shows the reason as a warning toast.
   * @param {object} res a Result of SR.act
   * @param {HTMLElement=} origin the row (or control) that ran it
   * @param {{silent: boolean, flash: boolean, repeat: boolean}=} opts flash false: the caller
   *   flashes the row itself; repeat: a hold-repeat run (stat stamps are coalesced)
   * @returns {object} res
   */
  function feedback(res, origin, opts) {
    opts = opts || {};
    if (!res || opts.silent) return res;
    if (!res.ok) {
      var reason = res.reason ? t(res.reason, res.vars) : t('ui.refused');
      D().refuse(origin && origin.main ? origin.main : origin, reason);
      SR.ui.toast({ key: res.reason || 'ui.refused', vars: res.vars, kind: 'warning', id: 'toast-refused' });
      return res;
    }
    if (opts.flash !== false && origin && typeof origin.flash === 'function') origin.flash();
    flyChips(res.deltas, origin && origin.main ? origin.main : origin);
    (res.toasts || []).forEach(function (x) { SR.ui.toast({ key: x.key, vars: x.vars, kind: x.kind || 'info' }); });
    // Stamps: the rules' own (a stat gain ≥ 2 raises stamp.stats.<stat>; promotions, degrees ...),
    // plus a stat stamp derived from the deltas when the rules raised none. During a hold-repeat
    // only the first stat stamp shows (a repeat stops at stamps, GDD §4.4; stat stamps would stop
    // every training repeat after one run, so they are coalesced instead: docs/requests/W1-D.md).
    var seen = {};      // stat keys the rules already stamped (whatever their wording)
    (res.stamps || []).forEach(function (x) {
      var m = /^stamp\.stats\.(\w+)$/.exec(x.key || '');
      if (m) seen[m[1]] = true;
      if (m && opts.repeat) return;
      SR.ui.stamp({ text: t(x.key, x.vars), kind: x.kind || (m ? statStampKind(m[1]) : 'primary'), stat: !!m });
    });
    (res.deltas || []).forEach(function (d) {
      if (d && d.kind === 'stat' && d.n >= STAT_STAMP_MIN && SR.ui.STATS.indexOf(d.key) >= 0 && !seen[d.key]) {
        seen[d.key] = true;
        if (!opts.repeat) SR.ui.stamp({ text: t('ui.stamp.stat', { n: d.n, stat: t('ui.statLong.' + d.key) }), kind: statStampKind(d.key), stat: true });
      }
    });
    var played = false;
    (res.sfx || []).forEach(function (name) { if (D().sfx(name)) played = true; });
    if (!played) {
      var spent = (res.deltas || []).some(function (d) { return d && d.kind === 'cash' && d.n < 0; });
      D().sfx(spent ? 'purchase' : 'confirm');
    }
    var sum = summary(res);
    if (sum) D().announce(sum);
    return res;
  }

  // ------------------------------------------------------------------ the sub-screen host
  /**
   * Creates a sub-screen host inside root (ARCHITECTURE §7.1): a Breadcrumb and a body where the
   * top sub-screen mounts; lifecycle mount / refresh / unmount, Back with the veto, feedback after
   * ctx.act.
   * @param {HTMLElement} root
   * @param {{onClose: function, onOpen: function, building: string, host: string, rootLabel: string,
   *   feedback: function, onResult: function, focusScope: boolean}} opts host: 'card' | 'pocket';
   *   rootLabel: the first crumb (Back); feedback(result, originEl): replaces the default feedback;
   *   onResult(result, actionId): after each ctx.act; focusScope: push a focus scope of its own
   *   (default true unless host is 'card')
   * @returns {{push: function, pop: function, replace: function, close: function, refresh: function,
   *   back: function, onAction: function, top: function, depth: function, destroy: function}}
   */
  function createSubhost(root, opts) {
    opts = opts || {};
    var h = D().h;
    var stack = [];
    var unsubs = [];
    var inAct = 0;
    var scope = null;
    var crumbs = h('div', { class: 'subhost-crumbs' });
    var body = h('div', { class: 'subhost-body', 'data-id': 'subhost-body' });
    var el = h('div', { class: 'subhost', 'data-id': 'subhost', hidden: true }, crumbs, body);
    root.appendChild(el);
    var host;

    function top() { return stack.length ? stack[stack.length - 1] : null; }

    function renderCrumbs() {
      D().clear(crumbs);
      if (!stack.length) return;
      var items = [{ label: opts.rootLabel || 'ui.back', onClick: function () { host.close(); } }];
      stack.forEach(function (e, i) {
        items.push({ label: e.def.title || 'ui.subscreen', onClick: function () { while (stack.length > i + 1) popTop(undefined); } });
      });
      crumbs.appendChild(SR.ui.breadcrumb({ id: 'breadcrumb', items: items }));
    }

    function subscribe() {
      if (unsubs.length) return;
      ['time:advanced', 'money:changed'].forEach(function (name) {
        unsubs.push(SR.events.on(name, function () { if (!inAct) host.refresh(); }));
      });
    }
    function unsubscribe() { unsubs.forEach(function (f) { f(); }); unsubs = []; }

    function makeCtx(entry) {
      var ctx = {
        params: entry.params || {},
        building: opts.building || null,
        host: opts.host || 'card',
        text: SR.text,
        ui: SR.ui,
        preview: function (id, p) { return preview(id, p); },
        act: function (id, p) {
          inAct++;
          var res;
          try { res = act(id, p); } finally { inAct--; }
          // The control that committed (the focused one inside the sub-screen) is where the
          // chips fly from (UI.md §4.3), as they do from a row.
          var a = document.activeElement;
          var origin = entry.el && a && entry.el.contains(a) ? a : entry.el;
          (opts.feedback || feedback)(res, origin);
          if (opts.onResult) { try { opts.onResult(res, id); } catch (e) { console.error(e); } }
          if (res && res.ok && res.open) runMinigame(res.open, function () { host.refresh(); });
          host.refresh();
          return res;
        },
        push: function (id, p) { return host.push(id, p); },
        pop: function (r) { host.pop(r); },
        replace: function (id, p) { host.replace(id, p); },
        close: function () { host.close(); },
        refresh: function () { host.refresh(); },
      };
      Object.defineProperty(ctx, 'state', { enumerable: true, get: function () { return readOnly(SR.state); } });
      return ctx;
    }

    function call(entry, name, a, b, c) {
      if (!entry || typeof entry.def[name] !== 'function') return undefined;
      try { return entry.def[name].call(entry.def, a, b, c); } catch (e) {
        console.error('SR.ui.subhost: sub-screen "' + entry.id + '" ' + name + '() threw', e);
        return undefined;
      }
    }

    function mountEntry(entry) {
      entry.el = h('div', { class: 'subscreen', 'data-subscreen': entry.id, 'data-id': 'sub-' + entry.id });
      body.appendChild(entry.el);
      entry.ctx = makeCtx(entry);
      call(entry, 'mount', entry.el, entry.ctx);
    }
    function unmountEntry(entry) {
      call(entry, 'unmount');
      if (entry.el) { D().clear(entry.el); if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el); }
      entry.el = null;
    }

    function show() {
      stack.forEach(function (e, i) { if (e.el) e.el.hidden = i !== stack.length - 1; });
      el.hidden = !stack.length;
      renderCrumbs();
      body.scrollTop = 0;
      var tp = top();
      if (tp && tp.el) {
        // The sub-screen's [data-autofocus] control (Button { autofocus }), else its first enabled
        // control that is not a text field (a pad in a text field only has A and B), else the first
        // control, else the Breadcrumb.
        var list = SR.ui.focus.navigables(tp.el);
        var first = tp.el.querySelector('[data-autofocus][data-nav]');
        if (!first || list.indexOf(first) < 0) {
          first = list.filter(function (n) { return n.getAttribute('aria-disabled') !== 'true' && !SR.ui.focus.isTextTarget(n); })[0];
        }
        first = first || list[0] || SR.ui.focus.navigables(el)[0];
        if (first) SR.ui.focus.focus(first);
      }
    }

    function popTop(result) {
      var entry = stack.pop();
      if (!entry) return;
      unmountEntry(entry);
      if (entry.resolve) entry.resolve(result);
      D().sfx('close');
      if (stack.length) {
        show();
        call(top(), 'refresh', top().ctx);
      } else {
        el.hidden = true;
        renderCrumbs();
        unsubscribe();
        if (scope) { SR.ui.focus.pop(scope); scope = null; }
        if (opts.onClose) opts.onClose(result);
      }
    }

    host = {
      /**
       * Opens a sub-screen on top. @returns {Promise<*>} resolved by pop(result) (undefined on close)
       */
      push: function (id, params) {
        var def = SR.reg.subscreen && SR.reg.subscreen[id];
        if (!def) {
          SR.util.warnOnce('ui.sub.' + id, 'SR.ui.subhost: unknown sub-screen "' + id + '"');
          SR.ui.toast({ key: 'ui.subMissing', kind: 'warning' });
          return Promise.resolve(undefined);
        }
        if (def.feature && !(SR.features && SR.features[def.feature])) {
          SR.ui.toast({ key: 'ui.featureOff', kind: 'warning' });
          return Promise.resolve(undefined);
        }
        var wasEmpty = !stack.length;
        var entry = { id: id, def: def, params: params || {}, el: null, ctx: null, resolve: null };
        var p = new Promise(function (res) { entry.resolve = res; });
        stack.push(entry);
        if (wasEmpty) {
          subscribe();
          if (opts.onOpen) opts.onOpen();
          if (opts.focusScope !== false && opts.host !== 'card') scope = SR.ui.focus.push(el, { id: 'subhost', autofocus: false });
        }
        mountEntry(entry);
        D().sfx('open');
        show();
        return p;
      },
      /** Closes the top sub-screen, resolving its push() with result; the parent refreshes. */
      pop: function (result) { popTop(result); },
      /** Replaces the top sub-screen (its push() promise carries over). */
      replace: function (id, params) {
        var old = top();
        if (!old) return host.push(id, params);
        var def = SR.reg.subscreen && SR.reg.subscreen[id];
        if (!def) { SR.util.warnOnce('ui.sub.' + id, 'SR.ui.subhost: unknown sub-screen "' + id + '"'); return Promise.resolve(undefined); }
        unmountEntry(old);
        old.id = id; old.def = def; old.params = params || {};
        mountEntry(old);
        show();
        return Promise.resolve(undefined);
      },
      /** Closes every sub-screen (their promises resolve with undefined). */
      close: function () { while (stack.length) popTop(undefined); },
      /** Calls the top sub-screen's refresh(ctx). */
      refresh: function () { var e = top(); if (e) call(e, 'refresh', e.ctx); },
      /**
       * Back one crumb. A sub-screen whose back(ctx) returns false vetoes it; the host then asks
       * to confirm. @returns {boolean} handled (false when nothing is open)
       */
      back: function () {
        var e = top();
        if (!e) return false;
        var ok = typeof e.def.back === 'function' ? call(e, 'back', e.ctx) : true;
        if (ok === false) {
          SR.ui.confirm({ id: 'confirm-discard', title: 'ui.sub.discardTitle', text: 'ui.sub.discardText',
            yes: 'ui.sub.discard', no: 'ui.sub.stay', danger: true }).then(function (yes) { if (yes && top() === e) popTop(undefined); });
          return true;
        }
        popTop(undefined);
        return true;
      },
      /** Offers an input action to the top sub-screen's onAction. @returns {boolean} consumed */
      onAction: function (action, ev) {
        var e = top();
        if (!e || typeof e.def.onAction !== 'function') return false;
        return call(e, 'onAction', action, ev, e.ctx) === true;
      },
      /** @returns {string|null} the top sub-screen id. */
      top: function () { var e = top(); return e ? e.id : null; },
      /** @returns {number} open sub-screens. */
      depth: function () { return stack.length; },
      /** @returns {string[]} the open sub-screen ids, bottom to top. */
      ids: function () { return stack.map(function (e) { return e.id; }); },
      /** Closes everything without callbacks and removes the host's DOM. */
      destroy: function () {
        var saved = opts.onClose;
        opts.onClose = null;
        host.close();
        opts.onClose = saved;
        unsubscribe();
        if (el.parentNode) el.parentNode.removeChild(el);
      },
      el: el,
    };
    return host;
  }

  // ------------------------------------------------------------------ minigames from rows
  function runMinigame(open, after) {
    if (!SR.minigame || typeof SR.minigame.run !== 'function') {
      SR.ui.toast({ key: 'ui.minigamePending', kind: 'warning' });
      return;
    }
    if (C) C.hold = null;
    var p;
    try { p = SR.minigame.run(open.minigame, assign({ skin: open.skin }, open.params)); } catch (e) {
      console.error('SR.ui.card: SR.minigame.run failed', e);
      return;
    }
    Promise.resolve(p).then(function (result) {
      if (!open.resolve) return;
      var res = act(open.resolve, result);
      feedback(res, null);
      if (after) after(res);
      if (C) refreshRows(true);
    });
  }

  // ------------------------------------------------------------------ the building card controller
  var C = null;   // { id, def, sceneParams, root, el, rowsEl, rows, sub, scope, hold, last, pointerDown, hooks, unsubs, opener, ghostId }

  function buildingDef(id) {
    return (SR.reg.building && SR.reg.building[id]) || { id: id, name: 'place.' + id };
  }

  function brandColour(def) {
    return D().paint('bld.' + (def.exteriorId || def.id) + '.walls') || D().paint('bld.' + def.id + '.walls') || null;
  }

  function pickGreeting(def, params) {
    var fnName = 'greet.' + def.id;
    if (SR.reg.fn && typeof SR.reg.fn[fnName] === 'function' && SR.state) {
      try {
        var g = SR.reg.fn[fnName](SR.state, params || {}, { rng: SR.rng.fx, now: SR.state.clock.min, source: 'ui' });
        if (g) return typeof g === 'string' ? { key: g } : g;
      } catch (e) { SR.util.warnOnce('ui.greet.' + def.id, 'SR.ui.card: ' + fnName + ' threw: ' + e.message); }
    }
    var list = (def.greetings || []).filter(function (x) { return typeof x === 'string' || (x && x.key); });
    if (list.length) {
      var pick = SR.rng.fx.pick(list);
      return typeof pick === 'string' ? { key: pick } : pick;
    }
    if (SR.text.has('greet.' + def.id)) return { key: 'greet.' + def.id };
    return null;
  }

  /** The actions this card shows: the building's (or its mode's list, for home doors). */
  function cardActions() {
    var def = C.def, mode = C.sceneParams.params && C.sceneParams.params.mode;
    var modes = def.modes;
    if (modes && mode && modes[mode]) {
      var ids = Array.isArray(modes[mode]) ? modes[mode] : modes[mode].actions || [];
      return ids.map(function (id) { return SR.reg.action[id]; }).filter(Boolean);
    }
    return SR.registry.entries('action').map(function (e) { return e.def; }).filter(function (a) {
      return a.building === C.id && !/:resolve$/.test(a.id);
    });
  }

  function groupIndex(g) { var i = GROUPS.indexOf(g); return i < 0 ? GROUPS.length : i; }

  function rowParams(row) {
    return assign({}, C.sceneParams.params, row.variant ? { variant: row.variant } : null);
  }

  function variantsOf(def) {
    if (!Array.isArray(def.variants) || def.variants.length < 2) return null;
    var avail = def.variants.filter(function (v) {
      var pv = preview(def.id, assign({}, C.sceneParams.params, { variant: v }));
      return pv && !pv.hidden;
    });
    if (avail.length < 2) return null;
    return avail.map(function (v) { return { id: v, label: 'ui.variant.' + v }; });
  }

  function focusedRowId() {
    var a = document.activeElement;
    var r = a && a.closest ? a.closest('.arow') : null;
    return r && C && C.rowsEl.contains(r) ? r.getAttribute('data-row') : null;
  }

  function rowById(id) {
    if (!C) return null;
    for (var i = 0; i < C.rows.length; i++) if (C.rows[i].id === id) return C.rows[i];
    return null;
  }

  function rowOpts(r) {
    var pv = r.preview, def = r.def;
    var hustle = def.minigame && SR.features && SR.features.hustles ? { label: 'ui.hustle', onClick: function () { runHustle(rowById(def.id) || r); } } : null;
    return {
      id: def.id, hotkey: r.hotkey || null, icon: def.icon, label: def.label || 'act.' + def.id,
      gains: SR.ui.chip.gains(pv),
      costs: def.screen ? [] : SR.ui.chip.costs(pv, { def: def }),
      badges: pv.badges || [],
      disabled: !pv.ok, reason: pv.reason, reasonVars: pv.vars,
      variants: variantsOf(def), variant: r.variant,
      onVariant: function (v) { C.variants[def.id] = v; r.variant = v; refreshRows(true); },
      hustle: hustle,
      repeatable: isRepeatable(def),
      onRun: function () { press(rowById(def.id) || r, 'click'); },
      onRefuse: function () { if (C) C.hold = null; },
      onFocus: function () { var cur = rowById(def.id); if (C) C.ghostId = cur ? def.id : null; SR.ui.hud.ghost(cur ? cur.preview : null); },
      onBlur: function () {
        // Blur, or the pointer leaving a hovered row: the ghost goes back to the focused row, if any.
        if (!C) return;
        var fid = focusedRowId();
        var fr = fid && fid !== def.id ? rowById(fid) : null;
        C.ghostId = fr ? fr.id : null;
        SR.ui.hud.ghost(fr ? fr.preview : null);
      },
    };
  }

  /**
   * Re-evaluates every row from SR.preview. Rows are updated in place while the list keeps its
   * order (focus and the run flash survive); otherwise the list is rebuilt and focus restored.
   */
  function refreshRows(keepFocus) {
    if (!C) return;
    var h = D().h;
    var fid = keepFocus ? focusedRowId() : null;
    var fIndex = -1;
    if (fid) C.rows.forEach(function (r, i) { if (r.id === fid) fIndex = i; });
    var defs = cardActions().slice().sort(function (a, b) {
      return groupIndex(a.group) - groupIndex(b.group) || (a.order || 0) - (b.order || 0) || (a.id < b.id ? -1 : 1);
    });
    var rows = [];
    defs.forEach(function (def) {
      var variant = C.variants[def.id] || (Array.isArray(def.variants) ? def.variants[0] : undefined);
      var row = { id: def.id, def: def, variant: variant, el: null };
      var pv = preview(def.id, rowParams(row));
      if (!pv || pv.hidden) return;
      row.preview = pv;
      rows.push(row);
    });
    // Hotkeys 1-9: explicit ones first (unique), then the rest in order.
    var used = {};
    rows.forEach(function (r) {
      var k = Number(r.preview.hotkey || r.def.hotkey);
      if (k >= 1 && k <= 9 && !used[k]) { used[k] = true; r.hotkey = k; }
    });
    var nextKey = 1;
    rows.forEach(function (r) {
      if (r.hotkey) return;
      while (used[nextKey] && nextKey <= 9) nextKey++;
      if (nextKey <= 9) { r.hotkey = nextKey; used[nextKey] = true; }
    });
    var sameOrder = C.rows.length === rows.length && rows.every(function (r, i) { return C.rows[i].id === r.id; }) && C.rowsEl.childNodes.length > 0;
    var old = {};
    C.rows.forEach(function (r) { old[r.id] = r.el; });
    rows.forEach(function (r) {
      if (old[r.id]) { r.el = old[r.id]; r.el.update(rowOpts(r)); }
      else { r.el = SR.ui.actionRow(rowOpts(r)); bindLongPress(r.id, r.el); }
    });
    C.rows = rows;
    if (!sameOrder) {
      D().clear(C.rowsEl);
      var group = null;
      rows.forEach(function (r) {
        if (r.def.group !== group) {
          group = r.def.group;
          C.rowsEl.appendChild(h('h3', { class: 'bcard-group', 'data-id': 'group-' + (group || 'other') }, t('ui.group.' + (group || 'special'))));
        }
        C.rowsEl.appendChild(r.el);
      });
      if (!rows.length) C.rowsEl.appendChild(h('p', { class: 'bcard-empty t-ink-700', 'data-id': 'card-empty' }, t('ui.nothingHere')));
      if (keepFocus && (fid || fIndex >= 0) && !C.sub.depth()) {
        var same = rowById(fid) || rows[Math.min(fIndex, rows.length - 1)];
        if (same) SR.ui.focus.focus(same.el.main);
      }
    }
    // The HUD ghost follows the focused (or hovered) row's new preview: after a run it may be
    // capped, or refused (no ghost), and a row that went away takes its ghost with it (UI.md §1.1).
    if (C.ghostId) {
      var g = rowById(C.ghostId);
      if (!g) C.ghostId = null;
      SR.ui.hud.ghost(g && !C.sub.depth() ? g.preview : null);
    }
    updateReadout();
  }

  function updateReadout() {
    if (!C || !C.el) return;
    var s = SR.state;
    C.el.setReadout(s && s.money && s.clock ? t('ui.cardReadout', { money: SR.text.money(s.money.cash), time: SR.text.time(s.clock.min) }) : '');
  }

  function bindLongPress(id, rowEl) {
    var main = rowEl.main;
    var timer = 0;
    function cancel() { if (timer) { clearTimeout(timer); timer = 0; } if (C) C.pointerDown = false; }
    main.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      // A long-press that ended off the row (no click followed) must not swallow the next tap.
      rowEl._suppressClick = false;
      var r = rowById(id);
      if (!C || !r || !isRepeatable(r.def)) return;
      C.pointerDown = true;
      timer = setTimeout(function () {
        timer = 0;
        var cur = rowById(id);
        if (!C || !C.pointerDown || !cur) return;
        rowEl._suppressClick = true;
        press(cur, 'pointer');
      }, LONG_PRESS_MS);
    });
    main.addEventListener('pointerup', cancel);
    main.addEventListener('pointercancel', cancel);
    main.addEventListener('pointerleave', cancel);
  }

  /**
   * Runs a row once (the first press or a repeat).
   * @returns {boolean|string} true when it ran, false when refused or hidden, 'pending' while a
   *   confirm or a sub-screen is open
   */
  function runRow(r, opts) {
    opts = opts || {};
    if (!C) return false;
    var def = r.def;
    var params = rowParams(r);
    var pv = preview(def.id, params);
    if (!pv || pv.hidden) return false;
    if (!pv.ok) {
      D().refuse(r.el.main, pv.reason ? t(pv.reason, pv.vars) : '');
      refreshRows(true);
      return false;
    }
    if (def.screen) {
      C.opener = def.id;
      // The door's params (a home door's { homeId, mode }) reach the sub-screen; the row's own
      // screenParams are more specific and win.
      C.sub.push(def.screen, assign({}, C.sceneParams.params, def.screenParams));
      return 'pending';
    }
    if (!opts.repeat) {
      var spendOver = Number(D().setting('game.confirmSpendOver')) || 0;
      var cash = pv.cost && pv.cost.cash;
      var ask = def.confirm ? { text: def.confirm } : spendOver > 0 && cash >= spendOver ? { text: 'ui.confirmSpend', vars: { money: SR.text.money(cash) } } : null;
      if (ask) {
        SR.ui.confirm({ id: 'confirm-row', title: def.label || 'act.' + def.id, text: ask.text, vars: assign({}, pv.vars, ask.vars) })
          .then(function (yes) { if (yes && C) commit(r, params); });
        return 'pending';
      }
    }
    return commit(r, params, opts.repeat);
  }

  function commit(r, params, repeat) {
    var res = act(r.def.id, params);
    if (C && C.hooks.onResult) { try { C.hooks.onResult(res, r.def); } catch (e) { console.error(e); } }
    feedback(res, r.el, { silent: r.def.silent, flash: false, repeat: !!repeat });
    // R re-runs the card's last action only if that action is repeatable (ARCHITECTURE §11), so
    // a non-repeatable run (a crime, a confirm) replaces the last action instead of being skipped.
    if (res && res.ok && C) C.last = { id: r.def.id, variant: r.variant };
    if (res && res.ok && res.open) runMinigame(res.open);
    if (C) {
      refreshRows(true);
      var now = rowById(r.def.id);
      if (res && res.ok && now && !r.def.silent) now.el.flash();
    }
    return !!(res && res.ok);
  }

  /** The Hustle skin of a row: a skin id, or a named fn ('jobs.hustleSkin') giving one (and its step). */
  function hustleSkin(r) {
    var mg = r.def.minigame || {};
    var skin = mg.skin, step;
    if (skin && SR.reg.fn && typeof SR.reg.fn[skin] === 'function' && !(SR.reg.skin && SR.reg.skin[skin])) {
      var ret = null;
      try { ret = SR.reg.fn[skin](SR.state, rowParams(r), { source: 'ui', now: SR.state.clock.min }); } catch (e) { ret = null; }
      if (ret && typeof ret === 'object') { skin = ret.skin; step = ret.step; } else skin = ret;
      // The job's Timing Ring step (B-05 pitchStep) comes with SR.rules.jobs.hustleSkin(s, track).
      if (skin && step === undefined && SR.rules.jobs && typeof SR.rules.jobs.hustleSkin === 'function') {
        try {
          var o = SR.rules.jobs.hustleSkin(SR.state, r.def.building);
          if (o && o.skin === skin) step = o.step;
        } catch (e2) { step = undefined; }
      }
    }
    return { skin: skin || null, step: step };
  }

  function runHustle(r) {
    var pv = preview(r.def.id, rowParams(r));
    if (!pv.ok) { D().refuse(r.el.main, pv.reason ? t(pv.reason, pv.vars) : ''); return; }
    var hs = hustleSkin(r);
    if (!hs.skin || !SR.minigame || typeof SR.minigame.run !== 'function') { SR.ui.toast({ key: 'ui.minigamePending', kind: 'warning' }); return; }
    C.hold = null;
    var params = rowParams(r);
    var runParams = assign({}, params, { skin: hs.skin, auto: !!D().setting('game.alwaysAuto') });
    if (hs.step !== undefined) runParams.step = hs.step;
    Promise.resolve(SR.minigame.run(hs.skin, runParams)).then(function (result) {
      if (!C || !result) return;
      commit(r, assign(params, { m: result.m, hustle: result }));
    }, function (e) { SR.util.warnOnce('ui.hustle.' + hs.skin, 'SR.ui.card: hustle "' + hs.skin + '" failed: ' + (e && e.message)); });
  }

  /** A press on a row: run it, and start hold-to-repeat for a repeatable one. */
  function press(r, source) {
    if (!C) return false;
    if (SR.ui.stamp.swallow()) return false;
    var ok = runRow(r, {});
    if (ok === true && isRepeatable(r.def) && D().setting('game.holdRepeat') !== false && (source === 'input' || source === 'pointer')) {
      C.hold = { id: r.id, t: 0, source: source };
    }
    return ok;
  }

  function held(source) {
    if (source === 'pointer') return !!(C && C.pointerDown);
    return !!(SR.input && typeof SR.input.held === 'function' && SR.input.held('confirm'));
  }

  function blocked() {
    var top = SR.scenes.top();
    if (!top || top.id !== 'building') return true;
    if (SR.ui.stamp.busy({ ignoreStat: true })) return true;   // promotions, degrees, ranks stop a repeat
    return !!(C && C.sub.depth());
  }

  /** Fixed-step update from the building scene: hold-to-repeat timing (tests step it). */
  function update(dt) {
    if (!C || !C.hold) return;
    if (!held(C.hold.source) || blocked()) { C.hold = null; return; }
    C.hold.t += dt * 1000;
    var iv = repeatMs();
    while (C && C.hold && C.hold.t + 1e-6 >= iv) {
      C.hold.t -= iv;
      var r = rowById(C.hold.id);
      if (!r || runRow(r, { repeat: true }) !== true) { if (C) C.hold = null; break; }
      if (blocked()) { C.hold = null; break; }
    }
  }

  function repeatLast() {
    if (!C || !C.last) { D().refuse(null); return false; }
    var r = rowById(C.last.id);
    if (!r || !isRepeatable(r.def)) { D().refuse(null); return false; }
    if (C.last.variant) r.variant = C.last.variant;
    return runRow(r, { repeat: true }) === true;
  }

  function rowOfElement(el) {
    var rowEl = el && el.closest ? el.closest('.arow') : null;
    if (!rowEl || !C.rowsEl.contains(rowEl)) return null;
    if (el !== rowEl.main && !rowEl.main.contains(el)) return null;
    return rowById(rowEl.getAttribute('data-row'));
  }

  function isBackBinding(ev) {
    if (!ev || !ev.code) return false;
    var b = SR.input && typeof SR.input.bindings === 'function' ? SR.input.bindings('back') : ['Escape', 'Backspace', 'Pad1'];
    return (b || []).indexOf(ev.code) >= 0;
  }

  function openOverlay(id, params) {
    if (!SR.reg.scene[id]) return false;
    C.hold = null;
    SR.scenes.push(id, params);
    return true;
  }

  function cityOr() { return SR.reg.scene.city ? 'city' : 'title'; }

  /** Leaves the building for the city (UI.md §5.6: Esc / B with no sub-screen open). */
  function leave() {
    if (!C) return;
    var id = C.id;
    C.hold = null;
    D().sfx('close');
    SR.scenes.go(cityOr(), { from: id }, { transition: 'pageTurn' });
  }

  /**
   * Handles an input action for the card (from the building scene's onAction).
   * @returns {boolean} consumed
   */
  function onAction(action, ev) {
    if (!C) return false;
    ev = ev || {};
    if (ev.down === false) return false;
    // Any key completes the greeting's typewriter (UI.md §2.3) and still does its job.
    if (C.el.speech && !C.el.speech.done()) C.el.speech.complete();
    if ((action === 'confirm' || action === 'back' || action === 'interact' || action === 'repeat' || /^row\d$/.test(action)) && SR.ui.stamp.swallow()) return true;
    if (action === 'interact') return true;   // E / Enter / Space / A also fire confirm; the card acts on that
    if (C.sub.depth()) {
      if (SR.ui.focus.handle(action, ev)) return true;
      if (C.sub.onAction(action, ev)) return true;
      if (action === 'back') { C.sub.back(); return true; }
      if (action === 'pause' && !isBackBinding(ev)) return openOverlay('pause');
      return false;
    }
    var m = /^row(\d)$/.exec(action);
    if (m) {
      if (ev.repeat) return true;
      var n = Number(m[1]);
      for (var i = 0; i < C.rows.length; i++) {
        if (C.rows[i].hotkey === n) { SR.ui.focus.focus(C.rows[i].el.main); press(C.rows[i], 'hotkey'); return true; }
      }
      return true;
    }
    switch (action) {
      case 'confirm': {
        var r = rowOfElement(SR.ui.focus.focused());
        if (r) { if (!ev.repeat) press(r, 'input'); return true; }
        return SR.ui.focus.handle('confirm', ev);
      }
      case 'up': case 'down': case 'left': case 'right':
        return SR.ui.focus.handle(action, ev);
      case 'repeat':
        if (!ev.repeat) repeatLast();
        return true;
      case 'back':
        leave();
        return true;
      case 'tabPrev': case 'tabNext': {
        var fr = rowOfElement(SR.ui.focus.focused());
        if (fr && fr.el.stepVariant) fr.el.stepVariant(action === 'tabPrev' ? -1 : 1);
        return true;
      }
      case 'pause':
        if (!isBackBinding(ev)) openOverlay('pause');
        return true;
      case 'pocket':
        if (ev.device === 'pad') openOverlay('pocket');
        return true;
      case 'map': case 'bag': case 'journal':
        openOverlay('pocket', { tab: action });
        return true;
      default:
        return false;
    }
  }

  /**
   * Mounts the card for a building scene.
   * @param {HTMLElement} root the scene's UI root
   * @param {{id: string, params: object, screen: string, screenParams: object}} sceneParams
   * @param {{onResult: function}=} hooks
   * @returns {HTMLElement} the card
   */
  function mount(root, sceneParams, hooks) {
    unmount();
    sceneParams = sceneParams || {};
    var id = sceneParams.id;
    var def = buildingDef(id);
    C = { id: id, def: def, sceneParams: { id: id, params: sceneParams.params || {} }, root: root, rows: [], variants: {},
      hold: null, last: null, pointerDown: false, hooks: hooks || {}, unsubs: [], opener: null, ghostId: null };
    var greet = pickGreeting(def, C.sceneParams.params);
    var owner = def.owner && SR.reg.person && SR.reg.person[def.owner];
    C.el = card({ id: 'card', title: def.name || 'place.' + id, brand: brandColour(def), portrait: def.portrait || def.owner || null,
      greeting: greet && greet.key, greetingVars: greet && greet.vars, voice: owner && owner.voice, onLeave: leave });
    C.rowsEl = D().h('div', { class: 'bcard-rows', 'data-id': 'card-rows' });
    C.el.body.appendChild(C.rowsEl);
    root.appendChild(C.el);
    C.sub = createSubhost(C.el.body, {
      host: 'card', building: id, rootLabel: def.name || 'place.' + id,
      onResult: function (res, actionId) {
        if (!C || !res || !res.ok) return;
        C.last = { id: actionId };      // a sub-screen commit is the card's last action (R refuses it)
        if (C.hooks.onResult) C.hooks.onResult(res, SR.reg.action[actionId] || { id: actionId });
      },
      onOpen: function () { C.rowsEl.hidden = true; C.hold = null; C.ghostId = null; SR.ui.hud.ghost(null); },
      onClose: function () {
        if (!C) return;
        C.rowsEl.hidden = false;
        refreshRows(false);
        var back = C.opener ? rowById(C.opener) : null;
        C.opener = null;
        SR.ui.focus.focus(back ? back.el.main : (C.rows[0] && C.rows[0].el.main));
      },
    });
    C.scope = SR.ui.focus.push(C.el, { id: 'card', autofocus: false });
    refreshRows(false);
    if (C.rows[0]) SR.ui.focus.focus(C.rows[0].el.main);
    ['time:advanced', 'money:changed', 'stat:changed', 'item:changed', 'job:changed', 'home:changed', 'karma:changed', 'day:started'].forEach(function (name) {
      C.unsubs.push(SR.events.on(name, function () { scheduleRefresh(); }));
    });
    if (sceneParams.screen) C.sub.push(sceneParams.screen, sceneParams.screenParams || {});
    return C.el;
  }

  var refreshQueued = false;
  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    Promise.resolve().then(function () {
      refreshQueued = false;
      if (C && !C.sub.depth()) refreshRows(true);
      else if (C) updateReadout();
    });
  }

  /** Unmounts the card (the building scene's ui.unmount). */
  function unmount() {
    if (!C) return;
    var c = C;
    C = null;
    c.unsubs.forEach(function (f) { f(); });
    c.sub.destroy();
    SR.ui.focus.pop(c.scope);
    SR.ui.hud.ghost(null);
    SR.ui.tooltip.hide();
    if (c.el.parentNode) c.el.parentNode.removeChild(c.el);
  }

  // ------------------------------------------------------------------ public host API
  /**
   * Enters a building (from the city or another building) and optionally opens a sub-screen on
   * arrival (ARCHITECTURE §7.1). In the same building it just opens the sub-screen.
   * @param {string} buildingId
   * @param {{params: object, screen: string, screenParams: object}=} o
   */
  card.open = function (buildingId, o) {
    o = o || {};
    var top = SR.scenes.top();
    if (C && C.id === buildingId && top && top.id === 'building' && (!o.params || SR.util.equal(o.params, C.sceneParams.params))) {
      if (o.screen) { C.sub.close(); C.sub.push(o.screen, o.screenParams || {}); }
      return;
    }
    SR.scenes.go('building', { id: buildingId, params: o.params || {}, screen: o.screen, screenParams: o.screenParams },
      { transition: C ? 'pageTurn' : 'doorZoom' });
  };
  /** Re-evaluates the rows (and the open sub-screen). */
  card.refresh = function () { if (!C) return; if (C.sub.depth()) C.sub.refresh(); else refreshRows(true); updateReadout(); };
  /** Opens a sub-screen in the card. @returns {Promise<*>} */
  card.push = function (id, params) { return C ? C.sub.push(id, params) : Promise.resolve(undefined); };
  /** Closes the card's top sub-screen with result. */
  card.pop = function (result) { if (C) C.sub.pop(result); };
  /** Replaces the card's top sub-screen. */
  card.replace = function (id, params) { if (C) C.sub.replace(id, params); };
  card.feedback = feedback;
  card.mount = mount;
  card.unmount = unmount;
  card.onAction = onAction;
  card.update = update;
  card.leave = leave;
  card.stopRepeat = function () { if (C) C.hold = null; };
  /** @returns {string|null} the building id of the mounted card. */
  card.current = function () { return C ? C.id : null; };
  /** @returns {string[]} the open sub-screen ids of the card. */
  card.screens = function () { return C ? C.sub.ids() : []; };
  /** @returns {boolean} hold-to-repeat is running (tests). */
  card.repeating = function () { return !!(C && C.hold); };
  /**
   * @returns {{id: string, label: string, enabled: boolean, reason: string, hotkey: number,
   *   repeatable: boolean, chips: string[]}[]} the visible rows (SR.debug.ui)
   */
  card.rows = function () {
    if (!C) return [];
    return C.rows.map(function (r) {
      return {
        id: r.id, label: t(r.def.label || 'act.' + r.id), enabled: !!r.preview.ok,
        reason: r.preview.ok ? null : (r.preview.reason ? t(r.preview.reason, r.preview.vars) : null), hotkey: r.hotkey || null,
        repeatable: isRepeatable(r.def), variant: r.variant || null,
        chips: Array.prototype.map.call(r.el.querySelectorAll('.chip'), function (c) { return c.textContent; }),
      };
    });
  };

  /** @returns {object|null} the card for SR.debug.ui(): building, open sub-screens, rows, repeat state. */
  card.debug = function () {
    if (!C) return null;
    return { building: C.id, params: C.sceneParams.params, screens: C.sub.ids(), rows: card.rows(), repeating: !!C.hold,
      last: C.last ? C.last.id : null };
  };

  SR.ui.card = card;
  SR.ui.subhost = { create: createSubhost };
})();
