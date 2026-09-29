// js/art/interiors/store.js — owner: W2-Food. SR.def.interior('store'): the Funkytown Five-O
// diorama (ART_AUDIO §9). Hero prop and loops: the slushee machine swirling under its glowing sign,
// the fridge with its flickering light (steady with Flash Reduction), the snack shelves, a security
// camera that follows you (a nod to the Hold-up), Dee behind the counter. Colours are palette keys
// (the int.store set: '@name'). The scene lives in x 0-760; behind the card only wall and floor.
// Node-loadable: nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  var SIGN = { x: 92, y: 132, w: 150, h: 46 };     // the SLUSHEE sign over the machine
  var CAM = { x: 40, y: 92 };                      // the security camera, top left (below the HUD strip)

  function txt(key) { return SR.text && SR.text.has && SR.text.has(key) ? SR.text(key) : ''; }
  function flashReduced() {
    try { return !!(SR.settings && typeof SR.settings.get === 'function' && SR.settings.get('access.flashReduction')); } catch (e) { return false; }
  }

  /** The sign board, the gum jar on the counter (its top is at y 390), the camera's bracket. */
  function heroStatic(ctx, K) {
    K.rect(ctx, SIGN.x, SIGN.y, SIGN.w, SIGN.h, K.color('kit.screen'));
    K.line(ctx, [SIGN.x + 20, 26, SIGN.x + 20, SIGN.y], 2);
    K.line(ctx, [SIGN.x + SIGN.w - 20, 26, SIGN.x + SIGN.w - 20, SIGN.y], 2);
    // the gum jar
    K.rect(ctx, 404, 358, 30, 34, K.color('kit.glass'), K.LW);
    for (var g = 0; g < 6; g++) K.circle(ctx, 410 + (g % 3) * 9, 384 - Math.floor(g / 3) * 9, 4, K.color(g % 2 ? 'kit.cushion' : 'kit.slushB'), 0);
    K.rect(ctx, 400, 352, 38, 8, K.color('kit.metal'), K.DL);
    // the camera bracket
    K.line(ctx, [CAM.x - 30, CAM.y - 14, CAM.x, CAM.y], 4, K.color('kit.metalDark'));
  }

  /** The sign's glow, and the camera turning to keep you in view. */
  function heroAnim(ctx, K, t, state) {
    var glow = flashReduced() ? 1 : 0.85 + 0.15 * Math.sin(t * 5);
    var s = txt('card.store.sign');
    if (s) {
      ctx.save();
      ctx.globalAlpha *= glow;
      SR.art.draw.text(ctx, s, SIGN.x + SIGN.w / 2, SIGN.y + 32, { size: 24, weight: 900, role: 'display', align: 'center', color: 'light.neonPink', maxWidth: SIGN.w - 16 });
      ctx.restore();
    }
    // the camera sweeps slowly, and stares at you after a robbery
    var robbed = state && state.records && state.records.robberies > 0;
    var a = robbed ? 0.62 : 0.35 + 0.25 * Math.sin(t * 0.6);
    ctx.save();
    ctx.translate(CAM.x, CAM.y);
    ctx.rotate(a);
    K.rect(ctx, -6, -12, 52, 24, K.color('kit.metal'), K.LW);
    K.rect(ctx, 44, -8, 10, 16, K.color('kit.screen'), K.DL);
    var lit = flashReduced() || Math.floor(t * 2) % 2 === 0;
    K.circle(ctx, 4, -4, 3.5, K.color(lit ? 'kit.red' : 'kit.metalDark'), 0);
    var sm = txt('card.store.camera');
    if (sm) SR.art.draw.text(ctx, sm, 20, 5, { size: 8, weight: 900, role: 'display', align: 'center', color: 'ink', maxWidth: 34 });
    ctx.restore();
  }

  SR.def.interior('store', {
    wall: { type: 'stripes', color: '@wall', alt: '@wallShade', trim: '@trim' },
    floor: { type: 'tiles', a: '@floorA', b: '@floorB', perspective: 0.5 },
    window: { x: 300, y: 86, w: 170, h: 120 },
    props: [
      { type: 'poster', x: 500, y: 92, w: 96, h: 120, color: 'kit.slushB', alt: 'kit.paper', text: 'card.store.poster' },
      { type: 'slushee', x: 110, y: 420 },
      { type: 'cooler', x: 470, y: 404 },
      { type: 'shelf', x: 608, y: 404, w: 146 },
      { type: 'counter', x: 90, y: 490, w: 360, color: '@counter' },
      { type: 'register', x: 318, y: 392, sortY: 490 },
      { type: 'plant', x: 690, y: 640 },
    ],
    owner: { id: 'dee', x: 262, y: 446, pose: 'idle' },
    you: { x: 520, y: 594 },
    lights: [{ x: 240, y: 52, r: 210, color: '@light', alpha: 0.22 }, { x: 560, y: 52, r: 210, color: '@light', alpha: 0.22 }],
    custom: 'storeHero',
    fns: { storeHero: { static: heroStatic, anim: heroAnim } },
  });
})();
