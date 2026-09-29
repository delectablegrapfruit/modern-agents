// js/minigames/framework.js — owner: W1-M. The minigame framework (ARCHITECTURE §10; CONTRACT §13):
// SR.minigame.run (engine or skin ids, D29), skin resolution (SR.def.skin), Auto sampling, forced
// results for tests, the stat-check helpers every engine shares, glyphs for key hints, and the
// Hardcore `pending` hook (ARCHITECTURE §15). The frame itself (UI §5.8) is the 'minigame' scene
// in js/scenes/minigame.js, which builds the `host` each engine's create(host, params) receives.
//
// Engine definition (SR.minigame.register(id, def); CONTRACT §13 plus the optional W1-M fields):
//   title        text key of the frame title
//   music        song id to switch to while open (omitted: the building's song keeps playing)
//   keys         the input context map { action: [bindings] }, pushed by the frame on open
//   context      the context's name (default: the engine id; CONTRACT §12.3)
//   create(host, params) → { update(dt), render(ctx), onAction(action, ev), destroy(),
//                            pointer?(kind, x, y, ev)   'down'|'move'|'up', play-area units
//                            auto?(rng) → result        Auto from the current position
//                            replay?(result)            animate an Auto result (≤ 2 s)
//                            progress?() → object       what forfeit() needs
//                            peek?() → object }         test introspection
//   auto(state, params, rng) → result   a SAMPLED outcome with real draws (omitted: no Auto)
//   worst(params) → result              the loss that Hardcore's pending hook stores
//   forfeit(params, progress) → result  the result of leaving early (default: worst)
//   summary(result, text) → string      one line for the result banner and #aria
//   assist        false hides the Assist toggle (default true)
//   confirmExit   true: Exit always asks (otherwise only with a live stake)
//   stake         true: every round is stake-bearing (Hardcore pending)
//
// Skin definition (SR.def.skin(id, def); ARCHITECTURE §10): { engine, params, art, text, auto,
//   context?, stake? }. `params` is an object or fn(state, runParams) → object (so a skin can read
//   SR.tuning when it opens); run params override it. `text.title` / `text.subtitle` name the frame
//   title. `auto`: a policy fn(state, params, rng) replacing the engine's, or false for no Auto.
//   `context` names the input context (default: the engine's `context`, else the engine id, as
//   CONTRACT §12.3 says; Shift Rush's is `orderup`, the context §12.3 names for its keys).
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;

  // GDD §4.3 stat check bounds, used only until js/rules/check.js lands (then its chance() is used,
  // with the B-28b modifiers). Kept here as named constants (BUILD_PLAN §1.7).
  var CHECK_MIN = 0.05;
  var CHECK_MAX = 0.95;

  var forced = [];       // results queued by force() (SR.debug.mg), consumed by the next run()
  var lastOpen = null;   // the last Result.open seen on action:done (its `resolve` id)
  var running = null;    // { L } of the run in progress (one minigame at a time)

  function clone(v) { return v === undefined ? undefined : SR.util.clone(v); }

  /**
   * Resolves an engine or skin id (CONTRACT §13, D29).
   * @param {string} id an engine id ('duel') or a skin id ('holdup')
   * @param {object=} params run params; params.skin may name a skin of that engine
   * @param {object=} state the state a skin's params fn reads (default SR.state)
   * @returns {{id: string, def: object, skinId: (string|null), skin: (object|null), params: object}|null}
   */
  function lookup(id, params, state) {
    params = params || {};
    var engineId = null, skinId = null;
    if (hasOwn.call(SR.reg.skin, id)) {
      skinId = id;
      engineId = SR.reg.skin[id].engine;
    } else if (hasOwn.call(SR.reg.minigame, id)) {
      engineId = id;
      var ps = params.skin;
      if (typeof ps === 'string' && hasOwn.call(SR.reg.skin, ps) && SR.reg.skin[ps].engine === id) skinId = ps;
    }
    if (!engineId || !hasOwn.call(SR.reg.minigame, engineId)) return null;
    var skin = skinId ? SR.reg.skin[skinId] : null;
    var base = {};
    if (skin && skin.params) {
      base = typeof skin.params === 'function' ? skin.params(state || SR.state, params) || {} : clone(skin.params);
    }
    var merged = Object.assign(base, clone(params) || {});
    merged.skin = skinId;
    return { id: engineId, def: SR.reg.minigame[engineId], skinId: skinId, skin: skin, params: merged };
  }

  /** @returns {function|null} the Auto policy of a lookup: the skin's, else the engine's; null = no Auto. */
  function autoPolicy(L) {
    if (L.skin && L.skin.auto === false) return null;
    if (L.skin && typeof L.skin.auto === 'function') return L.skin.auto;
    return typeof L.def.auto === 'function' ? L.def.auto : null;
  }

  /**
   * Plays a whole round with the Auto policy and real draws (ARCHITECTURE §10), without the frame.
   * @param {string} id engine or skin id
   * @param {object=} params run params
   * @param {object=} rng a stream (default SR.rng.rules)
   * @param {object=} state the state the policy reads (default SR.state)
   * @returns {object|null} the sampled result, or null when the game has no Auto (roulette)
   */
  function auto(id, params, rng, state) {
    var L = lookup(id, params, state);
    if (!L) throw new Error('SR.minigame.auto: unknown engine or skin "' + id + '"');
    var fn = autoPolicy(L);
    return fn ? fn(state || SR.state || {}, L.params, rng || SR.rng.rules) : null;
  }

  /** @returns {boolean} the round risks a stake (fights, robberies, casino rounds; ARCHITECTURE §10). */
  function isStake(L) {
    return !!(L.params.stake || (L.skin && L.skin.stake) || L.def.stake === true);
  }

  /** @returns {object|null} the engine's loss result for these params. */
  function worst(L) {
    return typeof L.def.worst === 'function' ? L.def.worst(L.params) : null;
  }

  /** @returns {object|null} the result of leaving early (the engine's forfeit, else its worst). */
  function forfeit(L, progress) {
    if (typeof L.def.forfeit === 'function') return L.def.forfeit(L.params, progress || null);
    return worst(L);
  }

  /**
   * The Hardcore pending hook (ARCHITECTURE §10, §15): before a stake-bearing round opens, store
   * { resolve, worst } in the state and ask the save module to write the ironman slot, so closing
   * the tab mid-round counts as the loss.
   * @returns {{s: object, p: object}|null} the state and the `pending` object it got (pendingEnd)
   */
  function pendingBegin(L, id) {
    var s = SR.state;
    if (!s || !s.mode || s.mode.difficulty !== 'hardcore' || !isStake(L)) return null;
    var resolve = L.params.resolve || null;
    if (!resolve && lastOpen && (lastOpen.minigame === id || lastOpen.skin === id)) resolve = lastOpen.resolve || null;
    var p = { resolve: resolve, worst: worst(L) };
    s.pending = p;
    if (SR.save && typeof SR.save.write === 'function') {
      try { SR.save.write('ironman'); } catch (e) { if (typeof console !== 'undefined') console.error('SR.minigame: ironman write failed', e); }
    }
    return { s: s, p: p };
  }

  /** Clears this run's `pending` only (a round opened right after may have set its own). */
  function pendingEnd(pend) {
    if (pend && pend.s.pending === pend.p) pend.s.pending = null;
  }

  function emitDone(L, result) {
    SR.events.emit('minigame:done', { id: L.id, skin: L.skinId, result: result });
  }

  /**
   * Opens a minigame in the frame (pushes the 'minigame' scene) and resolves with its result.
   * @param {string} id an engine id or a skin id (D29)
   * @param {object=} params run params (params.skin: a skin of the engine; params.auto: start in
   *   Auto; params.stake: the amount at stake, shown in the frame; params.resolve: the resolve
   *   action id for Hardcore's pending hook)
   * @returns {Promise<object>} the engine's result (ARCHITECTURE §10 shapes)
   */
  function run(id, params) {
    var L = lookup(id, params);
    if (!L) return Promise.reject(new Error('SR.minigame.run: unknown engine or skin "' + id + '"'));
    if (forced.length) {
      var r = forced.shift();
      lastOpen = null;
      emitDone(L, clone(r));
      return Promise.resolve(clone(r));
    }
    // One frame at a time. A frame that has closed but whose promise has not settled yet (a
    // microtask away) no longer counts, so a minigame:done listener may open the next round.
    if (running && SR.scenes.stack().indexOf('minigame') >= 0) {
      return Promise.reject(new Error('SR.minigame.run: "' + running.L.id + '" is already open'));
    }
    if (!SR.scenes || typeof SR.scenes.push !== 'function' || !SR.scenes.get('minigame')) {
      return Promise.reject(new Error('SR.minigame.run: the minigame scene is not registered'));
    }
    var mine = { L: L };
    running = mine;
    var pend = pendingBegin(L, id);
    lastOpen = null;
    return SR.scenes.push('minigame', { id: L.id, skin: L.skinId, params: L.params }).then(function (res) {
      if (running === mine) running = null;
      pendingEnd(pend);
      if (res !== undefined) return res;
      // A scene change that removed the frame (SR.scenes.go) counts as leaving the round; the
      // frame never reached its own close(), so minigame:done is emitted here (CONTRACT §9.2).
      var left = forfeit(L, null);
      emitDone(L, clone(left));
      return left;
    }, function (e) {
      if (running === mine) running = null;
      pendingEnd(pend);
      throw e;
    });
  }

  /** Queues a result that the next run() returns at once, without the frame (SR.debug.mg). */
  function force(result) {
    forced.push(clone(result));
    return forced.length;
  }

  /**
   * A stat check's success chance for display and rolls: SR.rules.check.chance (with the B-28b
   * modifiers) once it exists, else GDD §4.3's clamp(stat / (stat + D), 0.05, 0.95).
   * @param {number} stat
   * @param {number} D
   * @param {{s: object, checkId: string}=} opts
   * @returns {number} 0.05..0.95
   */
  function chance(stat, D, opts) {
    var chk = SR.rules && SR.rules.check;
    if (chk && typeof chk.chance === 'function') return chk.chance(stat, D, opts || {});
    stat = Math.max(0, +stat || 0);
    var p = stat / (stat + Math.max(1, +D || 0));
    return SR.util.clamp(p, CHECK_MIN, CHECK_MAX);
  }

  /** @returns {boolean} a roll against p with one draw from rng (SR.rules.check.roll when present). */
  function roll(rng, p) {
    var chk = SR.rules && SR.rules.check;
    if (chk && typeof chk.roll === 'function') return !!chk.roll(rng, p);
    return rng.chance(p);
  }

  /**
   * Reads a number (or value) from SR.tuning by dotted path, falling back to the engine's constant.
   * @param {string} path e.g. 'jobs.hustle.seconds'
   * @param {*} dflt the BALANCE value the engine uses when the table does not (yet) name the field
   * @returns {*}
   */
  function tune(path, dflt) {
    var v = SR.tuning;
    var parts = String(path).split('.');
    for (var i = 0; i < parts.length; i++) {
      if (v === null || v === undefined || typeof v !== 'object' || !hasOwn.call(v, parts[i])) return dflt;
      v = v[parts[i]];
    }
    return v !== undefined && v !== null && typeof v === typeof dflt ? v : dflt;
  }

  // Glyphs for binding codes (CONTRACT §12.1) when W1-D's KeyHint is not there: words come from
  // the `key.*` text keys of en-ui.js (never hard-coded English), arrows and signs are symbols,
  // and anything else shows the code minus its prefix ('Digit1' → '1', 'KeyH' → 'H').
  var SYMBOLS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Minus: '-', Equal: '+', NumpadAdd: '+', NumpadSubtract: '-' };
  var WORDS = {
    Enter: 'key.enter', NumpadEnter: 'key.enter', Space: 'key.space', Escape: 'key.esc', Backspace: 'key.backspace',
    Tab: 'key.tab', ShiftLeft: 'key.shift', ShiftRight: 'key.shift', Mouse0: 'key.mouseLeft', Mouse2: 'key.mouseRight',
    WheelUp: 'key.wheelUp', WheelDown: 'key.wheelDown',
  };

  /** @returns {string} a short glyph for a binding code ('Digit1' → '1', 'Pad0' → 'A'). */
  function glyph(code) {
    if (!code) return '';
    // W1-D's KeyHint glyphs (key.* strings in en-ui.js, Xbox or PlayStation style) once they exist.
    var kh = SR.ui && SR.ui.keyHint;
    var has = function (k) { return !!(SR.text && typeof SR.text.has === 'function' && SR.text.has(k)); };
    if (kh && typeof kh.glyph === 'function' && has('key.enter') && has('key.pad.xbox.0')) return kh.glyph(code);
    if (hasOwn.call(SYMBOLS, code)) return SYMBOLS[code];
    if (hasOwn.call(WORDS, code) && has(WORDS[code])) return SR.text(WORDS[code]);
    var pad = /^Pad(\d+)$/.exec(code);
    if (pad && has('key.pad.xbox.' + pad[1])) return SR.text('key.pad.xbox.' + pad[1]);
    var m = /^(?:Digit|Numpad|Key)(.+)$/.exec(code);
    return m ? m[1] : code;
  }

  // Default bindings of the global actions (CONTRACT §12.1), for key-hint glyphs only when
  // SR.input.bindings is not available yet. Input itself always goes through SR.input.
  var GLOBAL_HINTS = {
    confirm: ['Enter', 'Pad0'], back: ['Escape', 'Pad1'], pause: ['Escape', 'Pad9'],
    up: ['ArrowUp', 'Pad12'], down: ['ArrowDown', 'Pad13'], left: ['ArrowLeft', 'Pad14'], right: ['ArrowRight', 'Pad15'],
  };

  /**
   * @param {string} action an action name
   * @param {string|null} context the context it belongs to (null: global)
   * @param {object=} keys the context map (fallback when SR.input has no bindings())
   * @returns {string[]} its binding codes
   */
  function bindings(action, context, keys) {
    var inp = SR.input;
    if (inp && typeof inp.bindings === 'function') {
      try {
        var b = inp.bindings(action, context || undefined);
        if (b && b.length) return b.slice();
      } catch (e) { /* unknown action in this context: fall back */ }
    }
    if (keys && hasOwn.call(keys, action)) return keys[action].slice();
    return hasOwn.call(GLOBAL_HINTS, action) ? GLOBAL_HINTS[action].slice() : [];
  }

  // Remember the resolve action of the last Result that opened a minigame, so the Hardcore hook
  // knows it even though the building passes only the open params to run() (CONTRACT §13).
  SR.onBoot(50, function () {
    SR.events.on('action:done', function (p) {
      if (p && p.result && p.result.open) lastOpen = p.result.open;
    });
  });

  Object.assign(SR.minigame, {
    run: run,
    lookup: lookup,
    auto: auto,
    autoPolicy: autoPolicy,
    force: force,
    forfeit: forfeit,
    worst: worst,
    isStake: isStake,
    chance: chance,
    roll: roll,
    tune: tune,
    glyph: glyph,
    bindings: bindings,
    /** @returns {string[]} the registered engine ids. */
    engines: function () { return Object.keys(SR.reg.minigame); },
  });
})();
