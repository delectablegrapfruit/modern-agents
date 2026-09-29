// js/scenes/city.js — owner: W2-City. the city scene (UI §5.5).
// wave-1 slice placeholder, owner W2-City (BUILD_PLAN §3.12; the lead at the wave-1 integration).
// Only what the grey-box vertical slice needs, wired as ARCHITECTURE §8.6 describes the city scene:
// enter starts the world from the state (SR.world.start: where the game left the player, or where
// a flow placed it first, e.g. SR.world.place('afterHospital')) and, when a building's Leave brings
// you back (params.from, the card's convention), steps out of that building's door
// (SR.world.doors.exit); update runs SR.world.update; render runs the render core painter
// (SR.render.frame, which draws the placeholder stick from SR.world.player); presses go to
// SR.world.onAction; the HUD (W1-D) is mounted. Walking into a door opens the building
// (SR.world.doors.go). No traffic, dialogs, touch cluster, click-to-walk input, adaptive music,
// Fold Rescue presentation or pause menu: those are W2-City's (and W2-Front's). The owner replaces
// the whole file.
(function () {
  'use strict';
  /* stub, owner: W2-City */
  var SR = window.SR;

  /** @returns {string|null} the worldmap door a building id comes back out of (Leave → the city). */
  function doorOf(from, s) {
    var W = SR.world, G = W.geometry;
    if (G.doorById && G.doorById[from]) return from;
    var last = W.doors && W.doors.last;
    if (last && last.resolved && last.resolved.id === from) return last.id;     // a home door you walked into
    if (from === 'home') { var hd = W.homeDoor(s); return hd ? hd.id : null; }
    return null;
  }

  SR.scenes.register('city', {
    kind: 'base',
    music: 'crossroads_strut',
    enter: function (params) {
      var W = SR.world, s = SR.state;
      params = params || {};
      if (!s) return;                                  // no game running: the world stays where it is
      var door = params.from ? doorOf(params.from, s) : null;
      W.start(s);
      if (door) W.doors.exit(door);
    },
    exit: function () { if (SR.state && SR.world.ready) SR.world.sync(); },
    update: function (dt) { SR.world.update(dt); },
    render: function (ctx, alpha) { SR.render.frame(ctx, alpha); },
    onAction: function (action) { return SR.world.onAction(action); },
    ui: {
      mount: function (root) { root.classList.add('scene-city'); SR.ui.hud.mount(root, {}); },
      unmount: function () { SR.ui.hud.unmount(); },
    },
  });
})();
