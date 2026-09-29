// js/render/buildings.js — owner: W1-G. Building and prop sprites in the Y-sorted pass
// (ARCHITECTURE §9.1 step 5, §9.3): the memory-bounded sprite cache (baked lazily at the current
// zoom for buildings within the view expanded by half a view on every side, one mass per frame,
// a 12 Mpx LRU (6 Mpx touch-compact) with the farthest evicted first, sprite DPR ≤ 1.5, flat
// placeholders until baked), the occlusion fade (GDD §3.7), the lit-window schedule (ART_AUDIO §3)
// and prop sprites cached per type, variant and zoom.
(function () {
  'use strict';
  var SR = window.SR;

  var SPRITE_BUDGET = 12e6;          // device px (48 MB)
  var SPRITE_BUDGET_COMPACT = 6e6;   // touch-compact profile
  var SPRITE_DPR_MAX = 1.5;
  var WINDOW_EXPAND = 0.5;           // bake within the view expanded by half a view on every side
  var FADE_ALPHA = 0.35;             // occlusion fade (B-15 `occlusionAlpha`; tuning.world wins)
  var FADE_TIME = 0.15;
  var DOOR_FOCUS = 160;              // a door within 160 u of the player keeps its porch clear
  var LIT_SLOT = 15;                 // the lit-window pattern changes every 15 game minutes

  function L() { return SR.render.lib; }

  var sprites = {};      // id -> { key, zoom, scale, job, result, used, dist }
  var pending = 0;
  var props = {};        // 'type|variant|zoomKey' -> { canvas, ax, ay, w, h, px }
  var propPx = 0;
  var litCache = {};     // id -> { slot, list }

  function spriteScale(v) { return Math.min(v.s, SPRITE_DPR_MAX); }
  function budget() { return L().compact() ? SPRITE_BUDGET_COMPACT : SPRITE_BUDGET; }

  function reset() {
    sprites = {}; props = {}; propPx = 0; litCache = {}; pending = 0;
    if (SR.art.exterior && SR.art.exterior.reset) SR.art.exterior.reset();
  }

  /** Drops one building's sprites (all zooms), or every sprite when id is omitted. */
  function invalidate(id) {
    if (id === undefined) { reset(); return; }
    delete sprites[id];
    delete litCache[id];
  }

  function inRect(b, x0, y0, x1, y1) { return b[0] < x1 && b[2] > x0 && b[1] < y1 && b[3] > y0; }

  function viewKey(v) { return v.bz + '@' + Math.round(spriteScale(v) * 1000); }

  // ---------------------------------------------------------------------------------------------
  // Buildings
  // ---------------------------------------------------------------------------------------------

  /** Pushes the buildings that intersect the view into the Y-sorted pass. @returns {number} how many */
  function collect(v, m, push) {
    var n = 0, list = m.buildings;
    var mx = 60 / v.zoom;
    for (var i = 0; i < list.length; i++) {
      var b = list[i].geom.bounds;
      if (!inRect(b, v.x0 - mx, v.y0 - mx, v.x1 + mx, v.y1 + mx)) continue;
      push(list[i].geom.sortY, 'building', list[i]);
      n++;
    }
    return n;
  }

  /** Draws one building: its sprite at this zoom, a sprite of another zoom scaled, or flat boxes. */
  function drawBuilding(ctx, rb, v) {
    var e = sprites[rb.id];
    var a = rb.alpha;
    if (a < 1) ctx.globalAlpha = a;
    if (e && e.result) {
      var r = e.result, b = r.bounds;
      e.used = v.frame;
      ctx.drawImage(r.albedo, b[0], b[1], b[2] - b[0], b[3] - b[1]);
      L().count.images++;
    } else {
      L().count.fills += SR.art.exterior.placeholder(ctx, rb.def);
    }
    if (a < 1) ctx.globalAlpha = 1;
  }

  /** Runs this frame's building bake: one step (one mass) of the nearest missing sprite. */
  function bake(v, m) {
    var key = viewKey(v), sc = spriteScale(v);
    var ex0 = v.x0 - (v.x1 - v.x0) * WINDOW_EXPAND, ex1 = v.x1 + (v.x1 - v.x0) * WINDOW_EXPAND;
    var ey0 = v.y0 - (v.y1 - v.y0) * WINDOW_EXPAND, ey1 = v.y1 + (v.y1 - v.y0) * WINDOW_EXPAND;
    var best = null, bestD = Infinity;
    pending = 0;
    for (var i = 0; i < m.buildings.length; i++) {
      var rb = m.buildings[i], b = rb.geom.bounds;
      var e = sprites[rb.id];
      var d = Math.hypot((b[0] + b[2]) / 2 - v.x, (b[1] + b[3]) / 2 - v.y);
      if (e) e.dist = d;
      if (!inRect(b, ex0, ey0, ex1, ey1)) continue;
      if (e && e.key === key && e.job && e.job.done) continue;   // ready at this zoom
      pending++;
      var vis = inRect(b, v.x0, v.y0, v.x1, v.y1);
      // A started bake finishes first; then visible buildings, nearest first; then the window.
      var pr = (e && e.key === key ? 0 : 1e6) + (vis ? 0 : 1e7) + d;
      if (pr < bestD) { best = rb; bestD = pr; }
    }
    if (!best) return 0;
    var cur = sprites[best.id];
    if (!cur || cur.key !== key || !cur.job) {
      var job = SR.art.exterior.baker(best.def, v.bz, sc);
      var keep = cur && cur.result ? cur.result : null;   // the old zoom's sprite shows until this one is ready
      var bb = best.geom.bounds;
      cur = sprites[best.id] = { key: key, zoom: v.bz, scale: sc, job: job, result: keep, used: v.frame, old: !!keep,
        dist: Math.hypot((bb[0] + bb[2]) / 2 - v.x, (bb[1] + bb[3]) / 2 - v.y) };
    }
    cur.job.step();
    if (cur.job.done) {
      cur.result = cur.job.result;
      cur.old = false;
      evict(v, best.id);
    }
    return 1;
  }

  /** Evicts sprites until the pixel budget holds: other zooms first, then the farthest. */
  function evict(v, keepId) {
    var total = 0, ids = Object.keys(sprites);
    ids.forEach(function (id) { var e = sprites[id]; if (e.result) total += e.result.px; });
    if (total <= budget()) return;
    var key = viewKey(v);
    ids.sort(function (a, b) {
      var ea = sprites[a], eb = sprites[b];
      var oa = ea.key !== key || ea.old ? 1 : 0, ob = eb.key !== key || eb.old ? 1 : 0;
      return ob - oa || (eb.dist || 0) - (ea.dist || 0);
    });
    for (var i = 0; i < ids.length && total > budget(); i++) {
      if (ids[i] === keepId) continue;
      var e = sprites[ids[i]];
      if (!e.result) continue;
      total -= e.result.px;
      delete sprites[ids[i]];
    }
  }

  /** Bakes every sprite the view's bake window needs now (tests, sheets). @returns {number} bakes */
  function bakeAll(v, m) {
    var n = 0, guard = 0;
    while (guard++ < 4000) {
      var did = bake(v, m);
      if (!did) break;
      n++;
    }
    return n;
  }

  /** The occlusion fade (GDD §3.7): a building covering the player, a door near them, a named NPC or a marker fades to 35 %. */
  function occlusion(v, m) {
    var oa = L().tune('world.occlusionAlpha', null);
    var fadeAlpha = oa && typeof oa.alpha === 'number' ? oa.alpha : FADE_ALPHA;
    var fadeTime = oa && typeof oa.ms === 'number' ? oa.ms / 1000 : FADE_TIME;
    var A = SR.render.actors;
    var focus = A && A.focus ? A.focus(v) : null;
    var dt = v.dt;
    var p = A && A.playerPos ? A.playerPos() : null;
    for (var i = 0; i < m.buildings.length; i++) {
      var rb = m.buildings[i], g = rb.geom;
      var target = 1;
      if (focus && focus.length) {
        for (var f = 0; f < focus.length && target === 1; f++) {
          var fr = focus[f];
          if (!inRect(g.bounds, fr[0], fr[1], fr[2], fr[3])) continue;
          for (var k = 0; k < g.cover.length; k++) {
            var cr = g.cover[k];
            // Covered: the focus stands north of this piece's south edge and inside its projection.
            if (fr[3] < cr[3] && inRect(cr, fr[0], fr[1], fr[2], fr[3])) { target = fadeAlpha; break; }
          }
        }
      }
      if (target === 1 && p) {
        // A door within 160 u of the player whose porch this building covers.
        var ds = m.doors, near = L().tune('world.door.tag', DOOR_FOCUS);
        for (var d = 0; d < ds.length; d++) {
          var dg = ds[d].geom;
          if (dg === g || !dg.visible) continue;
          var dd = ds[d].door;
          if (Math.abs(dd.x - p.x) > near || Math.abs(dd.y - p.y) > near) continue;
          if (Math.hypot(dd.x - p.x, dd.y - p.y) > near) continue;
          for (var q = 0; q < g.cover.length; q++) {
            if (inRect(g.cover[q], dg.visible[0], dg.visible[1], dg.visible[2], dg.visible[3])) { target = fadeAlpha; break; }
          }
          if (target !== 1) break;
        }
      }
      rb.target = target;
      var step = dt > 0 ? dt * (1 - fadeAlpha) / fadeTime : 1;
      if (rb.alpha < target) rb.alpha = Math.min(target, rb.alpha + step);
      else if (rb.alpha > target) rb.alpha = Math.max(target, rb.alpha - step);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // The lit-window schedule (ART_AUDIO §3): 15 % lit 07-17, 60-90 % (per building) 20-23, 25 %
  // after 01, ramps between; each window has a seeded threshold that changes daily.
  // ---------------------------------------------------------------------------------------------

  function litFraction(id, min) {
    var eve = 0.6 + 0.3 * L().hash01(id, 'eve');
    var pts = [[0, (eve + 0.25) / 2], [60, 0.25], [300, 0.25], [420, 0.15], [1020, 0.15], [1200, eve], [1380, eve], [1440, (eve + 0.25) / 2]];
    for (var i = 1; i < pts.length; i++) {
      if (min <= pts[i][0]) {
        var a = pts[i - 1], b = pts[i];
        return a[1] + (b[1] - a[1]) * (min - a[0]) / (b[0] - a[0]);
      }
    }
    return 0.25;
  }

  /** @returns {number[][]} the lit window rects of a building at a game minute and day. */
  function litWindows(id, min, day) {
    var e = sprites[id];
    if (!e || !e.result) return null;
    var slot = day * 96 + Math.floor(min / LIT_SLOT);
    var c = litCache[id];
    if (c && c.slot === slot && c.src === e.result) return c.list;
    var f = litFraction(id, min);
    var w = e.result.windows, list = [];
    for (var i = 0; i < w.length; i++) if (L().hash01(id, i, day) < f) list.push(w[i]);
    litCache[id] = { slot: slot, src: e.result, list: list };
    return list;
  }

  /** @returns {object[]} the neon sprites of a baked building ([] until baked). */
  function neon(id) {
    var e = sprites[id];
    return e && e.result ? e.result.neon : [];
  }

  /** @returns {object|null} the baked sprite entry of a building (tests). */
  function sprite(id) {
    var e = sprites[id];
    return e ? { key: e.key, zoom: e.zoom, scale: e.scale, ready: !!(e.result && !e.old), result: e.result } : null;
  }

  // ---------------------------------------------------------------------------------------------
  // Props (ART_AUDIO §6): cached sprites per type, variant and zoom. W2-Exterior draws them
  // through SR.art.props.draw(ctx, type, variant) / size(type, variant); until then placeholders.
  // ---------------------------------------------------------------------------------------------

  var FLAT = { pond: 1, fountain: 1, decal: 1, puddle: 1, plaza: 1 };   // drawn into the ground chunks
  // Placeholder sprite boxes [w, h, anchor x, anchor y] in u (anchor = the ground contact point).
  var SIZES = { tree: [100, 136, 50, 124], lamp: [28, 80, 14, 74], bench: [64, 40, 32, 30], hydrant: [20, 30, 10, 26],
    bin: [24, 32, 12, 28], planter: [44, 34, 22, 26], mailbox: [22, 32, 11, 28], shelter: [110, 80, 55, 66],
    newsbox: [24, 30, 12, 26], billboard: [140, 120, 70, 108], sawhorse: [76, 44, 38, 36], statue: [80, 110, 40, 96],
    chessTable: [52, 44, 26, 34], binoculars: [30, 52, 15, 46], plinth: [80, 64, 40, 50] };

  function propKey(p) { return p.type + '|' + (p.variant || 0) + '|' + (p.a || 0); }

  function propSize(type, variant, a) {
    var A = SR.art.props;
    if (A && typeof A.size === 'function') {
      try {
        var s = A.size(type, variant, a);
        if (s && s.w > 0 && s.h > 0) return [s.w, s.h, s.ax === undefined ? s.w / 2 : s.ax, s.ay === undefined ? s.h : s.ay];
      } catch (e) { /* placeholder below */ }
    }
    var z = SIZES[type] || [48, 60, 24, 54];
    if (type === 'bench' && (a === 90 || a === 270)) return [40, 76, 20, 58];
    if (type === 'tree' && variant === 1) return [70, 150, 35, 140];
    return z;
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  function propSprite(p, v) {
    var zk = v.bz + '@' + Math.round(spriteScale(v) * 1000);
    var key = propKey(p) + '|' + zk;
    var hit = props[key];
    if (hit) return hit;
    var sz = propSize(p.type, p.variant || 0, p.a || 0);
    var sc = v.bz * spriteScale(v);
    var cv = makeCanvas(sz[0] * sc, sz[1] * sc);
    var x = cv.getContext('2d');
    x.setTransform(sc, 0, 0, sc, sz[2] * sc, sz[3] * sc);
    x.lineJoin = 'round'; x.lineCap = 'round';
    var A = SR.art.props, ok = false;
    if (A && typeof A.draw === 'function') {
      try { A.draw(x, p.type, p.variant || 0, p.a || 0); ok = true; } catch (e) {
        SR.util.warnOnce('render.prop:' + p.type, 'SR.render: SR.art.props.draw(' + p.type + ') threw: ' + e.message);
      }
    }
    if (!ok) placeholderProp(x, p.type, p.variant || 0, p.a || 0, Math.max(1.5, 1.5 / sc));
    hit = props[key] = { canvas: cv, w: sz[0], h: sz[1], ax: sz[2], ay: sz[3], px: cv.width * cv.height };
    propPx += hit.px;
    return hit;
  }

  /** Placeholder prop art (W2-Exterior's js/art/props.js replaces it), in the pre-seeded prop.* keys. */
  function placeholderProp(x, type, variant, a, lw) {
    var pal = L().pal, tone = L().tone;
    var ink = pal('ink', 0.1);
    function shadow(rx, ry) {
      x.save(); x.globalAlpha = 0.18; x.fillStyle = ink;
      x.beginPath(); x.ellipse(4, 3, rx, ry, 0, 0, Math.PI * 2); x.fill(); x.restore();
    }
    function outline(fn) { x.save(); x.strokeStyle = ink; x.globalAlpha = 0.9; x.lineWidth = lw; x.beginPath(); fn(); x.stroke(); x.restore(); }
    function box(bx, by, w, h, top, face, dz) {
      x.fillStyle = top; x.fillRect(bx, by - dz, w, h);
      x.fillStyle = face; x.fillRect(bx, by + h - dz, w, dz);
      outline(function () { x.rect(bx, by - dz, w, h + dz); x.moveTo(bx, by + h - dz); x.lineTo(bx + w, by + h - dz); });
    }
    if (type === 'tree') {
      var trunk = pal(['prop.trunk', 'strata2'], 0.35);
      if (variant === 2) {
        // The cloud tree: a paper-cloud crown on a thin trunk.
        shadow(30, 8);
        x.fillStyle = trunk; x.fillRect(-3, -60, 6, 60);
        var cl = pal(['cloud', 'paperEdge'], 0.97);
        x.fillStyle = cl;
        x.beginPath();
        [[-22, -74, 18], [0, -86, 24], [22, -74, 18], [-8, -66, 16], [12, -64, 16]].forEach(function (c) { x.moveTo(c[0] + c[2], c[1]); x.arc(c[0], c[1], c[2], 0, Math.PI * 2); });
        x.fill();
        x.fillStyle = pal(['cloudLine', 'sidewalk'], 0.8); x.fillRect(-34, -58, 68, 2);
        outline(function () { x.rect(-3, -58, 6, 58); });
        return;
      }
      var tall = variant === 1;
      var r = tall ? 24 : 38, hgt = tall ? 110 : 80, ry = tall ? r * 1.9 : r;
      shadow(r * 0.8, r * 0.3);
      x.fillStyle = trunk;
      x.fillRect(-4, -hgt * 0.45, 8, hgt * 0.45);
      x.fillStyle = pal(['prop.leafShade', 'grassShade'], 0.4);
      x.beginPath(); x.ellipse(0, -hgt * 0.62 - (tall ? 20 : 0), r, ry, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = pal(tall ? ['prop.poplar', 'grass'] : ['prop.leaf', 'grass'], 0.5);
      x.beginPath(); x.ellipse(-r * 0.12, -hgt * 0.66 - (tall ? 20 : 0), r * 0.86, ry * 0.86, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = pal(['prop.leafHi', 'grassHi'], 0.6);
      x.beginPath(); x.ellipse(-r * 0.35, -hgt * 0.78 - (tall ? 30 : 0), r * 0.3, ry * 0.22, -0.5, 0, Math.PI * 2); x.fill();
      outline(function () { x.ellipse(0, -hgt * 0.62 - (tall ? 20 : 0), r, ry, 0, 0, Math.PI * 2); x.rect(-4, -hgt * 0.45 + 2, 8, hgt * 0.45 - 2); });
    } else if (type === 'lamp') {
      shadow(6, 3);
      x.fillStyle = pal(['prop.lampPost', 'railing'], 0.3);
      x.fillRect(-2, -64, 4, 64);
      x.fillRect(-8, -70, 16, 6);
      x.fillStyle = pal(['prop.lampGlass', 'glassLit'], 0.9);
      x.fillRect(-6, -64, 12, 5);
      outline(function () { x.rect(-2, -64, 4, 64); x.rect(-8, -70, 16, 11); });
    } else if (type === 'bench') {
      var wood = pal(['prop.bench', 'path'], 0.6), iron = pal(['prop.benchIron', 'railing'], 0.3);
      if (a === 90 || a === 270) {
        shadow(10, 26);
        box(-10, -50, 20, 48, wood, tone(wood, -1), 8);
        x.fillStyle = iron; x.fillRect(-10, -52, 3, 50);
      } else {
        shadow(28, 5);
        x.fillStyle = wood; x.fillRect(-28, -22, 56, 8);
        x.fillStyle = tone(wood, -1); x.fillRect(-28, -14, 56, 6);
        x.fillStyle = iron; x.fillRect(-24, -8, 4, 8); x.fillRect(20, -8, 4, 8);
        outline(function () { x.rect(-28, -22, 56, 14); });
      }
    } else if (type === 'sawhorse') {
      var sw = pal(['sawhorse', 'paperEdge'], 0.9), ss = pal(['sawhorseStripe', 'ui.hp'], 0.4);
      shadow(30, 4);
      x.fillStyle = pal(['prop.lampPost', 'railing'], 0.3);
      x.fillRect(-30, -12, 4, 12); x.fillRect(26, -12, 4, 12);
      x.fillStyle = sw; x.fillRect(-34, -30, 68, 16);
      x.fillStyle = ss;
      x.beginPath();
      for (var i = -34; i < 34; i += 16) { x.moveTo(i, -14); x.lineTo(i + 8, -30); x.lineTo(i + 14, -30); x.lineTo(i + 6, -14); }
      x.fill();
      outline(function () { x.rect(-34, -30, 68, 16); });
    } else if (type === 'chessTable') {
      var top = pal(['prop.chess', 'paperEdge'], 0.9), dark = pal(['prop.chessDark', 'ink'], 0.1);
      shadow(18, 6);
      x.fillStyle = pal(['prop.lampPost', 'railing'], 0.3); x.fillRect(-3, -14, 6, 14);
      x.fillStyle = top; x.beginPath(); x.ellipse(0, -18, 22, 12, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = dark;
      x.beginPath();
      for (var cx = 0; cx < 4; cx++) for (var cy = 0; cy < 4; cy++) if ((cx + cy) % 2) x.rect(-8 + cx * 4, -22 + cy * 2, 4, 2);
      x.fill();
      outline(function () { x.ellipse(0, -18, 22, 12, 0, 0, Math.PI * 2); });
    } else if (type === 'binoculars') {
      var bc = pal(['prop.binocular', 'railing'], 0.3);
      shadow(8, 3);
      x.fillStyle = bc; x.fillRect(-2, -30, 4, 30);
      x.fillRect(-10, -42, 20, 12);
      x.fillStyle = pal('glass', 0.8); x.fillRect(-8, -40, 5, 5); x.fillRect(3, -40, 5, 5);
      outline(function () { x.rect(-10, -42, 20, 12); x.rect(-2, -30, 4, 30); });
    } else if (type === 'shelter') {
      // A bus shelter: glass back panel, two posts, a roof slab and a bench.
      var post = pal(['prop.lampPost', 'railing'], 0.3), glass = pal(['prop.shelter', 'glass'], 0.8);
      shadow(50, 8);
      x.save(); x.globalAlpha = 0.55; x.fillStyle = glass; x.fillRect(-48, -58, 96, 40); x.restore();
      x.fillStyle = post; x.fillRect(-50, -60, 4, 60); x.fillRect(46, -60, 4, 60);
      x.fillStyle = tone(post, 1); x.fillRect(-54, -66, 108, 8);
      x.fillStyle = pal(['prop.bench', 'path'], 0.6); x.fillRect(-36, -16, 72, 6);
      outline(function () { x.rect(-54, -66, 108, 8); x.rect(-48, -58, 96, 40); });
    } else if (type === 'plinth') {
      var st = pal(['prop.plinth', 'stone'], 0.8);
      shadow(34, 8);
      box(-32, -44, 64, 44, tone(st, 1), tone(st, -1), 20);
    } else {
      var c = pal(type === 'hydrant' ? ['prop.hydrant', 'ui.hp'] : type === 'bin' ? ['prop.bin', 'railing'] : ['prop.' + type, 'railing'], 0.4);
      var s = propSize(type, variant, a);
      shadow(s[0] * 0.4, 4);
      x.fillStyle = c;
      x.fillRect(-s[0] * 0.35, -s[3] * 0.8, s[0] * 0.7, s[3] * 0.8);
      x.fillStyle = tone(c, 1);
      x.fillRect(-s[0] * 0.35, -s[3] * 0.8, s[0] * 0.7, 4);
      outline(function () { x.rect(-s[0] * 0.35, -s[3] * 0.8, s[0] * 0.7, s[3] * 0.8); });
    }
  }

  var propBuckets = null;   // 512 u grid of props for culling
  var propModel = null;
  var PB = 512;

  function buckets(m) {
    if (propModel === m && propBuckets) return propBuckets;
    propModel = m;
    propBuckets = {};
    m.props.forEach(function (p) {
      if (FLAT[p.type]) return;
      var k = Math.floor(p.x / PB) + ',' + Math.floor(p.y / PB);
      (propBuckets[k] || (propBuckets[k] = [])).push(p);
    });
    return propBuckets;
  }

  /** Pushes the props that intersect the view into the Y-sorted pass. @returns {number} how many */
  function collectProps(v, m, push) {
    if (!m.props.length) return 0;
    var bk = buckets(m), n = 0;
    var pad = 160;
    var i0 = Math.floor((v.x0 - pad) / PB), i1 = Math.floor((v.x1 + pad) / PB);
    var j0 = Math.floor((v.y0 - pad) / PB), j1 = Math.floor((v.y1 + pad * 2) / PB);
    for (var i = i0; i <= i1; i++) {
      for (var j = j0; j <= j1; j++) {
        var list = bk[i + ',' + j];
        if (!list) continue;
        for (var k = 0; k < list.length; k++) {
          var p = list[k];
          if (p.x < v.x0 - pad || p.x > v.x1 + pad || p.y < v.y0 - 20 || p.y > v.y1 + pad * 2) continue;
          push(p.y, 'prop', p);
          n++;
        }
      }
    }
    return n;
  }

  /** Draws one prop from its cached sprite (anchored at its ground contact point). */
  function drawProp(ctx, p, v) {
    var s = propSprite(p, v);
    ctx.drawImage(s.canvas, p.x - s.ax, p.y - s.ay, s.w, s.h);
    L().count.images++;
  }

  /** @returns {object} sprite cache sizes (device px) for SR.render.stats(). */
  function stats() {
    var px = 0, count = 0, neonPx = 0, neonCount = 0;
    Object.keys(sprites).forEach(function (id) {
      var e = sprites[id];
      if (e.result) { px += e.result.px; count++; neonPx += e.result.neonPx || 0; neonCount += e.result.neon.length; }
      else if (e.job && e.job.px) px += e.job.px;
    });
    return { count: count, px: px, budgetPx: budget(), pending: pending, neonPx: neonPx, neonCount: neonCount, propPx: propPx, propCount: Object.keys(props).length };
  }

  SR.render.buildings = {
    collect: collect,
    collectProps: collectProps,
    drawBuilding: drawBuilding,
    drawProp: drawProp,
    bake: bake,
    bakeAll: bakeAll,
    occlusion: occlusion,
    litWindows: litWindows,
    litFraction: litFraction,
    neon: neon,
    sprite: sprite,
    invalidate: invalidate,
    reset: reset,
    stats: stats,
  };
})();
