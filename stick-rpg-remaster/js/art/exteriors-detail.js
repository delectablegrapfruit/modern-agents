// js/art/exteriors-detail.js — owner: W2-Exterior (W3-Light in wave 3). SR.def.exterior: the ART_AUDIO
// §5.2 signature detail of all 16 buildings, painted by the exterior painter (js/art/exteriors.js,
// W1-G) into each building's sprite after its masses and door treatment: Paperview's skylights,
// balcony and rooftop letters; Hillcrest's tall windows and grove; the castle's moat; Edgeview's crown
// lettering, rooftop garden and terrace; the bank's "$" relief and BANK letters; NLI's yellow plate,
// stacked-line logo, rooftop billboard and the fishing stick; U of S's pediment, thinking statue and
// ivy; City Hall's lettering, clock and flagpole; Fine Line's thin serif lettering and the sofa in
// the window; McSticks' mascot and fry arches; Sticky's beer mug; the casino's dice and cloud
// marquee; Five-O's graffiti and slushee sign; the pawn shop's three gold balls and barred windows;
// the depot's departures board; the parked Sky Bus. Each `signature` lists the rects (projected
// space, x, y - 0.5 z) the visibility invariant keeps clear of other buildings (ARCHITECTURE §8.1).
// State: For Sale signs on homes you own no tier of (P0), the kid's memorial once he is gone (P0,
// BALANCE kid.givePack) and, only while the `cityReacts` flag is on, the reacting elements of GDD
// §3.14 (the NLI billboard with your portrait as CEO, castle flags in your karma colour, the butler at
// the mansion gate, banners on Main Street and City Hall in office). A boot hook re-bakes a building
// whose state key changed (SR.render.invalidate('building:<id>')).
// Node-loadable (CONTRACT §1): definitions only at load time; drawing happens inside detail().
(function () {
  'use strict';
  var SR = window.SR;

  // ---------------------------------------------------------------------------------------------
  // Shared helpers (world units in the sprite's transform; g = the painter's detail geometry)
  // ---------------------------------------------------------------------------------------------

  var SERIF = 'news';
  // How much higher (u of z) the painter raises the castle's tallest cone tower, the south-east one
  // (ART_AUDIO §5.2; js/art/exteriors.js ARCH.castle since docs/requests/W2-Exterior.md 2a landed),
  // so the karma flags stay on the painter's pennants.
  var CASTLE_TALLEST = 40;
  var baked = {};            // building id -> the state key its last detail was drawn with

  function fill(ctx, r, c) { ctx.fillStyle = c; ctx.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]); }
  function hits(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }
  function winRect(w) { return [w[0], w[1], w[0] + w[2], w[1] + w[3]]; }
  function h01(a, b, c) { return SR.util.hash(a, b, c) / 4294967296; }

  function ink(ctx, g, k, fn) {
    ctx.save();
    ctx.strokeStyle = g.colors.ink;
    ctx.globalAlpha *= 0.9;
    ctx.lineWidth = g.lineWidth * (k || 1);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    fn();
    ctx.stroke();
    ctx.restore();
  }
  function outline(ctx, g, r, k) { ink(ctx, g, k || 0.7, function () { ctx.rect(r[0], r[1], r[2] - r[0], r[3] - r[1]); }); }

  /** Drops the lit windows that a rect painted over them now hides (no glass glows through it at night). */
  function cover(g, r) {
    for (var i = g.windows.length - 1; i >= 0; i--) if (hits(winRect(g.windows[i]), r)) g.windows.splice(i, 1);
  }
  /** Replaces the windows a rect crosses by their parts left and right of it (the display window around the sofa). */
  function punch(g, r) {
    for (var i = g.windows.length - 1; i >= 0; i--) {
      var w = g.windows[i], wr = winRect(w);
      if (!hits(wr, r)) continue;
      g.windows.splice(i, 1);
      if (r[0] - wr[0] > 4) g.windows.push([wr[0], w[1], r[0] - wr[0], w[3]]);
      if (wr[2] - r[2] > 4) g.windows.push([r[2], w[1], wr[2] - r[2], w[3]]);
    }
  }

  /** @returns {string} a text key's text, or '' while the key is not registered (signs then stay blank). */
  function word(key) { return SR.text && SR.text.has(key) ? SR.text(key) : ''; }

  /**
   * Letters fitted into a rect. o: role ('display' | 'news'), weight, fill (height share), tracking (em),
   * stroke (an ink outline width in lineWidths), upper.
   */
  function letters(ctx, g, str, r, colour, o) {
    if (!str) return;
    o = o || {};
    var w = r[2] - r[0], h = r[3] - r[1];
    var size = Math.max(3, h * (o.fill || 0.7));
    var D = SR.art.draw, role = o.role || 'display', weight = o.weight || (role === 'display' ? 900 : 700);
    if (o.upper) str = str.toUpperCase();
    ctx.save();
    ctx.font = D.font(size, weight, role);
    if (o.tracking && 'letterSpacing' in ctx) ctx.letterSpacing = (o.tracking * size) + 'px';
    var tw = ctx.measureText(str).width;
    if (tw > w * 0.92) { size *= w * 0.92 / tw; ctx.font = D.font(size, weight, role); if (o.tracking && 'letterSpacing' in ctx) ctx.letterSpacing = (o.tracking * size) + 'px'; }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var x = (r[0] + r[2]) / 2, y = (r[1] + r[3]) / 2 + size * 0.04;
    if (o.stroke) { ctx.lineJoin = 'round'; ctx.strokeStyle = g.colors.ink; ctx.lineWidth = g.lineWidth * o.stroke; ctx.strokeText(str, x, y); }
    ctx.fillStyle = colour;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  /** Draws a prop of js/art/props.js standing at (x, y), scaled. */
  function prop(ctx, type, x, y, scale, variant, a) {
    var A = SR.art.props;
    if (!A || typeof A.draw !== 'function') return;
    ctx.save();
    ctx.translate(x, y);
    if (scale && scale !== 1) ctx.scale(scale, scale);
    A.draw(ctx, type, variant || 0, a || 0);
    ctx.restore();
  }
  /** Draws a brand glyph of js/art/logos.js centred on (x, y), h tall. */
  function logo(ctx, g, name, x, y, h, opts) {
    var Lg = SR.art.logos;
    if (!Lg || typeof Lg.draw !== 'function') return;
    var o = opts || {};
    if (!o.lw) o.lw = g.lineWidth * 0.6;
    Lg.draw(ctx, name, x, y, h, o);
  }
  function stick(ctx, pose, o) { if (SR.art.stick && typeof SR.art.stick.draw === 'function') SR.art.stick.draw(ctx, pose, o); }

  function massOf(g, role) { for (var i = 0; i < g.masses.length; i++) if (g.masses[i].role === role) return g.masses[i]; return g.masses[0]; }
  function defOf(id) {
    var wm = SR.reg.worldmap && SR.reg.worldmap.main;
    var list = wm && Array.isArray(wm.buildings) ? wm.buildings : [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  /** @returns {object} a building's worldmap `exterior` entry ({} when it has none). */
  function exOf(id) { var d = defOf(id); return (d && d.exterior) || {}; }
  /** @returns {number[]|null} a worldmap spot [x, y] (people's places, CONTRACT §15.1). */
  function spotOf(name) {
    var wm = SR.reg.worldmap && SR.reg.worldmap.main, p = wm && wm.spots && wm.spots[name];
    return Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1]) ? p : null;
  }
  // The kid's corner when the worldmap has no `spots.kidCorner`; the mansion's second signature rect
  // covers the memorial there (tests/node/exterior-detail.test.cjs checks it against the worldmap).
  var KID_CORNER = [2090, 1110];

  /**
   * The shop roof sign's board as the painter draws it (js/art/exteriors.js roofSign: a sign top's
   * south face, else 0.55 of the facade, ≤ 260 u wide, from the sign height to 0.3 of it), until the
   * painter hands it over (docs/requests/W2-Exterior.md 2d). @returns {number[]} [x0, y0, x1, y1]
   */
  function roofBoard(g, m) {
    if (g.roofSign) return g.roofSign.slice();
    var ex = exOf(g.id), K = g.projection, f = m.facade, t = null;
    (ex.tops || []).forEach(function (x) { if (!t && x.kind === 'sign') t = x; });
    if (t) return [t.rect[0], t.rect[3] - K * t.h, t.rect[2], t.rect[3] - K * m.h];
    var sh = K * Math.max(30, (typeof ex.signH === 'number' ? ex.signH : m.h + 70) - m.h);
    var sw = Math.min((f[2] - f[0]) * 0.55, 260), cx = (f[0] + f[2]) / 2;
    return [cx - sw / 2, f[1] - sh, cx + sw / 2, f[1] - sh * 0.3];
  }

  // ---- state readers (the reacting elements need the `cityReacts` flag; For Sale and the memorial are P0)
  function reacts() { return !!(SR.features && SR.features.cityReacts); }
  function owns(s, tier) { return !!(s && s.homes && Array.isArray(s.homes.owned) && s.homes.owned.indexOf(tier) >= 0); }
  function forSale(s, tiers) { for (var i = 0; i < tiers.length; i++) if (owns(s, tiers[i])) return false; return true; }
  function office(s) {
    if (!s || !reacts()) return '';
    var o = s.job && s.job.office;
    if (!o && s.election && s.election.status === 'office') o = s.election.path;
    return o === 'president' || o === 'dictator' ? o : '';
  }
  function ceo(s) { return !!(s && reacts() && s.job && s.job.ranks && s.job.ranks.nli === 'ceo'); }
  /** @returns {string} your karma colour (the flags'), or its band name where the rig is not loaded (Node keys). */
  function karmaCol(s) {
    var k = s && s.stats ? s.stats.karma || 0 : 0;
    if (SR.art.stick && typeof SR.art.stick.karmaColor === 'function') return SR.art.stick.karmaColor(k);
    // The band's palette key (the rules' B-04c band index; its formula where the rules are absent).
    var St = SR.rules && SR.rules.stats, b = St && typeof St.band === 'function' ? St.band(k) : -1;
    if (!(b >= 0 && b <= 9)) b = Math.max(0, Math.min(9, Math.ceil(Math.abs(k) / 10) - 1));
    return 'karma.' + (k < 0 ? 'evil.' : 'good.') + b;
  }
  function kidGone(s) { return !!(s && s.npc && s.npc.kid && s.npc.kid.dead); }

  /** Banners in office (GDD §3.14): blue with a star as President, red with a fist as Dictator, hung along a facade. */
  function banners(ctx, g, s, f, n) {
    var who = office(s);
    if (!who) return;
    var cloth = g.pal(who === 'president' ? 'acc.navy' : 'acc.crimson'), mark = g.pal(who === 'president' ? 'white' : 'acc.black');
    var bw = 14, bh = Math.min(40, (f[3] - f[1]) * 0.55);
    for (var i = 0; i < n; i++) {
      var x = f[0] + (f[2] - f[0]) * (i + 0.5) / n - bw / 2, y = f[1] + 4;
      var r = [x, y, x + bw, y + bh];
      cover(g, r);
      fill(ctx, [x - 3, y - 2, x + bw + 3, y], g.colors.stoneShade);
      ctx.fillStyle = cloth;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw, y + bh); ctx.lineTo(x + bw / 2, y + bh - 6); ctx.lineTo(x, y + bh); ctx.closePath(); ctx.fill();
      ctx.fillStyle = mark;
      ctx.beginPath();
      if (who === 'president') for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 2.2 : 5; ctx.lineTo(x + bw / 2 + Math.cos(a) * rr, y + bh * 0.35 + Math.sin(a) * rr); }
      else { ctx.arc(x + bw / 2, y + bh * 0.3, 3.6, 0, Math.PI * 2); ctx.rect(x + bw / 2 - 2, y + bh * 0.3, 4, 8); }
      ctx.fill();
      ink(ctx, g, 0.5, function () { ctx.moveTo(x, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw, y + bh); ctx.lineTo(x + bw / 2, y + bh - 6); ctx.lineTo(x, y + bh); ctx.closePath(); });
    }
  }

  /** A For Sale sign on a post standing at (x, y) (props.js draws it); the windows behind the board stay dark. */
  function saleSign(ctx, g, x, y, scale) {
    var k = scale || 1;
    cover(g, [x - 27 * k, y - 60 * k, x + 27 * k, y - 26 * k]);
    prop(ctx, 'forSale', x, y, k);
  }

  // The state each building's detail depends on (a key per building; '' when it depends on none).
  var KEYS = {
    home_apt: function (s) { return forSale(s, ['apt2']) ? 'sale' : ''; },
    home_mansion: function (s) { return [forSale(s, ['mansion']) ? 'sale' : '', kidGone(s) ? 'memorial' : '', reacts() && owns(s, 'mansion') ? 'butler' : '', office(s)].join('|'); },
    home_castle: function (s) { return (forSale(s, ['castle']) ? 'sale' : '') + '|' + (reacts() && owns(s, 'castle') ? karmaCol(s) : ''); },
    home_pent: function (s) { return forSale(s, ['pent']) ? 'sale' : ''; },
    nli: function (s) { return (ceo(s) ? 'ceo:' + karmaCol(s) + ':' + JSON.stringify((s.player && s.player.look) || null) + ':' + ((s.player && s.player.name) || '') : '') + '|' + office(s); },
    bank: office, cityhall: office, mcsticks: office, bar: office, casino: office, store: office, pawn: office,
  };

  /** @param {string} id a building id @param {object=} s the state @returns {string} the state key its detail depends on ('' for none). */
  function stateKey(id, s) { var f = KEYS[id]; return f ? f(s || null) : ''; }

  /** Records the key a detail drew with (every detail calls it first). */
  function drew(id, s) { baked[id] = stateKey(id, s); }

  /**
   * Re-bakes (through SR.render.invalidate) every building whose state key changed since its sprite
   * was drawn. @returns {string[]} the invalidated building ids
   */
  function refresh() {
    var out = [];
    if (!SR.render || typeof SR.render.invalidate !== 'function') return out;
    Object.keys(baked).forEach(function (id) {
      if (stateKey(id, SR.state) === baked[id]) return;
      delete baked[id];
      SR.render.invalidate('building:' + id);
      out.push(id);
    });
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // home_apt: Paperview Apartments (house, 3 floors)
  // ---------------------------------------------------------------------------------------------
  SR.def.exterior('home_apt', {
    signature: [[860, 726, 1152, 772], [672, 828, 1340, 864], [630, 952, 1382, 980]],
    detail: function (ctx, g, s) {
      drew('home_apt', s);
      var m = g.masses[0], P = g.colors, K = g.projection, f = m.facade;
      var x0 = m.rect[0], y0 = m.rect[1], x1 = m.rect[2], y1 = m.rect[3];
      var ridgeH = Math.min((y1 - y0) * 0.35, 90);
      var yR = (y0 + y1) / 2 - K * (m.h + ridgeH), yS = y1 - K * m.h;
      var sky = g.pal(['bld.home_apt.skylight', 'glass']);
      // Skylights on the south slope (a nod to the original's brown roof); they glow at night.
      var n = 6, sw = 44, sh = 24, sy = yR + (yS - yR) * 0.4;
      for (var i = 0; i < n; i++) {
        var sx = x0 + 72 + i * ((x1 - x0 - 144 - sw) / (n - 1));
        fill(ctx, [sx, sy, sx + sw, sy + sh], P.trim);
        fill(ctx, [sx + 4, sy + 4, sx + sw - 4, sy + sh - 4], sky);
        ctx.save(); ctx.fillStyle = g.tone(sky, 1); ctx.beginPath();
        ctx.moveTo(sx + 10, sy + 4); ctx.lineTo(sx + 18, sy + 4); ctx.lineTo(sx + 12, sy + sh - 4); ctx.lineTo(sx + 6, sy + sh - 4); ctx.closePath(); ctx.fill(); ctx.restore();
        fill(ctx, [sx, sy + sh, sx + sw, sy + sh + 3], g.tone(P.roof, -1));
        outline(ctx, g, [sx, sy, sx + sw, sy + sh]);
        g.windows.push([sx + 5, sy + 5, sw - 10, sh - 10]);
      }
      // "PAPERVIEW" letters standing on the ridge.
      var name = word('place.sign.home_apt');
      if (name) {
        var cx = (x0 + x1) / 2, lr = [cx - 144, yR - 38, cx + 144, yR + 2];
        fill(ctx, [lr[0] + 30, yR - 4, lr[2] - 30, yR + 2], g.tone(P.roof, -1));
        letters(ctx, g, name, lr, P.trim, { fill: 0.9, stroke: 1.2, tracking: 0.08 });
      }
      // The top floor's balcony: a slab under its windows and a railing in front of them.
      var fh = (f[3] - f[1] - 6) / 3, by = f[1] + 3 + fh - 3;
      var bx0 = f[0] + 24, bx1 = f[2] - 24;
      fill(ctx, [bx0, by, bx1, by + 5], P.trim);
      fill(ctx, [bx0, by + 5, bx1, by + 8], g.tone(P.shade, -1));
      ctx.save();
      ctx.strokeStyle = P.ink; ctx.globalAlpha = 0.7; ctx.lineWidth = Math.max(0.8, g.lineWidth * 0.35);
      ctx.beginPath();
      for (var x = bx0; x <= bx1; x += 7) { ctx.moveTo(x, by - 12); ctx.lineTo(x, by); }
      ctx.stroke();
      ctx.restore();
      fill(ctx, [bx0, by - 13, bx1, by - 11], P.trim);
      outline(ctx, g, [bx0, by, bx1, by + 8]);
      // The top floor is for sale while you own no part of it (the Paperview card's "Top floor: Tour").
      if (KEYS.home_apt(s)) {
        var br = [bx1 - 110, by - 20, bx1 - 20, by + 1];
        cover(g, br);
        fill(ctx, br, g.pal('white'));
        fill(ctx, [br[0], br[1], br[2], br[1] + 3], g.pal('ui.hp'));
        fill(ctx, [br[0], br[3] - 3, br[2], br[3]], g.pal('ui.hp'));
        letters(ctx, g, word('place.sign.forSale'), [br[0] + 4, br[1] + 3, br[2] - 4, br[3] - 3], g.pal('ui.hp-ink'), { fill: 0.8 });
        outline(ctx, g, br);
      }
    },
  });

  // ---------------------------------------------------------------------------------------------
  // home_mansion: Hillcrest Mansion (house, door E onto Main Street)
  // ---------------------------------------------------------------------------------------------
  SR.def.exterior('home_mansion', {
    signature: [[1752, 942, 1896, 1066], [2056, 1074, 2124, 1124]],
    detail: function (ctx, g, s) {
      drew('home_mansion', s);
      var m = g.masses[0], P = g.colors, f = m.facade, lw = g.lineWidth;
      // Tall windows: two storeys of arched windows with shutters replace the painter's small grid.
      fill(ctx, [f[0] + lw, f[1] + 2, f[2] - lw, f[3] - 5], P.walls);
      for (var i = g.windows.length - 1; i >= 0; i--) if (hits(winRect(g.windows[i]), f)) g.windows.splice(i, 1);
      var storey = (f[3] - f[1] - 8) / 2, ww = 16, wh = Math.min(34, storey - 10);
      var cols = Math.floor((f[2] - f[0] - 16) / 44), sx = (f[0] + f[2]) / 2 - cols * 22;
      var shut = g.pal(['bld.home_mansion.gate', 'railing']);
      for (var r = 0; r < 2; r++) {
        for (var c = 0; c < cols; c++) {
          var x = sx + c * 44 + 14, y = f[1] + 6 + r * storey + (storey - wh) / 2;
          fill(ctx, [x - 6, y + 2, x - 2, y + wh], shut);
          fill(ctx, [x + ww + 2, y + 2, x + ww + 6, y + wh], shut);
          ctx.save();
          ctx.fillStyle = P.trim;
          ctx.beginPath(); ctx.moveTo(x - 2, y + wh + 2); ctx.lineTo(x - 2, y + ww / 2); ctx.arc(x + ww / 2, y + ww / 2, ww / 2 + 2, Math.PI, 0); ctx.lineTo(x + ww + 2, y + wh + 2); ctx.closePath(); ctx.fill();
          ctx.fillStyle = P.glass;
          ctx.beginPath(); ctx.moveTo(x, y + wh); ctx.lineTo(x, y + ww / 2); ctx.arc(x + ww / 2, y + ww / 2, ww / 2, Math.PI, 0); ctx.lineTo(x + ww, y + wh); ctx.closePath(); ctx.fill();
          ctx.restore();
          fill(ctx, [x + ww / 2 - 0.6, y + 2, x + ww / 2 + 0.6, y + wh], P.trim);
          fill(ctx, [x - 3, y + wh + 1, x + ww + 3, y + wh + 3], P.trim);
          g.windows.push([x + 1, y + ww / 2, ww - 2, wh - ww / 2 - 1]);
        }
      }
      fill(ctx, [f[0] + lw, f[1] + 4 + storey, f[2] - lw, f[1] + 6 + storey], g.tone(P.walls, -1));
      // A grove of three trees at the west end of the house (the first signature rect), the poplar
      // behind the two oaks.
      var x0 = m.rect[0], y1 = m.rect[3];
      var grove = [[x0 + 84, y1 - 10, 0.72, 1], [x0 + 42, y1 - 6, 0.8, 0], [x0 + 120, y1 - 4, 0.66, 0]];
      grove.forEach(function (t) { cover(g, [t[0] - 34 * t[2], t[1] - 150 * t[2], t[0] + 34 * t[2], t[1] - 30 * t[2]]); });
      grove.forEach(function (t) { prop(ctx, 'tree', t[0], t[1], t[2], t[3]); });
      if (forSale(s, ['mansion'])) saleSign(ctx, g, m.rect[2] - 134, y1 - 4, 0.9);
      // The butler at the gate once you own it (P1, cityReacts).
      if (reacts() && owns(s, 'mansion')) {
        var gx = f[2] - 16;
        fill(ctx, [gx - 14, f[3] - 44, gx - 8, f[3]], g.colors.stone);
        ctx.save(); ctx.strokeStyle = shut; ctx.lineWidth = 1.4; ctx.beginPath();
        for (var b = gx - 6; b <= gx + 14; b += 5) { ctx.moveTo(b, f[3] - 32); ctx.lineTo(b, f[3]); }
        ctx.moveTo(gx - 8, f[3] - 28); ctx.lineTo(gx + 14, f[3] - 28); ctx.stroke(); ctx.restore();
        cover(g, [gx - 30, f[3] - 60, gx + 16, f[3]]);
        stick(ctx, 'wave', { x: gx - 22, y: f[3] - 2, t: 0.2, view: 'city', facing: 'down', look: { head: 'npc.stone', acc: ['bowtie', 'vest'], col: { bowtie: 'acc.black', vest: 'acc.black' } } });
      }
      // The kid's memorial at his corner once he is gone (BALANCE kid.givePack, P0).
      var kc = spotOf('kidCorner') || KID_CORNER;
      if (kidGone(s)) prop(ctx, 'memorial', kc[0], kc[1], 1);
      banners(ctx, g, s, f, 3);
    },
  });

  // ---------------------------------------------------------------------------------------------
  // home_castle: The Castle (castle on the Castle Rim, gate in the south face)
  // ---------------------------------------------------------------------------------------------
  SR.def.exterior('home_castle', {
    signature: [[946, 528, 1534, 546]],
    detail: function (ctx, g, s) {
      drew('home_castle', s);
      var m = g.masses[0], P = g.colors, f = m.facade, K = g.projection;
      var d = g.door, gap = d ? [d.x - 28, d.x + 28] : [0, 0];
      // The moat line along the foot of the walls, with a drawbridge at the gate.
      var moat = g.pal(['bld.home_castle.moat', 'water']), hi = g.pal('waterHi');
      [[f[0] + 6, gap[0]], [gap[1], f[2] - 6]].forEach(function (seg) {
        if (seg[1] - seg[0] < 4) return;
        fill(ctx, [seg[0], f[3] - 7, seg[1], f[3] - 1], moat);
        ctx.save(); ctx.strokeStyle = hi; ctx.lineWidth = 1.2; ctx.beginPath();
        for (var x = seg[0] + 6; x < seg[1] - 8; x += 22) { ctx.moveTo(x, f[3] - 4); ctx.quadraticCurveTo(x + 4, f[3] - 6, x + 8, f[3] - 4); }
        ctx.stroke(); ctx.restore();
        ink(ctx, g, 0.5, function () { ctx.moveTo(seg[0], f[3] - 7); ctx.lineTo(seg[1], f[3] - 7); });
      });
      if (d) {
        var wood = g.pal('kit.wood');
        fill(ctx, [gap[0] + 2, f[3] - 1, gap[1] - 2, f[3] + 5], wood);
        ctx.save(); ctx.strokeStyle = g.tone(wood, -1); ctx.lineWidth = 1; ctx.beginPath();
        for (var p = gap[0] + 8; p < gap[1] - 4; p += 7) { ctx.moveTo(p, f[3] - 1); ctx.lineTo(p, f[3] + 5); }
        ctx.stroke(); ctx.restore();
        ink(ctx, g, 0.6, function () { ctx.rect(gap[0] + 2, f[3] - 1, gap[1] - gap[0] - 4, 6); ctx.moveTo(gap[0] + 2, f[3] - 1); ctx.lineTo(gap[0] - 6, f[3] - 40); ctx.moveTo(gap[1] - 2, f[3] - 1); ctx.lineTo(gap[1] + 6, f[3] - 40); });
      }
      if (forSale(s, ['castle'])) saleSign(ctx, g, (d ? d.x : (f[0] + f[2]) / 2) - 80, f[3] - 2, 1);
      // Tower flags in your karma colour once the castle is yours (P1, cityReacts): the painter's
      // pennants are repainted at the same spots (towers from the worldmap's turret tops).
      if (reacts() && owns(s, 'castle')) {
        var def = defOf('home_castle'), tops = def && def.exterior && def.exterior.tops ? def.exterior.tops : [];
        var midX = (m.rect[0] + m.rect[2]) / 2, midY = (m.rect[1] + m.rect[3]) / 2, flag = SR.art.draw.color(karmaCol(s));
        var tallest = null;
        tops.forEach(function (t) { if (t.kind === 'turret' && (t.rect[1] + t.rect[3]) / 2 >= midY && (!tallest || t.rect[0] > tallest.rect[0])) tallest = t; });
        tops.forEach(function (t) {
          if (t.kind !== 'turret') return;
          var cx = (t.rect[0] + t.rect[2]) / 2, cy = (t.rect[1] + t.rect[3]) / 2;
          var R = Math.min(t.rect[2] - t.rect[0], t.rect[3] - t.rect[1]) / 2 * (cy >= midY ? 1.05 : 1);
          var fy = cy - K * (t.h + (t === tallest ? CASTLE_TALLEST : 0)) - R * 1.9, dir = cx > midX ? 1 : -1;
          ctx.save(); ctx.fillStyle = flag; ctx.beginPath();
          ctx.moveTo(cx, fy - 23); ctx.lineTo(cx + dir * 24, fy - 17); ctx.lineTo(cx, fy - 11); ctx.closePath(); ctx.fill(); ctx.restore();
          ink(ctx, g, 0.4, function () { ctx.moveTo(cx, fy - 23); ctx.lineTo(cx + dir * 24, fy - 17); ctx.lineTo(cx, fy - 11); });
        });
      }
    },
  });

  // ---------------------------------------------------------------------------------------------
  // home_pent: Edgeview Tower (podium and set-back tower)
  // ---------------------------------------------------------------------------------------------
  SR.def.exterior('home_pent', {
    // The rooftop garden and the whole crown band (y 3449-3479; the worldmap's rect starts at 3470).
    signature: [[3784, 3212, 4076, 3482]],
    detail: function (ctx, g, s) {
      drew('home_pent', s);
      var P = g.colors, K = g.projection, lw = g.lineWidth;
      var pod = massOf(g, 'main'), tw = massOf(g, 'tower');
      // The painter's top tier: inset 12 u per 200 u of height.
      var tiers = Math.max(1, Math.ceil(tw.h / 200)), ins = (tiers - 1) * 12;
      var t = [tw.rect[0] + ins, tw.rect[1] + ins, tw.rect[2] - ins, tw.rect[3] - ins];
      var roof = [t[0], t[1] - K * tw.h, t[2], t[3] - K * tw.h];
      var face = [t[0], t[3] - K * tw.h, t[2], t[3] - K * (tiers - 1) * 200];
      // The crown: a pale band with "EDGEVIEW" across the top tier.
      var band = [face[0], face[1] + 3, face[2], face[1] + 3 + Math.min(30, (face[3] - face[1]) * 0.55)];
      cover(g, band);
      fill(ctx, band, g.tone(P.trim, 0));
      fill(ctx, [band[0], band[3] - 3, band[2], band[3]], g.tone(P.shade, -1));
      letters(ctx, g, word('place.sign.home_pent'), [band[0] + 10, band[1] + 2, band[2] - 10, band[3] - 4], P.shade, { fill: 0.82, tracking: 0.25 });
      outline(ctx, g, band);
      // The rooftop garden on the penthouse level: a lawn, a pool, shrubs and loungers.
      var garden = g.pal(['bld.home_pent.garden', 'grass']);
      var lawn = [roof[0] + 10, roof[1] + 12, roof[0] + (roof[2] - roof[0]) * 0.34, roof[1] + (roof[3] - roof[1]) * 0.4];
      fill(ctx, lawn, garden);
      ctx.save(); ctx.fillStyle = g.tone(garden, -1);
      for (var i = 0; i < 18; i++) { ctx.beginPath(); ctx.arc(lawn[0] + 6 + h01('pent', i, 1) * (lawn[2] - lawn[0] - 12), lawn[1] + 6 + h01('pent', i, 2) * (lawn[3] - lawn[1] - 12), 1.3, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      outline(ctx, g, lawn, 0.5);
      var pool = [roof[2] - 10 - (roof[2] - roof[0]) * 0.26, roof[1] + 12, roof[2] - 10, roof[1] + (roof[3] - roof[1]) * 0.3];
      fill(ctx, [pool[0] - 4, pool[1] - 4, pool[2] + 4, pool[3] + 4], g.pal('paperEdge'));
      fill(ctx, pool, g.pal('water'));
      fill(ctx, [pool[0], pool[1], pool[2], pool[1] + 4], g.pal('waterHi'));
      outline(ctx, g, [pool[0] - 4, pool[1] - 4, pool[2] + 4, pool[3] + 4], 0.5);
      for (var c = 0; c < 2; c++) {
        var lx = pool[0] + 6 + c * 22, ly = pool[3] + 10;
        fill(ctx, [lx, ly, lx + 14, ly + 7], g.pal('white'));
        outline(ctx, g, [lx, ly, lx + 14, ly + 7], 0.4);
      }
      for (var x = roof[0] + 16; x < roof[2] - 12; x += 26) {
        ctx.save(); ctx.fillStyle = g.pal('prop.leafShade'); ctx.beginPath(); ctx.arc(x, roof[3] - 12, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = g.pal('prop.leaf'); ctx.beginPath(); ctx.arc(x - 2, roof[3] - 14, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      prop(ctx, 'tree', lawn[0] + 26, lawn[3] - 8, 0.42, 0);
      // The podium's roof terrace: decking and parasols on the strips beside the tower.
      var pr = [pod.rect[0], pod.rect[1] - K * pod.h, pod.rect[2], pod.rect[3] - K * pod.h];
      [[pr[0] + lw, tw.rect[0] - 2], [tw.rect[2] + 2, pr[2] - lw]].forEach(function (sx) {
        if (sx[1] - sx[0] < 16) return;
        var deck = [sx[0] + 4, pr[1] + 14, sx[1] - 4, pr[3] - 16];
        fill(ctx, deck, g.pal('kit.woodLight'));
        ctx.save(); ctx.strokeStyle = g.pal('kit.wood'); ctx.lineWidth = 1; ctx.beginPath();
        for (var y = deck[1] + 6; y < deck[3]; y += 6) { ctx.moveTo(deck[0], y); ctx.lineTo(deck[2], y); }
        ctx.stroke(); ctx.restore();
        outline(ctx, g, deck, 0.5);
        [0.25, 0.7].forEach(function (k, j) {
          var px = (deck[0] + deck[2]) / 2, py = deck[1] + (deck[3] - deck[1]) * k, rr = Math.min(16, (deck[2] - deck[0]) / 2);
          ctx.save(); ctx.fillStyle = g.pal(j ? 'acc.teal' : 'acc.red'); ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = g.pal('white'); ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, rr, 0, Math.PI / 2); ctx.moveTo(px, py); ctx.arc(px, py, rr, Math.PI, Math.PI * 1.5); ctx.fill(); ctx.restore();
          ink(ctx, g, 0.4, function () { ctx.arc(px, py, rr, 0, Math.PI * 2); });
        });
      });
      if (forSale(s, ['pent'])) {
        var f0 = tw.facade, br = [f0[2] - 76, f0[3] - 82, f0[2] - 12, f0[3] - 28];
        cover(g, br);
        fill(ctx, br, g.pal('white'));
        fill(ctx, [br[0], br[1], br[2], br[1] + 5], g.pal('ui.hp'));
        letters(ctx, g, word('place.sign.forSale'), [br[0] + 4, br[1] + 8, br[2] - 4, br[3] - 6], g.pal('ui.hp-ink'), { fill: 0.5 });
        outline(ctx, g, br);
      }
    },
  });

  // ---------------------------------------------------------------------------------------------
  // bank: Bank of the 2nd Dimension (hall, red, door W onto Main Street)
  // ---------------------------------------------------------------------------------------------
  SR.def.exterior('bank', {
    signature: [[3000, 1020, 3276, 1100], [3048, 714, 3228, 894]],
    detail: function (ctx, g, s) {
      drew('bank', s);
      var m = g.masses[0], P = g.colors, f = m.facade, rf = m.roof;
      var px = (f[0] + f[2]) / 2, pw = Math.min((f[2] - f[0]) * 0.45, 280), ph = pw * 0.26;
      // A big "$" relief in the pediment's tympanum.
      logo(ctx, g, 'dollar', px, f[1] - ph * 0.36, ph * 0.62, { colour: 'bld.bank.trim', shade: 'bld.bank.roof', lw: g.lineWidth * 1.2 });
      // "BANK" in gold on a dark red plate under the pediment.
      var plate = [px - 70, f[1] + 5, px + 70, f[1] + 25];
      cover(g, plate);
      fill(ctx, plate, P.roof);
      fill(ctx, [plate[0], plate[3] - 3, plate[2], plate[3]], g.tone(P.roof, -1));
      letters(ctx, g, word('place.sign.bank'), [plate[0] + 6, plate[1] + 2, plate[2] - 6, plate[3] - 2], P.trim, { fill: 0.86, tracking: 0.3 });
      outline(ctx, g, plate);
      // The vault medallion on the roof: a gold ring and a big "$", readable from any zoom.
      var cx = (rf[0] + rf[2]) / 2, cy = (rf[1] + rf[3]) / 2, R = Math.min(84, (rf[2] - rf[0]) * 0.15);
      ctx.save();
      ctx.fillStyle = g.tone(P.walls, -1); ctx.beginPath(); ctx.arc(cx + 3, cy + 4, R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = P.trim; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = P.walls; ctx.beginPath(); ctx.arc(cx, cy, R - 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = g.tone(P.trim, -1); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R - 4.5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      logo(ctx, g, 'dollar', cx, cy, R * 1.45, { colour: 'bld.bank.trim', shade: 'bld.bank.roof', lw: g.lineWidth * 2.2 });
      ink(ctx, g, 1, function () { ctx.arc(cx, cy, R, 0, Math.PI * 2); });
      banners(ctx, g, s, [f[0] + 20, f[1] + 20, px - 90, f[3]], 2);
    },
  });

  // ---------------------------------------------------------------------------------------------
  // nli: New Lines Inc. (podium and set-back tower, door W onto Main Street)
  // ---------------------------------------------------------------------------------------------
  SR.def.exterior('nli', {
    signature: [[3106, 1664, 3194, 1728], [2850, 1872, 3016, 1902]],
    detail: function (ctx, g, s) {
      drew('nli', s);
      var P = g.colors, K = g.projection, tw = massOf(g, 'tower'), pod = massOf(g, 'main');
      var plateCol = g.pal(['bld.nli.plate', 'lanePaint']);
      // "NEW LINES INC." on the yellow plate over the podium entrance (the painter's name plate).
      var pl = g.sign;
      if (pl) {
        cover(g, pl);
        fill(ctx, pl, plateCol);
        var lh = pl[3] - pl[1];
        logo(ctx, g, 'lines', pl[0] + lh * 0.7, (pl[1] + pl[3]) / 2, lh * 0.7, { lw: g.lineWidth * 0.4 });
        letters(ctx, g, word('place.sign.nli'), [pl[0] + lh * 1.4, pl[1] + 1, pl[2] - 4, pl[3] - 1], P.ink, { fill: 0.72 });
        outline(ctx, g, pl);
      }
      // The three stacked-line logo on a panel at the crown of the tower.
      var tiers = Math.max(1, Math.ceil(tw.h / 200)), ins = (tiers - 1) * 12;
      var tt = [tw.rect[0] + ins, tw.rect[1] + ins, tw.rect[2] - ins, tw.rect[3] - ins];
      var top = [tt[0], tt[3] - K * tw.h, tt[2], tt[3] - K * (tiers - 1) * 200];
      var cx = (top[0] + top[2]) / 2, cy = (top[1] + top[3]) / 2, ph = Math.min(60, (top[3] - top[1]) * 0.64);
      var panel = [cx - ph * 0.7, cy - ph / 2, cx + ph * 0.7, cy + ph / 2];
      cover(g, panel);
      fill(ctx, panel, g.tone(P.walls, 1));
      logo(ctx, g, 'lines', cx, cy, ph * 0.8, { lw: g.lineWidth * 0.6 });
      outline(ctx, g, panel);
      // The rooftop billboard (worldmap signature) on the top roof's north edge: the company's ad,
      // or your portrait once you are CEO (P1, cityReacts).
      // It fills the worldmap's signature rect (the one the visibility invariant protects), else a
      // 300 × 64 board over the top roof's north edge.
      var roofTop = tt[1] - K * tw.h, sig = (exOf('nli').signature || [])[0];
      var cxT = (tt[0] + tt[2]) / 2;
      var bb = Array.isArray(sig) && sig.length === 4 ? sig.slice() : [cxT - 150, roofTop - 88, cxT + 150, roofTop - 24];
      [bb[0] + 36, (bb[0] + bb[2]) / 2, bb[2] - 36].forEach(function (x) { fill(ctx, [x - 3, bb[3], x + 3, roofTop + 8], g.pal('prop.lampPost')); });
      fill(ctx, [bb[0] - 4, bb[1] - 4, bb[2] + 4, bb[3] + 4], g.pal('prop.billboard'));
      if (ceo(s)) {
        // Paper white with your portrait on the company's yellow (the karma bands colour only your
        // head, ART_AUDIO §2.3).
        fill(ctx, bb, g.pal('white'));
        ctx.save(); ctx.translate(bb[0] + 12, bb[1] + 6);
        if (SR.art.portraits) SR.art.portraits.draw(ctx, 'player', bb[3] - bb[1] - 12, 'happy', { karma: s.stats ? s.stats.karma : 0, bg: 'bld.nli.plate' });
        ctx.restore();
        letters(ctx, g, (s.player && s.player.name) || '', [bb[0] + 76, bb[1] + 6, bb[2] - 10, bb[1] + 34], P.ink, { fill: 0.8 });
        letters(ctx, g, word('place.sign.ceo'), [bb[0] + 76, bb[1] + 36, bb[2] - 10, bb[3] - 6], g.pal('bld.nli.roof'), { fill: 0.7 });
      } else {
        fill(ctx, bb, P.trim);
        fill(ctx, [bb[0], bb[1], bb[0] + 90, bb[3]], plateCol);
        logo(ctx, g, 'lines', bb[0] + 45, (bb[1] + bb[3]) / 2, 44, { lw: g.lineWidth * 0.6 });
        letters(ctx, g, word('place.sign.nli'), [bb[0] + 100, bb[1] + 8, bb[2] - 10, bb[1] + 36], P.ink, { fill: 0.8 });
        letters(ctx, g, word('place.sign.nliAd'), [bb[0] + 100, bb[1] + 38, bb[2] - 10, bb[3] - 6], g.pal('white'), { fill: 0.7 });
      }
      outline(ctx, g, [bb[0] - 4, bb[1] - 4, bb[2] + 4, bb[3] + 4], 1);
      // The fishing stick: sitting on the roof's east edge, a line dangling into the clouds below.
      var fx = tt[2] - 18, fy = roofTop + (tt[3] - tt[1]) * 0.5;
      stick(ctx, 'sit', { x: fx, y: fy, view: 'city', facing: 'right', look: 7, scale: 0.9 });
      ink(ctx, g, 0.5, function () { ctx.moveTo(fx + 4, fy - 30); ctx.lineTo(tw.rect[2] - 4, fy - 62); });
      ctx.save(); ctx.strokeStyle = P.ink; ctx.globalAlpha = 0.6; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(tw.rect[2] - 4, fy - 62); ctx.lineTo(tw.rect[2] - 3, fy + 90); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.fillStyle = g.pal('acc.red'); ctx.beginPath(); ctx.arc(tw.rect[2] - 3, fy + 92, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      banners(ctx, g, s, [pod.facade[0] + 180, pod.facade[1], pod.facade[2] - 10, pod.facade[3]], 3);
    },
  });

  // ---------------------------------------------------------------------------------------------
  // uofs: University of Stick (hall, door S onto East Avenue)
  // ---------------------------------------------------------------------------------------------
  SR.def.exterior('uofs', {
    signature: [[3664, 1928, 3716, 2002]],
    detail: function (ctx, g, s) {
      drew('uofs', s);
      var m = g.masses[0], P = g.colors, f = m.facade, d = g.door;
      var px = d && d.face === 'S' ? d.x : (f[0] + f[2]) / 2, pw = Math.min((f[2] - f[0]) * 0.45, 280), ph = pw * 0.26;
      // "U of S" in the pediment, under a mortarboard.
      var ty = f[1] - ph * 0.28;
      letters(ctx, g, word('place.sign.uofs'), [px - 70, ty - 11, px + 70, ty + 11], P.ink, { role: SERIF, weight: 700, fill: 0.95 });
      logo(ctx, g, 'mortarboard', px, f[1] - ph * 0.62, ph * 0.26, { lw: g.lineWidth * 0.4 });
      // The statue of a thinking stick on a plinth west of the stairs.
      var sx = px - (f[2] - f[0]) * 0.21, base = f[3] - 2;
      var plinth = [sx - 18, base - 22, sx + 18, base];
      cover(g, [sx - 22, base - 70, sx + 22, base]);
      fill(ctx, [plinth[0], plinth[1] - 6, plinth[2], plinth[1]], g.tone(P.stone, 1));
      fill(ctx, plinth, P.stone);
      fill(ctx, [plinth[0] - 3, base - 3, plinth[2] + 3, base], P.stoneShade);
      outline(ctx, g, [plinth[0], plinth[1] - 6, plinth[2], base]);
      stick(ctx, 'study0', { x: sx, y: plinth[1] - 2, view: 'city', facing: 'down', scale: 1.1, head: 'stone', limb: 'stoneShade', torso: 'stoneShade', shadow: false });
      // Ivy climbing the facade's ends and a few columns.
      var ivy = g.pal(['bld.uofs.ivy', 'grassShade']);
      var hi = g.tone(ivy, 1), lo = g.tone(ivy, -1);
      [f[0] + 14, f[0] + 46, f[2] - 46, f[2] - 14, px - 250, px + 240].forEach(function (ix, k) {
        var top = f[1] + 8 + h01('uofs', k, 0) * (f[3] - f[1]) * 0.35;
        cover(g, [ix - 16, top - 6, ix + 16, f[3]]);
        for (var i = 0; i < 26; i++) {
          var t = i / 25, y = f[3] - 2 - t * (f[3] - 2 - top);
          var x = ix + Math.sin(t * 9 + k) * 7 + (h01('uofs', k, i) - 0.5) * 12;
          ctx.fillStyle = i % 3 === 0 ? hi : i % 3 === 1 ? ivy : lo;
          ctx.beginPath(); ctx.ellipse(x, y, 4.2, 3.2, h01('uofs', i, k) * 3, 0, Math.PI * 2); ctx.fill();
        }
      });
    },
  });

  // ---------------------------------------------------------------------------------------------
  // cityhall: City Hall (hall with the brass dome)
  // ---------------------------------------------------------------------------------------------
  SR.def.exterior('cityhall', {
    signature: [[3736, 1010, 3944, 1038]],
    detail: function (ctx, g, s) {
      drew('cityhall', s);
      var m = g.masses[0], P = g.colors, f = m.facade, d = g.door, K = g.projection;
      var px = d && d.face === 'S' ? d.x : (f[0] + f[2]) / 2, pw = Math.min((f[2] - f[0]) * 0.45, 280), ph = pw * 0.26;
      // "CITY HALL" on a brass frieze plate; the clock face in the pediment.
      var plate = [px - 100, f[1] + 5, px + 100, f[1] + 25];
      cover(g, plate);
      fill(ctx, plate, P.trim);
      fill(ctx, [plate[0], plate[3] - 3, plate[2], plate[3]], g.tone(P.trim, -1));
      letters(ctx, g, word('place.sign.cityhall'), [plate[0] + 8, plate[1] + 2, plate[2] - 8, plate[3] - 2], P.ink, { role: SERIF, weight: 700, fill: 0.9, tracking: 0.2 });
      outline(ctx, g, plate);
      logo(ctx, g, 'clock', px, f[1] - ph * 0.38, ph * 0.5, { lw: g.lineWidth * 0.5, min: 600 });
      // The flagpole on the dome's lantern (a blue flag for a President, a red one for a Dictator).
      var def = defOf('cityhall'), dome = null;
      (def && def.exterior && def.exterior.tops || []).forEach(function (t) { if (t.kind === 'dome') dome = t; });
      if (dome) {
        var cx = (dome.rect[0] + dome.rect[2]) / 2, cy = (dome.rect[1] + dome.rect[3]) / 2 - K * m.h;
        var R = Math.min(dome.rect[2] - dome.rect[0], dome.rect[3] - dome.rect[1], 2 * (dome.h - m.h)) / 2;
        var who = office(s);
        prop(ctx, 'flagpole', cx, cy - K * R - R * 0.54, 0.34, who === 'president' ? 1 : who === 'dictator' ? 2 : 0);
      }
      banners(ctx, g, s, [f[0] + 10, f[1] + 30, px - 110, f[3]], 2);
      banners(ctx, g, s, [px + 110, f[1] + 30, f[2] - 10, f[3]], 2);
    },
  });

  // ---------------------------------------------------------------------------------------------
  // furniture: Fine Line Furnishings (shop, the north door shown as a porch)
  // ---------------------------------------------------------------------------------------------
  SR.def.exterior('furniture', {
    signature: [[792, 2208, 1278, 2258]],
    detail: function (ctx, g, s) {
      drew('furniture', s);
      var m = massOf(g, 'main'), P = g.colors, f = m.facade;
      var name = word('place.sign.furniture');
      var paper = g.pal(['bld.furniture.walls', 'paperEdge']);
      // Thin serif-ish lettering on the painter's roof sign and on the annex canopy.
      var board = roofBoard(g, m), cx = (f[0] + f[2]) / 2;
      fill(ctx, [board[0] + 2, board[1] + 2, board[2] - 2, board[3] - 3], P.trim);
      letters(ctx, g, name, [board[0] + 8, board[1] + 3, board[2] - 8, board[3] - 3], paper, { role: SERIF, weight: 400, fill: 0.78, tracking: 0.12 });
      if (g.canopy) {
        var c = g.canopy;
        fill(ctx, [c[0] + 3, c[1] + 2, c[2] - 3, c[3] - 7], P.trim);
        letters(ctx, g, name, [c[0] + 6, c[1] + 2, c[2] - 6, c[3] - 8], paper, { role: SERIF, weight: 400, fill: 0.8 });
      }
      // Showroom skylights along the roof (they glow at night).
      var rf = m.roof, n = 5, sw2 = 44, gap = (rf[2] - rf[0] - 120 - n * sw2) / (n - 1), sy = rf[1] + (rf[3] - rf[1]) * 0.3;
      for (var i = 0; i < n; i++) {
        var sx = rf[0] + 60 + i * (sw2 + gap);
        fill(ctx, [sx, sy, sx + sw2, sy + 22], g.tone(P.walls, -1));
        fill(ctx, [sx + 4, sy + 4, sx + sw2 - 4, sy + 18], P.glass);
        fill(ctx, [sx, sy + 22, sx + sw2, sy + 25], g.tone(P.walls, -2));
        outline(ctx, g, [sx, sy, sx + sw2, sy + 22], 0.5);
        g.windows.push([sx + 5, sy + 5, sw2 - 10, 12]);
      }
      // A sofa in the display window (a nod to the original's store), a floor lamp and a plant.
      var gw = (f[2] - f[0]) * 0.6, gx = cx - gw / 2, gh = Math.min((f[3] - f[1]) * 0.42, 34), gy = f[3] - 6 - gh;
      var sofaH = gh * 0.62, sofaX = gx + gw * 0.2, lampX = gx + gw * 0.36, potX = gx + gw * 0.82;
      var hide = [sofaX - sofaH * 0.85, gy + 2, sofaX + sofaH * 0.85, gy + gh - 2];
      punch(g, hide);
      punch(g, [lampX - 6, gy + 2, lampX + 6, gy + gh - 2]);
      punch(g, [potX - 7, gy + 2, potX + 7, gy + gh - 2]);
      logo(ctx, g, 'sofa', sofaX, gy + gh - sofaH / 2 - 2, sofaH, { lw: g.lineWidth * 0.4 });
      fill(ctx, [lampX - 0.8, gy + 8, lampX + 0.8, gy + gh - 2], P.ink);
      ctx.save(); ctx.fillStyle = g.pal('kit.lamp'); ctx.beginPath(); ctx.moveTo(lampX - 5, gy + 11); ctx.lineTo(lampX + 5, gy + 11); ctx.lineTo(lampX + 3, gy + 4); ctx.lineTo(lampX - 3, gy + 4); ctx.closePath(); ctx.fill(); ctx.restore();
      fill(ctx, [potX - 4, gy + gh - 9, potX + 4, gy + gh - 2], g.pal('kit.pot'));
      ctx.save(); ctx.fillStyle = g.pal('kit.plant'); ctx.beginPath(); ctx.arc(potX, gy + gh - 13, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ink(ctx, g, 0.4, function () { ctx.rect(potX - 4, gy + gh - 9, 8, 7); ctx.moveTo(lampX - 5, gy + 11); ctx.lineTo(lampX + 5, gy + 11); ctx.lineTo(lampX + 3, gy + 4); ctx.lineTo(lampX - 3, gy + 4); ctx.closePath(); });
    },
  });

  // ---------------------------------------------------------------------------------------------
  // mcsticks: McSticks (shop, door E onto Main Street, the roof sign)
  // ---------------------------------------------------------------------------------------------
  SR.def.exterior('mcsticks', {
    signature: [[1744, 1874, 1836, 1982], [1518, 2150, 1602, 2246], [1978, 2150, 2062, 2246]],
    detail: function (ctx, g, s) {
      drew('mcsticks', s);
      var m = g.masses[0], P = g.colors, f = m.facade, K = g.projection;
      var def = defOf('mcsticks'), sign = null;
      (def && def.exterior && def.exterior.tops || []).forEach(function (t) { if (t.kind === 'sign') sign = t; });
      // The burger-on-a-stick mascot standing on top of the roof sign.
      if (sign) {
        var sx = (sign.rect[0] + sign.rect[2]) / 2, top = [sign.rect[1] - K * sign.h, sign.rect[3] - K * sign.h];
        var base = (top[0] + top[1]) / 2 + 3, mh = 96;
        ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = P.ink; ctx.beginPath(); ctx.ellipse(sx + 4, base + 2, 18, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        logo(ctx, g, 'burger', sx, base - mh / 2, mh, { lw: g.lineWidth * 0.8 });
      }
      // Fry-shaped roof arches at the front corners of the roof: golden fries leaning into arches
      // over little red cartons.
      var fry = g.pal('acc.goldHi'), frySide = g.pal('acc.gold'), carton = P.trim;
      [f[0] + 100, f[2] - 100].forEach(function (ax) {
        var ay = f[1] - 12, w = 32, hgt = 70;
        for (var i = 0; i < 7; i++) {
          var a = Math.PI - i * Math.PI / 6, x = ax + Math.cos(a) * w, y = ay - hgt * 0.35 - Math.sin(a) * hgt * 0.62;
          ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI - a);
          fill(ctx, [-4, -13, 4, 13], fry); fill(ctx, [1.5, -13, 4, 13], frySide);
          ink(ctx, g, 0.4, function () { ctx.rect(-4, -13, 8, 26); });
          ctx.restore();
        }
        [ax - w, ax + w].forEach(function (bx) {
          ctx.save(); ctx.fillStyle = carton; ctx.beginPath(); ctx.moveTo(bx - 11, ay - 22); ctx.lineTo(bx + 11, ay - 22); ctx.lineTo(bx + 8, ay); ctx.lineTo(bx - 8, ay); ctx.closePath(); ctx.fill(); ctx.restore();
          fill(ctx, [bx - 7, ay - 15, bx + 7, ay - 12], g.pal('acc.yellow'));
          ink(ctx, g, 0.5, function () { ctx.moveTo(bx - 11, ay - 22); ctx.lineTo(bx + 11, ay - 22); ctx.lineTo(bx + 8, ay); ctx.lineTo(bx - 8, ay); ctx.closePath(); });
        });
      });
      banners(ctx, g, s, [f[0] + 10, f[1], f[2] - 40, f[3] - 40], 3);
    },
  });

  // ---------------------------------------------------------------------------------------------
  // bar: Sticky's (shop, door E onto Main Street; Harold stands under the awning, W2-Street)
  // ---------------------------------------------------------------------------------------------
  SR.def.exterior('bar', {
    signature: [[2018, 2890, 2082, 2994]],
    detail: function (ctx, g, s) {
      drew('bar', s);
      var m = g.masses[0], P = g.colors, f = m.facade;
      // The beer mug sign on a pole at the roof's Main Street corner (a neon sign at night once the
      // painter bakes detail neon; W2-Exterior request 2).
      var x = f[2] - 50, base = f[1] - 6, mh = 52;
      fill(ctx, [x - 2.5, base - 44, x + 2.5, base], g.pal('prop.lampPost'));
      fill(ctx, [x - 30, base - 44 - mh - 6, x + 30, base - 40], g.tone(P.shade, -2));
      ctx.save(); ctx.strokeStyle = g.pal('light.neonYellow'); ctx.lineWidth = 2.2;
      ctx.strokeRect(x - 27, base - 44 - mh - 3, 54, mh + 6); ctx.restore();
      logo(ctx, g, 'mug', x, base - 44 - mh / 2 + 2, mh * 0.86, { lw: g.lineWidth * 0.6 });
      outline(ctx, g, [x - 30, base - 44 - mh - 6, x + 30, base - 40]);
      // Three spare kegs and two vents on the roof.
      var rf = m.roof, wood = g.pal('kit.wood'), hoop = g.pal('kit.metalDark');
      [[rf[0] + 44, rf[1] + 60], [rf[0] + 76, rf[1] + 56], [rf[0] + 60, rf[1] + 88]].forEach(function (k) {
        ctx.save(); ctx.fillStyle = P.ink; ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.ellipse(k[0] + 6, k[1] + 4, 15, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        fill(ctx, [k[0] - 13, k[1] - 20, k[0] + 13, k[1]], wood);
        fill(ctx, [k[0] - 13, k[1] - 16, k[0] + 13, k[1] - 13], hoop);
        fill(ctx, [k[0] - 13, k[1] - 6, k[0] + 13, k[1] - 3], hoop);
        ctx.save(); ctx.fillStyle = g.tone(wood, 1); ctx.beginPath(); ctx.ellipse(k[0], k[1] - 20, 13, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ink(ctx, g, 0.5, function () { ctx.ellipse(k[0], k[1] - 20, 13, 6, 0, 0, Math.PI * 2); ctx.moveTo(k[0] - 13, k[1] - 20); ctx.lineTo(k[0] - 13, k[1]); ctx.lineTo(k[0] + 13, k[1]); ctx.lineTo(k[0] + 13, k[1] - 20); });
      });
      [[rf[2] - 70, rf[1] + 140], [rf[2] - 110, rf[3] - 180]].forEach(function (v) {
        fill(ctx, [v[0] - 16, v[1] - 12, v[0] + 16, v[1] + 4], P.stone);
        fill(ctx, [v[0] - 16, v[1] + 4, v[0] + 16, v[1] + 10], P.stoneShade);
        outline(ctx, g, [v[0] - 16, v[1] - 12, v[0] + 16, v[1] + 10], 0.5);
      });
      banners(ctx, g, s, [f[0] + 10, f[1], f[2] - 10, f[3] - 44], 3);
    },
  });

  // ---------------------------------------------------------------------------------------------
  // casino: Silver Lining Casino (box, door E onto Main Street; the roof dice)
  // ---------------------------------------------------------------------------------------------

  /** A die: a cube of edge sz standing on z = zb at footprint centre (cx, cy), turned by rot; pips per face. */
  function die(ctx, g, cx, cy, sz, rot, zb, pipsTop, pipsFront) {
    var K = g.projection, zt = zb + sz, h = sz / 2, cs = Math.cos(rot), sn = Math.sin(rot);
    var c = [[-h, -h], [h, -h], [h, h], [-h, h]].map(function (p) { return [cx + p[0] * cs - p[1] * sn, cy + p[0] * sn + p[1] * cs]; });
    var body = g.pal('white'), pip = g.pal('ink'), one = g.pal('acc.red');
    function quad(q, col) {
      ctx.fillStyle = col; ctx.beginPath(); q.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.fill();
      ink(ctx, g, 0.7, function () { q.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); });
    }
    function pips(q, n) {
      var spots = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
        5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[n] || [];
      ctx.fillStyle = n === 1 ? one : pip;
      spots.forEach(function (sp) {
        var u = 0.5 + sp[0] * 0.27, v = 0.5 + sp[1] * 0.27;
        var x = q[0][0] + (q[1][0] - q[0][0]) * u + (q[3][0] - q[0][0]) * v, y = q[0][1] + (q[1][1] - q[0][1]) * u + (q[3][1] - q[0][1]) * v;
        ctx.beginPath(); ctx.ellipse(x, y, sz * 0.07, sz * 0.07 * (n === 1 ? 1 : 0.9), 0, 0, Math.PI * 2); ctx.fill();
      });
    }
    // Its stacked-paper shadow on the roof, then the south-facing sides (only they show in this
    // projection), then the top.
    ctx.save(); ctx.globalAlpha *= 0.18; ctx.fillStyle = g.colors.ink; ctx.beginPath();
    c.forEach(function (p, i) { var x = p[0] + 10, y = p[1] - K * zb + 12; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath(); ctx.fill(); ctx.restore();
    var best = null, bestNy = 0;
    for (var i = 0; i < 4; i++) {
      var a = c[i], b = c[(i + 1) % 4], ny = (a[0] - b[0]) / sz;   // the outward normal's y (south is +)
      if (ny <= 0.02) continue;
      var q = [[a[0], a[1] - K * zt], [b[0], b[1] - K * zt], [b[0], b[1] - K * zb], [a[0], a[1] - K * zb]];
      quad(q, g.tone(body, ny > 0.9 ? -1 : -2));
      if (ny > bestNy) { best = q; bestNy = ny; }
    }
    var topQ = c.map(function (p) { return [p[0], p[1] - K * zt]; });
    quad(topQ, body);
    pips(topQ, pipsTop);
    if (best) pips(best, pipsFront);
  }

  SR.def.exterior('casino', {
    signature: [[1686, 3884, 1834, 3964]],
    detail: function (ctx, g, s) {
      drew('casino', s);
      var m = g.masses[0], P = g.colors, f = m.facade;
      var def = defOf('casino'), dice = null;
      (def && def.exterior && def.exterior.tops || []).forEach(function (t) { if (t.kind === 'dice') dice = t; });
      // Two giant dice on the roof: one square to the street, one turned.
      if (dice) {
        var r = dice.rect, span = r[2] - r[0], dz = dice.h - m.h;
        var s1 = Math.min(dz, span * 0.44, r[3] - r[1]), s2 = s1 * 0.84;
        die(ctx, g, r[2] - s2 * 0.7, r[1] + s2 * 0.62, s2, 0.38, m.h, 3, 6);
        die(ctx, g, r[0] + s1 / 2 + 6, r[3] - s1 / 2, s1, 0, m.h, 5, 1);
      }
      // The silver-lining cloud on a marquee panel ringed with bulbs (the bulbs glow at night).
      var panel = [f[0] + 40, f[1] + 14, f[0] + 188, f[1] + 94];
      cover(g, panel);
      fill(ctx, panel, g.tone(P.walls, -1));
      fill(ctx, [panel[0] + 8, panel[1] + 8, panel[2] - 8, panel[3] - 8], g.tone(P.walls, -2));
      logo(ctx, g, 'cloud', (panel[0] + panel[2]) / 2, (panel[1] + panel[3]) / 2, (panel[3] - panel[1]) * 0.62, { lw: g.lineWidth * 0.6 });
      var bulb = g.pal(['bld.casino.bulb', 'glassLit']);
      ctx.save(); ctx.fillStyle = bulb; ctx.beginPath();
      for (var x = panel[0] + 4; x <= panel[2] - 4; x += 12) {
        [panel[1] + 4, panel[3] - 4].forEach(function (y) { ctx.moveTo(x + 2.2, y); ctx.arc(x, y, 2.2, 0, Math.PI * 2); g.windows.push([x - 2, y - 2, 4, 4]); });
      }
      for (var y = panel[1] + 16; y <= panel[3] - 16; y += 12) {
        [panel[0] + 4, panel[2] - 4].forEach(function (xx) { ctx.moveTo(xx + 2.2, y); ctx.arc(xx, y, 2.2, 0, Math.PI * 2); g.windows.push([xx - 2, y - 2, 4, 4]); });
      }
      ctx.fill(); ctx.restore();
      outline(ctx, g, panel);
      banners(ctx, g, s, [panel[2] + 10, f[1], f[2] - 170, f[3]], 2);
    },
  });

  // ---------------------------------------------------------------------------------------------
  // store: Funkytown Five-O (shop, door W onto Main Street)
  // ---------------------------------------------------------------------------------------------
  SR.def.exterior('store', {
    signature: [[3024, 3246, 3292, 3302], [2858, 3186, 2924, 3302]],
    detail: function (ctx, g, s) {
      drew('store', s);
      var m = g.masses[0], P = g.colors, f = m.facade;
      // Graffiti-style "FIVE-O" on a taller roof sign: fat tilted letters, an ink outline, a drop
      // shadow and drips (the painter's board, raised 22 u, sits at its foot).
      var b0 = roofBoard(g, m), sw = b0[2] - b0[0], cx = (b0[0] + b0[2]) / 2;
      var board = [b0[0], b0[1] - 22, b0[2], b0[3]];
      fill(ctx, board, P.trim);
      ctx.save(); ctx.fillStyle = g.tone(P.trim, 1);
      for (var sp = 0; sp < 14; sp++) { ctx.beginPath(); ctx.arc(board[0] + 8 + h01('five', sp, 1) * (sw - 16), board[1] + 4 + h01('five', sp, 2) * (board[3] - board[1] - 8), 1.5 + h01('five', sp, 3) * 2.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      outline(ctx, g, board, 1);
      var t = word('place.sign.store'), cols = ['acc.yellow', 'light.neonBlue', 'white', 'light.neonGreen'];
      if (t) {
        var size = (board[3] - board[1]) * 0.82, D = SR.art.draw;
        ctx.save();
        ctx.font = D.font(size, 900, 'display');
        var tw = ctx.measureText(t).width;
        var k = Math.min(1, (sw - 24) / (tw * 1.12));
        size *= k; ctx.font = D.font(size, 900, 'display');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
        var x = cx - (tw * k * 1.12) / 2, y = (board[1] + board[3]) / 2;
        for (var i = 0; i < t.length; i++) {
          var ch = t.charAt(i), cw = ctx.measureText(ch).width * 1.12, lx = x + cw / 2, rot = (h01('five', i, 0) - 0.5) * 0.3, dy = (h01('five', i, 4) - 0.5) * size * 0.16;
          ctx.save(); ctx.translate(lx, y + dy); ctx.rotate(rot);
          ctx.fillStyle = P.ink; ctx.fillText(ch, 2.5, 2.5);
          ctx.strokeStyle = P.ink; ctx.lineWidth = g.lineWidth * 1.6; ctx.strokeText(ch, 0, 0);
          ctx.fillStyle = g.pal(cols[i % cols.length]); ctx.fillText(ch, 0, 0);
          if (h01('five', i, 5) < 0.5) { ctx.fillRect(-1, size * 0.34, 2, size * 0.26); ctx.beginPath(); ctx.arc(0, size * 0.6, 1.8, 0, Math.PI * 2); ctx.fill(); }
          ctx.restore();
          x += cw;
        }
        ctx.restore();
      }
      // The slushee sign on a pole at the roof's Main Street corner.
      var px = f[0] + 48, base = f[1] - 4;
      fill(ctx, [px - 2.5, base - 42, px + 2.5, base], g.pal('prop.lampPost'));
      var plate = [px - 30, base - 56, px + 30, base - 42];
      fill(ctx, plate, g.pal('white'));
      letters(ctx, g, word('place.sign.slushee'), [plate[0] + 3, plate[1] + 1, plate[2] - 3, plate[3] - 1], g.pal('kit.slushB'), { fill: 0.8 });
      outline(ctx, g, plate);
      logo(ctx, g, 'slushee', px, base - 86, 58, { lw: g.lineWidth * 0.7 });
      banners(ctx, g, s, [f[0] + 90, f[1], f[2] - 10, f[3] - 44], 3);
    },
  });

  // ---------------------------------------------------------------------------------------------
  // pawn: Pawn Shop (box, door W onto Main Street)
  // ---------------------------------------------------------------------------------------------
  SR.def.exterior('pawn', {
    signature: [[2852, 3906, 2912, 4003]],
    detail: function (ctx, g, s) {
      drew('pawn', s);
      var m = g.masses[0], P = g.colors, f = m.facade;
      // Barred windows: two bars and a rail across every window of the facade.
      ctx.save();
      ctx.strokeStyle = g.pal('railing'); ctx.lineWidth = Math.max(1, g.lineWidth * 0.6); ctx.lineCap = 'butt';
      ctx.beginPath();
      g.windows.forEach(function (w) {
        if (!hits(winRect(w), f)) return;
        ctx.moveTo(w[0] + w[2] / 3, w[1] - 1); ctx.lineTo(w[0] + w[2] / 3, w[1] + w[3] + 1);
        ctx.moveTo(w[0] + w[2] * 2 / 3, w[1] - 1); ctx.lineTo(w[0] + w[2] * 2 / 3, w[1] + w[3] + 1);
        ctx.moveTo(w[0] - 1, w[1] + w[3] / 2); ctx.lineTo(w[0] + w[2] + 1, w[1] + w[3] / 2);
      });
      ctx.stroke();
      ctx.restore();
      // The three gold balls on a bracket over a "PAWN" board, on a pole at the roof's Main Street corner.
      var x = f[0] + 40, base = f[1] - 2;
      fill(ctx, [x - 2.5, base - 44, x + 2.5, base], g.pal('prop.lampPost'));
      var board = [x - 24, base - 44, x + 24, base - 28];
      fill(ctx, board, P.trim);
      letters(ctx, g, word('place.sign.pawn'), [board[0] + 2, board[1] + 1, board[2] - 2, board[3] - 1], P.ink, { fill: 0.85 });
      outline(ctx, g, board);
      logo(ctx, g, 'balls', x, base - 68, 44, { lw: g.lineWidth * 0.7 });
      banners(ctx, g, s, [f[0] + 110, f[1], f[2] - 10, f[3]], 3);
    },
  });

  // ---------------------------------------------------------------------------------------------
  // bus: Bus Depot (depot; the north door shown as a porch with "BUS DEPOT" on the annex canopy)
  // ---------------------------------------------------------------------------------------------
  SR.def.exterior('bus', {
    signature: [[4000, 3032, 4178, 3078]],
    detail: function (ctx, g, s) {
      drew('bus', s);
      var m = massOf(g, 'main'), P = g.colors, f = m.facade;
      // The departures board on the south face: tonight's red-eyes to the six cities.
      var cx = (f[0] + f[2]) / 2, board = [cx - 84, f[1] + 4, cx + 84, f[1] + 40];
      cover(g, board);
      fill(ctx, [board[0] - 3, board[1] - 3, board[2] + 3, board[3] + 3], g.pal('prop.lampPost'));
      fill(ctx, board, g.pal('acc.black'));
      logo(ctx, g, 'bus', board[0] + 10, (board[1] + board[3]) / 2, 20, { lw: g.lineWidth * 0.4 });
      var amber = g.pal('light.neonYellow');
      letters(ctx, g, word('place.sign.departures'), [board[0] + 22, board[1] + 1, board[2] - 4, board[1] + 9], amber, { fill: 0.8, tracking: 0.2 });
      // The six cities in their destination-board order (SR.def.city: `order`, the `name` key).
      var reg = SR.reg.city || {};
      var cities = Object.keys(reg).sort(function (a, b) { return (reg[a].order || 0) - (reg[b].order || 0); }).slice(0, 6);
      // A board's own 24 h clock: the sprite never depends on the player's 12 / 24 h setting.
      var when = SR.text && typeof SR.text.time === 'function' ? SR.text.time(0, false) : '';
      for (var i = 0; i < cities.length; i++) {
        var col = i % 2, row = Math.floor(i / 2);
        var r = [board[0] + 22 + col * 72, board[1] + 11 + row * 9, board[0] + 90 + col * 72, board[1] + 19 + row * 9];
        var nm = word(reg[cities[i]].name || 'city.' + cities[i] + '.name');
        ctx.save(); ctx.font = SR.art.draw.font(6, 700, 'ui'); ctx.textBaseline = 'middle'; ctx.fillStyle = amber;
        ctx.textAlign = 'left'; ctx.fillText(nm, r[0], (r[1] + r[3]) / 2, 46);
        ctx.textAlign = 'right'; ctx.fillText(when, r[2], (r[1] + r[3]) / 2, 20);
        ctx.restore();
      }
      outline(ctx, g, [board[0] - 3, board[1] - 3, board[2] + 3, board[3] + 3]);
    },
  });

  // ---------------------------------------------------------------------------------------------
  // skybus: the parked Sky Bus (a solid prop by the Bus Hole; its front faces south)
  // ---------------------------------------------------------------------------------------------
  SR.def.exterior('skybus', {
    signature: [],
    detail: function (ctx, g, s) {
      drew('skybus', s);
      var m = g.masses[0], P = g.colors, f = m.facade, r = m.roof, w = r[2] - r[0];
      // The roof: ribs, two hatches and an AC unit; window tops along both sides.
      ctx.save(); ctx.strokeStyle = g.tone(P.walls, -1); ctx.lineWidth = 1; ctx.beginPath();
      for (var y = r[1] + 14; y < r[3] - 10; y += 16) { ctx.moveTo(r[0] + w * 0.32, y); ctx.lineTo(r[2] - w * 0.32, y); }
      ctx.stroke(); ctx.restore();
      [0.22, 0.62].forEach(function (k) {
        var hy = r[1] + (r[3] - r[1]) * k;
        fill(ctx, [r[0] + w * 0.34, hy, r[2] - w * 0.34, hy + 24], P.stone);
        outline(ctx, g, [r[0] + w * 0.34, hy, r[2] - w * 0.34, hy + 24], 0.5);
      });
      fill(ctx, [r[0] + w * 0.3, r[3] - 60, r[2] - w * 0.3, r[3] - 30], P.stoneShade);
      outline(ctx, g, [r[0] + w * 0.3, r[3] - 60, r[2] - w * 0.3, r[3] - 30], 0.5);
      for (var wy = r[1] + 20; wy < r[3] - 20; wy += 26) {
        fill(ctx, [r[0] + 2, wy, r[0] + 6, wy + 16], P.glass);
        fill(ctx, [r[2] - 6, wy, r[2] - 2, wy + 16], P.glass);
      }
      // The front: a destination sign over the windscreen and headlights.
      var dest = [f[0] + 10, f[1] + 1, f[2] - 10, f[1] + 7];
      fill(ctx, dest, g.pal('acc.black'));
      letters(ctx, g, word('place.sign.skybus'), dest, g.pal('light.neonYellow'), { fill: 0.9 });
      [f[0] + 8, f[2] - 8].forEach(function (x) { ctx.save(); ctx.fillStyle = g.pal('car.lamp'); ctx.beginPath(); ctx.arc(x, f[3] - 12, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
    },
  });

  SR.art.exteriorDetail = {
    stateKey: stateKey,
    refresh: refresh,
    /** @returns {object} building id -> the state key its last baked detail used (tests). */
    baked: function () { return Object.assign({}, baked); },
    /** @returns {string[]} the ids with a detail that depends on the state. */
    stateful: function () { return Object.keys(KEYS); },
  };

  // Re-bake a building when the state its detail shows changes (ownership, the kid, office, CEO,
  // karma for the castle flags). Priority 40: render caches (CONTRACT §3.5); not in Node.
  SR.onBoot(40, function () {
    if (!SR.events || typeof SR.events.on !== 'function') return;
    ['action:done', 'day:started', 'save:loaded', 'home:changed', 'job:changed', 'election:changed', 'karma:changed', 'game:over'].forEach(function (ev) {
      SR.events.on(ev, function () { refresh(); });
    });
  });
})();
