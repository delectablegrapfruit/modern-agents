// js/main.js — owner: W1-K (lead). The entry point, loaded last by index.html (never in Node):
// seeds the fx stream from Math.random (ARCHITECTURE §14) and calls SR.boot() on DOMContentLoaded.
(function () {
  'use strict';
  var SR = window.SR;

  // rng.js stays free of Math.random; the cosmetic fx stream gets its entropy here.
  SR.onBoot(10, function () { SR.rng.fx.seed((Math.random() * 4294967296) >>> 0); });

  function start() {
    try {
      SR.boot();
    } catch (e) {
      console.error(e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
