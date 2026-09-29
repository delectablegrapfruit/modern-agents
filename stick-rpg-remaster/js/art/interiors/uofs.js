// js/art/interiors/uofs.js — owner: W2-Civic. SR.def.interior('uofs'): the University of Stick's
// lecture hall (ART_AUDIO §9: the chalkboard with a new absurd formula every day and a pendulum
// clock; Dean Quill at the lectern). A panelled hall in the int.uofs palette with a library wall,
// a gym corner at the back (the Gym row), a poster and a student desk; your stick stands before the
// lectern. Drawn by the W1-A kit from palette keys only; the scene keeps x 0-760 (the card covers
// the rest). Node-loadable: nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  SR.def.interior('uofs', {
    wall: { type: 'panels', color: '@wall', alt: '@wallShade', trim: '@trim' },
    floor: { type: 'planks', a: '@floorA', b: '@floorB', perspective: 0.5 },
    window: { x: 36, y: 72, w: 170, h: 150 },
    props: [
      { type: 'chalkboard', x: 240, y: 76, w: 290, h: 140 },
      { type: 'pendulum', x: 580, y: 52, w: 80, h: 220 },
      { type: 'poster', x: 676, y: 96, text: 'card.uofs.poster' },
      { type: 'poster', x: 676, y: 236, w: 80, h: 90, text: 'card.uofs.poster2', color: 'kit.paper', alt: 'bld.uofs.ivy' },
      { type: 'library', x: 18, y: 468, w: 190, h: 230 },
      { type: 'plant', x: 214, y: 470, alt: 'kit.pot' },
      { type: 'barbell', x: 560, y: 436, w: 150, h: 100 },
      { type: 'lectern', x: 382, y: 482, w: 96, h: 132 },
      { type: 'desk', x: 30, y: 680, w: 180, h: 80 },
    ],
    owner: { id: 'quill', x: 430, y: 458, pose: 'idle' },
    you: { x: 280, y: 590 },
    lights: [{ x: 385, y: 40, r: 250, color: '@light' }],
  });
})();
