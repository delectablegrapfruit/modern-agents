// js/data/cities.js — owner: W1-C. SR.def.city: the six floating cities the Sky Bus serves
// (GDD §4.11; BALANCE B-12a), each mirroring one of the original's six destination handlers.
// A def is identity and art only: the name and blurb text keys (city.<id>.*, en-conflict.js), the
// order on the destination board, and the distant-island art params of ART_AUDIO §4 (a silhouette
// kind and palette keys 'city.<id>.*', never colour literals). Every number of a city (ticket,
// mugging range, what the buyers want, demand, the bust rule) lives in SR.tuning.bus.cities[id] and
// is read by SR.rules.trade at call time.
// Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  var PARTS = ['ground', 'base', 'tower', 'roof', 'accent', 'trim', 'window'];

  /**
   * Registers a city.
   * @param {string} id the B-12a id
   * @param {number} order its place on the destination board (the original's 2 × 3 grid, read by rows)
   * @param {string} silhouette ART_AUDIO §4's unique island shape
   * @param {{bearing: number, dist: number}} sky where the island floats, seen from the sheet
   *   (bearing in degrees clockwise from north; dist 0..1 of the horizon band)
   */
  function city(id, order, silhouette, sky) {
    var colours = {};
    PARTS.forEach(function (p) { colours[p] = 'city.' + id + '.' + p; });
    SR.def.city(id, {
      name: 'city.' + id + '.name', blurb: 'city.' + id + '.blurb', wants: 'city.' + id + '.wants',
      order: order, icon: 'city', tuning: 'bus.cities.' + id,
      art: { silhouette: silhouette, colours: colours, sky: sky, parallax: 0.15, lights: true },
      p: 0,
    });
  }

  city('crayonburg', 1, 'crayons', { bearing: 300, dist: 0.55 });
  city('rustbelt', 2, 'chimneys', { bearing: 330, dist: 0.8 });
  city('glitter', 3, 'sequins', { bearing: 250, dist: 0.7 });
  city('gusty', 4, 'windmills', { bearing: 20, dist: 0.6 });
  city('eraser', 5, 'erasers', { bearing: 95, dist: 0.5 });      // the Sky Ribbon curls east to it
  city('pegas', 6, 'pegs', { bearing: 120, dist: 0.75 });        // and on to Las Pegas
})();
