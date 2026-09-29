// js/scenes/hospital.js — owner: W2-Transit. the hospital scene and the player:down listener.
// wave-1 slice placeholder, owner W2-Transit (BUILD_PLAN §3.12; the lead at the wave-1 integration).
// Only what the grey-box vertical slice needs: after SR.rules.health.down's hospital night (Relaxed
// and Standard; the day has advanced and the clock reads 12:00), a player:down while you are in
// play (the city or a building at the bottom of the stack) places the player at the
// 'afterHospital' spawn, outside your home door, and queues the city (ARCHITECTURE §8.6). No
// hospital scene, FLATLINED gag, bill card, Stick General edition or death scene: those are
// W2-Transit's. The owner replaces the whole file.
(function () {
  'use strict';
  /* stub, owner: W2-Transit */
  var SR = window.SR;

  SR.onBoot(50, function () {
    SR.events.on('player:down', function (p) {
      if (!p || p.outcome !== 'hospital' || !SR.state || !SR.reg.scene.city) return;
      var base = SR.scenes.stack()[0];
      if (base !== 'city' && base !== 'building') return;
      if (SR.world.ready) SR.world.place('afterHospital', SR.state);
      SR.scenes.queue('city');
    });
  });
})();
