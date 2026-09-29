// js/art/interiors/home.js — owner: W2-Home. SR.def.interior('home'): the five home interiors
// (ART_AUDIO §9): the Paperview apartment (bare, a crack in the wall), its top floor (a balcony
// door with a view), the Edgeview penthouse (skyline windows), the Hillcrest mansion (a grand hall
// under a chandelier, your portrait) and the Castle (a throne room under banners). Every furniture
// piece you own and use appears in a fixed spot of the home you live in, at its tier (the pod,
// the SkyDish, the Workstation, the Grand Library, the Home Gym, the Cocktail Lounge; the P0
// satellite beside the TV); the answering machine blinks while messages are unread. A home you own
// but live elsewhere stands empty; one for sale shows a For Sale sign with a photo of the building
// and its price.
//
// The building scene draws SR.art.interior('home', { homeId, mode }) (D60). The kit draws one def
// per interior id, so 'home' is a frame: its custom static fn paints the tier's own room (a def per
// tier, drawn with SR.art.interior.fromDef, with that tier's palette int.<tier>.*), and its prop
// list holds every tier's props, each shown only in its tier, so the kit's per-frame pass keeps the
// live sky in the windows, the loops (the TV, the answering machine, the chandelier, the fish) and
// the props standing in front of you. Colours are explicit palette keys (the frame's own set is
// int.home). Node-loadable: nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;

  var TIERS = ['apt', 'apt2', 'pent', 'mansion', 'castle'];
  var YOU = { x: 250, y: 560 };   // where you stand (the building scene's float texts rise from here)
  // The penthouse skyline's lit windows: 20:00 to 06:00 (presentation, CONTRACT D49); noon without a state.
  var LIT_FROM = 1200, LIT_UNTIL = 360, NOON = 720;

  // ---- whose room, and what is in it --------------------------------------------------------------
  /** @returns {string|null} the worldmap door of a home tier (SR.def.home `door`). */
  function doorOf(id) { var d = SR.reg && SR.reg.home && SR.reg.home[id]; return d ? d.door : null; }

  /**
   * The tier this door shows now, as the door resolver would pick it (ARCHITECTURE §8.4): the tier
   * you live in behind params.homeId's door (so moving up to Paperview's top floor, or moving in at
   * an Owned door, redraws the room you now live in without leaving), else the best tier you own
   * there, else params.homeId (a For Sale listing); without params, the home you live in.
   * Allocation-free: props' `when` call it every frame.
   * @returns {string}
   */
  function tierOf(state, params) {
    var id = params && params.homeId, h = state && state.homes, liv = h && h.living;
    if (TIERS.indexOf(id) < 0) return TIERS.indexOf(liv) >= 0 ? liv : 'apt';
    var door = doorOf(id);
    if (!door || !h) return id;
    if (TIERS.indexOf(liv) >= 0 && doorOf(liv) === door) return liv;
    var best = null, owned = h.owned || [];
    for (var i = 0; i < TIERS.length; i++) if (owned.indexOf(TIERS[i]) >= 0 && doorOf(TIERS[i]) === door) best = TIERS[i];
    return best || id;
  }
  function livesIn(state, tier) { return !!(state && state.homes && state.homes.living === tier); }
  function owns(state, tier) { return !!(state && state.homes && (state.homes.owned || []).indexOf(tier) >= 0); }
  /** @returns {number} the tier of a piece in use at home (SR.rules.homes.has), 0 when absent or stored. */
  function inUse(state, base) {
    if (!state || !state.furniture) return 0;
    if (SR.rules && SR.rules.homes && typeof SR.rules.homes.has === 'function') return SR.rules.homes.has(state, base);
    var t = state.furniture.owned[base] || 0;
    return (state.furniture.storage || []).indexOf(base) >= 0 ? 0 : t;
  }

  // ---- the furniture's fixed spots (floor props: x, y = the left end of the front bottom edge) ---
  var SPOTS = {
    bed: { x: 20, y: 520 },
    books: { x: 300, y: 440 }, library: { x: 290, y: 405 },
    tv: { x: 440, y: 470 }, dish: { x: 620, y: 470 },
    table: { x: 300, y: 545 },
    freezer: { x: 600, y: 590 },
    minibar: { x: 400, y: 600 }, lounge: { x: 360, y: 610 },
    pc: { x: 540, y: 700 },          // the Workstation (220 u) still ends at x 760 (ART_AUDIO §9)
    treadmill: { x: 330, y: 712 },
    aquarium: { x: 20, y: 712 },
  };
  // The castle's throne takes the back of the hall: its pieces move round it.
  var CASTLE_SPOTS = { books: { x: 170, y: 430 }, library: { x: 30, y: 405 }, tv: { x: 480, y: 470 }, dish: { x: 660, y: 470 } };
  function spot(tier, name) { return (tier === 'castle' && CASTLE_SPOTS[name]) || SPOTS[name]; }

  /** The furniture of a tier: every piece at its spot, shown while you live there and use it. */
  function furniture(tier) {
    function at(name, extra) { var s = spot(tier, name), o = { x: s.x, y: s.y }; for (var k in extra) o[k] = extra[k]; return o; }
    function when(base, tierNeeded) {
      return function (state) { return livesIn(state, tier) && (tierNeeded ? inUse(state, base) === tierNeeded : inUse(state, base) > 0); };
    }
    return [
      at('bed', { type: 'bed', when: when('bed'), pick: function (st) { return inUse(st, 'bed') >= 2 ? 'pod' : null; } }),
      at('books', { type: 'books', when: when('books', 1) }),
      at('library', { type: 'library', when: when('books', 2) }),
      at('tv', { type: 'tv', when: when('tv') }),
      // the dish: the P0 satellite plugged into the TV, or the TV's own SkyDish tier (P1)
      at('dish', { type: 'skydish', when: function (st) { return livesIn(st, tier) && (inUse(st, 'satellite') > 0 || inUse(st, 'tv') >= 2); } }),
      at('freezer', { type: 'freezer', when: when('freezer') }),
      at('minibar', { type: 'minibar', w: 120, when: when('minibar', 1) }),
      at('lounge', { type: 'lounge', w: 300, when: when('minibar', 2) }),
      at('pc', { type: 'computer', when: when('pc'), pick: function (st) { return inUse(st, 'pc') >= 2 ? 'workstation' : null; } }),
      at('treadmill', { type: 'treadmill', when: when('treadmill'), pick: function (st) { return inUse(st, 'treadmill') >= 2 ? 'homegym' : null; } }),
      at('aquarium', { type: 'aquarium', w: 140, when: when('aquarium') }),
      // the answering machine on its side table: always there in the home you live in
      at('table', { type: 'table', w: 90, h: 70, d: 50, color: 'kit.woodDark', when: function (st) { return livesIn(st, tier); } }),
      { type: 'answering', x: spot(tier, 'table').x + 12, y: spot(tier, 'table').y - 70, sortY: spot(tier, 'table').y + 1,
        when: function (st) { return livesIn(st, tier); } },
    ];
  }

  // ---- each tier's room ---------------------------------------------------------------------------
  function win(tier, x, y, w, h) { return { type: 'window', x: x, y: y, w: w, h: h, frame: 'int.' + tier + '.trim' }; }
  /** A rug lies under everything: sorted first, so the kit never redraws it over a stick or a piece. */
  function rug(x, y, w, d, color, alt) { return { type: 'rug', x: x, y: y, w: w, d: d, color: color, alt: alt, sortY: 0 }; }

  var ROOMS = {
    apt: {
      wall: { type: 'plain', color: 'int.apt.wall', alt: 'int.apt.wallShade', trim: 'int.apt.trim' },
      floor: { type: 'planks', a: 'int.apt.floorA', b: 'int.apt.floorB', perspective: 0.55 },
      props: [win('apt', 70, 80, 210, 140), { type: 'crack', x: 330, y: 50 }, { type: 'door', x: 640, y: 170, color: 'kit.wood', alt: 'int.apt.trim' },
        rug(150, 650, 260, 90, 'kit.fabric', 'kit.linen')],
      lights: [{ x: 380, y: 60, r: 220, color: 'int.apt.light' }],
    },
    apt2: {
      wall: { type: 'wallpaper', color: 'int.apt2.wall', alt: 'int.apt2.wallShade', trim: 'int.apt2.trim' },
      floor: { type: 'planks', a: 'int.apt2.floorA', b: 'int.apt2.floorB', perspective: 0.55 },
      props: [{ type: 'balconydoor', x: 40, y: 100, w: 160, h: 290, frame: 'int.apt2.trim' }, win('apt2', 400, 80, 170, 130),
        { type: 'clock', x: 250, y: 70 }, { type: 'door', x: 640, y: 170, color: 'kit.wood', alt: 'int.apt2.trim' },
        { type: 'plant', x: 230, y: 470 }, rug(130, 660, 320, 110, 'kit.cushion', 'kit.linen')],
      lights: [{ x: 400, y: 60, r: 240, color: 'int.apt2.light' }],
    },
    pent: {
      wall: { type: 'panels', color: 'int.pent.wall', alt: 'int.pent.wallShade', trim: 'int.pent.trim' },
      floor: { type: 'tiles', a: 'int.pent.floorA', b: 'int.pent.floorB', perspective: 0.6 },
      props: [win('pent', 30, 40, 330, 250), win('pent', 390, 40, 330, 250), { type: 'lamp', x: 700, y: 470 },
        { type: 'plant', x: 250, y: 470 }, rug(110, 670, 380, 130, 'int.pent.wallShade', 'int.pent.trim')],
      lights: [{ x: 380, y: 50, r: 260, color: 'int.pent.light' }],
    },
    mansion: {
      wall: { type: 'wallpaper', color: 'int.mansion.wall', alt: 'int.mansion.wallShade', trim: 'int.mansion.trim', wainscotH: 110 },
      floor: { type: 'checker', a: 'int.mansion.floorA', b: 'int.mansion.floorB', perspective: 0.6 },
      props: [{ type: 'portrait', x: 80, y: 80, w: 110, h: 130, person: 'player', mood: 'smug' }, { type: 'chandelier', x: 270, y: 70 },
        win('mansion', 540, 50, 170, 240), { type: 'plant', x: 230, y: 460 },
        rug(110, 690, 460, 170, 'kit.rug', 'kit.rugTrim')],
      lights: [{ x: 370, y: 90, r: 280, color: 'int.mansion.light' }],
    },
    castle: {
      wall: { type: 'stone', color: 'int.castle.wall', alt: 'int.castle.wallShade', trim: 'int.castle.trim', wainscot: false },
      floor: { type: 'tiles', a: 'int.castle.floorA', b: 'int.castle.floorB', perspective: 0.7 },
      props: [{ type: 'banners', x: 170, y: 30, w: 420, h: 190, color: 'int.castle.accent', alt: 'kit.gold' },
        win('castle', 40, 70, 90, 220), win('castle', 640, 70, 90, 220),
        { type: 'throne', x: 305, y: 410, color: 'kit.gold', alt: 'int.castle.accent' },
        rug(290, 712, 180, 300, 'kit.rug', 'kit.rugTrim')],
      lights: [{ x: 380, y: 60, r: 280, color: 'int.castle.light' }],
    },
  };

  // ---- the For Sale sign (a home you do not own) ----------------------------------------------------
  // UI §5.6: the For Sale card shows the listing with an exterior thumbnail. The card is W1-D's, so
  // the listing's facts are the greeting (greet.home) and the sign in the room carries the photo of
  // the building, the price and the realty's name. It stands below every tier's windows (the live
  // sky is repainted over the glass each frame) and inside the scene (x ≤ 760, ART_AUDIO §9).
  var SIGN = { x: 470, y: 316, w: 220, h: 196, post: 600 };   // clear of the penthouse's lamp (x 700)
  var PHOTO = { w: 132, h: 74, pad: 4, dpr: 2 };
  var photos = {};                  // door building id → { img, w, h } | null (baked once a session)

  /** @returns {object|null} the worldmap building behind a home tier's door (the photo's model). */
  function doorBuilding(tier) {
    var door = doorOf(tier), map = SR.reg.worldmap && SR.reg.worldmap.main, list = map && map.buildings;
    if (!door || !list) return null;
    if (Array.isArray(list)) { for (var i = 0; i < list.length; i++) if (list[i].id === door) return list[i]; return null; }
    return list[door] || null;
  }

  /** @returns {object|null} the door's building baked by SR.art.exterior (W1-G) at the photo's size, once. */
  function photoOf(tier) {
    var def = doorBuilding(tier), E = SR.art.exterior;
    if (!def || !E || typeof E.build !== 'function' || typeof E.geom !== 'function') return null;
    if (photos[def.id] === undefined) {
      try {
        var b = E.geom(def).bounds, bw = b[2] - b[0], bh = b[3] - b[1];
        var zoom = Math.min((PHOTO.w - 2 * PHOTO.pad) / bw, (PHOTO.h - 2 * PHOTO.pad) / bh);
        photos[def.id] = { img: E.build(def, zoom, PHOTO.dpr).albedo, w: bw * zoom, h: bh * zoom };
      } catch (e) {
        SR.util.warnOnce('home.photo.' + tier, 'SR.art.interior home: the For Sale photo of ' + tier + ' failed: ' + e.message);
        photos[def.id] = null;
      }
    }
    return photos[def.id];
  }

  function forSaleSign(tier) {
    return function (ctx, kit, state) {
      if (owns(state, tier)) return;
      var x = SIGN.x, y = SIGN.y, w = SIGN.w, h = SIGN.h;
      kit.rect(ctx, x + w / 2 - 7, y + h - 4, 14, SIGN.post - y - h + 4, kit.color('kit.woodDark'));
      kit.rect(ctx, x, y, w, h, kit.color('kit.paper'));
      kit.rect(ctx, x, y, w, 34, kit.color('kit.red'), kit.DL);
      var price = SR.tuning && SR.tuning.homes && SR.tuning.homes[tier] ? SR.tuning.homes[tier].price : 0;
      var say = function (key, vars) { return SR.text && SR.text.has(key) ? SR.text(key, vars) : ''; };
      SR.art.draw.text(ctx, say('card.home.forSaleSign'), x + w / 2, y + 18, { size: 20, weight: 900, role: 'display', align: 'center', color: 'kit.paper', maxWidth: w - 16 });
      // the photo: the building from the street, on the sky of the realty's brochure
      var px = x + (w - PHOTO.w) / 2, py = y + 44, ph = photoOf(tier);
      kit.rect(ctx, px, py, PHOTO.w, PHOTO.h, kit.color('ui.primary-100'), 0);
      if (ph) ctx.drawImage(ph.img, px + (PHOTO.w - ph.w) / 2, py + (PHOTO.h - ph.h) / 2, ph.w, ph.h);
      kit.rect(ctx, px, py, PHOTO.w, PHOTO.h, null, kit.DL);
      SR.art.draw.text(ctx, say('card.home.signPrice', { price: SR.text ? SR.text.money(price) : String(price) }), x + w / 2, py + PHOTO.h + 24,
        { size: 24, weight: 900, role: 'display', align: 'center', color: 'ink', maxWidth: w - 16 });
      SR.art.draw.text(ctx, say('card.home.signRealty'), x + w / 2, y + h - 18, { size: 14, weight: 700, align: 'center', color: 'ink', maxWidth: w - 16 });
    };
  }

  /** The tier's own def (drawn by the frame's static fn): its room, its props, its furniture, its sign. */
  var TIER_DEFS = {};
  TIERS.forEach(function (tier) {
    var r = ROOMS[tier];
    TIER_DEFS[tier] = {
      palette: tier, wall: r.wall, floor: r.floor, lights: r.lights,
      props: r.props.concat(furniture(tier)),
      custom: 'sign', fns: { sign: forSaleSign(tier) },
    };
  });

  /** @returns {object} the kit renderer of a tier's room. */
  function room(tier) { return SR.art.interior.fromDef('home.' + tier, TIER_DEFS[tier]); }

  // ---- the frame's props: every tier's, each only in its own tier ----------------------------------
  var FRAME_PROPS = [];
  TIERS.forEach(function (tier) {
    TIER_DEFS[tier].props.forEach(function (p) {
      var q = {}, k;
      for (k in p) if (Object.prototype.hasOwnProperty.call(p, k)) q[k] = p[k];
      var inner = p.when;
      q.when = function (state, params) { return tierOf(state, params) === tier && (!inner || inner(state, params)); };
      FRAME_PROPS.push(q);
    });
  });

  // The penthouse's view: the city's towers across its two windows. The geometry is fixed, so it is
  // worked out once here (the anim fn runs every frame and allocates nothing).
  var PENT_WINDOWS = ROOMS.pent.props.filter(function (p) { return p.type === 'window'; });
  var SKY_TOWERS = [], SKY_LIGHTS = [], SKY_MULLIONS = [];
  PENT_WINDOWS.forEach(function (wr, n) {
    for (var i = 0; i < 7; i++) {
      var bw = 30 + ((i * 37 + n * 11) % 25), bh = 60 + ((i * 53 + n * 29) % 90);
      var bx = wr.x + 8 + i * (wr.w - 16) / 7, by = wr.y + wr.h - bh;
      SKY_TOWERS.push(bx, by, bw, bh);
      for (var r = 0; r < 4; r++) if ((i + r + n) % 3) SKY_LIGHTS.push(bx + 6 + (r % 2) * 12, by + 10 + r * 14);
    }
    // the kit's panes (3 across, 2 down for a window this size), drawn again over the towers
    SKY_MULLIONS.push([wr.x + wr.w / 3, wr.y, wr.x + wr.w / 3, wr.y + wr.h], [wr.x + wr.w * 2 / 3, wr.y, wr.x + wr.w * 2 / 3, wr.y + wr.h],
      [wr.x, wr.y + wr.h / 2, wr.x + wr.w, wr.y + wr.h / 2]);
  });
  var SKY_ALPHA = 0.72;             // the towers read as solid shapes in the haze; the sky still tints them
  var PENT_FRONT = null;            // the penthouse's floor props (the ones that can stand in front of the glass)

  /** The penthouse's view: the city's towers across the windows (drawn over the live sky each frame). */
  function skyline(ctx, kit, t, state) {
    if (tierOf(state, kit.params) !== 'pent') return;
    var PROPS = SR.art.interior.kit.PROPS;
    if (!PENT_FRONT) PENT_FRONT = TIER_DEFS.pent.props.filter(function (p) { return PROPS[p.type] && !PROPS[p.type].wall && p.type !== 'rug'; });
    var min = state && state.clock ? state.clock.min : NOON;
    var night = min < LIT_UNTIL || min >= LIT_FROM;
    var i, j;
    ctx.save();
    // Clip to the glass, less whatever stands in front of it (the lamp, the Grand Library): each
    // cut-out is wound the other way, so the even-odd rule leaves it out.
    ctx.beginPath();
    for (i = 0; i < PENT_WINDOWS.length; i++) ctx.rect(PENT_WINDOWS[i].x, PENT_WINDOWS[i].y, PENT_WINDOWS[i].w, PENT_WINDOWS[i].h);
    for (i = 0; i < PENT_FRONT.length; i++) {
      var p = PENT_FRONT[i];
      if (p.when && !p.when(state, kit.params)) continue;
      var d = PROPS[p.type], w = p.w || d.w, hh = (p.h || d.h) + 40;
      ctx.rect(p.x + w, p.y - hh, -w, hh);
    }
    ctx.clip('evenodd');
    ctx.fillStyle = SR.art.draw.alpha(kit.color('ui.ink-700'), SKY_ALPHA);
    for (i = 0; i < SKY_TOWERS.length; i += 4) ctx.fillRect(SKY_TOWERS[i], SKY_TOWERS[i + 1], SKY_TOWERS[i + 2], SKY_TOWERS[i + 3]);
    if (night) {
      ctx.fillStyle = kit.color('kit.bulb');
      for (i = 0; i < SKY_LIGHTS.length; i += 2) ctx.fillRect(SKY_LIGHTS[i], SKY_LIGHTS[i + 1], 5, 6);
    }
    var trim = kit.color('int.pent.trim');
    for (j = 0; j < SKY_MULLIONS.length; j++) kit.line(ctx, SKY_MULLIONS[j], 6, trim);
    ctx.restore();
  }

  SR.def.interior('home', {
    wall: { type: 'plain', wainscot: false },
    floor: { type: 'planks', a: 'int.home.floorA', b: 'int.home.floorB' },
    props: FRAME_PROPS,
    you: { x: YOU.x, y: YOU.y },
    custom: 'room',
    fns: {
      room: {
        static: function (ctx, kit, state) { room(tierOf(state, kit.params)).drawStatic(ctx, state); },
        anim: skyline,
      },
    },
  });
})();
