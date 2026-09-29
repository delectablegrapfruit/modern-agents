// js/boot/events.js — owner: W1-K (lead). SR.events: the synchronous event bus (ARCHITECTURE §13;
// the rule events of §6.8 and the UI events of §13 are listed in docs/CONTRACT.md §9).
// Listeners must not throw: errors are caught, logged and kept in SR.events.errors.
// Pure: no DOM or browser API (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;
  var map = {};          // name -> [fn, ...]
  var MAX_ERRORS = 50;

  function list(name) { return hasOwn.call(map, name) ? map[name] : null; }

  /**
   * Subscribes fn(payload, name) to name ('*' receives every event).
   * @returns {function()} a function that unsubscribes
   */
  function on(name, fn) {
    if (typeof fn !== 'function') throw new Error('SR.events.on("' + name + '"): fn must be a function');
    var l = list(name) || (map[name] = []);
    l.push(fn);
    return function () { off(name, fn); };
  }

  /** Removes fn (or a once() wrapper of fn) from name. */
  function off(name, fn) {
    var l = list(name);
    if (!l) return;
    for (var i = l.length - 1; i >= 0; i--) {
      if (l[i] === fn || l[i]._once === fn) { l.splice(i, 1); break; }
    }
  }

  /** Subscribes fn for the next emit of name only. @returns {function()} unsubscribe */
  function once(name, fn) {
    var w = function (payload, n) { off(name, w); return fn(payload, n); };
    w._once = fn;
    return on(name, w);
  }

  function call(fn, payload, name, l) {
    // A listener removed by an earlier listener of the same emit is skipped.
    if (l.indexOf(fn) < 0) return false;
    try {
      fn(payload, name);
    } catch (e) {
      SR.events.errors.push({ name: name, error: e });
      if (SR.events.errors.length > MAX_ERRORS) SR.events.errors.shift();
      if (typeof console !== 'undefined' && console.error) console.error('SR.events: a listener of "' + name + '" threw', e);
    }
    return true;
  }

  /**
   * Calls every listener of name, then every '*' listener, synchronously and in subscription order.
   * @returns {number} the number of listeners called
   */
  function emit(name, payload) {
    var n = 0, l = list(name), star = name === '*' ? null : list('*');
    if (l) l.slice().forEach(function (fn) { if (call(fn, payload, name, l)) n++; });
    if (star) star.slice().forEach(function (fn) { if (call(fn, payload, name, star)) n++; });
    return n;
  }

  /** @returns {number} the number of listeners of name. */
  function count(name) { var l = list(name); return l ? l.length : 0; }

  SR.events = { on: on, off: off, once: once, emit: emit, count: count, errors: [] };
})();
