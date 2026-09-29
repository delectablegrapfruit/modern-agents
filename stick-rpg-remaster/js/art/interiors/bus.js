// js/art/interiors/bus.js — owner: W2-Transit. SR.def.interior('bus'): the bus depot (ART_AUDIO §9:
// the departures board flipping letters, the Sky Bus through the window; Tabby at the ticket window).
// Pale cyan tiles, the depot's brand cyan on the trim (bld.bus), a tiled floor, two waiting benches
// and a poster for the six cities. The yard window is the custom fn's: its frame and sill and the
// "TICKETS" plate over the ticket window are static; every frame repaints the live sky in the window,
// the yard with the parked Sky Bus (its lamps lit from dusk to dawn) and then the window's bars, so
// the bus stands behind the glass.
// Colours are palette keys only (int.bus.*, bld.bus.*, kit.*, prop.*, light.*). Node-loadable:
// nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  var WIN = { x: 34, y: 64, w: 286, h: 168 };     // the yard window (the Sky Bus parks behind it)
  var PLATE = { x: 262, y: 236, w: 276, h: 30 };  // the plate over the ticket window
  var BUS_SCALE = 0.44;                            // the Sky Bus (378 u long) fits the window
  var DUSK = 19.5, DAWN = 6.5;                     // the bus's lamps are lit between these hours

  /** @returns {boolean} the hour is dark enough for the lamps. */
  function lampsOn(state) {
    var h = ((state && state.clock ? state.clock.min : 720) / 60) % 24;
    return h < DAWN || h >= DUSK;
  }

  /** The window's frame and sill (static). */
  function frame(ctx, kit) {
    kit.rect(ctx, WIN.x - 6, WIN.y - 6, WIN.w + 12, WIN.h + 12, kit.color('bld.bus.roof'), kit.LW);
    kit.box(ctx, WIN.x - 16, WIN.y + WIN.h + 16, WIN.w + 32, 10, 14, 'bld.bus.roof');
  }

  /** The glass: the live sky, the yard with the Sky Bus and a lamp post, then the bars (each frame). */
  function glass(ctx, kit, t, state) {
    kit.sky(ctx, [WIN.x, WIN.y, WIN.w, WIN.h], state);
    ctx.save();
    ctx.beginPath();
    ctx.rect(WIN.x, WIN.y, WIN.w, WIN.h);
    ctx.clip();
    var gy = WIN.y + WIN.h - 34;
    kit.rect(ctx, WIN.x - 2, gy, WIN.w + 4, 40, kit.color('sidewalk'), kit.DL);
    kit.line(ctx, [WIN.x, gy + 12, WIN.x + WIN.w, gy + 12], 1, kit.color('sidewalkJoint'));
    var lx = WIN.x + WIN.w - 40;
    kit.line(ctx, [lx, gy + 2, lx, WIN.y + 36], 4, kit.color('prop.lampPost'));
    kit.circle(ctx, lx, WIN.y + 32, 8, kit.color(lampsOn(state) ? 'light.lamp' : 'prop.lampGlass'), kit.DL);
    if (SR.art.vehicles && typeof SR.art.vehicles.draw === 'function') {
      var bob = Math.sin(t * 9) * 0.6;   // the engine idles
      SR.art.vehicles.draw(ctx, 'skybus', 0, WIN.x + 116, gy + 4 + bob, { scale: BUS_SCALE, t: t, lights: lampsOn(state), shadow: true });
    }
    ctx.restore();
    var bar = kit.color('bld.bus.roof');
    kit.line(ctx, [WIN.x + WIN.w / 2, WIN.y, WIN.x + WIN.w / 2, WIN.y + WIN.h], 6, bar);
    kit.line(ctx, [WIN.x, WIN.y + WIN.h * 0.42, WIN.x + WIN.w, WIN.y + WIN.h * 0.42], 5, bar);
    ctx.save();
    ctx.globalAlpha *= 0.2;
    kit.poly(ctx, [WIN.x + WIN.w * 0.08, WIN.y + WIN.h, WIN.x + WIN.w * 0.3, WIN.y, WIN.x + WIN.w * 0.42, WIN.y,
      WIN.x + WIN.w * 0.2, WIN.y + WIN.h], kit.color('white'), 0);
    ctx.restore();
    ctx.lineWidth = kit.LW;
    ctx.strokeStyle = kit.color('inkLine');
    ctx.strokeRect(WIN.x, WIN.y, WIN.w, WIN.h);
  }

  /** The plate over the ticket window, lettered from the text key card.bus.window. */
  function plate(ctx, kit) {
    kit.rect(ctx, PLATE.x, PLATE.y, PLATE.w, PLATE.h, kit.color('bld.bus.walls'), kit.LW);
    var s = SR.text && SR.text.has && SR.text.has('card.bus.window') ? SR.text('card.bus.window') : '';
    if (s) {
      SR.art.draw.text(ctx, s, PLATE.x + PLATE.w / 2, PLATE.y + PLATE.h / 2 + 1,
        { size: 18, weight: 900, role: 'display', align: 'center', baseline: 'middle', color: 'bld.bus.trim', maxWidth: PLATE.w - 16 });
    }
  }

  SR.def.interior('bus', {
    wall: { type: 'tiles', color: 'int.bus.wall', alt: 'int.bus.wallShade', trim: 'bld.bus.walls', size: 48 },
    floor: { type: 'tiles', a: 'int.bus.floorA', b: 'int.bus.floorB', perspective: 0.5, tile: 110 },
    props: [
      { type: 'departures', x: 350, y: 52, w: 336, h: 150 },
      { type: 'clock', x: 700, y: 88 },
      { type: 'poster', x: 44, y: 262, w: 96, h: 124, color: 'bld.bus.walls', alt: 'kit.paper', text: 'card.bus.poster' },
      { type: 'ticket', x: 262, y: 478, w: 276, color: 'int.bus.counter', alt: 'bld.bus.roof' },
      { type: 'bench', x: 30, y: 668, w: 210, color: 'bld.bus.roof' },
      { type: 'bench', x: 586, y: 640, w: 170, color: 'bld.bus.roof' },
      { type: 'plant', x: 600, y: 520 },
      { type: 'trash', x: 700, y: 590 },
    ],
    owner: { id: 'tabby', x: 400, y: 440, pose: 'idle' },
    you: { x: 190, y: 600 },
    lights: [{ x: 170, y: 64, r: 220, color: 'int.bus.light' }, { x: 520, y: 64, r: 240, color: 'int.bus.light' }],
    custom: 'depot',
    fns: {
      depot: {
        static: function (ctx, kit) { frame(ctx, kit); plate(ctx, kit); },
        anim: function (ctx, kit, t, state) { glass(ctx, kit, t, state); },
      },
    },
  });
})();
