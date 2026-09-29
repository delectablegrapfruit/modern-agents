// js/core/text.js — owner: W1-K (lead). SR.text(key, vars): the text table lookup with {name}
// substitution and variants, plus the formatting helpers money, num, time, dur, pct
// (ARCHITECTURE §7.2; docs/CONTRACT.md §7). Keys are registered with SR.def.text({...}) by the
// js/data/text/en-*.js files. Pure: no DOM or browser API (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;
  var missing = [];

  /**
   * @param {string} key a text key ('act.mcsticks.fries')
   * @param {object=} vars {name} substitutions; vars.variant picks an entry of an array value
   * @returns {string} the text, or ⟦key⟧ when the key is missing (logged once)
   */
  function text(key, vars) {
    var reg = SR.reg.text;
    if (!hasOwn.call(reg, key)) {
      if (missing.indexOf(key) < 0) missing.push(key);
      SR.util.warnOnce('text:' + key, 'SR.text: missing key "' + key + '"');
      return '⟦' + key + '⟧';
    }
    var v = reg[key];
    if (Array.isArray(v)) {
      var n = v.length;
      var i = vars && vars.variant !== undefined && vars.variant !== null
        ? ((Math.floor(vars.variant) % n) + n) % n
        : SR.rng.fx.int(0, n - 1);
      v = v[i];
    }
    return SR.util.fmt(v, vars);
  }

  /** @returns {boolean} the key is registered. */
  text.has = function (key) { return hasOwn.call(SR.reg.text, key); };

  /** @returns {string[]} the missing keys looked up so far (for tests and the validator). */
  text.missing = function () { return missing.slice(); };

  /** @returns {string} n with thousands separators and `digits` decimals (default 0): 12,345.6 */
  function num(n, digits) {
    digits = digits || 0;
    if (typeof n !== 'number' || !isFinite(n)) return String(n);
    var s = Math.abs(n).toFixed(digits);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    s = parts.join('.');
    return n < 0 && /[1-9]/.test(s) ? '-' + s : s;
  }
  text.num = num;

  /**
   * Money as the UI shows it (UI.md §10): $1,240; -$20.
   * @param {number} n dollars
   * @param {{sign: boolean, cents: boolean, compact: boolean}=} opts sign: '+$20' for gains;
   *   cents: '$12.34'; compact: '$1.2M' from a million up (the HUD only)
   * @returns {string}
   */
  text.money = function (n, opts) {
    opts = opts || {};
    if (typeof n !== 'number' || !isFinite(n)) return '$?';
    var a = Math.abs(n), body;
    if (opts.compact && a >= 1e6) {
      var big = a >= 1e9 ? [a / 1e9, 'B'] : [a / 1e6, 'M'];
      body = big[0].toFixed(1).replace(/\.0$/, '') + big[1];
    } else {
      body = num(opts.cents ? a : Math.round(a), opts.cents ? 2 : 0);
    }
    var zero = !/[1-9]/.test(body);
    var sign = zero ? '' : n < 0 ? '-' : opts.sign ? '+' : '';
    return sign + '$' + body;
  };

  /**
   * A clock time: '14:30' (24 h) or '2:30 PM'. 1440 reads '24:00' (the wall).
   * @param {number} min minutes since midnight
   * @param {boolean=} h12 12-hour format; default: the setting game.clock24 (24 h if unavailable)
   * @returns {string}
   */
  text.time = function (min, h12) {
    if (h12 === undefined) {
      h12 = !!(SR.settings && typeof SR.settings.get === 'function' && SR.settings.get('game.clock24') === false);
    }
    var m = Math.round(min);
    if (m !== 1440) m = ((m % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60), mm = SR.util.pad(m % 60, 2);
    if (!h12) return SR.util.pad(h, 2) + ':' + mm;
    var h24 = h % 24;
    return (h24 % 12 === 0 ? 12 : h24 % 12) + ':' + mm + ' ' + (h24 < 12 ? 'AM' : 'PM');
  };

  /** @returns {string} a duration: '30m', '2h', '1h 30m' ('rest of day' is a text key). */
  text.dur = function (min) {
    var m = Math.max(0, Math.round(min)), h = Math.floor(m / 60), r = m % 60;
    if (h && r) return h + 'h ' + r + 'm';
    return h ? h + 'h' : r + 'm';
  };

  /** @returns {string} a probability 0..1 as a percentage: '62 %' (digits decimals, default 0). */
  text.pct = function (p, digits) { return num(p * 100, digits || 0) + ' %'; };

  SR.text = text;
})();
