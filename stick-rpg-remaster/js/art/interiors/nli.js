// js/art/interiors/nli.js — owner: W2-Money. SR.def.interior('nli'): the lobby of New Lines Inc.
// (ART_AUDIO §9: the water cooler glugging, an elevator light, a motivational poster; proprietor
// Bea, or Terry, your assistant, once you are Vice President or higher). A cool grey office in the
// int.nli palette on a carpet: the three stacked-lines logo with the company's name over the
// reception desk, a motivational poster, the "now hiring" board, a clock, the elevator with its
// blinking floor light, the water cooler, filing cabinets and a plant. Composition (ART_AUDIO §9):
// the scene in x 0-760, only wall and floor behind the card; the window shows the live sky.
// Colours are palette keys only (int.nli.*, bld.nli.*, kit.*). Node-loadable: nothing draws at
// load time.
(function () {
  'use strict';
  var SR = window.SR;

  var ASSISTANT_FROM = 'vp';    // Terry receives you from this rung up (ART_AUDIO §9; GDD §6.2)
  var LOGO = { x: 352, y: 108, w: 124, bar: 14, gap: 8 };

  /** @returns {string} who stands behind the desk: Terry from VP up, else Bea (the live game's rank). */
  function host() {
    var s = SR.state, ladder = SR.tuning && SR.tuning.jobs ? SR.tuning.jobs.ladder.nli : [];
    var rank = s && s.job && s.job.ranks ? s.job.ranks.nli : null;
    return rank && ladder.indexOf(rank) >= ladder.indexOf(ASSISTANT_FROM) ? 'terry' : 'bea';
  }

  /** The company's three stacked lines (ART_AUDIO §5.2) and its name, over the reception desk. */
  function logo(ctx, K) {
    for (var i = 0; i < 3; i++) {
      var inset = i * 14;
      K.rect(ctx, LOGO.x + inset, LOGO.y + i * (LOGO.bar + LOGO.gap), LOGO.w - inset * 2, LOGO.bar, K.color('bld.nli.trim'), 2);
    }
    var name = SR.text.has('place.sign.nli') ? SR.text('place.sign.nli') : '';
    if (name) SR.art.draw.text(ctx, name, LOGO.x + LOGO.w / 2, LOGO.y + 3 * (LOGO.bar + LOGO.gap) + 14,
      { size: 18, weight: 900, role: 'display', align: 'center', baseline: 'middle', color: 'bld.nli.roof', maxWidth: 220 });
  }

  var owner = { x: 416, y: 462, pose: 'idle' };
  Object.defineProperty(owner, 'id', { enumerable: true, get: host });

  SR.def.interior('nli', {
    wall: { type: 'plain', color: '@wall', alt: '@wallShade', trim: '@trim', wainscotH: 70 },
    floor: { type: 'carpet', a: '@floorA', b: '@floorB', perspective: 0.5 },
    window: { x: 30, y: 84, w: 160, h: 150 },
    props: [
      { type: 'poster', x: 220, y: 96, w: 96, h: 124, text: 'card.nli.poster', color: 'kit.poster', alt: 'bld.nli.trim' },
      { type: 'clock', x: 506, y: 92, w: 56, h: 56, alt: 'bld.nli.roof' },
      { type: 'poster', x: 494, y: 196, w: 84, h: 100, text: 'card.nli.board', color: 'kit.paper', alt: 'bld.nli.plate' },
      { type: 'elevator', x: 598, y: 150, w: 128, h: 250 },
      { type: 'filing', x: 40, y: 512, w: 84, h: 150 },
      { type: 'watercooler', x: 196, y: 476 },
      // the reception desk in the tower's grey with a light top; Bea (or Terry) behind it
      { type: 'counter', x: 272, y: 488, w: 296, color: '@counter', alt: 'kit.counterTop' },
      { type: 'plant', x: 690, y: 560, w: 64, h: 130 },
    ],
    owner: owner,
    you: { x: 330, y: 612 },
    lights: [{ x: 420, y: 40, r: 260, color: '@light' }, { x: 120, y: 50, r: 170, color: '@light' }],
    custom: 'nliLogo',
    fns: { nliLogo: { static: function (ctx, K) { logo(ctx, K); } } },
  });
})();
