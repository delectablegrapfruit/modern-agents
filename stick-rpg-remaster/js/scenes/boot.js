// js/scenes/boot.js — owner: W2-Front. The `boot` scene (UI §5.1; ARCHITECTURE §5): loads the
// settings and the profile, warns once when saves cannot persist (SR.save.available false: memory
// only), and hands over to the title at once with its "Press any key or click" card (the logo drawing
// itself, the fan note, the audio unlock; js/scenes/title.js). The hand-over is immediate so the
// first frame is already the title with its live city baking behind the card.
// Also the front end's save listeners (a prio-50 boot hook): "This save couldn't be read" on
// save:broken (ARCHITECTURE §15, D34).
// Load-time rule: registers the scene and a boot hook only.
(function () {
  'use strict';
  var SR = window.SR;

  var S = { profile: null, settings: null, warned: false, broken: 0 };

  function toast(key, kind) { if (SR.ui && typeof SR.ui.toast === 'function') SR.ui.toast({ key: key, kind: kind || 'warning' }); }

  SR.scenes.register('boot', {
    kind: 'base',
    enter: function () {
      // SR.settings loads lazily: reading it once makes the stored values the live ones (the access
      // classes, the volumes and the bindings follow their own settings:changed listeners).
      try { S.settings = SR.settings ? SR.settings.all() : null; } catch (e) { S.settings = null; }
      try { S.profile = SR.save ? SR.save.profile() : null; } catch (e) { S.profile = null; }
      if (SR.save && SR.save.available === false && !S.warned) {
        S.warned = true;
        toast('ui.save.memoryOnly');
      }
      // A change requested inside enter runs right after it, without a transition (CONTRACT §11.4).
      SR.scenes.go('title', { gate: true });
    },
    /** @returns {object} what the boot loaded (tests). */
    info: function () { return { profile: !!S.profile, settings: !!S.settings, warned: S.warned, broken: S.broken }; },
  });

  SR.onBoot(50, function () {
    if (!SR.events) return;
    SR.events.on('save:broken', function (p) {
      S.broken++;
      toast(p && p.reason === 'newer' ? 'ui.save.newer' : 'ui.save.broken');
    });
  });
})();
