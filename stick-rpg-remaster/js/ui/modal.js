// js/ui/modal.js — owner: W1-D. SR.ui.modal and SR.ui.confirm (UI.md §2.3 Modal / Confirm:
// 480 wide (large 720), --e-3, the scrim; focus trapped; Esc cancels), and the `confirm` overlay
// scene that hosts them (CONTRACT §11.3). Confirms guard purchases ≥ the setting, crimes, loans,
// the election, quitting and deleting saves (UI.md §2.3).
// Load-time rule: defines functions and registers the scene only.
(function () {
  'use strict';
  var SR = window.SR;

  function D() { return SR.ui.dom; }

  /**
   * A Modal box (no scrim; the confirm scene adds it).
   * @param {{id: string, title: string, text: string, vars: object, body: HTMLElement,
   *   actions: {id: string, label: string, variant: string, hint: string, autofocus: boolean}[],
   *   large: boolean, icon: string, onAction: function}} o onAction(actionId)
   * @returns {HTMLElement}
   */
  function modal(o) {
    o = o || {};
    var h = D().h;
    var titleId = 'mt-' + (o.id || 'modal');
    var el = h('div', { class: ['modal', 'paper', o.large ? 'modal--large' : ''], role: 'dialog', 'aria-modal': 'true',
      'aria-labelledby': titleId, 'data-id': o.id || 'modal' });
    var head = h('div', { class: 'modal-head' },
      o.icon ? D().icon(o.icon, 32, 'modal-ico') : null,
      h('h2', { class: 'modal-title t-h3', id: titleId }, D().t(o.title, o.vars)));
    el.appendChild(head);
    var body = h('div', { class: 'modal-body scroll-y' });
    if (o.text) body.appendChild(h('p', { class: 'modal-text' }, D().t(o.text, o.vars)));
    if (o.body) body.appendChild(o.body);
    el.appendChild(body);
    var foot = h('div', { class: 'modal-actions' });
    (o.actions || []).forEach(function (a) {
      foot.appendChild(SR.ui.button({ id: (o.id || 'modal') + '-' + a.id, label: a.label, vars: a.vars, variant: a.variant || 'secondary',
        hint: a.hint, autofocus: a.autofocus, onClick: function () { if (o.onAction) o.onAction(a.id); } }));
    });
    el.appendChild(foot);
    el.body = body;
    return el;
  }

  /**
   * Opens a modal over the current scene (the `confirm` overlay) and resolves with the chosen
   * action id, or null when cancelled (Esc / B, or the scrim).
   * @param {object} o the modal options (see modal); o.cancel: false makes Esc do nothing
   * @returns {Promise<string|null>}
   */
  modal.open = function (o) {
    return SR.scenes.push('confirm', o || {}).then(function (r) { return r === undefined ? null : r; });
  };

  /**
   * Asks a yes / no question. The destructive variant focuses "No" first.
   * @param {{title: string, text: string, vars: object, yes: string, no: string, danger: boolean,
   *   body: HTMLElement, id: string}} o
   * @returns {Promise<boolean>}
   */
  function confirm(o) {
    o = o || {};
    return modal.open({
      id: o.id || 'confirm', title: o.title || 'ui.confirmTitle', text: o.text, vars: o.vars, body: o.body, icon: o.icon,
      actions: [
        { id: 'no', label: o.no || 'ui.cancel', variant: 'secondary', autofocus: !!o.danger, hint: 'back' },
        { id: 'yes', label: o.yes || 'ui.confirm', variant: o.danger ? 'danger' : 'primary', autofocus: !o.danger },
      ],
    }).then(function (r) { return r === 'yes'; });
  }

  // ---- the confirm scene (overlay; blocks the update below; the world keeps rendering) ----
  var stack = [];       // { root, scope, params } per open confirm scene (a confirm may open over another)
  function mounted() { return stack.length ? stack[stack.length - 1] : null; }

  function close(params, result) {
    var top = SR.scenes.top();
    if (!top || top.id !== 'confirm' || top.params !== params) return;
    SR.scenes.pop(result);
  }

  SR.scenes.register('confirm', {
    kind: 'overlay',
    blocksUpdate: true,
    ui: {
      mount: function (root, params) {
        params = params || {};
        var o = {};
        for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) o[k] = params[k];
        o.onAction = function (id) { D().sfx(id === 'no' ? 'close' : 'confirm'); close(params, id); };
        var box = modal(o);
        var scrim = D().h('div', { class: 'scrim', 'data-id': 'scrim' });
        scrim.addEventListener('click', function () { if (params.cancel !== false) close(params, null); });
        root.classList.add('modal-root');
        root.appendChild(scrim);
        root.appendChild(box);
        D().sfx('open');
        stack.push({ root: root, params: params, scope: SR.ui.focus.push(box, { id: 'modal' }) });
        D().announce(D().t(params.title, params.vars) + (params.text ? '. ' + D().t(params.text, params.vars) : ''));
      },
      unmount: function () {
        var m = stack.pop();
        if (m) SR.ui.focus.pop(m.scope);
      },
    },
    onAction: function (action, ev) {
      if (SR.ui.focus.handle(action, ev)) return;
      var m = mounted();
      if (m && action === 'back' && (!ev || ev.down !== false) && m.params.cancel !== false) close(m.params, null);
    },
  });

  SR.ui.modal = modal;
  SR.ui.confirm = confirm;
})();
