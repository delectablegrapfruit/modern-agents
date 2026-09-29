// js/art/props.js — owner: W2-Exterior. SR.art.props: the street furniture and park props of ART_AUDIO §6
// as upright cut-paper standees (the render core caches each as a sprite per type, variant, angle and
// zoom; CONTRACT §15.2): trees (the round oak r 40, the poplar, the cloud tree), lamps, benches (along
// or across the path), hydrants, bins, planters, mailboxes, newspaper boxes, bus shelters, billboards
// (5), sawhorses ("ROAD ENDS. OBVIOUSLY."), the statue plinth (a pigeon; your statue as President or
// Dictator with `cityReacts`), chess tables, coin binoculars, parked cars, the fountain jet, ducks,
// the kid's memorial, For Sale sign posts and flagpoles (the building details place the last three),
// plus the railing and castle-wall painters the ground bake may call. Wanted posters on shelters and
// lamp posts (Heat ≥ tuning.crime.police.posters) and the statue are reacting elements (GDD §3.14):
// drawn only while the `cityReacts` flag is on; `stateKey` names the state a sprite depends on.
// Node-loadable (CONTRACT §1): nothing is drawn at load time; colours are palette keys.
(function () {
  'use strict';
  var SR = window.SR;

  var SHADOW = [4, 6];          // the stacked-paper shadow offset (ART_AUDIO §1.1 rule 4), u
  var SHADOW_ALPHA = 0.18;
  var INK_U = 2;                // world ink: 2 u at zoom 1, never under 1.5 device px (ART_AUDIO §1.1 rule 2)
  var INK_MIN_PX = 1.5;
  var RAIL_POST = 48;           // railing posts every 48 u (ART_AUDIO §6)

  function C(k) { return SR.art.draw.color(k); }
  function tone(k, d) { return SR.art.draw.tone(C(k), d); }
  function word(key) { return SR.text && SR.text.has(key) ? SR.text(key) : ''; }
  function feature(f) { return !!(SR.features && SR.features[f]); }

  // Sprite boxes [w, h, ax, ay] in u: (ax, ay) is the ground contact point inside the box.
  var SIZE = {
    tree: [[100, 136, 50, 124], [70, 160, 35, 150], [104, 136, 52, 124]],
    lamp: [34, 90, 17, 82], bench: [76, 46, 38, 32], benchSide: [52, 108, 26, 62], hydrant: [26, 36, 12, 30],
    bin: [30, 42, 14, 36], planter: [52, 42, 26, 32], mailbox: [30, 50, 15, 44], newsbox: [30, 40, 14, 34],
    shelter: [128, 90, 64, 76], shelterSide: [64, 142, 32, 106], billboard: [144, 128, 72, 116],
    sawhorse: [100, 64, 50, 56], plinth: [88, 172, 44, 158], chessTable: [64, 50, 32, 36],
    binoculars: [36, 60, 17, 54], car: [160, 162, 80, 90], fountainJet: [84, 120, 42, 100], duck: [38, 26, 19, 20],
    memorial: [60, 44, 30, 32], forSale: [64, 70, 30, 62], flagpole: [64, 170, 10, 162],
  };
  var BILLBOARDS = 5;

  function side(a) { return a === 90 || a === 270; }

  /** @returns {{w: number, h: number, ax: number, ay: number}} a prop's sprite box in u (anchor = ground contact). */
  function size(type, variant, a) {
    var s = type === 'tree' ? SIZE.tree[((variant | 0) % 3 + 3) % 3] :
      type === 'bench' && side(a) ? SIZE.benchSide : type === 'shelter' && side(a) ? SIZE.shelterSide : SIZE[type];
    if (!s) return null;
    return { w: s[0], h: s[1], ax: s[2], ay: s[3] };
  }

  // ---------------------------------------------------------------------------------------------
  // A tiny painting kit (world units; lw is the ink width: 2 u, at least 1.5 device px)
  // ---------------------------------------------------------------------------------------------

  function kit(ctx) {
    var px = 1;
    if (typeof ctx.getTransform === 'function') { var m = ctx.getTransform(); px = Math.max(0.05, Math.hypot(m.a, m.b)); }
    var k = {
      lw: Math.max(INK_U, INK_MIN_PX / px),
      rect: function (x, y, w, h, c) { ctx.fillStyle = C(c); ctx.fillRect(x, y, w, h); },
      path: function (fn, c) { ctx.beginPath(); fn(); ctx.fillStyle = C(c); ctx.fill(); },
      ink: function (fn, w) {
        ctx.save(); ctx.beginPath(); fn();
        ctx.strokeStyle = C('ink'); ctx.globalAlpha *= 0.9; ctx.lineWidth = (w || 1) * k.lw;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore();
      },
      line: function (fn, c, w) {
        ctx.beginPath(); fn(); ctx.strokeStyle = C(c); ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke();
      },
      shadow: function (rx, ry, dx) {
        ctx.save(); ctx.globalAlpha *= SHADOW_ALPHA; ctx.fillStyle = C('ink');
        ctx.beginPath(); ctx.ellipse(SHADOW[0] + (dx || 0), SHADOW[1] * 0.5, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      },
      circle: function (x, y, r, c) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = C(c); ctx.fill(); },
      text: function (str, x, y, size, c, weight, maxW) {
        if (!str) return;
        ctx.font = SR.art.draw.font(size, weight || 900, 'display');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C(c);
        var w = ctx.measureText(str).width;
        if (maxW && w > maxW) ctx.font = SR.art.draw.font(size * maxW / w, weight || 900, 'display');
        ctx.fillText(str, x, y);
      },
    };
    return k;
  }

  // ---------------------------------------------------------------------------------------------
  // The props
  // ---------------------------------------------------------------------------------------------

  var DRAW = {};

  DRAW.tree = function (ctx, k, v) {
    v = ((v | 0) % 3 + 3) % 3;
    if (v === 2) {
      // The cloud tree: a paper-cloud crown on a thin trunk.
      k.shadow(30, 7);
      k.rect(-3, -64, 6, 64, 'prop.trunk');
      var bumps = [[-24, -78, 20], [0, -92, 26], [24, -78, 20], [-10, -70, 18], [14, -68, 18]];
      var crown = function () { bumps.forEach(function (c) { ctx.moveTo(c[0] + c[2], c[1]); ctx.arc(c[0], c[1], c[2], 0, Math.PI * 2); }); };
      // Ink the union's silhouette: a wide stroke of every bump, then the fill covers the inner arcs.
      k.ink(function () { ctx.rect(-3, -58, 6, 58); crown(); }, 1.6);
      k.path(crown, 'cloud');
      k.rect(-38, -60, 76, 2, 'cloudLine');
      return;
    }
    var tall = v === 1;
    var rx = tall ? 22 : 40, ry = tall ? 52 : 38, cy = tall ? -96 : -80, trunk = tall ? 44 : 48;
    k.shadow(rx * 0.8, rx * 0.25);
    k.rect(-4, -trunk, 8, trunk, 'prop.trunk');
    k.rect(-4, -trunk, 3, trunk, tone('prop.trunk', 1));
    k.path(function () { ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2); }, 'prop.leafShade');
    k.path(function () { ctx.ellipse(-rx * 0.1, cy - ry * 0.06, rx * 0.88, ry * 0.88, 0, 0, Math.PI * 2); }, tall ? 'prop.poplar' : 'prop.leaf');
    k.path(function () { ctx.ellipse(-rx * 0.34, cy - ry * 0.42, rx * 0.3, ry * 0.2, -0.5, 0, Math.PI * 2); }, 'prop.leafHi');
    k.ink(function () { ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2); ctx.moveTo(-4, cy + ry - 2); ctx.lineTo(-4, 0); ctx.moveTo(4, cy + ry - 2); ctx.lineTo(4, 0); });
  };

  function wanted(ctx, k, x, y, w) {
    // A wanted poster with your face (Heat ≥ the posters threshold; reacting element).
    var h = w * 1.3;
    k.rect(x - w / 2, y, w, h, 'fx.newsprint');
    k.circle(x, y + h * 0.42, w * 0.22, SR.art.stick && SR.art.stick.karmaColor ? SR.art.stick.karmaColor(karmaNow()) : 'karma.good.0');
    k.rect(x - w * 0.36, y + h * 0.1, w * 0.72, h * 0.12, 'ui.hp');
    k.ink(function () { ctx.rect(x - w / 2, y, w, h); }, 0.6);
  }

  function state() { return SR.state || null; }
  function karmaNow() { var s = state(); return s && s.stats ? s.stats.karma || 0 : 0; }
  function heatPosters() {
    var s = state(), t = SR.tuning && SR.tuning.crime && SR.tuning.crime.police;
    return !!(s && s.stats && feature('cityReacts') && t && typeof t.posters === 'number' && s.stats.heat >= t.posters);
  }
  function office() {
    var s = state();
    if (!s || !feature('cityReacts')) return null;
    var o = s.job && s.job.office;
    if (!o && s.election && s.election.status === 'office') o = s.election.path;
    return o === 'president' || o === 'dictator' ? o : null;
  }

  DRAW.lamp = function (ctx, k) {
    k.shadow(6, 3);
    k.rect(-5, -6, 10, 6, tone('prop.lampPost', 1));
    k.rect(-2, -66, 4, 62, 'prop.lampPost');
    k.path(function () { ctx.moveTo(-9, -66); ctx.lineTo(9, -66); ctx.lineTo(6, -76); ctx.lineTo(-6, -76); ctx.closePath(); }, 'prop.lampPost');
    k.rect(-6, -66, 12, 6, 'prop.lampGlass');
    k.ink(function () { ctx.rect(-2, -60, 4, 54); ctx.rect(-6, -66, 12, 6); ctx.moveTo(-9, -66); ctx.lineTo(-6, -76); ctx.lineTo(6, -76); ctx.lineTo(9, -66); });
    if (heatPosters()) wanted(ctx, k, 0, -44, 12);
  };

  DRAW.bench = function (ctx, k, v, a) {
    var wood = 'prop.bench', iron = 'prop.benchIron';
    if (side(a)) {
      // Along a north-south path: seen end-on, the long seat runs away from you.
      k.shadow(10, 26);
      k.rect(-12, -44, 24, 70, tone(wood, 1));
      k.rect(-12, 26, 24, 6, tone(wood, -1));
      k.rect(-14, -58, 5, 88, wood);
      k.rect(-10, 30, 3, 12, iron); k.rect(7, 30, 3, 12, iron);
      k.ink(function () { ctx.rect(-12, -44, 24, 76); ctx.rect(-14, -58, 5, 88); });
    } else {
      k.shadow(30, 5);
      k.rect(-30, -26, 60, 8, wood);
      k.rect(-30, -16, 60, 8, tone(wood, 1));
      k.rect(-30, -8, 60, 4, tone(wood, -1));
      k.rect(-26, -4, 4, 8, iron); k.rect(22, -4, 4, 8, iron);
      k.ink(function () { ctx.rect(-30, -26, 60, 8); ctx.rect(-30, -16, 60, 12); });
    }
    if ((v | 0) === 1 && !side(a)) {
      // Harold's bench: his paper cup on the seat.
      k.rect(18, -24, 6, 8, 'acc.cup');
      k.ink(function () { ctx.rect(18, -24, 6, 8); }, 0.6);
    }
  };

  DRAW.hydrant = function (ctx, k) {
    k.shadow(9, 3);
    k.path(function () { ctx.moveTo(-7, 0); ctx.lineTo(-7, -18); ctx.arc(0, -18, 7, Math.PI, 0); ctx.lineTo(7, 0); ctx.closePath(); }, 'prop.hydrant');
    k.rect(-10, -16, 20, 5, tone('prop.hydrant', -1));
    k.rect(-3, -28, 6, 3, tone('prop.hydrant', 1));
    k.rect(-8, -2, 16, 2, tone('prop.hydrant', -1));
    k.ink(function () { ctx.moveTo(-7, 0); ctx.lineTo(-7, -18); ctx.arc(0, -18, 7, Math.PI, 0); ctx.lineTo(7, 0); ctx.rect(-10, -16, 20, 5); });
  };

  DRAW.bin = function (ctx, k) {
    k.shadow(11, 4);
    k.path(function () { ctx.moveTo(-10, -30); ctx.lineTo(10, -30); ctx.lineTo(8, 0); ctx.lineTo(-8, 0); ctx.closePath(); }, 'prop.bin');
    k.rect(-12, -34, 24, 5, tone('prop.bin', 1));
    k.line(function () { ctx.moveTo(-4, -26); ctx.lineTo(-3, -4); ctx.moveTo(3, -26); ctx.lineTo(3, -4); }, tone('prop.bin', -1), 1.5);
    k.ink(function () { ctx.moveTo(-10, -30); ctx.lineTo(10, -30); ctx.lineTo(8, 0); ctx.lineTo(-8, 0); ctx.closePath(); ctx.rect(-12, -34, 24, 5); });
  };

  DRAW.planter = function (ctx, k) {
    k.shadow(20, 5);
    k.path(function () { ctx.moveTo(-18, -2); ctx.bezierCurveTo(-24, -34, 24, -34, 18, -2); ctx.closePath(); }, 'prop.leaf');
    k.circle(-6, -22, 6, 'prop.leafHi');
    k.path(function () { ctx.moveTo(-20, -14); ctx.lineTo(20, -14); ctx.lineTo(16, 0); ctx.lineTo(-16, 0); ctx.closePath(); }, 'prop.planter');
    k.rect(-20, -14, 40, 3, tone('prop.planter', 1));
    k.ink(function () { ctx.moveTo(-20, -14); ctx.lineTo(20, -14); ctx.lineTo(16, 0); ctx.lineTo(-16, 0); ctx.closePath(); });
  };

  DRAW.mailbox = function (ctx, k) {
    k.shadow(9, 3);
    k.rect(-3, -12, 6, 12, 'prop.lampPost');
    k.path(function () { ctx.moveTo(-10, -12); ctx.lineTo(-10, -30); ctx.arc(0, -30, 10, Math.PI, 0); ctx.lineTo(10, -12); ctx.closePath(); }, 'prop.mailbox');
    k.rect(-6, -30, 12, 3, 'ink');
    k.rect(-10, -18, 20, 3, tone('prop.mailbox', 1));
    k.ink(function () { ctx.moveTo(-10, -12); ctx.lineTo(-10, -30); ctx.arc(0, -30, 10, Math.PI, 0); ctx.lineTo(10, -12); ctx.closePath(); });
  };

  DRAW.newsbox = function (ctx, k) {
    k.shadow(10, 3);
    k.rect(-10, -30, 20, 26, 'prop.newsbox');
    k.rect(-7, -26, 14, 10, 'fx.newsprint');
    k.line(function () { ctx.moveTo(-5, -23); ctx.lineTo(5, -23); ctx.moveTo(-5, -20); ctx.lineTo(3, -20); }, 'ink', 1);
    k.rect(-8, -4, 3, 4, 'prop.lampPost'); k.rect(5, -4, 3, 4, 'prop.lampPost');
    k.ink(function () { ctx.rect(-10, -30, 20, 26); });
  };

  DRAW.shelter = function (ctx, k, v, a) {
    var post = 'prop.lampPost', glass = 'prop.shelter';
    var posters = heatPosters();
    if (side(a)) {
      // Along a north-south sidewalk: the roof slab runs away from you.
      k.shadow(18, 14);
      k.rect(-20, -40, 4, 72, post); k.rect(-20, -96, 4, 22, post);
      ctx.save(); ctx.globalAlpha *= 0.5; k.rect(-16, -88, 10, 116, glass); ctx.restore();
      k.rect(-2, -30, 14, 52, tone('prop.bench', 1));
      k.rect(-2, 22, 14, 3, tone('prop.bench', -1));
      // The roof: a glazed slab in a dark frame, seen from above.
      k.rect(-28, -102, 56, 112, post);
      ctx.save(); ctx.globalAlpha *= 0.75; k.rect(-24, -98, 48, 104, glass); ctx.restore();
      k.rect(-28, 10, 56, 6, tone(post, -1));
      k.line(function () { ctx.moveTo(-24, -64); ctx.lineTo(24, -64); ctx.moveTo(-24, -30); ctx.lineTo(24, -30); }, post, 2);
      k.ink(function () { ctx.rect(-28, -102, 56, 118); });
      if (posters) wanted(ctx, k, -12, -86, 10);
      return;
    }
    k.shadow(52, 8);
    ctx.save(); ctx.globalAlpha *= 0.55; k.rect(-50, -60, 100, 42, glass); ctx.restore();
    k.rect(-52, -62, 5, 62, post); k.rect(47, -62, 5, 62, post);
    k.rect(-58, -70, 116, 9, tone(post, 1));
    k.rect(-38, -16, 76, 6, 'prop.bench');
    k.rect(-34, -10, 3, 10, post); k.rect(31, -10, 3, 10, post);
    k.ink(function () { ctx.rect(-58, -70, 116, 9); ctx.rect(-50, -60, 100, 42); ctx.rect(-38, -16, 76, 6); });
    if (SR.art.logos) SR.art.logos.draw(ctx, 'bus', 36, -46, 16, { lw: k.lw * 0.5 });
    if (posters) { wanted(ctx, k, -30, -56, 12); wanted(ctx, k, -12, -56, 12); }
  };

  // Billboards: an ad per variant (a glyph and a text key). Text keys are optional (W2-City's en-world.js).
  var ADS = [['burger', 'acc.red'], ['lines', 'bld.nli.walls'], ['cloud', 'bld.casino.walls'], ['balls', 'bld.pawn.walls'], ['slushee', 'bld.store.walls']];
  var AD_KEYS = ['place.sign.billboard.1', 'place.sign.billboard.2', 'place.sign.billboard.3', 'place.sign.billboard.4', 'place.sign.billboard.5'];
  DRAW.billboard = function (ctx, k, v) {
    var i = ((v | 0) % BILLBOARDS + BILLBOARDS) % BILLBOARDS, ad = ADS[i];
    k.shadow(56, 6);
    k.rect(-48, -52, 6, 52, 'prop.lampPost'); k.rect(42, -52, 6, 52, 'prop.lampPost');
    k.rect(-62, -112, 124, 62, 'prop.billboard');
    k.rect(-58, -108, 116, 54, ad[1]);
    k.rect(-58, -108, 40, 54, tone(ad[1], 1));
    if (SR.art.logos) SR.art.logos.draw(ctx, ad[0], -38, -81, 34, { lw: k.lw * 0.6 });
    var t = word(AD_KEYS[i]);
    if (t) k.text(t, 18, -81, 11, 'white', 900, 68);
    k.ink(function () { ctx.rect(-62, -112, 124, 62); ctx.rect(-48, -50, 6, 50); ctx.rect(42, -50, 6, 50); });
  };

  DRAW.sawhorse = function (ctx, k) {
    k.shadow(38, 4);
    k.line(function () { ctx.moveTo(-32, 0); ctx.lineTo(-26, -28); ctx.lineTo(-20, 0); ctx.moveTo(20, 0); ctx.lineTo(26, -28); ctx.lineTo(32, 0); }, 'prop.lampPost', 4);
    k.rect(-38, -34, 76, 14, 'sawhorse');
    ctx.save(); ctx.beginPath(); ctx.rect(-38, -34, 76, 14); ctx.clip();
    k.path(function () { for (var i = -46; i < 40; i += 16) { ctx.moveTo(i, -20); ctx.lineTo(i + 8, -34); ctx.lineTo(i + 14, -34); ctx.lineTo(i + 6, -20); ctx.closePath(); } }, 'sawhorseStripe');
    ctx.restore();
    k.rect(-44, -50, 88, 14, 'white');
    k.text(word('place.sign.roadEnds'), 0, -43, 8, 'ink', 900, 82);
    k.ink(function () { ctx.rect(-38, -34, 76, 14); ctx.rect(-44, -50, 88, 14); ctx.moveTo(0, -36); ctx.lineTo(0, -34); });
  };

  DRAW.plinth = function (ctx, k) {
    // The statue plinth on Origin Plaza (64 × 64 footprint; the anchor is its south edge).
    var st = 'prop.plinth';
    k.shadow(36, 8, 0);
    k.rect(-32, -84, 64, 64, tone(st, 1));
    k.rect(-32, -20, 64, 20, st);
    k.rect(-36, -4, 72, 4, tone(st, -1));
    k.rect(-12, -14, 24, 6, 'bld.cityhall.trim');
    k.ink(function () { ctx.rect(-32, -84, 64, 84); ctx.moveTo(-32, -20); ctx.lineTo(32, -20); });
    var who = office();
    if (who && SR.art.stick) {
      // Your statue: white marble as President, red with a raised fist as Dictator (GDD §3.14).
      var marble = who === 'president' ? 'prop.statue' : 'acc.crimson', vein = who === 'president' ? 'acc.silver' : tone('acc.crimson', -1);
      SR.art.stick.draw(ctx, who === 'president' ? 'stand' : 'win', { x: 0, y: -46, view: 'city', scale: 1.5, head: marble, limb: vein, torso: vein, shadow: false, facing: 'down' });
    } else {
      // The pigeon on the empty plinth (ART_AUDIO §1.1 rule 6).
      k.path(function () { ctx.ellipse(6, -60, 7, 5, 0, 0, Math.PI * 2); }, 'prop.pigeon');
      k.circle(12, -65, 3.4, 'prop.pigeon');
      k.path(function () { ctx.moveTo(15, -65); ctx.lineTo(18, -64); ctx.lineTo(15, -63); }, 'prop.duckBill');
      k.ink(function () { ctx.ellipse(6, -60, 7, 5, 0, 0, Math.PI * 2); ctx.moveTo(15.4, -65); ctx.arc(12, -65, 3.4, 0, Math.PI * 2); }, 0.6);
    }
  };

  DRAW.chessTable = function (ctx, k) {
    k.shadow(22, 7);
    k.rect(-3, -16, 6, 16, 'prop.lampPost');
    k.path(function () { ctx.ellipse(0, -20, 24, 12, 0, 0, Math.PI * 2); }, 'prop.chess');
    ctx.save(); ctx.beginPath();
    for (var cx = 0; cx < 4; cx++) for (var cy = 0; cy < 4; cy++) if ((cx + cy) % 2) ctx.rect(-10 + cx * 5, -24 + cy * 2.5, 5, 2.5);
    ctx.fillStyle = C('prop.chessDark'); ctx.fill(); ctx.restore();
    k.circle(-6, -24, 1.8, 'prop.chessDark'); k.circle(6, -21, 1.8, 'white');
    k.path(function () { ctx.ellipse(-22, -4, 7, 4, 0, 0, Math.PI * 2); ctx.ellipse(22, -4, 7, 4, 0, 0, Math.PI * 2); }, 'prop.bench');
    k.ink(function () { ctx.ellipse(0, -20, 24, 12, 0, 0, Math.PI * 2); });
  };

  DRAW.binoculars = function (ctx, k) {
    var c = 'prop.binocular';
    k.shadow(9, 3);
    k.rect(-3, -32, 6, 32, c);
    k.rect(-8, -2, 16, 2, tone(c, -1));
    k.rect(-12, -46, 24, 14, c);
    k.rect(-10, -46, 20, 3, tone(c, 1));
    k.circle(-5, -39, 3.6, 'glass'); k.circle(5, -39, 3.6, 'glass');
    k.rect(8, -30, 4, 6, 'fx.coin');
    k.ink(function () { ctx.rect(-12, -46, 24, 14); ctx.rect(-3, -32, 6, 32); });
  };

  DRAW.car = function (ctx, k, v, a) {
    // A parked car: variant = one of SR.art.vehicles.TYPES (by index or name), a = heading in degrees.
    var V = SR.art.vehicles;
    if (!V) return;
    var types = ['compact', 'sedan', 'taxi', 'van'];
    var type = typeof v === 'string' ? v : types[((v | 0) % types.length + types.length) % types.length];
    var ang = (a || 0) * Math.PI / 180;
    V.draw(ctx, type, V.dirFromAngle(ang), 0, 0, { angle: ang, lights: false });
  };

  DRAW.fountainJet = function (ctx, k) {
    // The fountain's centre (its basin is baked into the ground): a pedestal and a paper spray.
    k.path(function () { ctx.ellipse(0, -4, 30, 12, 0, 0, Math.PI * 2); }, 'stone');
    k.path(function () { ctx.ellipse(0, -8, 24, 9, 0, 0, Math.PI * 2); }, 'water');
    k.rect(-6, -40, 12, 34, 'stone');
    k.rect(-6, -40, 4, 34, tone('stone', 1));
    k.path(function () { ctx.ellipse(0, -42, 16, 6, 0, 0, Math.PI * 2); }, 'stoneShade');
    k.path(function () {
      ctx.moveTo(-3, -44); ctx.bezierCurveTo(-4, -80, -30, -88, -36, -56); ctx.lineTo(-30, -56); ctx.bezierCurveTo(-26, -78, -6, -76, 0, -96);
      ctx.bezierCurveTo(6, -76, 26, -78, 30, -56); ctx.lineTo(36, -56); ctx.bezierCurveTo(30, -88, 4, -80, 3, -44); ctx.closePath();
    }, 'waterHi');
    k.ink(function () { ctx.ellipse(0, -4, 30, 12, 0, 0, Math.PI * 2); ctx.rect(-6, -40, 12, 32); }, 0.8);
  };

  DRAW.duck = function (ctx, k, v) {
    var f = (v | 0) % 2 ? -1 : 1;
    k.path(function () { ctx.ellipse(0, -6, 10, 6, 0, 0, Math.PI * 2); }, 'prop.duck');
    k.circle(f * 8, -13, 4.5, 'prop.duck');
    k.path(function () { ctx.moveTo(f * 12, -14); ctx.lineTo(f * 17, -12.5); ctx.lineTo(f * 12, -11); }, 'prop.duckBill');
    k.circle(f * 9, -14, 0.9, 'ink');
    k.ink(function () { ctx.ellipse(0, -6, 10, 6, 0, 0, Math.PI * 2); ctx.moveTo(f * 8 + 4.5, -13); ctx.arc(f * 8, -13, 4.5, 0, Math.PI * 2); }, 0.6);
  };

  DRAW.memorial = function (ctx, k) {
    // The kid's memorial: his skateboard leaning on a candle box, flowers and a candle (BALANCE: P0).
    k.shadow(22, 4);
    k.rect(-6, -18, 16, 18, 'kit.woodLight');
    ctx.save(); ctx.translate(-14, -2); ctx.rotate(-0.35);
    k.rect(-4, -30, 9, 30, 'acc.board'); k.rect(-4, -30, 9, 4, 'acc.red');
    k.circle(-2, -3, 2, 'acc.wheel'); k.circle(3, -3, 2, 'acc.wheel');
    k.ink(function () { ctx.rect(-4, -30, 9, 30); }, 0.7);
    ctx.restore();
    [[14, -8, 'acc.red'], [20, -12, 'acc.yellow'], [24, -6, 'acc.pink'], [17, -3, 'acc.white']].forEach(function (f) {
      k.line(function () { ctx.moveTo(f[0], f[1]); ctx.lineTo(f[0] - 2, 0); }, 'prop.leaf', 1.4);
      k.circle(f[0], f[1], 3, f[2]);
    });
    k.rect(0, -26, 4, 8, 'acc.cream');
    k.path(function () { ctx.ellipse(2, -29, 1.6, 3, 0, 0, Math.PI * 2); }, 'light.lamp');
    k.ink(function () { ctx.rect(-6, -18, 16, 18); ctx.rect(0, -26, 4, 8); }, 0.7);
  };

  DRAW.forSale = function (ctx, k) {
    // A For Sale board on a post (unowned homes; the building details place it).
    k.shadow(10, 3);
    k.rect(-2, -44, 4, 44, 'kit.woodDark');
    k.rect(-26, -58, 52, 30, 'white');
    k.rect(-26, -58, 52, 5, 'ui.hp'); k.rect(-26, -33, 52, 5, 'ui.hp');
    k.text(word('place.sign.forSale'), 0, -43, 9, 'ui.hp-ink', 900, 46);
    k.ink(function () { ctx.rect(-26, -58, 52, 30); ctx.rect(-2, -28, 4, 28); });
  };

  DRAW.flagpole = function (ctx, k, v) {
    // A flagpole with the city's flag (variant 1: a blue presidential flag, 2: a red one).
    var cols = [['kit.flagA', 'kit.flagB', 'kit.flagC'], ['acc.navy', 'white', 'acc.navy'], ['acc.crimson', 'acc.crimson', 'acc.black']][(v | 0) % 3];
    k.rect(-2, -150, 4, 150, 'acc.silver');
    k.circle(0, -152, 3.5, 'acc.gold');
    [0, 1, 2].forEach(function (i) { k.rect(2, -146 + i * 10, 44, 10, cols[i]); });
    k.ink(function () { ctx.rect(2, -146, 44, 30); ctx.rect(-2, -150, 4, 150); }, 0.7);
  };

  // ---------------------------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------------------------

  /**
   * Draws a prop with its ground contact point at the origin, in world units (CONTRACT §15.2).
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} type a key of SR.art.props.types()
   * @param {number|string=} variant the type's variant (trees 0-2, billboards 0-4, the bench 1 = Harold's; a car type for 'car')
   * @param {number=} a the angle in degrees (benches and shelters: 90 / 270 run north-south; cars: the heading)
   * @returns {boolean} false for an unknown type (nothing drawn)
   */
  function draw(ctx, type, variant, a) {
    var fn = DRAW[type];
    if (!fn) return false;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    try { fn(ctx, kit(ctx), variant || 0, a || 0); } finally { ctx.restore(); }
    return true;
  }

  /**
   * @returns {string} what a prop's look depends on in the state ('' for a static prop): the render
   *   core appends it to the sprite cache key so a reacting prop re-bakes when it changes.
   */
  function stateKey(type) {
    if (type === 'plinth') return office() || '';
    if (type === 'lamp' || type === 'shelter') return heatPosters() ? 'wanted:' + (SR.art.stick && SR.art.stick.karmaColor ? SR.art.stick.karmaColor(karmaNow()) : '') : '';
    return '';
  }

  /** Draws a railing from a to b ([x, y] in u): posts every 48 u and two rails (ART_AUDIO §6). */
  function railing(ctx, a, b) {
    var len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / RAIL_POST));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = C('railing');
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (var i = 0; i <= n; i++) { var x = a[0] + (b[0] - a[0]) * i / n, y = a[1] + (b[1] - a[1]) * i / n; ctx.moveTo(x, y); ctx.lineTo(x, y - 16); }
    ctx.moveTo(a[0], a[1] - 16); ctx.lineTo(b[0], b[1] - 16);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(a[0], a[1] - 8); ctx.lineTo(b[0], b[1] - 8); ctx.stroke();
    ctx.restore();
  }

  /** Draws the castle wall from a to b, w u thick: a stone top with merlons over a shaded face. */
  function wall(ctx, a, b, w) {
    w = w || 20;
    var hz = 18, horiz = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
    var r = horiz ? [Math.min(a[0], b[0]), a[1] - w / 2, Math.max(a[0], b[0]), a[1] + w / 2] : [a[0] - w / 2, Math.min(a[1], b[1]), a[0] + w / 2, Math.max(a[1], b[1])];
    ctx.save();
    ctx.fillStyle = C('stoneShade'); ctx.fillRect(r[0], r[3] - hz, r[2] - r[0], hz);
    ctx.fillStyle = C('stone'); ctx.fillRect(r[0], r[1] - hz, r[2] - r[0], r[3] - r[1]);
    ctx.fillStyle = tone('stone', 1);
    ctx.beginPath();
    if (horiz) for (var x = r[0]; x + 12 <= r[2]; x += 24) ctx.rect(x, r[1] - hz - 6, 12, 6);
    else for (var y = r[1]; y + 12 <= r[3]; y += 24) ctx.rect(r[0], y - hz - 6, r[2] - r[0], 6);
    ctx.fill();
    ctx.strokeStyle = C('ink'); ctx.globalAlpha = 0.8; ctx.lineWidth = INK_U;
    ctx.strokeRect(r[0], r[1] - hz, r[2] - r[0], r[3] - r[1] + hz);
    ctx.restore();
  }

  SR.art.props = {
    draw: draw,
    size: size,
    stateKey: stateKey,
    railing: railing,
    wall: wall,
    /** @returns {string[]} every prop type drawn here. */
    types: function () { return Object.keys(DRAW); },
    /** @returns {number} the variants of a type (trees 3, billboards 5, benches 2, ducks 2, flagpoles 3, else 1). */
    variants: function (type) { return { tree: 3, billboard: BILLBOARDS, bench: 2, duck: 2, flagpole: 3, car: 4 }[type] || 1; },
  };
})();
