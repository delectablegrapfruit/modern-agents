// For the browser tests: Classic is a board mode now (js/classic.js), played on the Play tab. The Classic checks that
// were written against the old Classic tab read the board in play through `CM` (window.CM, a view of the Play tab
// whose score, lines, level, clock, pause and top out are the Classic board's), and `makeClassic(k, w, h)` puts a new
// Classic board in play (the board record stays; only its game is new). Installed with context.addInitScript(install).
'use strict';
module.exports = function install() {
  const make = () => {
    const pm = Lull.app.modes.play, ctl = () => pm.ctl, g = () => pm.game, C = () => Lull.Classic.of(pm.game);
    const over = {
      get started() { return !!C() && C().started; },
      get paused() { return ctl().paused; },
      running: () => ctl().running(),
      get ms() { return C().ms; },
      get score() { return g().s.score; }, set score(v) { g().s.score = v; },
      get lines() { return C().lines; }, set lines(v) { C().lines = v; },
      get level() { return Lull.Classic.levelOf(g().recipe.classic, C().lines); }, set level(v) { /* the level follows the lines */ },
      get mult() { return g().s.mult || 1; }, set mult(v) { g().s.mult = v; },
      get acc() { return ctl().acc; }, set acc(v) { ctl().acc = v; },
      get over() { return g().over; },
      get pile() { return ctl().pile; },
      set gravity(f) { ctl().gravityFor = f; },
      togglePause: (f) => {
        const c = ctl();
        if (c.pile && !c.pile.done) { c.finishPile({ quiet: f === true }); return; }
        const on = f == null ? !c.paused : f;
        if (on) c.setPause(true); else c.go();
      },
      finishPile: (o) => ctl().finishPile(o),
      newGame: (start) => { window.makeClassic(); if (start) ctl().go(); },
      restart: () => { window.makeClassic(); ctl().go(); },
      frame: (now, dt) => pm.frame(now, dt),
      renderStatus: () => pm.renderStatus(),
      action: (a, rep) => pm.action(a, rep),
    };
    return new Proxy(pm, {
      get(t, k) { const d = Object.getOwnPropertyDescriptor(over, k); if (d) return d.get ? d.get() : d.value; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; },
      set(t, k, v) { const d = Object.getOwnPropertyDescriptor(over, k); if (d) { if (d.set) d.set(v); return true; } t[k] = v; return true; },
      deleteProperty(t, k) { if (k === 'gravity') { delete ctl().gravityFor; return true; } delete t[k]; return true; },
    });
  };
  window.makeClassic = (k, w, h) => {
    const pm = Lull.app.modes.play;
    pm.setGame(new Lull.Game({ w: w || 10, h: h || 20, recipe: { mode: 'classic', classic: k || {} }, previewCount: Lull.app.settings.preview }));
    return pm.game;
  };
  Object.defineProperty(window, 'CM', { get: make, configurable: true });
};
