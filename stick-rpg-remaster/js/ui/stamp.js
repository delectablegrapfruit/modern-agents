// js/ui/stamp.js — owner: W1-D. SR.ui.stamp: the rubber Stamp (UI.md §2.3; ART_AUDIO §11-§12):
// a word in display 64-96 in a double-outlined rounded rectangle, rotated -8°, inked at 85 %;
// it scales 1.4 → 1 with --ease-spring in 250 ms, thuds, jolts the stage 4 px and stays 900 ms.
// Stamps queue and never overlap; any click, confirm or back skips the current one. Reduced
// Motion shows it without the scale. The remaster's version of the original's "…INCREASED!!!".
// Load-time rule: defines functions only; the input listener is added in a prio-50 hook.
(function () {
  'use strict';
  var SR = window.SR;

  var IN_MS = 250;            // UI.md §2.3
  var HOLD_MS = 900;
  var OUT_MS = 150;
  var SWALLOW_MS = 250;       // input that skips a stamp does nothing else for this long
  var queue = [];
  var cur = null;             // { el, timer, o, at }
  var skippedAt = -1e9;

  function D() { return SR.ui.dom; }

  // The stinger a stamp plays, by its text key (ART_AUDIO §13.4; docs/requests/W2-Music.md 1 and
  // W2-Transit.md 7): a promotion's brass fanfare carries the leitmotif; a degree, FLATLINED and
  // BOOKED have their own scene stingers (the transcript's organ, the dirge, the jail sting), so
  // their stamps only thud; everything else plays the level-up triad. The first match wins; an
  // explicit o.sting (false, or a stinger id) overrides the table.
  var STINGERS = [
    [/^stamp\.jobs\.hired$/, 'stamp'],
    [/^stamp\.jobs\./, 'promotion'],
    [/^stamp\.training\./, null],
    [/^stamp\.hospital\.flatlined$/, null],
    [/^stamp\.crime\.jailed$/, null],
  ];
  /** @returns {string|null} the stinger id for a stamp (without 'stingers.'), or null for none. */
  function stingerFor(o) {
    if (o.sting === false || o.sting === null) return null;
    if (typeof o.sting === 'string') return o.sting;
    var key = typeof o.key === 'string' ? o.key : '';
    for (var i = 0; i < STINGERS.length; i++) if (STINGERS[i][0].test(key)) return STINGERS[i][1];
    return 'stamp';
  }
  function playStinger(o) {
    var id = stingerFor(o);
    var songs = SR.reg.song || {};
    if (id && !songs['stingers.' + id] && id !== 'stamp') id = 'stamp';   // a missing fanfare falls back to the triad
    if (!id || !songs['stingers.' + id] || !SR.audio || typeof SR.audio.stinger !== 'function') return null;
    try { SR.audio.stinger(id); } catch (e) { SR.util.warnOnce('ui.stamp.stinger', 'SR.ui.stamp: stinger failed: ' + e.message); }
    return id;
  }

  function build(o) {
    var text = o.text !== undefined ? D().t(o.text, o.vars) : D().t(o.key, o.vars);
    var size = o.size || (text.length > 14 ? 64 : 96);
    var el = D().h('div', { class: ['stamp', 'stamp--' + (o.kind || 'ink')], 'data-id': o.id || 'stamp', role: 'status',
      style: { '--stamp-fs': size + 'px' } },
    D().h('span', { class: 'stamp-word' }, text));
    el.stampText = text;
    return el;
  }

  function finish() {
    if (!cur) return;
    var c = cur;
    cur = null;
    if (c.timer) clearTimeout(c.timer);
    var el = c.el;
    if (D().reduced()) { if (el.parentNode) el.parentNode.removeChild(el); next(); return; }
    el.classList.add('is-leaving');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); next(); }, OUT_MS);
  }

  function next() {
    if (cur || !queue.length) return;
    var o = queue.shift();
    var el = build(o);
    var layer = D().layer('stamp');
    layer.appendChild(el);
    cur = { el: el, o: o, timer: 0, at: D().now() };
    D().announce(el.stampText);
    // The thud (W1-S's `stamp` recipe; `confirm`, the ink-stamp click, until it exists), the
    // stamp's stinger (the table above; registered stingers only), and the 4 px paper jolt (W1-G).
    if (!D().sfx('stamp')) D().sfx('confirm');
    cur.stinger = playStinger(o);
    if (SR.render && SR.render.fx && typeof SR.render.fx.jolt === 'function' && !D().reduced()) {
      try { SR.render.fx.jolt(); } catch (e2) { /* render core not landed */ }
    }
    D().haptic(30);
    var hold = D().fast() ? 0 : (D().reduced() ? 0 : IN_MS) + HOLD_MS;
    cur.timer = setTimeout(finish, hold);
    el.addEventListener('pointerdown', function () { skip(); });
  }

  // One key fires several actions (Enter: interact and confirm). The press that skips a stamp
  // is consumed for every action it fires, so it never also reaches the scene.
  var SKIP_ACTIONS = { confirm: 1, back: 1, interact: 1 };
  var skipCode = null;
  function onInput(ev) {
    if (!ev || !SKIP_ACTIONS[ev.action] || ev.down === false || ev.repeat) return;
    if (cur) {
      if (D().now() - cur.at < 120) return;       // the very press that raised the stamp
      skipCode = ev.code || '(inject)';
      skip();
      ev.consumed = true;
    } else if (skipCode && (ev.code || '(inject)') === skipCode && D().now() - skippedAt < 60) {
      ev.consumed = true;
    }
  }

  /**
   * Queues a stamp. @param {{key: string, vars: object, text: string, kind: string, size: number,
   * id: string, static: boolean, stat: boolean, sting: (boolean|string)}} o kind: ink | str | int |
   * cha | money | hp | primary; static: return the element only (galleries); stat: a stat-gain stamp
   * (see busy); key: the text key (also picks the stinger, even when text is given); sting: false
   * lands it without a stinger, a stinger id ('promotion') plays that one
   * @returns {HTMLElement|null} the element when static
   */
  function stamp(o) {
    o = o || {};
    if (o.static) { var el = build(o); el.classList.add('is-static'); return el; }
    queue.push(o);
    next();
    return null;
  }
  /**
   * @param {{ignoreStat: boolean}=} opts ignoreStat: stat-gain stamps do not count
   * @returns {boolean} a stamp is showing or queued (hold-to-repeat stops at stamps)
   */
  stamp.busy = function (opts) {
    if (opts && opts.ignoreStat) {
      return !!(cur && !cur.o.stat) || queue.some(function (o) { return !o.stat; });
    }
    return !!cur || queue.length > 0;
  };
  function skip() { if (!cur) return false; skippedAt = D().now(); finish(); return true; }
  /** Skips the current stamp. @returns {boolean} one was showing */
  stamp.skip = skip;
  /**
   * For scenes: true while a stamp shows or was just skipped by input, so the press that skips a
   * stamp is not also taken as a row activation. Skips the showing stamp.
   * @returns {boolean} the scene should swallow this press
   */
  stamp.swallow = function () {
    if (cur) { skip(); return true; }
    return D().now() - skippedAt < SWALLOW_MS;
  };
  /** Drops the queue and the current stamp. */
  stamp.clear = function () { queue.length = 0; finish(); };
  /** @returns {string|null} the current stamp's text (tests, SR.debug.ui). */
  stamp.current = function () { return cur ? cur.el.stampText : null; };
  /** @returns {string|null} the stinger the current stamp played (tests), or null. */
  stamp.stinger = function () { return cur ? cur.stinger || null : null; };
  /** @returns {string|null} the stinger a stamp with these options would play (before registration checks). */
  stamp.stingerFor = function (o) { return stingerFor(o || {}); };

  SR.ui.stamp = stamp;

  SR.onBoot(50, function () {
    if (typeof document === 'undefined') return;
    if (SR.input && typeof SR.input.on === 'function') SR.input.on('*', onInput);
  });
})();
