// js/art/interiors/cityhall.js — owner: W2-Civic. SR.def.interior('cityhall'): City Hall's lobby
// and Election Office (ART_AUDIO §9: the ballot box, flags, the portrait of the mayor, yours in
// office; Clerk Plume behind the counter). A stone hall in the int.cityhall palette on a checker
// floor with a red carpet; campaign bunting (the kit's banners) hangs while a campaign runs or you
// hold office. Drawn by the W1-A kit from palette keys only; the scene keeps x 0-760. The `when`
// tests read the state the building scene hands the static layer, whose cache is baked on entry;
// the custom `live` fn remembers what the bake showed and, in the per-frame pass, draws the portrait
// and the bunting the election has changed since (accepting the nomination at the Election Office
// hangs the bunting at once, not on the next visit). Node-loadable: nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  function inOffice(s) { return !!(s && s.job && s.job.office); }
  function festive(s) { return inOffice(s) || !!(s && s.election && s.election.status === 'campaign'); }

  // The props the election changes (shared by the static list and the live fn).
  var DOODLE = { type: 'portrait', x: 300, y: 64, w: 110, h: 130, person: 'doodle', mood: 'smug', when: function (s) { return !inOffice(s); } };
  var YOURS = { type: 'portrait', x: 300, y: 64, w: 110, h: 130, person: 'player', mood: 'happy', when: inOffice };
  var BUNTING = { type: 'banners', x: 552, y: 36, w: 210, h: 150, color: 'kit.flagA', alt: 'kit.flagC', when: festive };

  var baked = null;   // what the last static bake showed: { office, festive }

  SR.def.interior('cityhall', {
    wall: { type: 'stone', color: '@wall', alt: '@wallShade', trim: '@trim' },
    floor: { type: 'checker', a: '@floorA', b: '@floorB', perspective: 0.45 },
    window: { x: 36, y: 80, w: 150, h: 170 },
    props: [
      DOODLE,
      YOURS,
      { type: 'poster', x: 206, y: 110, text: 'card.cityhall.poster', color: 'kit.flagB', alt: 'kit.flagA' },
      { type: 'clock', x: 468, y: 92 },
      BUNTING,
      { type: 'rug', x: 190, y: 712, w: 380, d: 190, color: 'kit.rug', alt: 'kit.rugTrim' },
      { type: 'flags', x: 30, y: 482 },
      { type: 'flags', x: 686, y: 470 },
      { type: 'counter', x: 330, y: 482, w: 320 },
      { type: 'ballot', x: 150, y: 566 },
    ],
    owner: { id: 'plume', x: 480, y: 456, pose: 'idle' },
    you: { x: 330, y: 604 },
    lights: [{ x: 430, y: 40, r: 270, color: '@light' }],
    custom: 'live',
    fns: {
      live: {
        /** Remembers what the static bake shows (the kit calls it inside drawStatic). */
        static: function (ctx, kit, state) { baked = { office: inOffice(state), festive: festive(state) }; },
        /** Draws what changed since the bake: the portrait of the new office holder, the bunting. */
        anim: function (ctx, kit, t, state) {
          if (!baked) return;
          var office = inOffice(state);
          if (office !== baked.office) kit.prop(ctx, office ? YOURS : DOODLE, undefined, state);
          if (festive(state) && !baked.festive) kit.prop(ctx, BUNTING, undefined, state);
        },
      },
    },
  });
})();
