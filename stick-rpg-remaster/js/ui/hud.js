// js/ui/hud.js — owner: W1-D. SR.ui.hud: the city HUD in the 3-row layout of UI.md §4.1 and the
// compact strip of §4.2 (buildings), bound to events (ARCHITECTURE §13) and written in one
// batched pass per frame by flush() (the loop calls it, CONTRACT D30). Also the ghost deltas of
// UI.md §1.1 (hovering or focusing a row previews its trade on the HUD) and the chip targets of
// the feedback of UI.md §4.3.
// Load-time rule: defines functions only.
(function () {
  'use strict';
  var SR = window.SR;

  var COUNT_MS = 400;          // the cash counter (UI.md §4.1)
  var MINIMAL_SHOW_MS = 3000;  // the minimal HUD shows in full for 3 s after a change (UI.md §4.1)
  // Fallbacks only while js/data/tuning.js is a stub: B-11d `crime.police.posters` (Wanted at
  // Heat ≥ 50) and B-03 `training.winded.threshold` (Winded while HP < 25 % of HP max).
  var WANTED_HEAT = 50;
  var WINDED_FRAC = 0.25;
  function wantedAt() {
    var p = SR.tuning && SR.tuning.crime && SR.tuning.crime.police;
    return p && typeof p.posters === 'number' ? p.posters : WANTED_HEAT;
  }
  var EVENTS = ['stat:changed', 'money:changed', 'time:advanced', 'karma:changed', 'heat:changed', 'buzz:changed',
    'item:changed', 'job:changed', 'home:changed', 'day:started', 'action:done', 'weather:changed', 'perk:chosen',
    'settings:changed', 'election:changed'];

  var ui = null;               // the mounted HUD: { root, el, parts..., last: {} }
  var dirty = false;
  var rafPending = false;
  var unsubs = [];
  var cash = { shown: null, from: 0, to: 0, t0: 0 };
  var minimalUntil = 0;

  function D() { return SR.ui.dom; }
  function t(k, v) { return D().t(k, v); }

  function loopDrives() { return !!(SR.loop && typeof SR.loop.step === 'function'); }
  function schedule() {
    dirty = true;
    if (loopDrives() || rafPending || typeof requestAnimationFrame !== 'function') return;
    rafPending = true;
    requestAnimationFrame(function () { rafPending = false; flush(); });
  }

  // ---- reading the state (display only; rules stay the source) ----
  function weekday(s) {
    if (SR.rules.time && typeof SR.rules.time.weekday === 'function') {
      try { var w = SR.rules.time.weekday(s); if (typeof w === 'number') return w; } catch (e) { /* stub-era */ }
    }
    return ((s.clock.day - 1) % 7 + 7) % 7;
  }
  function jobTitle(s) {
    var v = null;
    if (SR.rules.jobs && typeof SR.rules.jobs.bestTitle === 'function') {
      try { v = SR.rules.jobs.bestTitle(s); } catch (e) { v = null; }
    }
    if (v && typeof v === 'object') v = v.key || v.id || null;
    if (!v && s.job && s.job.ranks) v = s.job.ranks.nli || s.job.ranks.mcsticks || null;
    if (!v) return t('hud.noJob');
    v = String(v);
    if (/\./.test(v)) return t(v);
    return SR.text.has('job.' + v) ? SR.text('job.' + v) : SR.text.has('job.' + v + '.title') ? SR.text('job.' + v + '.title') : v;
  }
  function winded(s) {
    if (SR.rules.stats && typeof SR.rules.stats.winded === 'function') {
      try { return !!SR.rules.stats.winded(s); } catch (e) { /* stub-era */ }
    }
    var tr = SR.tuning && SR.tuning.training && SR.tuning.training.winded;
    var frac = tr && typeof tr.threshold === 'number' ? tr.threshold : WINDED_FRAC;
    return s.stats.hp < s.stats.hpMax * frac;
  }

  // ---- building the DOM ----
  function build(root, opts) {
    var h = D().h;
    var p = {};
    p.karma = SR.ui.karmaMedallion({ id: 'hud-karma', karma: 0, size: 48 });
    p.name = h('span', { class: 'hud-name', 'data-id': 'hud-name' });
    p.job = h('span', { class: 'hud-job t-small', 'data-id': 'hud-job' });
    p.badges = h('span', { class: 'hud-badges', 'data-id': 'hud-badges' });
    p.hp = SR.ui.meter({ id: 'hud-hp', kind: 'hp', value: 0, max: 1 });
    p.stats = {};
    var statRow = h('span', { class: 'hud-stats' });
    SR.ui.STATS.forEach(function (k) { p.stats[k] = SR.ui.statChip({ id: 'hud-stat-' + k, stat: k, value: 0 }); statRow.appendChild(p.stats[k]); });
    p.clock = SR.ui.clockRing({ id: 'hud-clock', min: 480, size: 64 });
    p.time = h('span', { class: 'hud-time t-label', 'data-id': 'hud-time' });
    p.day = h('span', { class: 'hud-day t-small', 'data-id': 'hud-day' });
    p.weather = h('span', { class: 'hud-weather', 'data-id': 'hud-weather', tabindex: '-1' });
    p.cash = h('span', { class: 'hud-cash t-money', 'data-id': 'hud-cash' });
    p.cashGhost = h('span', { class: 'hud-ghost t-small', 'data-id': 'hud-cash-ghost', 'aria-hidden': 'true' });
    p.bank = h('span', { class: 'hud-bank t-small', 'data-id': 'hud-bank' });
    p.heat = SR.ui.meter({ id: 'hud-heat', kind: 'heat', value: 0, max: 100, w: 120 });
    p.heatWrap = h('span', { class: 'hud-heat' }, h('span', { class: 'hud-heat-k t-small' }, t('hud.heat')), p.heat);
    p.pocket = SR.ui.iconButton({ id: 'hud-pocket', label: 'hud.pocket', icon: 'pocket', hint: 'pocket', size: 's', nav: false,
      onClick: function () { openOverlay('pocket'); } });
    p.pause = SR.ui.iconButton({ id: 'hud-pause', label: 'hud.pause', icon: 'settings', size: 's', nav: false,
      onClick: function () { openOverlay('pause'); } });
    p.goal = h('div', { class: 'hud-goal paper', 'data-id': 'hud-goal', hidden: true });

    var el = h('div', { class: 'hud', 'data-id': 'hud', role: 'region', 'aria-label': t('hud.aria') },
      h('div', { class: 'hud-left paper' },
        p.karma,
        h('span', { class: 'hud-who' }, p.name, p.job, p.badges),
        h('span', { class: 'hud-vitals' }, p.hp, statRow)),
      h('div', { class: 'hud-centre paper' }, p.clock, h('span', { class: 'hud-when' }, p.time, h('span', { class: 'hud-dayline' }, p.day, p.weather))),
      h('div', { class: 'hud-right paper' },
        h('span', { class: 'hud-money' }, h('span', { class: 'hud-cashline' }, p.cash, p.cashGhost), p.bank, p.heatWrap),
        h('span', { class: 'hud-buttons' }, p.pocket, p.pause)),
      p.goal);
    root.appendChild(el);
    return { root: root, el: el, p: p, last: {} };
  }

  function openOverlay(id, params) {
    if (!SR.reg.scene[id]) { D().refuse(null); return; }
    var top = SR.scenes.top();
    if (top && top.id === id) return;
    SR.scenes.push(id, params);
  }

  // ---- writing (flush) ----
  function set(key, v, fn) {
    if (ui.last[key] === v) return;
    ui.last[key] = v;
    fn(v);
  }

  function flushCash(target) {
    var p = ui.p;
    var nowMs = D().now();
    if (cash.shown === null || D().reduced()) { cash.shown = target; cash.to = target; }
    else if (target !== cash.to) { cash.from = cash.shown; cash.to = target; cash.t0 = nowMs; }
    if (cash.shown !== cash.to) {
      var k = Math.min(1, (nowMs - cash.t0) / COUNT_MS);
      cash.shown = Math.round(cash.from + (cash.to - cash.from) * SR.util.easeOut(k));
      if (k < 1) dirty = true;
      if (k >= 1) cash.shown = cash.to;
      if (!loopDrives() && dirty) schedule();
    }
    var text = SR.text.money(cash.shown, { compact: true });
    set('cash', text, function (v) { p.cash.textContent = v; });
    set('cashAria', target, function (v) { p.cash.setAttribute('aria-label', t('hud.cashAria', { money: SR.text.money(v) })); });
  }

  /** Applies the pending HUD writes (called once per frame by the loop; D30). */
  function flush() {
    if (!ui) { dirty = false; return; }
    if (!dirty) return;
    dirty = false;
    var s = SR.state, p = ui.p;
    if (!s || !s.stats || !s.clock) {
      set('empty', true, function () { ui.el.classList.add('is-empty'); });
      return;
    }
    set('empty', false, function () { ui.el.classList.remove('is-empty'); });
    var st = s.stats;
    set('name', (s.player && s.player.name) || '', function (v) { p.name.textContent = v; });
    set('job', jobTitle(s), function (v) { p.job.textContent = v; });
    set('karma', st.karma, function (v) { p.karma.update({ karma: v }); });
    set('hp', st.hp + '/' + st.hpMax, function () { p.hp.update({ value: st.hp, max: st.hpMax }); });
    SR.ui.STATS.forEach(function (k) { set('stat.' + k, st[k], function (v) { p.stats[k].update({ value: v }); }); });
    set('clock', s.clock.min, function (v) {
      var prev = ui.last.clockShown;
      ui.last.clockShown = v;
      p.clock.update({ min: v, animate: prev !== undefined && v > prev && s.clock.day === ui.last.clockDay });
    });
    ui.last.clockDay = s.clock.day;
    set('time', s.clock.min >= 1440 ? SR.text.time(s.clock.min) + ' ' + t('hud.late') : SR.text.time(s.clock.min), function (v) {
      p.time.textContent = v;
      ui.el.classList.toggle('is-late', s.clock.min >= 1440);
    });
    var len = s.mode ? s.mode.length : 0;
    var dayText = t(len ? 'hud.day' : 'hud.dayUnlimited', { weekday: t('hud.weekday.' + weekday(s)), day: s.clock.day, length: len });
    set('day', dayText, function (v) { p.day.textContent = v; });
    var wx = SR.features && SR.features.weather && s.world ? s.world.weather : null;
    set('weather', wx ? wx + '|' + (s.daily && s.daily.forecastSeen ? s.world.forecast : '') : '', function () {
      D().clear(p.weather);
      p.weather.hidden = !wx;
      if (!wx) return;
      p.weather.appendChild(D().icon(wx, 20));
      var tip = s.daily && s.daily.forecastSeen ? t('hud.forecast', { weather: t('hud.weather.' + s.world.forecast) }) : t('hud.forecastUnknown');
      p.weather.setAttribute('aria-label', t('hud.weather.' + wx) + '. ' + tip);
      p.weather.setAttribute('data-tip', tip);
      if (!p.weather._tip) p.weather._tip = SR.ui.tooltip(p.weather, function () { return p.weather.getAttribute('data-tip'); });
    });
    flushCash(s.money ? s.money.cash : 0);
    set('bank', s.money ? s.money.bank : 0, function (v) { p.bank.textContent = t('hud.bank', { money: SR.text.money(v, { compact: true }) }); });
    var heat = st.heat || 0;
    set('heat', heat, function (v) { p.heatWrap.hidden = !(v > 0); p.heat.update({ value: v }); });
    var badges = [];
    if (winded(s)) badges.push({ key: 'hud.winded', kind: 'warn' });
    if (st.buzz > 0) badges.push({ key: 'hud.tipsy', vars: { n: st.buzz }, kind: 'info' });
    if (heat >= wantedAt()) badges.push({ key: 'hud.wanted', kind: 'danger' });
    set('badges', JSON.stringify(badges), function () {
      D().clear(p.badges);
      badges.forEach(function (b) { p.badges.appendChild(SR.ui.badge({ text: t(b.key, b.vars), kind: b.kind })); });
    });
    flushGoal(s);
    if (ui.minimal) {
      var showFull = D().now() < minimalUntil;
      ui.el.classList.toggle('is-minimal', !showFull);
      if (showFull) schedule();
    }
  }

  function flushGoal(s) {
    var p = ui.p;
    var goal = null;
    if (!ui.compact && SR.features && SR.features.advisor && SR.rules.advisor && typeof SR.rules.advisor.goals === 'function') {
      try { goal = (SR.rules.advisor.goals(s) || [])[0] || null; } catch (e) { goal = null; }
    }
    set('goal', goal ? JSON.stringify(goal) : '', function () {
      D().clear(p.goal);
      p.goal.hidden = !goal;
      if (!goal) return;
      var pr = goal.progress;
      p.goal.appendChild(D().icon('achievement', 20));
      p.goal.appendChild(D().h('span', { class: 'hud-goal-text t-small' }, t(goal.key, goal.vars)));
      if (pr && typeof pr.value === 'number') p.goal.appendChild(SR.ui.progress({ value: pr.value, max: pr.max, showValue: true }));
      p.goal.onclick = function () { openOverlay('pocket', { tab: 'journal' }); };
    });
  }

  // ---- public API ----
  /**
   * Mounts the HUD into a scene's UI root and binds it to the events.
   * @param {HTMLElement} root the scene root (<div data-scene>)
   * @param {{compact: boolean, minimal: boolean}=} opts compact: the building strip (UI.md §4.2)
   * @returns {HTMLElement} the HUD element
   */
  function mount(root, opts) {
    opts = opts || {};
    unmount();
    ui = build(root, opts);
    ui.compact = false;
    ui.minimal = false;
    cash.shown = null;
    compact(!!opts.compact);
    minimal(opts.minimal !== undefined ? !!opts.minimal : !!D().setting('game.minimalHud'));
    EVENTS.forEach(function (name) {
      unsubs.push(SR.events.on(name, function (payload) {
        if (ui && ui.minimal && name !== 'settings:changed') minimalUntil = D().now() + MINIMAL_SHOW_MS;
        if (name === 'settings:changed' && payload && payload.key === 'game.minimalHud') minimal(!!payload.value);
        if (name === 'settings:changed' || name === 'day:started') ui.last = {};
        schedule();
      }));
    });
    dirty = true;
    flush();
    return ui.el;
  }

  /** Removes the HUD and its listeners. */
  function unmount() {
    unsubs.forEach(function (f) { f(); });
    unsubs = [];
    if (ui && ui.el.parentNode) ui.el.parentNode.removeChild(ui.el);
    ui = null;
  }

  /** Switches between the city HUD and the compact building strip. */
  function compact(on) {
    if (!ui) return false;
    ui.compact = !!on;
    ui.el.classList.toggle('is-compact', ui.compact);
    ui.last = {};
    schedule();
    return ui.compact;
  }

  /** Minimal HUD (H): only HP and the ClockRing until something changes (UI.md §4.1). */
  function minimal(on) {
    if (!ui) return false;
    ui.minimal = !!on;
    if (!ui.minimal) ui.el.classList.remove('is-minimal');
    minimalUntil = 0;
    schedule();
    return ui.minimal;
  }

  /**
   * Previews a row's trade on the HUD (UI.md §1.1): HP, cash, the clock and stat ghosts.
   * @param {object|null} preview a Preview from SR.preview, or null to clear
   */
  function ghost(preview) {
    if (!ui) return;
    var p = ui.p, s = SR.state;
    var hp = 0, cashD = 0, min = 0, stats = {};
    if (preview && !preview.hidden && preview.ok !== false && s) {
      var c = preview.cost || {};
      hp -= c.hp || 0;
      cashD -= c.cash || 0;
      min += c.min || 0;
      (preview.gains || []).forEach(function (g) {
        if (g.kind === 'hp') hp += g.n || 0;
        else if (g.kind === 'cash') cashD += g.n || 0;
        else if (g.kind === 'stat') stats[g.key] = (stats[g.key] || 0) + (g.n || 0);
      });
    }
    p.hp.update({ ghost: hp && s ? Math.max(-s.stats.hp, Math.min(hp, s.stats.hpMax - s.stats.hp)) : 0 });
    p.clock.update({ ghost: min, animate: false });
    p.cashGhost.textContent = cashD ? SR.text.money(cashD, { sign: true }) : '';
    p.cashGhost.className = 'hud-ghost t-small' + (cashD < 0 ? ' is-loss' : cashD > 0 ? ' is-gain' : '');
    SR.ui.STATS.forEach(function (k) { p.stats[k].update({ ghost: stats[k] || 0 }); });
    ui.el.classList.toggle('has-ghost', !!(hp || cashD || min));
  }

  /**
   * The HUD element a gain or cost chip flies to (UI.md §4.3).
   * @param {string} kind a Delta kind ('cash', 'bank', 'hp', 'stat', 'time', 'karma', 'heat', 'item')
   * @param {string=} key the stat key for 'stat'
   * @returns {HTMLElement|null}
   */
  function target(kind, key) {
    if (!ui) return null;
    var p = ui.p;
    switch (kind) {
      case 'cash': case 'money': return p.cash;
      case 'bank': case 'lien': return ui.compact ? p.cash : p.bank;
      case 'hp': case 'hpMax': return p.hp;
      case 'stat': return ui.compact ? p.hp : p.stats[key] || null;
      case 'time': return p.clock;
      case 'karma': return ui.compact ? p.hp : p.karma;
      case 'heat': return ui.compact ? p.cash : p.heatWrap;
      default: return p.pocket;
    }
  }

  /** Pulses a HUD counter (stat chips pulse on gains by themselves). */
  function pulse(kind, key) {
    var el = target(kind, key);
    if (!el || D().reduced()) return;
    el.classList.remove('is-pulse');
    void el.offsetWidth;
    el.classList.add('is-pulse');
  }

  SR.ui.hud = {
    mount: mount,
    unmount: unmount,
    compact: compact,
    flush: flush,
    minimal: minimal,
    ghost: ghost,
    target: target,
    pulse: pulse,
    /** Marks the HUD for a rewrite at the next flush. */
    invalidate: function () { if (ui) ui.last = {}; schedule(); },
    /** @returns {HTMLElement|null} the mounted HUD element. */
    el: function () { return ui ? ui.el : null; },
  };
})();
