// js/scenes/title.js — owner: W2-Front. The `title` scene (UI §5.2; ARCHITECTURE §5): the live city
// at dusk drifting behind the menu (SR.ui.title.backdrop), the title screen (js/ui/screens/title.js)
// and its input. params = { gate: true } (from the boot scene) shows the "Press any key or click"
// card first (UI §5.1): any key, click, tap or pad button folds it away (the first key, click or
// tap also unlocks the audio, W1-S); Tab still moves focus. Music: paper_sky.
// Load-time rule: registers the scene only.
(function () {
  'use strict';
  var SR = window.SR;

  var T = null;   // the mounted title screen (SR.ui.title.mount's handle)

  function onPageShow(e) { if (e && e.persisted && T) T.refresh(); }   // back from Classic mode (bfcache)

  SR.scenes.register('title', {
    kind: 'base',
    music: 'paper_sky',
    enter: function () {
      SR.ui.title.backdrop.enter();
      window.addEventListener('pageshow', onPageShow);
    },
    exit: function () {
      window.removeEventListener('pageshow', onPageShow);
      SR.ui.title.backdrop.exit();
    },
    resume: function () { if (T) T.refresh(); },
    // While the boot card covers the stage the city is neither stepped nor drawn: the card is opaque,
    // and the first frames stay cheap (ARCHITECTURE §17: boot ≤ 1.5 s to the boot screen).
    update: function (dt) {
      if (!(T && T.gateOn)) SR.ui.title.backdrop.update(dt);
      if (T) T.update(dt);
    },
    render: function (ctx, alpha) { if (!(T && T.gateOn)) SR.ui.title.backdrop.render(ctx, alpha); },
    ui: {
      mount: function (root, params) { T = SR.ui.title.mount(root, { gate: !!(params && params.gate) }); },
      unmount: function () { if (T) T.destroy(); T = null; },
    },
    onAction: function (action, ev) {
      if (!T || (ev && ev.consumed)) return false;
      if (ev && ev.down === false) return false;
      if (action === 'pocket' && ev && ev.code === 'Tab') return false;       // Tab moves focus (CONTRACT §15.5)
      if (T.gateOn) {                                                         // a pad button (or an injected press) opens the menu
        T.dismissGate();
        if (ev) ev.consumed = true;
        return true;
      }
      return SR.ui.focus.handle(action, ev);
    },
    /** @returns {object} what the title shows (tests). */
    info: function () {
      if (!T) return null;
      return { gate: T.gateOn, items: Array.prototype.map.call(T.menu.querySelectorAll('[data-id^="title-"]'), function (b) { return b.getAttribute('data-id'); }),
        drift: SR.ui.title.backdrop.at() };
    },
  });
})();
