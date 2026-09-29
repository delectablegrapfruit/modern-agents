// js/core/scenes.js — owner: W1-K (lead). SR.scenes: the scene stack (ARCHITECTURE §5;
// docs/CONTRACT.md §11). M0: the stack, overlays with promises, the deferred scene-change queue,
// per-frame dispatch, and the kernel's fallback 'boot' and 'title' stubs (used only while no
// file registers those ids). M1 adds transitions through SR.render.fx.
// SR.scenes.register is created by js/boot/namespace.js (load-time safe); this file adds the rest.
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;

  var stack = [];        // entries { id, def, params, root, resolve }
  var busy = false;
  var ops = [];          // operations requested while another one runs (run in order)
  var pending = null;    // { id, params } queued until the top of the stack is a base scene

  // The kernel's placeholders (M0). A registered scene with the same id always wins.
  var fallbacks = {
    boot: {
      id: 'boot', kind: 'base',
      enter: function () { SR.scenes.go('title'); },
    },
    title: {
      id: 'title', kind: 'base',
      ui: { mount: mountTitleStub, unmount: function () {} },
    },
  };

  function mountTitleStub(root) {
    var t = function (key, fallback) { return SR.text && SR.text.has(key) ? SR.text(key) : fallback; };
    var box = document.createElement('div');
    box.setAttribute('data-id', 'title-stub');
    box.style.padding = '24px';
    box.style.fontFamily = 'system-ui, sans-serif';
    var h = document.createElement('h1');
    h.setAttribute('data-id', 'title-stub-logo');
    h.textContent = t('game.title', 'PAPER SKY');
    box.appendChild(h);
    var tag = document.createElement('p');
    tag.textContent = t('game.tag', 'a Stick RPG fan remaster');
    box.appendChild(tag);
    if (SR.text && SR.text.has('ui.fanNote')) {
      var fan = document.createElement('p');
      fan.setAttribute('data-id', 'title-stub-fan');
      fan.textContent = SR.text('ui.fanNote');
      box.appendChild(fan);
    }
    var note = document.createElement('p');
    note.setAttribute('data-id', 'title-stub-note');
    note.textContent = 'Kernel title stub (W1-K M0). The title screen arrives with W2-Front.';
    box.appendChild(note);
    root.appendChild(box);
  }

  /** @returns {object|null} the scene def for id (registered first, then the kernel fallback). */
  function get(id) {
    if (hasOwn.call(SR.reg.scene, id)) return SR.reg.scene[id];
    if (hasOwn.call(fallbacks, id)) return fallbacks[id];
    return null;
  }

  function isOverlay(def) { return !!def && def.kind === 'overlay'; }
  function topEntry() { return stack.length ? stack[stack.length - 1] : null; }

  function invoke(obj, name, a, b) {
    if (!obj || typeof obj[name] !== 'function') return undefined;
    try {
      return obj[name](a, b);
    } catch (e) {
      if (typeof console !== 'undefined') console.error('SR.scenes: ' + name + '() threw', e);
      return undefined;
    }
  }

  function uiHost() { return typeof document !== 'undefined' ? document.getElementById('ui') : null; }

  function enter(e) {
    invoke(e.def, 'enter', e.params);
    var host = e.def.ui && typeof e.def.ui.mount === 'function' ? uiHost() : null;
    if (host) {
      e.root = document.createElement('div');
      e.root.setAttribute('data-scene', e.id);
      host.appendChild(e.root);
      invoke(e.def.ui, 'mount', e.root, e.params);
    }
    if (e.def.music && SR.audio && typeof SR.audio.music === 'function') SR.audio.music(e.def.music);
  }

  function leave(e) {
    if (e.root) {
      invoke(e.def.ui, 'unmount');
      if (e.root.parentNode) e.root.parentNode.removeChild(e.root);
      e.root = null;
    }
    invoke(e.def, 'exit');
  }

  function settle(e, result) {
    if (e.resolve) { var r = e.resolve; e.resolve = null; r(result); }
  }

  // Scene changes requested from inside enter/exit/pop run after the current change completes.
  function op(fn) {
    if (busy) { ops.push(fn); return; }
    busy = true;
    try {
      fn();
      while (ops.length) ops.shift()();
    } finally {
      busy = false;
      ops.length = 0;
    }
    flushPending();
  }

  function flushPending() {
    if (!pending || busy) return;
    var top = topEntry();
    if (top && isOverlay(top.def)) return;
    var p = pending;
    pending = null;
    go(p.id, p.params);
  }

  function unknown(fnName, id) {
    if (typeof console !== 'undefined') console.error('SR.scenes.' + fnName + ': unknown scene "' + id + '"');
  }

  /** Replaces the whole stack with scene id (base scenes). */
  function go(id, params) {
    op(function () {
      var def = get(id);
      if (!def) { unknown('go', id); return; }
      while (stack.length) { var e = stack.pop(); leave(e); settle(e, undefined); }
      var n = { id: id, def: def, params: params, root: null, resolve: null };
      stack.push(n);
      enter(n);
    });
  }

  /**
   * Pushes an overlay over the current scene (the one below gets pause()).
   * @returns {Promise<*>} resolved by pop(result), or with undefined if go() removes the scene
   */
  function push(id, params) {
    return new Promise(function (resolve) {
      op(function () {
        var def = get(id);
        if (!def) { unknown('push', id); resolve(undefined); return; }
        var top = topEntry();
        if (top) invoke(top.def, 'pause');
        var n = { id: id, def: def, params: params, root: null, resolve: resolve };
        stack.push(n);
        enter(n);
      });
    });
  }

  /** Pops the top scene, resolving its push() promise with result; the one below gets resume(). */
  function pop(result) {
    op(function () {
      var e = stack.pop();
      if (!e) return;
      leave(e);
      var top = topEntry();
      if (top) invoke(top.def, 'resume');
      settle(e, result);
    });
  }

  /** Replaces the top scene; a pending push() promise carries over to the new scene. */
  function replace(id, params) {
    op(function () {
      var def = get(id);
      if (!def) { unknown('replace', id); return; }
      var e = stack.pop();
      if (e) leave(e);
      var n = { id: id, def: def, params: params, root: null, resolve: e ? e.resolve : null };
      stack.push(n);
      enter(n);
    });
  }

  /**
   * The deferred scene change of ARCHITECTURE §5: go(id, params) as soon as the top of the stack
   * is a base scene (now, if it already is). A later call replaces a pending one.
   */
  function queue(id, params) {
    pending = { id: id, params: params };
    flushPending();
  }

  /** Fixed step: update top down, stopping below a scene that blocksUpdate. */
  function update(dt) {
    var list = stack.slice();
    for (var i = list.length - 1; i >= 0; i--) {
      invoke(list[i].def, 'update', dt);
      if (list[i].def.blocksUpdate) break;
    }
  }

  /** Per frame: render bottom up from the topmost scene that blocksRender (or the bottom). */
  function render(ctx, alpha) {
    var list = stack.slice(), from = 0;
    for (var i = list.length - 1; i >= 0; i--) if (list[i].def.blocksRender) { from = i; break; }
    for (var j = from; j < list.length; j++) invoke(list[j].def, 'render', ctx, alpha);
  }

  /** Sends an input action to the top scene's onAction. @returns {*} what onAction returned */
  function dispatch(action, ev) {
    var top = topEntry();
    return top ? invoke(top.def, 'onAction', action, ev) : undefined;
  }

  Object.assign(SR.scenes, {
    get: get,
    go: go,
    push: push,
    pop: pop,
    replace: replace,
    queue: queue,
    update: update,
    render: render,
    dispatch: dispatch,
    /** @returns {{id: string, def: object, params: *}|null} the top of the stack. */
    top: function () { var e = topEntry(); return e ? { id: e.id, def: e.def, params: e.params } : null; },
    /** @returns {string[]} the scene ids, bottom to top. */
    stack: function () { return stack.map(function (e) { return e.id; }); },
  });
})();
