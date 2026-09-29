// js/ui/subscreens/messages.js — owner: W2-Home. The sub-screen home.messages (UI §5.6, §5.9; GDD
// §6.1, §6.8): the answering machine. An inbox and an archive (a Segmented), newest first, each
// row with the caller, the day and an unread dot; the reader plays a message (the answering-machine
// beep, the text in a typing SpeechBubble) and marks it read through ctx.act('home.msgRead'), and
// Archive / Back to the inbox go through ctx.act('home.msgArchive'). The inbox keeps at most 150
// messages (SR.rules.effects.MSG_MAX; archived ones are kept longest, ARCHITECTURE §15). Any host
// may show it: in the Pocket without a phone it only says that messages play at home.
// Node-loadable: nothing touches the DOM until mount.
(function () {
  'use strict';
  var SR = window.SR;

  var SNIPPET = 64;             // characters of a message shown in its list row
  var S = null;                 // { root, ctx, tab: 'inbox' | 'archive', open: id | null } while mounted

  function D() { return SR.ui.dom; }
  function t(k, v) { return D().t(k, v); }

  /** @returns {string} the caller's display name: the person's name, else this file's list, else the id. */
  function fromName(from) {
    var p = SR.reg.person && SR.reg.person[from];
    if (p && p.name && SR.text.has(p.name)) return SR.text(p.name);
    var k = 'sub.home.messages.from.' + from;
    if (SR.text.has(k)) return SR.text(k);
    return from ? String(from).charAt(0).toUpperCase() + String(from).slice(1) : t('sub.home.messages.from.unknown');
  }
  function textOf(m) { return SR.text(m.key, m.vars); }
  function inbox(st) { return st.msgs.filter(function (m) { return !m.archived; }).reverse(); }
  function archived(st) { return st.msgs.filter(function (m) { return m.archived; }).reverse(); }
  function find(st, id) { return st.msgs.filter(function (m) { return m.id === id; })[0] || null; }
  function msgMax() { return (SR.rules.effects && SR.rules.effects.MSG_MAX) || 150; }

  /** Without a phone the Pocket cannot play messages (GDD §6.1, orig: only at home). */
  function blocked(ctx) {
    if (ctx.host !== 'pocket' || ctx.building === 'home') return false;
    return !SR.rules.conditions.eval(ctx.state, ['phone'], {}).ok;   // the rules' own `phone` condition
  }

  /** Re-renders with fn, keeping focus on the control with the same data-id (else the first one). */
  function focusKeep(fn) {
    var root = S.root, a = document.activeElement;
    var inside = !!(a && root.contains(a));
    var had = inside ? a.getAttribute('data-id') : null;
    fn();
    if (!inside && document.activeElement && document.activeElement !== document.body) return;
    var el = (had && root.querySelector('[data-id="' + had + '"][data-nav]')) ||
      root.querySelector('[data-autofocus][data-nav]') || root.querySelector('[data-nav]');
    if (el) SR.ui.focus.focus(el);
  }

  function renderList() {
    var h = D().h, st = S.ctx.state, root = S.root;
    var ins = inbox(st), arc = archived(st);
    var seg = SR.ui.segmented({
      id: 'msg-tabs', label: 'sub.home.messages',
      options: [{ id: 'inbox', label: t('sub.home.messages.inbox', { n: ins.length }) },
        { id: 'archive', label: t('sub.home.messages.archive', { n: arc.length }) }],
      value: S.tab, onChange: function (v) { S.tab = v; render(); },
    });
    root.appendChild(h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' } },
      seg, h('span', { class: 't-small', 'data-id': 'msg-kept', style: { color: 'var(--ink-700)' } }, t('sub.home.messages.kept', { n: st.msgs.length, max: msgMax() }))));
    var items = S.tab === 'archive' ? arc : ins;
    if (!items.length) {
      root.appendChild(h('p', { class: 't-body', 'data-id': 'msg-empty', style: { color: 'var(--ink-700)' } },
        t(S.tab === 'archive' ? 'sub.home.messages.emptyArchive' : 'sub.home.messages.empty')));
      return;
    }
    var ul = h('div', { class: 'msg-list scroll-y', 'data-id': 'msg-list', role: 'list', style: { touchAction: 'pan-y' } });
    items.forEach(function (m) {
      var body = textOf(m);
      var snip = body.length > SNIPPET ? body.slice(0, SNIPPET - 1) + '…' : body;
      var unread = !m.read;
      // A list item holding a button (a <button> may not take the listitem role: it would lose its own).
      var b = h('button', { type: 'button', class: 'arow-main nav-inset', 'data-nav': '', 'data-id': 'msg-' + m.id,
        'aria-label': fromName(m.from) + ', ' + t('sub.home.messages.day', { day: m.day }) + (unread ? ', ' + t('sub.home.messages.new') : '') + '. ' + snip,
        style: { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '2px', width: '100%', textAlign: 'left',
          padding: 'var(--sp-2) var(--sp-3)', borderBottom: 'var(--line-thin)', background: 'transparent' } },
        h('span', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } },
          D().icon('messages', 20),
          h('span', { style: { fontWeight: unread ? '900' : '600', flex: '1 1 auto' } }, fromName(m.from)),
          unread ? SR.ui.badge({ text: 'sub.home.messages.new', kind: 'new' }) : null,
          h('span', { class: 't-small', style: { color: 'var(--ink-700)' } }, t('sub.home.messages.day', { day: m.day }))),
        h('span', { class: 't-small', style: { color: 'var(--ink-700)' } }, snip));
      b.addEventListener('click', function () { openMsg(m.id); });
      ul.appendChild(h('div', { role: 'listitem' }, b));
    });
    root.appendChild(ul);
  }

  function renderReader() {
    var h = D().h, st = S.ctx.state, root = S.root, m = find(st, S.open);
    if (!m) { S.open = null; renderList(); return; }
    root.appendChild(h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' } },
      D().icon('messages', 24),
      h('span', { class: 't-label', 'data-id': 'msg-from' }, t('sub.home.messages.from', { from: fromName(m.from) })),
      h('span', { class: 't-small', style: { marginLeft: 'auto', color: 'var(--ink-700)', whiteSpace: 'nowrap' } }, t('sub.home.messages.day', { day: m.day }))));
    S.bubble = SR.ui.speech({ id: 'msg-text', text: textOf(m), tail: 'left', voice: 'blip' });
    root.appendChild(S.bubble);
    var next = nextUnread(st, m.id);
    root.appendChild(h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginTop: 'var(--sp-4)' } },
      SR.ui.button({ id: 'msg-archive', label: m.archived ? 'sub.home.messages.unarchive' : 'sub.home.messages.archiveIt', icon: 'save', size: 's',
        onClick: function () { archive(m.id, !m.archived); } }),
      next ? SR.ui.button({ id: 'msg-next', label: 'sub.home.messages.next', variant: 'primary', size: 's', autofocus: true,
        onClick: function () { openMsg(next.id); } }) : null,
      SR.ui.button({ id: 'msg-back', label: 'sub.home.messages.list', size: 's', autofocus: !next,
        onClick: function () { S.open = null; render(); } })));
  }

  function nextUnread(st, after) {
    var list = inbox(st).filter(function (m) { return !m.read && m.id !== after; });
    return list.length ? list[list.length - 1] : null;   // the oldest unread first, like a tape
  }

  function render() {
    if (!S) return;
    focusKeep(function () {
      D().clear(S.root);
      S.bubble = null;
      if (blocked(S.ctx)) {
        S.root.appendChild(D().h('p', { class: 't-body', 'data-id': 'msg-nophone' }, t('sub.home.messages.noPhone')));
        return;
      }
      if (S.open !== null) renderReader(); else renderList();
    });
  }

  /** Plays a message: the beep, the reader; an unread one is marked read through the rules. */
  function openMsg(id) {
    if (!S) return;
    var m = find(S.ctx.state, id);
    if (!m) return;
    S.open = id;
    if (!m.read) S.ctx.act('home.msgRead', { id: id });   // the host plays its feedback (the beep) and refreshes
    else D().sfx('answering_beep');
    render();
    var b = S.root.querySelector('[data-id="msg-next"]') || S.root.querySelector('[data-id="msg-back"]');
    if (b) SR.ui.focus.focus(b);
    D().announce(fromName(m.from) + '. ' + textOf(m));
  }

  /** Archives a message (or puts it back) and returns to the list it came from. */
  function archive(id, on) {
    if (!S) return;
    S.ctx.act('home.msgArchive', { id: id, archived: on });
    S.open = null;
    render();
    var row = S.root.querySelector('[data-id="msg-tabs"]');
    if (row) SR.ui.focus.focus(row);
  }

  SR.def.subscreen('home.messages', {
    title: 'sub.home.messages',
    p: 0,
    mount: function (root, ctx) {
      S = { root: root, ctx: ctx, tab: 'inbox', open: null, bubble: null };
      if (ctx.params && ctx.params.id !== undefined && find(ctx.state, ctx.params.id)) { render(); openMsg(ctx.params.id); return; }
      render();
    },
    refresh: function (ctx) {
      if (!S) return;
      S.ctx = ctx;
      // A refresh after reading keeps the typing bubble: only the list view is rebuilt.
      if (S.open === null) render();
    },
    unmount: function () { S = null; },
    onAction: function (action, ev) {
      if (!S || (ev && ev.down === false)) return false;
      if (S.bubble && (action === 'confirm' || action === 'interact') && S.bubble.complete()) return true;
      if (action === 'back' && S.open !== null) { S.open = null; render(); return true; }
      if ((action === 'tabPrev' || action === 'tabNext') && S.open === null) {
        S.tab = action === 'tabPrev' ? 'inbox' : 'archive';
        render();
        return true;
      }
      return false;
    },
  });
})();
