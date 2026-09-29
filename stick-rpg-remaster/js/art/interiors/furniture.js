// js/art/interiors/furniture.js — owner: W2-Goods. SR.def.interior('furniture'): Fine Line
// Furnishings (ART_AUDIO §9: showroom spotlights, a rotating display bed; proprietor Sofia). The
// original's cues are kept: a red runner, department signs over the back wall, a couch and coffee
// table on the left, the TV and the fridge against the back wall, the bed in the middle. The display
// bed carries a price tag with the Featherfold Bed's B-08b price.
// Composition (ART_AUDIO §9): the scene in x 0-760, only wall and floor behind the card; a big
// showroom window with the live sky.
// Colours are palette keys only (int.furniture.*, bld.furniture.*, kit.*). Node-loadable: nothing
// draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  // Department signs hanging from the ceiling: [text key, centre x, y].
  var SIGNS = [['card.furniture.sign.beds', 420, 150], ['card.furniture.sign.living', 150, 262], ['card.furniture.sign.kitchen', 668, 160]];

  var SIGN_W = 110, SIGN_H = 34;
  function strings(ctx, K, cx, y) {
    K.line(ctx, [cx - SIGN_W / 2 + 12, 26, cx - SIGN_W / 2 + 12, y], 1.5);
    K.line(ctx, [cx + SIGN_W / 2 - 12, 26, cx + SIGN_W / 2 - 12, y], 1.5);
  }
  function hangingSign(ctx, K, key, cx, y) {
    var s = SR.text.has(key) ? SR.text(key) : '';
    if (!s) return;
    var w = SIGN_W, h = SIGN_H;
    strings(ctx, K, cx, y);
    K.rect(ctx, cx - w / 2, y, w, h, K.color('int.furniture.accent'), 2);
    SR.art.draw.text(ctx, s, cx, y + h / 2 + 1, { size: 16, weight: 900, role: 'display', align: 'center', color: 'white', maxWidth: w - 12 });
  }

  /** The display bed's price tag on its plinth (the B-08b price of the Featherfold Bed). */
  function priceTag(ctx, K) {
    var row = SR.tuning && SR.tuning.furniture && SR.tuning.furniture.bed;
    if (!row) return;
    var s = SR.text.money(row.price);
    K.line(ctx, [506, 528, 540, 548], 1.5);
    K.rect(ctx, 530, 540, 64, 28, K.color('kit.paper'), 2);
    SR.art.draw.text(ctx, s, 562, 555, { size: 14, weight: 900, role: 'display', align: 'center', color: 'ink', maxWidth: 58 });
  }

  SR.def.interior('furniture', {
    wall: { type: 'plain', color: 'int.furniture.wall', alt: 'int.furniture.wallShade', trim: 'int.furniture.trim', wainscotH: 60 },
    floor: { type: 'tiles', a: 'int.furniture.floorA', b: 'int.furniture.floorB', perspective: 0.45, tile: 110 },
    window: { x: 36, y: 70, w: 250, h: 150, panes: 3 },
    props: [
      { type: 'spotlight', x: 330, y: 26 },
      { type: 'spotlight', x: 470, y: 26 },
      { type: 'spotlight', x: 610, y: 26 },
      // the back wall: the TV and the fridge under their departments (orig)
      { type: 'tv', x: 470, y: 405, w: 140 },
      { type: 'cooler', x: 630, y: 405, w: 100, h: 190, color: 'kit.fridge' },
      // the red runner up to the display bed (orig)
      { type: 'rug', x: 296, y: 720, w: 210, d: 470, color: 'kit.rug', alt: 'kit.rugTrim' },
      // the hero: the rotating display bed on its plinth
      { type: 'displaybed', x: 290, y: 530, w: 250, color: 'kit.cushion' },
      // the living room corner: a couch, a coffee table, a lamp and a plant (orig: couch and table)
      { type: 'sofa', x: 30, y: 480, w: 200, color: 'kit.fabric' },
      { type: 'table', x: 60, y: 580, w: 150, h: 40, d: 70, color: 'kit.woodLight' },
      { type: 'lamp', x: 232, y: 470, h: 170 },
      { type: 'plant', x: 690, y: 560 },
    ],
    owner: { id: 'sofia', x: 610, y: 482, pose: 'idle', facing: 'left' },
    you: { x: 250, y: 640 },
    lights: [{ x: 160, y: 60, r: 240, color: 'int.furniture.light', fixture: false }, { x: 540, y: 60, r: 260, color: 'int.furniture.light', fixture: false }],
    custom: 'showroom',
    fns: {
      showroom: {
        static: function (ctx, K) {
          for (var i = 0; i < SIGNS.length; i++) hangingSign(ctx, K, SIGNS[i][0], SIGNS[i][1], SIGNS[i][2]);
          priceTag(ctx, K);
        },
        // the LIVING sign hangs in front of the window: its strings again over the live sky
        anim: function (ctx, K) { strings(ctx, K, SIGNS[1][1], SIGNS[1][2]); },
      },
    },
  });
})();
