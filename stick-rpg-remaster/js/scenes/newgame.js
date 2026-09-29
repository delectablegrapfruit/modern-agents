// js/scenes/newgame.js — owner: W2-Front. The `newgame` scene (UI §5.3; ARCHITECTURE §5): the 3-step
// wizard (js/ui/screens/newgame.js) over the title's drifting city. params = { seed } (tests pick the
// new game's seed and the dice stream). Begin: SR.rules.state.create → SR.save.load (the rules and
// world streams, the play clock) → a Hardcore run writes its ironman slot at once (replacing a
// Hardcore run in progress asks first) → the intro. Back from the first step returns to the title.
// Load-time rule: registers the scene only.
(function () {
  'use strict';
  var SR = window.SR;

  var N = null;   // the wizard's handle

  /** Starts the game from the wizard's options. @returns {object|null} the live state */
  function begin(opts) {
    var s = SR.rules.state.create(opts);
    SR.save.load(s);
    if (SR.ui.saveload.hardcore(s)) {
      try { SR.save.write('ironman'); } catch (e) { SR.util.warnOnce('newgame.ironman', 'newgame: the ironman slot could not be written (' + e.message + ')'); }
    }
    SR.scenes.go('intro');
    return SR.state;
  }

  function onBegin(opts) {
    var hardcore = SR.tuning.difficulty[opts.difficulty] && SR.tuning.difficulty[opts.difficulty].saves === 'ironman';
    var exists = SR.save.list().some(function (e) { return e.slot === 'ironman'; });
    if (!(hardcore && exists)) { begin(opts); return; }
    SR.ui.confirm({ id: 'ng-ironman', title: 'front.new.ironmanTitle', text: 'front.new.ironmanText', yes: 'front.new.begin', danger: true })
      .then(function (ok) { if (ok) begin(opts); });
  }

  SR.scenes.register('newgame', {
    kind: 'base',
    music: 'paper_sky',
    enter: function () { SR.ui.title.backdrop.enter(); },
    exit: function () { SR.ui.title.backdrop.exit(); },
    update: function (dt) {
      SR.ui.title.backdrop.update(dt);
      if (N) N.update(dt);
    },
    render: function (ctx, alpha) { SR.ui.title.backdrop.render(ctx, alpha); },
    ui: {
      mount: function (root, params) {
        params = params || {};
        root.classList.add('ng-root');
        N = SR.ui.newgame.mount(root, { seed: params.seed, onBack: function () { SR.scenes.go('title'); }, onBegin: onBegin });
      },
      unmount: function () { if (N) N.destroy(); N = null; },
    },
    onAction: function (action, ev) {
      if (!N || (ev && (ev.consumed || ev.down === false))) return false;
      if (action === 'pocket' && ev && ev.code === 'Tab') return false;
      if (SR.ui.focus.handle(action, ev)) return true;
      if (action === 'back' && !(ev && ev.repeat)) { N.back(); return true; }
      return false;
    },
    /** @returns {object|null} the wizard's state (tests). */
    info: function () {
      if (!N) return null;
      var W = N.W;
      return { step: W.step, seed: W.seed, length: W.length, custom: W.custom, difficulty: W.difficulty, base: W.base, stats: W.stats,
        pool: W.pool, rolls: W.rolls, fair: W.fair, name: W.name, tutorial: W.tutorial, acc: W.acc, options: SR.ui.newgame.options(W) };
    },
    /** Begins at once with the wizard's current options (tests, the debug path). */
    begin: function (opts) { return begin(opts || (N ? SR.ui.newgame.options(N.W) : {})); },
  });
})();
