// js/ui/dialog.js — owner: W1-D. SR.ui.dialog: the Dialog sheet and choice cards (UI.md §5.7)
// and the `dialog` overlay scene (CONTRACT §11.3). The sheet (32-1248 × 472-704) freezes the world
// and the clock under it (the scene blocks updates; the city keeps rendering, frozen). A portrait
// on the left, the text, then 2-4 choice Buttons, each with chips and, for checks, a chance chip.
// A choice may carry a NumberField: open() then resolves { choice, n }.
// Encounters, shift events, police stops and Jail Day use the same sheet.
// Load-time rule: defines functions and registers the scene only.
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;

  var stack = [];   // open dialogs: { params, scope, rows }

  function D() { return SR.ui.dom; }
  function t(k, v) { return D().t(k, v); }

  function personName(o) {
    if (o.name) return t(o.name, o.vars);
    var p = o.person && SR.reg.person && SR.reg.person[o.person];
    if (p && p.name) return t(p.name);
    return o.person ? t(SR.text.has('person.' + o.person) ? 'person.' + o.person : o.person) : '';
  }

  function previewOf(ch, n) {
    if (!ch.action) return null;
    var params = {};
    for (var k in ch.params) if (hasOwn.call(ch.params, k)) params[k] = ch.params[k];
    if (ch.number) params.n = n;
    if (typeof SR.preview !== 'function') return { ok: false, reason: 'ui.rulesPending' };
    try { return SR.preview(ch.action, params); } catch (e) { return { ok: false, reason: 'ui.rulesPending' }; }
  }

  function close(entry, result) {
    var top = SR.scenes.top();
    if (!top || top.id !== 'dialog' || top.params !== entry.params) return;
    SR.scenes.pop(result);
  }

  function buildChoice(entry, ch, i) {
    var h = D().h;
    var num = null;
    var chips = h('span', { class: 'dlg-chips' });
    var btn = SR.ui.button({ id: 'choice-' + ch.id, label: ch.label, vars: ch.vars, variant: ch.variant || (i === 0 ? 'primary' : 'secondary'),
      onClick: function () {
        var n = num ? num.value : undefined;
        var pv = previewOf(ch, n);
        if (ch.disabled || (pv && !pv.ok)) return;   // the button's own disabled state refuses
        D().sfx('confirm');
        close(entry, { choice: ch.id, n: n });
      } });
    btn.insertBefore(h('span', { class: 'dlg-key', 'aria-hidden': 'true' }, String(i + 1)), btn.firstChild);
    var wrap = h('div', { class: 'dlg-choice', 'data-choice': ch.id }, btn);
    if (ch.number) {
      num = SR.ui.numberField({ id: 'choice-' + ch.id + '-n', label: ch.number.label, value: ch.number.value !== undefined ? ch.number.value : ch.number.min,
        min: ch.number.min || 0, max: ch.number.max, step: ch.number.step || 1, money: ch.number.money, quick: ch.number.quick,
        onChange: function () { render(); }, onSubmit: function () { btn.click(); } });
      wrap.appendChild(num);
    }
    wrap.appendChild(chips);
    function render() {
      var n = num ? num.value : undefined;
      var pv = previewOf(ch, n);
      D().clear(chips);
      var list = [];
      if (pv && !pv.hidden) {
        list = SR.ui.chip.costs(pv).concat(SR.ui.chip.gains(pv));
      }
      (ch.chips || []).forEach(function (c) { list.push(c && c.nodeType ? c : SR.ui.chip(c)); });
      if (typeof ch.chance === 'number' && !(pv && typeof pv.chance === 'number')) list.push(SR.ui.chip({ kind: 'chance', n: ch.chance }));
      list.forEach(function (c) { chips.appendChild(c); });
      var off = !!ch.disabled || !!(pv && !pv.ok);
      var reason = ch.disabled ? ch.reason : pv && !pv.ok ? pv.reason : null;
      btn.update({ disabled: off, reason: reason, reasonVars: pv && pv.vars });
      wrap.classList.toggle('is-disabled', off);
      var why = wrap.querySelector('.dlg-reason');
      if (off && reason) {
        if (!why) { why = h('span', { class: 'dlg-reason t-small' }); wrap.appendChild(why); }
        why.textContent = t(reason, pv && pv.vars);
      } else if (why) why.parentNode.removeChild(why);
    }
    render();
    return { el: wrap, btn: btn, ch: ch, render: render, num: num };
  }

  function mountSheet(root, params) {
    var h = D().h;
    params = params || {};
    var entry = { params: params, rows: [], scope: null };
    var sheet = h('div', { class: 'dlg paper', 'data-id': params.id || 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': personName(params) });
    var who = h('div', { class: 'dlg-who' });
    if (params.person || params.portrait) who.appendChild(SR.ui.portrait({ id: 'dialog-portrait', person: params.portrait || params.person, size: 176, mood: params.mood }));
    sheet.appendChild(who);
    var main = h('div', { class: 'dlg-main' });
    var name = personName(params);
    if (name) main.appendChild(h('h2', { class: 'dlg-name t-h3', 'data-id': 'dialog-name' }, name));
    if (params.text) {
      var sp = SR.ui.speech({ id: 'dialog-text', text: params.text, vars: params.vars, voice: params.voice, tail: 'left' });
      entry.speech = sp;
      main.appendChild(sp);
    }
    var choices = h('div', { class: 'dlg-choices', role: 'group' });
    (params.choices || []).forEach(function (ch, i) {
      var row = buildChoice(entry, ch, i);
      entry.rows.push(row);
      choices.appendChild(row.el);
    });
    main.appendChild(choices);
    sheet.appendChild(main);
    root.classList.add('dialog-root');
    root.appendChild(sheet);
    entry.sheet = sheet;
    entry.scope = SR.ui.focus.push(sheet, { id: 'dialog', autofocus: false });
    var firstOk = null;
    entry.rows.forEach(function (r) { if (!firstOk && !r.btn.classList.contains('is-disabled')) firstOk = r.btn; });
    SR.ui.focus.focus(firstOk || (entry.rows[0] && entry.rows[0].btn));
    D().announce((name ? name + ': ' : '') + (params.text ? t(params.text, params.vars) : ''));
    D().sfx('open');
    stack.push(entry);
    return entry;
  }

  function cancelResult(params) {
    var c = params.cancel;
    if (c === false) return null;
    if (c === undefined) {
      var leave = (params.choices || []).filter(function (ch) { return ch.id === 'leave'; })[0];
      return { choice: leave ? 'leave' : null, n: undefined };
    }
    return { choice: c, n: undefined };
  }

  SR.scenes.register('dialog', {
    kind: 'overlay',
    blocksUpdate: true,
    ui: {
      mount: function (root, params) { mountSheet(root, params); },
      unmount: function () {
        var e = stack.pop();
        if (e && e.scope) SR.ui.focus.pop(e.scope);
      },
    },
    onAction: function (action, ev) {
      var e = stack[stack.length - 1];
      if (!e) return;
      if (e.speech && !e.speech.done()) e.speech.complete();
      if (SR.ui.focus.handle(action, ev)) return;
      var m = /^row(\d)$/.exec(action);
      if (m && !(ev && ev.repeat)) {
        var r = e.rows[Number(m[1]) - 1];
        if (r) { SR.ui.focus.focus(r.btn); r.btn.click(); }
        return;
      }
      if (action === 'back' && !(ev && ev.repeat)) {
        var res = cancelResult(e.params);
        if (res) { D().sfx('close'); close(e, res); }
      }
    },
  });

  SR.ui.dialog = {
    /**
     * Opens the Dialog sheet over the current scene.
     * @param {{id: string, person: string, portrait: string, name: string, text: string, vars: object,
     *   mood: string, voice: number, cancel: (string|false),
     *   choices: {id: string, label: string, vars: object, action: string, params: object,
     *     chips: object[], chance: number, disabled: boolean, reason: string, variant: string,
     *     number: {min: number, max: number, step: number, label: string, value: number, money: boolean}}[]}} opts
     *   action: an action id previewed for the choice's chips and enabled state (the caller runs
     *   it); cancel: the choice id Esc returns (default 'leave' when offered), false: Esc does nothing
     * @returns {Promise<{choice: (string|null), n: (number|undefined)}>}
     */
    open: function (opts) {
      return SR.scenes.push('dialog', opts || {}).then(function (r) { return r || { choice: null, n: undefined }; });
    },
    /** Re-evaluates the open dialog's choices (after a state change). */
    refresh: function () { var e = stack[stack.length - 1]; if (e) e.rows.forEach(function (r) { r.render(); }); },
    /** @returns {boolean} a dialog is open. */
    isOpen: function () { return stack.length > 0; },
  };
})();
