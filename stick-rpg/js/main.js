// Boot, plus a small debug API used by the automated tests (tests/*.cjs):
//   SRPG.debug.newGame(opts)     start a fresh game (opts patch the new state) and show the city
//   SRPG.debug.set(patch)        shallow-merge fields into the current state (items merged too)
//   SRPG.debug.open(id)          show a location (building / street dialog) directly
//   SRPG.debug.go(id, params)    show any registered screen
//   SRPG.debug.state()           the current state
(function () {
  'use strict';
  var SRPG = window.SRPG;

  // Fallback screens so the game still runs if an optional module failed to load.
  if (!SRPG.screens.title) {
    SRPG.registerScreen('title', {
      enter: function () {
        SRPG.ui.button(null, 'START', function () { SRPG.debug.newGame(); }, { x: 240, y: 190, cls: 'outline' });
      },
      render: function (ctx) { ctx.fillStyle = '#0a6fd8'; ctx.fillRect(0, 0, SRPG.W, SRPG.H); },
    });
  }
  if (!SRPG.screens.death) {
    SRPG.registerScreen('death', {
      enter: function () { setTimeout(function () { SRPG.engine.go('results'); }, 1500); },
      render: function (ctx) {
        ctx.fillStyle = '#0a6fd8';
        ctx.fillRect(0, 0, SRPG.W, SRPG.H);
        SRPG.draw.text(ctx, 'YOU DIED', 275, 200, { size: 30, align: 'center', color: '#034' });
      },
    });
  }
  if (!SRPG.screens.results) {
    SRPG.registerScreen('results', {
      enter: function () {
        var s = SRPG.game.s;
        SRPG.ui.message('Net worth: ' + SRPG.util.money(SRPG.game.netWorth(s)) + '\nRank: ' + SRPG.game.rank(s), function () { SRPG.engine.go('title'); });
      },
      render: function (ctx) { ctx.fillStyle = '#0a6fd8'; ctx.fillRect(0, 0, SRPG.W, SRPG.H); },
    });
  }

  SRPG.debug = {
    newGame: function (opts) {
      var s = SRPG.newState(opts || {});
      if (opts) SRPG.debug.set(opts, s);
      SRPG.game.start(s);
      SRPG.engine.go('city', { fade: false });
      return s;
    },
    set: function (patch, s) {
      s = s || SRPG.game.s;
      for (var k in patch) {
        if (k === 'items') for (var i in patch.items) s.items[i] = patch.items[i];
        else s[k] = patch[k];
      }
      return s;
    },
    open: function (id) { SRPG.location.open(id, { resume: true }); },
    go: function (id, params) { SRPG.engine.go(id, params); },
    state: function () { return SRPG.game.s; },
  };

  window.addEventListener('load', function () {
    SRPG.engine.init();
    SRPG.engine.go('title');
  });
})();
