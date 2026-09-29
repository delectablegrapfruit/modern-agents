// tests/sheets/components-fixtures.js — owner: W1-D. Test content and stand-ins for the W1-D
// contact sheet (tests/sheets/components.html) and e2e suites (tests/e2e/ui-kit.test.cjs,
// tests/e2e/card.test.cjs). Never loaded by index.html.
//   W1D.fakes()      installs a stand-in only where the real module is missing (CONTRACT D27):
//                    SR.preview / SR.act (a tiny rules subset), SR.settings, SR.state
//   W1D.content()    registers the test buildings `testshop` and `testbank`, their actions, the
//                    test sub-screens `test.form` and `test.child`, their text and the
//                    `test.gallery` scene (routes input actions to SR.ui.focus)
//   W1D.state()      a fresh fixture state (the v1 schema subset the UI reads)
//   W1D.step(n)      n fixed steps (SR.loop.step, or scenes.update + hud.flush without a loop)
//   W1D.log          sub-screen lifecycle calls, in order
(function () {
  'use strict';
  var SR = window.SR;
  var W1D = window.W1D = { log: [], fakeRules: false };

  // ------------------------------------------------------------------ fixture state
  W1D.state = function () {
    if (SR.rules && SR.rules.state && typeof SR.rules.state.create === 'function') {
      try {
        var s = SR.rules.state.create({ seed: 7, name: 'Rikki' });
        s.player.name = 'Rikki';
        return s;
      } catch (e) { /* fall back to the subset below */ }
    }
    return {
      v: 1, seed: 7, mode: { length: 40, difficulty: 'standard', tutorial: false },
      clock: { day: 12, min: 870, wake: 480 },
      player: { name: 'Rikki' },
      stats: { str: 12, int: 88, cha: 30, karma: 34, hp: 22, hpMax: 27, heat: 35, buzz: 2 },
      money: { cash: 1240, bank: 3000 },
      job: { ranks: { mcsticks: 'cook', nli: 'sales' } },
      items: { gum: 0, ammo: 3 },
      homes: { owned: ['apt'], living: 'apt' },
      world: { weather: 'rain', forecast: 'clear' },
      daily: { forecastSeen: false },
      flags: {}, msgs: [], log: { today: [], yesterday: [] },
    };
  };

  // ------------------------------------------------------------------ stand-ins (only where missing)
  function fakeRules() {
    // A tiny subset of the pipeline of ARCHITECTURE §6.2 for sheets that do not load js/rules:
    // requires (hpBelowMax, stat, cashAtLeast), cost (cash, min), effects (heal, cash, bank, stat,
    // karma, heat, item), the time wall, refusal reasons and the §8.7 events.
    function need(id, params) {
      var s = SR.state, def = SR.reg.action[id];
      if (!def) return { hidden: true };
      if (def.feature && !SR.features[def.feature]) return { hidden: true };
      if (def.hidden) return { hidden: true };
      var cost = { cash: (def.cost && def.cost.cash) || 0, min: (def.cost && def.cost.min) || 0, hp: 0, items: {} };
      var p = { id: id, ok: true, reason: null, vars: null, cost: cost, gains: [], chance: null, badges: [], hotkey: null,
        repeatable: !!def.repeatable, screen: def.screen || null, hidden: false };
      (def.requires || []).forEach(function (r) {
        if (!p.ok) return;
        if (r[0] === 'hpBelowMax' && s.stats.hp >= s.stats.hpMax) { p.ok = false; p.reason = 'test.reason.fullHp'; }
        if (r[0] === 'stat' && s.stats[r[1]] < r[2]) { p.ok = false; p.reason = 'test.reason.stat'; p.vars = { stat: r[1].toUpperCase(), n: r[2], have: s.stats[r[1]] }; }
      });
      if (def.screen) { p.cost = { cash: 0, min: 0, hp: 0, items: {} }; return p; }
      if (p.ok && cost.min && s.clock.min + cost.min > 1440) { p.ok = false; p.reason = 'test.reason.late'; }
      if (p.ok && cost.cash > s.money.cash) { p.ok = false; p.reason = 'test.reason.cash'; p.vars = { money: SR.text.money(cost.cash) }; }
      (def.effects || []).forEach(function (e) {
        if (e[0] === 'heal') { var n = Math.min(e[1], s.stats.hpMax - s.stats.hp); p.gains.push({ kind: 'hp', n: n, capped: n < e[1] }); }
        if (e[0] === 'cash') p.gains.push({ kind: 'cash', n: e[1] });
        if (e[0] === 'bank') p.gains.push({ kind: 'bank', n: e[1] });
        if (e[0] === 'stat') p.gains.push({ kind: 'stat', key: e[1], n: e[2] });
        if (e[0] === 'karma') p.gains.push({ kind: 'karma', n: e[1] });
        if (e[0] === 'heat') p.gains.push({ kind: 'heat', n: e[1] });
        if (e[0] === 'item') p.gains.push({ kind: 'item', key: e[1], n: e[2] });
      });
      return p;
    }
    SR.preview = function (id, params) { return need(id, params || {}); };
    SR.act = function (id, params) {
      var s = SR.state, def = SR.reg.action[id];
      var pv = need(id, params || {});
      var res = { ok: !!pv.ok && !pv.hidden, id: id, reason: pv.reason || (pv.hidden ? 'test.reason.hidden' : null), vars: pv.vars,
        deltas: [], msgs: [], toasts: [], stamps: [], sfx: [], anims: [], achievements: [], open: null, events: [], log: [],
        down: null, jailed: null, over: null };
      if (!res.ok) { SR.events.emit('action:done', { id: id, result: res }); return res; }
      function d(kind, key, from, to) { res.deltas.push({ kind: kind, key: key, n: to - from, from: from, to: to }); }
      if (pv.cost.cash) { d('cash', undefined, s.money.cash, s.money.cash - pv.cost.cash); s.money.cash -= pv.cost.cash; }
      if (pv.cost.min) { d('time', undefined, s.clock.min, s.clock.min + pv.cost.min); s.clock.min += pv.cost.min; }
      (def.effects || []).forEach(function (e) {
        if (e[0] === 'heal') { var h0 = s.stats.hp; s.stats.hp = Math.min(s.stats.hpMax, h0 + e[1]); d('hp', undefined, h0, s.stats.hp); }
        if (e[0] === 'cash') { var c0 = s.money.cash; s.money.cash += e[1]; d('cash', undefined, c0, s.money.cash); }
        if (e[0] === 'bank') { var b0 = s.money.bank; s.money.bank += e[1]; d('bank', undefined, b0, s.money.bank); }
        if (e[0] === 'stat') { var v0 = s.stats[e[1]]; s.stats[e[1]] += e[2]; d('stat', e[1], v0, s.stats[e[1]]); }
        if (e[0] === 'karma') { var k0 = s.stats.karma; s.stats.karma += e[1]; d('karma', undefined, k0, s.stats.karma); }
        if (e[0] === 'heat') { var t0 = s.stats.heat; s.stats.heat += e[1]; d('heat', undefined, t0, s.stats.heat); }
        if (e[0] === 'item') { var i0 = s.items[e[1]] || 0; s.items[e[1]] = i0 + e[2]; d('item', e[1], i0, s.items[e[1]]); }
        if (e[0] === 'toast') res.toasts.push({ key: e[1], vars: e[2], kind: 'reward' });
      });
      res.deltas.forEach(function (x) {
        if (x.kind === 'time') SR.events.emit('time:advanced', { from: x.from, to: x.to, reason: id });
        if (x.kind === 'cash' || x.kind === 'bank') SR.events.emit('money:changed', { cash: s.money.cash, bank: s.money.bank, delta: x.n, reason: id });
        if (x.kind === 'stat' || x.kind === 'hp') SR.events.emit('stat:changed', { key: x.key || 'hp', from: x.from, to: x.to, delta: x.n });
        if (x.kind === 'karma') SR.events.emit('karma:changed', { from: x.from, to: x.to });
      });
      SR.events.emit('action:done', { id: id, result: res });
      return res;
    };
    W1D.fakeRules = true;
  }

  function fakeSettings() {
    var data = {
      game: { clock24: true, holdRepeat: true, confirmSpendOver: 1000, alwaysAuto: false, minimalHud: false },
      access: { textScale: 1, highContrast: false, colorblind: 'none', reducedMotion: 'off', flashReduction: false,
        captions: true, typewriterCps: 60, haptics: false },
      controls: { keys: {}, pad: {}, contexts: {} },
    };
    SR.settings = {
      get: function (k) { var o = data; String(k).split('.').forEach(function (p) { o = o == null ? undefined : o[p]; }); return o; },
      set: function (k, v) {
        var parts = String(k).split('.'), o = data;
        for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
        o[parts[parts.length - 1]] = v;
        SR.events.emit('settings:changed', { key: k, value: v });
        return v;
      },
      all: function () { return JSON.parse(JSON.stringify(data)); },
    };
  }

  /** Installs stand-ins for the modules that are still missing. @returns {string[]} what it faked */
  W1D.fakes = function (opts) {
    opts = opts || {};
    var out = [];
    if (opts.rules === 'always' || typeof SR.preview !== 'function' || typeof SR.act !== 'function') { fakeRules(); out.push('rules'); }
    if (!SR.settings || typeof SR.settings.get !== 'function') { fakeSettings(); out.push('settings'); }
    if (!SR.state) { SR.state = W1D.state(); out.push('state'); }
    return out;
  };

  // ------------------------------------------------------------------ test content
  var registered = false;
  W1D.content = function () {
    if (registered) return;
    registered = true;
    SR.def.text({
      'test.reason.fullHp': 'Full HP',
      'test.reason.stat': 'Need {stat} {n} (you: {have})',
      'test.reason.cash': 'Need {money}',
      'test.reason.late': 'Ends after midnight',
      'test.reason.hidden': 'Not here',
      'test.confirmRob': 'Rob the till? The whole block will hear about it.',
      'test.sub.form': 'Ledger',
      'test.sub.child': 'Receipt',
      'test.greet': 'Welcome to the test shop. Everything here is pretend, including the prices.',
      'place.testshop': 'Test Shop',
      'place.testbank': 'Test Bank',
      'act.testshop.shake': 'Milkshake',
      'act.testshop.fries': 'Fries',
      'act.testshop.burger': 'Cheeseburger',
      'act.testshop.feast': 'Triple Burger',
      'act.testshop.gum': 'Buy gum',
      'act.testshop.fancy': 'Buy the neon sign',
      'act.testshop.work': 'Work: Cook',
      'act.testshop.promo': 'Ask for promotion',
      'act.testshop.study': 'Read the manual',
      'act.testshop.ledger': 'Check the ledger',
      'act.testshop.rob': 'Rob the till',
      'act.testshop.hustle': 'Rush hour',
      'act.testshop.secret': 'Secret menu',
      'act.testshop.ghost': 'Invisible row',
      'act.testshop.badRepeat1': 'Confirm, flagged repeat',
      'act.testshop.badRepeat2': 'Screen, flagged repeat',
      'act.testshop.badRepeat3': 'Minigame, flagged repeat',
      'act.testbank.form': 'Open the ledger',
      'act.testbank.tip': 'Tip the teller',
    });
    SR.def.building('testshop', { name: 'place.testshop', owner: 'mel', portrait: 'mel', greetings: ['test.greet'] });
    SR.def.building('testbank', { name: 'place.testbank', owner: 'penny', portrait: 'penny', greetings: [] });
    var A = function (id, def) { def.p = def.p === undefined ? 0 : def.p; SR.def.action(id, def); };
    A('testshop.shake', { building: 'testshop', group: 'eat', order: 10, icon: 'milkshake', label: 'act.testshop.shake', cost: { cash: 8, min: 30 }, requires: [['hpBelowMax']], effects: [['heal', 12]], repeatable: true });
    A('testshop.fries', { building: 'testshop', group: 'eat', order: 20, icon: 'fries', label: 'act.testshop.fries', cost: { cash: 12, min: 30 }, requires: [['hpBelowMax']], effects: [['heal', 20]], repeatable: true });
    A('testshop.burger', { building: 'testshop', group: 'eat', order: 30, icon: 'burger', label: 'act.testshop.burger', cost: { cash: 25, min: 30 }, requires: [['hpBelowMax']], effects: [['heal', 40]], repeatable: true });
    A('testshop.feast', { building: 'testshop', group: 'eat', order: 40, icon: 'tripleburger', label: 'act.testshop.feast', cost: { cash: 50, min: 30 }, requires: [['hpBelowMax']], effects: [['heal', 80]], repeatable: true });
    A('testshop.gum', { building: 'testshop', group: 'buy', order: 10, icon: 'gum', label: 'act.testshop.gum', cost: { cash: 2 }, effects: [['item', 'gum', 1]], repeatable: true });
    A('testshop.fancy', { building: 'testshop', group: 'buy', order: 20, icon: 'star', label: 'act.testshop.fancy', cost: { cash: 1500 }, effects: [['item', 'gum', 5]] });
    A('testshop.work', { building: 'testshop', group: 'work', order: 10, icon: 'work', label: 'act.testshop.work', cost: { min: 360 }, variants: ['full', 'half', 'overtime'], effects: [['cash', 42, 'wage'], ['karma', 1]], repeatable: true });
    A('testshop.promo', { building: 'testshop', group: 'work', order: 20, icon: 'promotion', label: 'act.testshop.promo', requires: [['stat', 'cha', 200]], effects: [] });
    A('testshop.study', { building: 'testshop', group: 'train', order: 10, icon: 'study', label: 'act.testshop.study', cost: { min: 60 }, effects: [['stat', 'int', 2]], repeatable: true });
    A('testshop.ledger', { building: 'testshop', group: 'services', order: 10, icon: 'bank', label: 'act.testshop.ledger', screen: 'test.form' });
    A('testshop.rob', { building: 'testshop', group: 'crime', order: 10, icon: 'rob', label: 'act.testshop.rob', confirm: 'test.confirmRob', effects: [['heat', 30], ['karma', -10]] });
    // Deliberately invalid defs (the validator forbids them in shipped data): the UI must still
    // never repeat a row with confirm or screen, even when `repeatable` says otherwise.
    A('testshop.badRepeat1', { building: 'testshop', group: 'special', order: 10, icon: 'warning', label: 'act.testshop.badRepeat1', confirm: 'test.confirmRob', cost: { cash: 1 }, effects: [], repeatable: true });
    A('testshop.badRepeat2', { building: 'testshop', group: 'special', order: 20, icon: 'warning', label: 'act.testshop.badRepeat2', screen: 'test.child', repeatable: true });
    A('testshop.badRepeat3', { building: 'testshop', group: 'special', order: 25, icon: 'warning', label: 'act.testshop.badRepeat3', minigame: { skin: 'test.none', auto: true }, cost: { cash: 1 }, effects: [], repeatable: true });
    A('testshop.secret', { building: 'testshop', group: 'special', order: 30, icon: 'lock', label: 'act.testshop.secret', p: 1, feature: 'weather', effects: [] });
    A('testshop.ghost', { building: 'testshop', group: 'special', order: 40, icon: 'lock', label: 'act.testshop.ghost', hidden: [['notFlag', 'w1dNeverSet']], effects: [] });
    A('testbank.form', { building: 'testbank', group: 'services', order: 10, icon: 'deposit', label: 'act.testbank.form', screen: 'test.form' });
    A('testbank.tip', { building: 'testbank', group: 'services', order: 20, icon: 'money', label: 'act.testbank.tip', cost: { cash: 10 }, effects: [['bank', 10]] });

    // A test sub-screen: a balance readout, a NumberField (a typed amount vetoes Back), a
    // commit button (ctx.act) and a child sub-screen. It counts its refreshes.
    SR.def.subscreen('test.form', {
      title: 'test.sub.form', p: 0,
      mount: function (root, ctx) {
        W1D.log.push('mount test.form');
        var h = SR.ui.dom.h;
        this._root = root;
        this._refreshes = 0;
        this._bal = h('p', { 'data-id': 'test-balance' });
        this._num = SR.ui.numberField({ id: 'test-amount', label: 'ui.amount', value: 0, min: 0, max: 500, money: true, quick: ['+10', '+100'] });
        root.appendChild(this._bal);
        root.appendChild(this._num);
        root.appendChild(SR.ui.button({ id: 'test-tip', label: 'act.testbank.tip', variant: 'primary', onClick: function () { ctx.act('testbank.tip', {}); } }));
        root.appendChild(SR.ui.button({ id: 'test-open-child', label: 'test.sub.child', onClick: function () {
          ctx.push('test.child', { note: 'hello' }).then(function (r) { W1D.log.push('child popped ' + r); });
        } }));
        this.refresh(ctx);
        this._refreshes = 0;
        try { ctx.state.money.cash = 1; W1D.log.push('state was writable'); } catch (e) { W1D.roError = e.message; }
      },
      refresh: function (ctx) {
        this._refreshes++;
        this._root.setAttribute('data-refreshes', String(this._refreshes));
        this._bal.textContent = 'Bank ' + SR.text.money(ctx.state.money.bank) + ' · cash ' + SR.text.money(ctx.state.money.cash);
      },
      back: function () { return this._num.value === 0; },
      unmount: function () { W1D.log.push('unmount test.form'); this._root = null; },
    });
    SR.def.subscreen('test.child', {
      title: 'test.sub.child', p: 0,
      mount: function (root, ctx) {
        W1D.log.push('mount test.child ' + ctx.params.note);
        root.appendChild(SR.ui.dom.h('p', { 'data-id': 'test-child-text' }, 'Receipt for ' + ctx.params.note));
        root.appendChild(SR.ui.button({ id: 'test-child-done', label: 'ui.ok', variant: 'primary', onClick: function () { ctx.pop('done'); } }));
      },
      unmount: function () { W1D.log.push('unmount test.child'); },
    });

    // The gallery's input scene: SR.input's actions reach the page's focus scope.
    SR.scenes.register('test.gallery', {
      kind: 'base',
      onAction: function (action, ev) {
        var f = SR.ui.focus.focused();
        var tabsEl = f && f.closest ? f.closest('.tabs') : null;
        if (tabsEl && (action === 'tabNext' || action === 'tabPrev')) { if (action === 'tabNext') tabsEl.next(); else tabsEl.prev(); return; }
        SR.ui.focus.handle(action, ev);
      },
    });
  };

  // ------------------------------------------------------------------ stepping
  /** Runs n fixed steps (SR.loop.step when the loop exists) and flushes the HUD. */
  W1D.step = function (n) {
    n = n === undefined ? 1 : n;
    if (SR.loop && typeof SR.loop.step === 'function') { SR.loop.step(n); return n; }
    for (var i = 0; i < n; i++) {
      if (SR.input && typeof SR.input.poll === 'function') SR.input.poll(SR.STEP);
      SR.scenes.update(SR.STEP);
    }
    if (SR.ui.hud && SR.ui.hud.flush) SR.ui.hud.flush();
    return n;
  };
})();
