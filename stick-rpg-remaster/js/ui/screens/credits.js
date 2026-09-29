// js/ui/screens/credits.js — owner: W2-Front. The `credits` scene (UI §5.18; GDD intro): the fan note
// (the text key ui.fanNote), how the game was made, the
// Classic note ("Classic mode is a separate faithful recreation included in this repository; your
// browser's Back button returns here") and a Back to title link, over the title's drifting city.
// Music: paper_sky. Load-time rule: defines functions and registers the scene only.
(function () {
  'use strict';
  var SR = window.SR;

  var LINES = ['front.credits.made', 'front.credits.art', 'front.credits.sound', 'front.credits.words', 'front.credits.thanks'];
  var C = null;

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function text(k, v) { return SR.text(k, v); }

  function back() { SR.scenes.go('title'); }

  SR.scenes.register('credits', {
    kind: 'base',
    music: 'paper_sky',
    enter: function () { SR.ui.title.backdrop.enter(); },
    exit: function () { SR.ui.title.backdrop.exit(); },
    update: function (dt) { SR.ui.title.backdrop.update(dt); },
    render: function (ctx, alpha) { SR.ui.title.backdrop.render(ctx, alpha); },
    ui: {
      mount: function (root) {
        C = {};
        var list = h('ul', { class: 'credits-list' });
        LINES.forEach(function (k) { list.appendChild(h('li', null, text(k))); });
        var link = h('button', { type: 'button', class: 'credits-link', 'data-id': 'credits-back', 'data-nav': '' }, text('front.credits.back'));
        link.addEventListener('click', function () { D().sfx('click'); back(); });
        C.panel = h('section', { class: 'front-panel front-panel--narrow paper', 'data-id': 'credits', 'aria-label': text('front.credits.title') },
          h('div', { class: 'front-head' }, h('h1', { class: 't-h1' }, text('front.credits.title'))),
          h('p', { class: 'credits-title' }, text('game.title') + ' · ' + text('game.tag')),
          h('p', { class: 'credits-fan', 'data-id': 'credits-fan' }, text('ui.fanNote')),
          list,
          h('p', { class: 'credits-classic', 'data-id': 'credits-classic' }, text('front.credits.classic')),
          h('p', { class: 'credits-version' }, text('front.title.version', { v: SR.VERSION })),
          link);
        root.appendChild(C.panel);
        C.scope = SR.ui.focus.push(C.panel, { id: 'credits' });
      },
      unmount: function () { if (C && C.scope) SR.ui.focus.pop(C.scope); C = null; },
    },
    onAction: function (action, ev) {
      if (!C || (ev && (ev.consumed || ev.down === false))) return false;
      if (action === 'pocket' && ev && ev.code === 'Tab') return false;
      if (SR.ui.focus.handle(action, ev)) return true;
      if (action === 'back' && !(ev && ev.repeat)) { back(); return true; }
      return false;
    },
  });
})();
