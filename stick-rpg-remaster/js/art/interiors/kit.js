// js/art/interiors/kit.js — owner: W1-A. SR.art.interior(id) and the interior kit (ART_AUDIO §9;
// ARCHITECTURE §9.2): draws an interior from its SR.def.interior data (palette keys only).
//
// Composition (1280 × 720): the back wall from y 0 to the floor line (default 400), the floor in
// one-point perspective below it, the scene in x 0-760 and only wall and floor behind the card
// (x 776-1248). Props stand on the floor with (x, y) = the left end of their front bottom edge (y is
// the floor contact line, so a smaller y is farther away) and recede toward the vanishing point
// (default 400, 300); wall props ('wall' kinds) use (x, y) = their top-left corner on the wall.
//
// SR.def.interior('mcsticks', {
//   wall: { type: 'tiles', color: 'int.mcsticks.wall', trim: 'bld.mcsticks.walls' },
//         // type: plain | tiles | panels | brick | stripes | stone | wallpaper; color, alt, trim
//   floor: { type: 'checker', a: 'int.mcsticks.floorA', b: 'int.mcsticks.floorB', perspective: 0.35 },
//         // type: checker | tiles | planks | carpet | concrete; perspective 0 (flat) .. 1 (true one-point)
//   window: { x: 60, y: 90, w: 220, h: 140 },          // shows the live sky (SR.render.sky.drawWindow)
//   props: [{ type: 'counter', x: 120, y: 470, w: 520, color: 'bld.mcsticks.walls' },
//           { type: 'menuBoard', x: 180, y: 110, items: ['fries', 'burger', 'milkshake'] },
//           { type: 'fryer', x: 520, y: 400, anim: 'steam' }],
//   owner: { id: 'mel', x: 360, y: 430, pose: 'idle' },  // pose: a clip (SR.art.stick.clips)
//   you: { x: 250, y: 560 },
//   lights: [{ x: 300, y: 60, r: 220, color: 'int.mcsticks.light' }],
//   custom: 'mcsticksHero',   // a function, or a name in fns: { mcsticksHero: fn | { static, anim } }
//   floorY: 400, vp: [400, 300],                         // optional composition overrides
// });
//
// Prop fields: type, x, y, w, h, d (depth), color (main palette key), alt (second key), anim (a
// loop name the type understands; most animated types animate without it), sortY (draw order when a
// prop sits on another, e.g. a register on the counter: the counter's y), when(state, params) → false
// hides it (owned furniture), pick(state, params) → another type (tier-2 furniture), text (a text key: posters,
// signs), items (menu board icons), person (portrait frame), flip (mirror). Colour keys may use
// '@name' for the interior's own set: '@counter' → int.<id>.counter (int.default.counter if absent).
//
// SR.art.interior(id, params) → { id, def, params, drawStatic(ctx, state), drawAnim(ctx, t, state, actors) };
//   params: the door resolver's ({ homeId, mode } at a home door), handed to when / pick / custom fns.
//   drawStatic paints the cacheable layer (wall, window frame, floor, props, lights); the building
//   scene caches it (redrawn on resize or a state change such as new furniture).
//   drawAnim paints each frame: the live sky in the windows, animated props, then the people in depth
//   order (props in front of a person are drawn again over them).
//   actors: { owner: { pose | clip, id | look, t, mood, visible }, you: { pose | clip, t, mood, visible,
//             x, y, facing, look, karma }, extra: [{ look, x, y, clip, t, facing, mood, player }] } (every
//             field optional). pose / clip: any SR.art.stick clip; the UI.md §5.6 proprietor poses are
//             idle, talk, happy (or react-happy), shock (or react-shock) and work; happy / shock also
//             set the face unless mood is given.
// An id without a registered def returns a neutral room in its int.<id> palette (the grey-box
// placeholder). SR.art.interior.kit: the helpers custom draw fns receive (box, back, depthScale, prop,
// stick, color, tone, sky); SR.art.interior.types(): the prop types.
// Node-loadable: nothing draws at load time.
(function () {
  'use strict';
  var SR = window.SR;
  var W = 1280, H = 720;
  var FLOOR_Y = 400, VP = [400, 300], FOCAL = 600;
  var LW = 2.5, DL = 1.5; // silhouette and detail ink widths in interiors

  // ---- colour helpers ------------------------------------------------------------------------------
  function C(K, key) {
    if (typeof key !== 'string') return key;
    if (key.charAt(0) === '@') {
      var name = key.slice(1);
      var set = SR.art.palette.int[K.pid] || SR.art.palette.int['default'];
      var v = set && set[name] !== undefined ? set[name] : SR.art.palette.int['default'][name];
      return SR.art.draw.color(v || 'int.default.wall');
    }
    return SR.art.draw.color(key);
  }
  function T(K, key, n) { return SR.art.draw.tone(C(K, key), n); }

  // ---- geometry ------------------------------------------------------------------------------------
  /** @returns {number[]} a floor-plane point (x, y) moved d units back toward the vanishing point. */
  function back(K, x, y, d) {
    var s = FOCAL / (FOCAL + d);
    return [K.vp[0] + (x - K.vp[0]) * s, K.vp[1] + (y - K.vp[1]) * s];
  }
  /**
   * The scale of a side-view person standing at floor y (farther = a little smaller). Props keep their
   * authored size, so people stay near the scale where an adult is about 1.75 counters tall.
   * @returns {number}
   */
  function depthScale(K, y) {
    var u = (y - K.floorY) / (H - K.floorY);
    u = u < 0 ? 0 : u > 1.2 ? 1.2 : u;
    return 0.9 + 0.14 * u;
  }
  function path(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
  }
  function fillStroke(ctx, fill, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = SR.art.draw.color('inkLine'); ctx.lineJoin = 'round'; ctx.stroke(); }
  }
  function rect(ctx, x, y, w, h, fill, lw) { ctx.beginPath(); ctx.rect(x, y, w, h); fillStroke(ctx, fill, lw === undefined ? LW : lw); }
  function circle(ctx, x, y, r, fill, lw) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); fillStroke(ctx, fill, lw === undefined ? LW : lw); }
  function ellipse(ctx, x, y, rx, ry, fill, lw) { ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2); fillStroke(ctx, fill, lw === undefined ? LW : lw); }
  function line(ctx, pts, lw, col) {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.lineWidth = lw || DL; ctx.strokeStyle = col || SR.art.draw.color('inkLine'); ctx.lineCap = 'round'; ctx.stroke();
  }
  function poly(ctx, pts, fill, lw) { path(ctx, pts); fillStroke(ctx, fill, lw === undefined ? LW : lw); }

  /**
   * A box in one-point perspective: front face x..x+w, y-h..y; the top and the side facing the
   * vanishing point recede d units. Colours: front = col, top = highlight, side = shade.
   */
  function box(ctx, K, x, y, w, h, d, col, opts) {
    var f = C(K, col);
    var top = y - h;
    var b00 = back(K, x, top, d), b10 = back(K, x + w, top, d), b01 = back(K, x, y, d), b11 = back(K, x + w, y, d);
    var lw = opts && opts.lw !== undefined ? opts.lw : LW;
    if (x + w < K.vp[0]) poly(ctx, [x + w, top, b10[0], b10[1], b11[0], b11[1], x + w, y], SR.art.draw.tone(f, -1), lw);
    else if (x > K.vp[0]) poly(ctx, [x, top, b00[0], b00[1], b01[0], b01[1], x, y], SR.art.draw.tone(f, -1), lw);
    if (top > K.vp[1]) poly(ctx, [x, top, x + w, top, b10[0], b10[1], b00[0], b00[1]], (opts && opts.top) ? C(K, opts.top) : SR.art.draw.tone(f, 1), lw);
    if (!(opts && opts.noFront)) rect(ctx, x, top, w, h, f, lw);
  }

  // ---- the live sky in a window --------------------------------------------------------------------
  function skyAt(min) {
    var keys = SR.art.palette.sky;
    var h = ((min || 720) / 60) % 24;
    var a = keys[keys.length - 1], b = keys[0], ah = a.h - 24, bh = b.h;
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].h <= h) { a = keys[i]; ah = a.h; b = keys[i + 1] || keys[0]; bh = keys[i + 1] ? b.h : b.h + 24; }
    }
    var u = bh > ah ? (h - ah) / (bh - ah) : 0;
    return { top: SR.art.draw.mix(a.top, b.top, u), horizon: SR.art.draw.mix(a.horizon, b.horizon, u) };
  }
  function sky(ctx, rct, state) {
    if (SR.render && SR.render.sky && typeof SR.render.sky.drawWindow === 'function') {
      SR.render.sky.drawWindow(ctx, rct);
      return;
    }
    var s = skyAt(state && state.clock ? state.clock.min : 720);
    var g = ctx.createLinearGradient(0, rct[1], 0, rct[1] + rct[3]);
    g.addColorStop(0, s.top);
    g.addColorStop(1, s.horizon);
    ctx.fillStyle = g;
    ctx.fillRect(rct[0], rct[1], rct[2], rct[3]);
  }
  function windowPanes(ctx, K, wnd, withGlass) {
    var fr = C(K, wnd.frame || '@trim');
    var x = wnd.x, y = wnd.y, w = wnd.w, h = wnd.h;
    var cols = wnd.panes || (w > 180 ? 3 : 2), rows = h > 150 ? 2 : 1;
    ctx.lineWidth = 6; ctx.strokeStyle = fr;
    ctx.beginPath();
    for (var c = 1; c < cols; c++) { ctx.moveTo(x + w * c / cols, y); ctx.lineTo(x + w * c / cols, y + h); }
    for (var r = 1; r < rows; r++) { ctx.moveTo(x, y + h * r / rows); ctx.lineTo(x + w, y + h * r / rows); }
    ctx.stroke();
    if (withGlass) {
      ctx.save();
      ctx.globalAlpha *= 0.22;
      poly(ctx, [x + w * 0.1, y + h, x + w * 0.35, y, x + w * 0.5, y, x + w * 0.25, y + h], SR.art.draw.color('white'), 0);
      ctx.restore();
    }
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.lineWidth = 8; ctx.strokeStyle = fr; ctx.stroke();
    ctx.lineWidth = LW; ctx.strokeStyle = SR.art.draw.color('inkLine'); ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
  }
  function windowStatic(ctx, K, wnd, state) {
    rect(ctx, wnd.x - 4, wnd.y - 4, wnd.w + 8, wnd.h + 8, C(K, wnd.frame || '@trim'), LW);
    sky(ctx, [wnd.x, wnd.y, wnd.w, wnd.h], state);
    windowPanes(ctx, K, wnd, true);
    // sill
    box(ctx, K, wnd.x - 14, wnd.y + wnd.h + 14, wnd.w + 28, 10, 14, wnd.frame || '@trim');
  }

  // ---- walls and floors ----------------------------------------------------------------------------
  function drawWall(ctx, K, state) {
    var wd = K.def.wall || {};
    var col = C(K, wd.color || '@wall'), alt = C(K, wd.alt || '@wallShade'), trim = C(K, wd.trim || '@trim');
    var fy = K.floorY;
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, W, fy);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, fy); ctx.clip();
    var gl = SR.art.draw.tone(col, -1), i, j;
    ctx.lineWidth = 1.5; ctx.strokeStyle = gl;
    switch (wd.type) {
      case 'tiles': {
        var ts = wd.size || 40;
        ctx.beginPath();
        for (i = ts; i < fy; i += ts) { ctx.moveTo(0, i); ctx.lineTo(W, i); }
        for (j = 0; j < W; j += ts) { ctx.moveTo(j, 0); ctx.lineTo(j, fy); }
        ctx.stroke();
        break;
      }
      case 'panels': {
        for (i = 0; i < W; i += 96) { rect(ctx, i + 10, 40, 76, fy - 150, SR.art.draw.tone(col, 0.35), DL); }
        break;
      }
      case 'brick': {
        ctx.beginPath();
        for (i = 0, j = 0; i < fy; i += 22, j++) {
          ctx.moveTo(0, i); ctx.lineTo(W, i);
          for (var bx = (j % 2) * 30; bx < W; bx += 60) { ctx.moveTo(bx, i); ctx.lineTo(bx, i + 22); }
        }
        ctx.stroke();
        break;
      }
      case 'stripes': {
        ctx.fillStyle = alt;
        for (i = 0; i < W; i += 64) ctx.fillRect(i, 0, 28, fy);
        break;
      }
      case 'stone': {
        ctx.beginPath();
        for (i = 0, j = 0; i < fy; i += 56, j++) {
          ctx.moveTo(0, i); ctx.lineTo(W, i);
          for (var sx = (j % 2) * 55; sx < W; sx += 110) { ctx.moveTo(sx, i); ctx.lineTo(sx, i + 56); }
        }
        ctx.lineWidth = 2.5; ctx.strokeStyle = gl; ctx.stroke();
        break;
      }
      case 'wallpaper': {
        ctx.fillStyle = alt;
        for (i = 30, j = 0; i < fy; i += 60, j++) for (var px = (j % 2) * 40 + 20; px < W; px += 80) { ctx.beginPath(); ctx.arc(px, i, 5, 0, Math.PI * 2); ctx.fill(); }
        break;
      }
      default: break;
    }
    ctx.restore();
    // cornice, wainscot trim and skirting
    rect(ctx, -4, 0, W + 8, 26, SR.art.draw.tone(col, -1), LW);
    if (wd.wainscot !== false) {
      rect(ctx, -4, fy - (wd.wainscotH || 70), W + 8, wd.wainscotH || 70, wd.type === 'tiles' ? trim : alt, LW);
      rect(ctx, -4, fy - (wd.wainscotH || 70) - 8, W + 8, 8, trim, DL);
    }
    rect(ctx, -4, fy - 12, W + 8, 12, SR.art.draw.tone(trim, -1), LW);
  }

  function floorGrid(K, pers) {
    // Lines converge at (vp.x, yStar): pers = 1 is the true one-point perspective (yStar = vp.y).
    var fy = K.floorY;
    var sbTrue = (fy - K.vp[1]) / (H - K.vp[1]);
    var sb = 1 - (1 - sbTrue) * pers;
    var yStar = H - (H - fy) / (1 - sb + 1e-6);
    return { sb: sb, yStar: yStar };
  }
  function floorX(K, g, xf, y) { return K.vp[0] + (xf - K.vp[0]) * (y - g.yStar) / (H - g.yStar); }

  function drawFloor(ctx, K) {
    var fd = K.def.floor || {};
    var a = C(K, fd.a || '@floorA'), b = C(K, fd.b || '@floorB');
    var fy = K.floorY;
    var pers = fd.perspective === undefined ? 0.6 : fd.perspective;
    var g = floorGrid(K, Math.max(0.02, Math.min(1, pers)));
    var rows = fd.rows || 7, tile = fd.tile || 96;
    var ys = [];
    for (var k = 0; k <= rows; k++) ys.push(g.yStar + (H - g.yStar) / (1 + (k / rows) * (1 / g.sb - 1)));
    ctx.fillStyle = a;
    ctx.fillRect(0, fy, W, H - fy);
    var x0 = K.vp[0] - Math.ceil((K.vp[0] + 400) / tile) * tile, x1 = W + 1200;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, fy, W, H - fy); ctx.clip();
    var i;
    if (fd.type === 'checker' || fd.type === 'tiles') {
      if (fd.type === 'checker') {
        ctx.fillStyle = b;
        for (var r = 0; r < rows; r++) {
          var ya = ys[r], yb = ys[r + 1];
          for (var c = 0, xf = x0; xf < x1; xf += tile, c++) {
            if ((c + r) % 2) continue;
            ctx.beginPath();
            ctx.moveTo(floorX(K, g, xf, ya), ya); ctx.lineTo(floorX(K, g, xf + tile, ya), ya);
            ctx.lineTo(floorX(K, g, xf + tile, yb), yb); ctx.lineTo(floorX(K, g, xf, yb), yb);
            ctx.closePath(); ctx.fill();
          }
        }
      }
      ctx.beginPath();
      for (i = 0; i <= rows; i++) { ctx.moveTo(0, ys[i]); ctx.lineTo(W, ys[i]); }
      for (var xf2 = x0; xf2 < x1; xf2 += tile) { ctx.moveTo(floorX(K, g, xf2, H), H); ctx.lineTo(floorX(K, g, xf2, fy), fy); }
      ctx.lineWidth = 1.5; ctx.strokeStyle = fd.type === 'tiles' ? b : SR.art.draw.tone(a, -1); ctx.stroke();
    } else if (fd.type === 'planks') {
      ctx.beginPath();
      var pw = fd.tile || 48;
      for (var xp = x0; xp < x1; xp += pw) { ctx.moveTo(floorX(K, g, xp, H), H); ctx.lineTo(floorX(K, g, xp, fy), fy); }
      ctx.lineWidth = 1.5; ctx.strokeStyle = b; ctx.stroke();
      ctx.beginPath();
      for (i = 0; i < rows; i++) {
        for (var xq = x0 + (i % 3) * pw * 0.66; xq < x1; xq += pw * 3) {
          var yy = (ys[i] + ys[i + 1]) / 2;
          ctx.moveTo(floorX(K, g, xq, yy), yy); ctx.lineTo(floorX(K, g, xq + pw, yy), yy);
        }
      }
      ctx.stroke();
    } else if (fd.type === 'carpet') {
      ctx.fillStyle = b;
      for (i = 0; i < rows; i++) {
        var ym = (ys[i] + ys[i + 1]) / 2, sc = (ym - g.yStar) / (H - g.yStar);
        for (var xc = x0; xc < x1; xc += tile / 2) { ctx.beginPath(); ctx.arc(floorX(K, g, xc, ym), ym, 3 * sc, 0, Math.PI * 2); ctx.fill(); }
      }
    } else { // concrete
      ctx.fillStyle = b;
      var rng = SR.rng.create(SR.util.hash('floor', K.id));
      for (i = 0; i < 260; i++) { var yx = rng.float(fy, H); ctx.fillRect(rng.float(0, W), yx, 2, 2); }
      ctx.beginPath();
      for (i = 0; i <= rows; i += 2) { ctx.moveTo(0, ys[i]); ctx.lineTo(W, ys[i]); }
      ctx.lineWidth = 1.5; ctx.strokeStyle = SR.art.draw.tone(a, -1); ctx.stroke();
    }
    ctx.restore();
    // the wall-floor seam
    line(ctx, [0, fy, W, fy], LW);
  }

  function drawLights(ctx, K) {
    var ls = K.def.lights || [];
    for (var i = 0; i < ls.length; i++) {
      var l = ls[i];
      var c = C(K, l.color || '@light');
      if (l.fixture !== false) {
        line(ctx, [l.x, 26, l.x, l.y - 18], 2);
        poly(ctx, [l.x - 22, l.y, l.x + 22, l.y, l.x + 12, l.y - 18, l.x - 12, l.y - 18], C(K, l.shade || '@trim'), LW);
        circle(ctx, l.x, l.y + 2, 7, c, DL);
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var gr = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r || 200);
      gr.addColorStop(0, SR.art.draw.alpha(c, l.alpha || 0.28));
      gr.addColorStop(1, SR.art.draw.alpha(c, 0));
      ctx.fillStyle = gr;
      ctx.fillRect(l.x - (l.r || 200), l.y - (l.r || 200), (l.r || 200) * 2, (l.r || 200) * 2);
      ctx.restore();
    }
  }

  // ---- people ----------------------------------------------------------------------------------------
  // UI.md §5.6 proprietor animations (idle, talk, react-happy, react-shock, work) map onto clips.
  var CLIP_ALIAS = { 'react-happy': 'happy', react_happy: 'happy', 'react-shock': 'shock', react_shock: 'shock', stand: 'idle' };
  function clipName(c) {
    if (!c) return 'idle';
    if (CLIP_ALIAS[c]) return CLIP_ALIAS[c];
    return c;
  }
  function moodFor(c) { c = clipName(c); return c === 'happy' || c === 'cheer' ? 'happy' : c === 'shock' || c === 'cower' ? 'surprised' : c === 'hurt' ? 'hurt' : c === 'sleep' ? 'sleep' : undefined; }
  function drawPerson(ctx, K, spec, t) {
    var sc = depthScale(K, spec.y) * (spec.scale || 1);
    ctx.save();
    ctx.globalAlpha *= 0.18;
    ellipse(ctx, spec.x + 6 * sc, spec.y + 2, 46 * sc, 9 * sc, SR.art.draw.color('ink'), 0);
    ctx.restore();
    SR.art.stick.draw(ctx, spec.clip || 'idle', {
      view: 'side', x: spec.x, y: spec.y, scale: sc, look: spec.look, player: spec.player, karma: spec.karma,
      facing: spec.facing, mood: spec.mood, t: spec.t !== undefined ? spec.t : t, shadow: false,
    });
  }

  // ---- props -----------------------------------------------------------------------------------------
  // Each type: { wall, w, h, d, draw(ctx, p, K), anim(ctx, p, K, t) }. p has w, h, d filled in.
  function seeded(K, p, salt) { return SR.rng.create(SR.util.hash(K.id, p.type, p.x, p.y, salt || 0)); }
  function txt(key) { return key && SR.text && SR.text.has && SR.text.has(key) ? SR.text(key) : ''; }

  var PROPS = {
    counter: { w: 400, h: 100, d: 60, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, p.h - 10, p.d, p.color || '@counter');
      box(ctx, K, p.x - 8, p.y - p.h + 10, p.w + 16, 12, p.d + 10, p.alt || 'kit.counterTop');
      ctx.save(); ctx.globalAlpha *= 0.5;
      for (var x = p.x + 80; x < p.x + p.w - 20; x += 80) line(ctx, [x, p.y - p.h + 24, x, p.y - 6], DL);
      ctx.restore();
    } },
    bar: { w: 480, h: 110, d: 60, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, p.h - 12, p.d, p.color || 'kit.bar');
      box(ctx, K, p.x - 10, p.y - p.h + 12, p.w + 20, 14, p.d + 12, p.alt || 'kit.woodDark');
      line(ctx, [p.x, p.y - 22, p.x + p.w, p.y - 22], 5, C(K, 'kit.brass'));
    } },
    stool: { w: 44, h: 64, d: 0, draw: function (ctx, p, K) {
      var cx = p.x + p.w / 2;
      line(ctx, [cx, p.y - p.h + 6, cx, p.y], 5, C(K, 'kit.metalDark'));
      ellipse(ctx, cx, p.y - 2, p.w * 0.4, 5, C(K, 'kit.metalDark'), DL);
      ellipse(ctx, cx, p.y - p.h + 4, p.w / 2, 9, C(K, p.color || 'kit.red'));
    } },
    table: { w: 160, h: 80, d: 90, draw: function (ctx, p, K) {
      var c = p.color || 'kit.wood';
      line(ctx, [p.x + 14, p.y - p.h + 8, p.x + 14, p.y], 6, C(K, 'kit.woodDark'));
      line(ctx, [p.x + p.w - 14, p.y - p.h + 8, p.x + p.w - 14, p.y], 6, C(K, 'kit.woodDark'));
      box(ctx, K, p.x, p.y - p.h + 12, p.w, 12, p.d, c);
    } },
    booth: { w: 200, h: 130, d: 70, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y - 40, p.w, p.h - 40, 20, p.color || 'kit.red');
      box(ctx, K, p.x, p.y, p.w, 44, p.d, p.color || 'kit.red');
    } },
    shelf: { w: 140, h: 190, d: 40, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, p.h, p.d, p.color || 'kit.wood');
      var rng = seeded(K, p), cols = ['kit.red', 'kit.poster', 'kit.fabric', 'kit.plant', 'kit.paper', 'kit.slushA'];
      for (var s = 1; s <= 4; s++) {
        var sy = p.y - p.h + s * (p.h / 4.4);
        rect(ctx, p.x + 6, sy, p.w - 12, 5, SR.art.draw.tone(C(K, p.color || 'kit.wood'), -1), DL);
        for (var bx = p.x + 10; bx < p.x + p.w - 20;) {
          var bw = rng.int(10, 18), bh = rng.int(14, 26);
          rect(ctx, bx, sy - bh, bw, bh, C(K, cols[rng.int(0, cols.length - 1)]), DL);
          bx += bw + rng.int(2, 6);
        }
      }
    } },
    cooler: { w: 110, h: 200, d: 50, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, p.h, p.d, p.color || 'kit.metal');
      rect(ctx, p.x + 10, p.y - p.h + 14, p.w - 20, p.h - 40, C(K, 'kit.fridge'), DL);
      var rng = seeded(K, p), cols = ['kit.slushA', 'kit.slushB', 'kit.plant', 'kit.beer', 'kit.red'];
      for (var s = 0; s < 4; s++) {
        var sy = p.y - p.h + 20 + s * ((p.h - 50) / 4) + 30;
        line(ctx, [p.x + 12, sy, p.x + p.w - 12, sy], DL);
        for (var bx = p.x + 16; bx < p.x + p.w - 20; bx += 14) rect(ctx, bx, sy - 22, 9, 22, C(K, cols[rng.int(0, cols.length - 1)]), 1);
      }
    }, anim: function (ctx, p, K, t) {
      // the flickering fridge light (ART_AUDIO §9 Five-O)
      var f = Math.sin(t * 23) > 0.93 ? 0.35 : 0.12;
      ctx.save(); ctx.globalAlpha *= f; ctx.globalCompositeOperation = 'lighter';
      rect(ctx, p.x + 10, p.y - p.h + 14, p.w - 20, p.h - 40, C(K, 'kit.fridge'), 0);
      ctx.restore();
    } },
    register: { w: 70, h: 50, d: 40, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, p.h * 0.55, p.d, p.color || 'kit.metalDark');
      poly(ctx, [p.x + 10, p.y - p.h * 0.55, p.x + p.w - 10, p.y - p.h * 0.55, p.x + p.w - 16, p.y - p.h, p.x + 16, p.y - p.h], C(K, 'kit.screen'), DL);
      rect(ctx, p.x + 22, p.y - p.h + 6, p.w - 44, 8, C(K, 'kit.screenGlow'), 1);
    } },
    slot: { w: 80, h: 170, d: 50, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, p.h, p.d, p.color || '@accent');
      rect(ctx, p.x + 10, p.y - p.h + 40, p.w - 20, 46, C(K, 'kit.paper'), DL);
      circle(ctx, p.x + p.w / 2, p.y - p.h + 18, 10, C(K, 'kit.bulb'), DL);
      line(ctx, [p.x + p.w + 4, p.y - p.h + 110, p.x + p.w + 4, p.y - p.h + 64], 4);
      circle(ctx, p.x + p.w + 4, p.y - p.h + 62, 6, C(K, 'kit.red'), DL);
    }, anim: function (ctx, p, K, t) {
      var cols = ['kit.red', 'kit.gold', 'kit.plant', 'kit.slushB'];
      var rw = (p.w - 20) / 3;
      ctx.save(); ctx.beginPath(); ctx.rect(p.x + 10, p.y - p.h + 40, p.w - 20, 46); ctx.clip();
      for (var r = 0; r < 3; r++) {
        var off = ((t * (60 + r * 17)) % 30);
        for (var k = -1; k < 3; k++) circle(ctx, p.x + 10 + rw * (r + 0.5), p.y - p.h + 48 + k * 30 + off, 7, C(K, cols[(k + r + 8) % 4]), 1);
      }
      ctx.restore();
    } },
    cardtable: { w: 240, h: 70, d: 110, draw: function (ctx, p, K) {
      var cx = p.x + p.w / 2;
      box(ctx, K, cx - 20, p.y, 40, p.h - 16, 20, 'kit.woodDark');
      var b = back(K, cx, p.y - p.h, p.d);
      ellipse(ctx, cx, (p.y - p.h + b[1]) / 2 + 4, p.w / 2 + 10, Math.max(16, (p.y - p.h - b[1]) / 2 + 16), C(K, 'kit.woodDark'));
      ellipse(ctx, cx, (p.y - p.h + b[1]) / 2 + 2, p.w / 2, Math.max(12, (p.y - p.h - b[1]) / 2 + 10), C(K, p.color || 'kit.felt'), DL);
    } },
    roulette: { w: 260, h: 80, d: 120, draw: function (ctx, p, K) {
      PROPS.cardtable.draw(ctx, p, K);
      var b = back(K, p.x + p.w * 0.3, p.y - p.h, p.d);
      ellipse(ctx, p.x + p.w * 0.3, (p.y - p.h + b[1]) / 2 + 2, 38, 14, C(K, 'kit.woodDark'));
      ellipse(ctx, p.x + p.w * 0.3, (p.y - p.h + b[1]) / 2 + 2, 28, 10, C(K, 'kit.red'), DL);
      for (var i = 0; i < 6; i++) rect(ctx, p.x + p.w * 0.52 + i * 18, (p.y - p.h + b[1]) / 2 - 10, 14, 20, C(K, i % 2 ? 'kit.red' : 'kit.screen'), 1);
    }, anim: function (ctx, p, K, t) {
      var b = back(K, p.x + p.w * 0.3, p.y - p.h, p.d);
      var cy = (p.y - p.h + b[1]) / 2 + 2, cx = p.x + p.w * 0.3;
      var a = t * 5;
      circle(ctx, cx + Math.cos(a) * 20, cy + Math.sin(a) * 7, 3, C(K, 'kit.paper'), 1);
    } },
    taps: { w: 90, h: 50, d: 0, draw: function (ctx, p, K) {
      for (var i = 0; i < 3; i++) {
        var x = p.x + 12 + i * 30;
        line(ctx, [x, p.y, x, p.y - p.h + 10], 5, C(K, 'kit.tap'));
        rect(ctx, x - 5, p.y - p.h, 10, 16, C(K, i === 1 ? 'kit.red' : 'kit.woodDark'), DL);
      }
    } },
    dartboard: { wall: true, w: 90, h: 90, draw: function (ctx, p, K) {
      var cx = p.x + p.w / 2, cy = p.y + p.h / 2, r = p.w / 2;
      circle(ctx, cx, cy, r + 6, C(K, 'kit.woodDark'));
      circle(ctx, cx, cy, r, C(K, 'kit.dartA'));
      for (var i = 0; i < 20; i++) {
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r * 0.92, i * Math.PI / 10, (i + 1) * Math.PI / 10); ctx.closePath();
        ctx.fillStyle = C(K, i % 2 ? 'kit.dartB' : 'kit.dartA'); ctx.fill();
      }
      circle(ctx, cx, cy, r * 0.62, null, 4); ctx.strokeStyle = C(K, 'kit.dartC'); ctx.lineWidth = 5; ctx.stroke();
      circle(ctx, cx, cy, r * 0.12, C(K, 'kit.dartD'), DL);
      circle(ctx, cx, cy, r * 0.05, C(K, 'kit.dartC'), 0);
    } },
    ringrope: { w: 520, h: 120, d: 200, draw: function (ctx, p, K) {
      var b0 = back(K, p.x, p.y, p.d), b1 = back(K, p.x + p.w, p.y, p.d);
      poly(ctx, [p.x, p.y, p.x + p.w, p.y, b1[0], b1[1], b0[0], b0[1]], C(K, p.color || 'kit.linen'), LW);
      [[p.x, p.y], [p.x + p.w, p.y], b0, b1].forEach(function (q, i) {
        var s = i < 2 ? 1 : FOCAL / (FOCAL + p.d);
        rect(ctx, q[0] - 7 * s, q[1] - p.h * s, 14 * s, p.h * s, C(K, 'kit.metalDark'), DL);
      });
      for (var k = 1; k <= 3; k++) {
        var hh = p.h * k / 3.4;
        line(ctx, [p.x, p.y - hh, p.x + p.w, p.y - hh], 4, C(K, 'kit.rope'));
        line(ctx, [p.x, p.y - hh, b0[0], b0[1] - hh * FOCAL / (FOCAL + p.d)], 3, C(K, 'kit.rope'));
        line(ctx, [p.x + p.w, p.y - hh, b1[0], b1[1] - hh * FOCAL / (FOCAL + p.d)], 3, C(K, 'kit.rope'));
      }
    } },
    bed: { w: 260, h: 70, d: 120, draw: function (ctx, p, K) {
      box(ctx, K, p.x - 10, p.y - 20, 22, 120, p.d, 'kit.woodDark');
      box(ctx, K, p.x, p.y, p.w, 30, p.d, 'kit.woodDark');
      box(ctx, K, p.x + 6, p.y - 30, p.w - 12, 24, p.d - 10, 'kit.linen');
      box(ctx, K, p.x + 70, p.y - 32, p.w - 70, 20, p.d - 6, p.color || 'kit.blanket');
      ellipse(ctx, p.x + 38, p.y - 60, 28, 12, C(K, 'kit.linen'), DL);
    } },
    pod: { w: 260, h: 90, d: 120, draw: function (ctx, p, K) {
      ellipse(ctx, p.x + p.w / 2, p.y - 40, p.w / 2, 46, C(K, p.color || 'kit.metal'));
      ellipse(ctx, p.x + p.w / 2, p.y - 52, p.w / 2 - 30, 22, C(K, 'kit.glass'), DL);
      circle(ctx, p.x + p.w - 30, p.y - 30, 5, C(K, 'kit.plant'), 1);
    } },
    sofa: { w: 240, h: 90, d: 80, draw: function (ctx, p, K) {
      var c = p.color || 'kit.fabric';
      box(ctx, K, p.x, p.y - 40, p.w, 70, 24, c);
      box(ctx, K, p.x, p.y, p.w, 42, p.d, c);
      box(ctx, K, p.x - 14, p.y, 26, 64, p.d, c);
      box(ctx, K, p.x + p.w - 12, p.y, 26, 64, p.d, c);
      for (var i = 1; i < 3; i++) line(ctx, [p.x + p.w * i / 3, p.y - 42, p.x + p.w * i / 3, p.y - 6], DL);
    } },
    tv: { w: 170, h: 150, d: 40, draw: function (ctx, p, K) {
      box(ctx, K, p.x + 20, p.y, p.w - 40, 50, p.d, 'kit.woodDark');
      rect(ctx, p.x, p.y - p.h, p.w, p.h - 60, C(K, 'kit.screen'), LW);
      rect(ctx, p.x + 8, p.y - p.h + 8, p.w - 16, p.h - 76, C(K, 'kit.glassDark'), DL);
    }, anim: function (ctx, p, K, t) {
      var ph = Math.floor(t * 2) % 4, cols = ['kit.screenGlow', 'kit.slushA', 'kit.plant', 'kit.poster'];
      ctx.save(); ctx.globalAlpha *= 0.55;
      rect(ctx, p.x + 8, p.y - p.h + 8, p.w - 16, p.h - 76, C(K, cols[ph]), 0);
      ctx.restore();
    } },
    skydish: { w: 90, h: 90, d: 0, draw: function (ctx, p, K) {
      line(ctx, [p.x + 45, p.y, p.x + 45, p.y - 40], 5, C(K, 'kit.metalDark'));
      ctx.beginPath(); ctx.ellipse(p.x + 45, p.y - 60, 44, 30, -0.5, 0, Math.PI); ctx.closePath(); fillStroke(ctx, C(K, 'kit.metal'), LW);
      line(ctx, [p.x + 45, p.y - 60, p.x + 70, p.y - 88], 2.5);
      circle(ctx, p.x + 70, p.y - 88, 5, C(K, 'kit.red'), DL);
    } },
    computer: { w: 180, h: 150, d: 70, draw: function (ctx, p, K) {
      PROPS.desk.draw(ctx, { x: p.x, y: p.y, w: p.w, h: 80, d: p.d, color: p.color }, K);
      rect(ctx, p.x + 50, p.y - p.h, 80, 58, C(K, 'kit.screen'), LW);
      rect(ctx, p.x + 56, p.y - p.h + 6, 68, 44, C(K, 'kit.screenGlow'), DL);
      rect(ctx, p.x + 84, p.y - p.h + 58, 12, 10, C(K, 'kit.screen'), DL);
      rect(ctx, p.x + 46, p.y - 88, 88, 8, C(K, 'kit.paper'), DL);
    }, anim: function (ctx, p, K, t) {
      ctx.save(); ctx.beginPath(); ctx.rect(p.x + 56, p.y - p.h + 6, 68, 44); ctx.clip();
      var pts = [];
      for (var i = 0; i <= 8; i++) pts.push(p.x + 58 + i * 8, p.y - p.h + 30 - Math.sin(i * 0.9 + t * 2) * 10);
      line(ctx, pts, 2, C(K, 'kit.plant'));
      ctx.restore();
    } },
    desk: { w: 200, h: 80, d: 80, draw: function (ctx, p, K) {
      var c = p.color || 'kit.wood';
      box(ctx, K, p.x, p.y, 50, p.h - 10, p.d, c);
      box(ctx, K, p.x + p.w - 50, p.y, 50, p.h - 10, p.d, c);
      box(ctx, K, p.x - 6, p.y - p.h + 12, p.w + 12, 12, p.d + 6, c);
      for (var i = 1; i < 3; i++) line(ctx, [p.x + 8, p.y - p.h + 12 + i * 20, p.x + 42, p.y - p.h + 12 + i * 20], DL);
    } },
    lectern: { w: 90, h: 130, d: 40, draw: function (ctx, p, K) {
      box(ctx, K, p.x + 10, p.y, p.w - 20, p.h - 30, p.d, p.color || 'kit.wood');
      poly(ctx, [p.x, p.y - p.h + 30, p.x + p.w, p.y - p.h + 30, p.x + p.w - 8, p.y - p.h, p.x + 8, p.y - p.h + 8], SR.art.draw.tone(C(K, p.color || 'kit.wood'), 1));
    } },
    chalkboard: { wall: true, w: 260, h: 140, draw: function (ctx, p, K, t, state) {
      rect(ctx, p.x - 8, p.y - 8, p.w + 16, p.h + 16, C(K, 'kit.wood'));
      rect(ctx, p.x, p.y, p.w, p.h, C(K, p.color || 'kit.board'), DL);
      rect(ctx, p.x, p.y + p.h + 8, p.w, 8, C(K, 'kit.wood'), DL);
      // a new absurd formula every day (ART_AUDIO §9 U of S)
      var day = state && state.clock ? state.clock.day : 1;
      var rng = SR.rng.create(SR.util.hash('formula', day));
      var sym = ['∫', 'π', '√', 'Δ', '∞', 'Σ', 'x²', '≈', 'θ', 'λ', '∂', '½'];
      ctx.fillStyle = C(K, 'kit.chalk');
      ctx.font = SR.art.draw.font(28, 400, 'news');
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (var row = 0; row < 2; row++) {
        var s = '';
        for (var k = 0; k < 5; k++) s += sym[rng.int(0, sym.length - 1)] + (k === 2 ? ' = ' : ' ');
        ctx.fillText(s, p.x + 20, p.y + 36 + row * 50);
      }
      line(ctx, [p.x + 20, p.y + 110, p.x + p.w - 30, p.y + 104], 2, C(K, 'kit.chalk'));
    } },
    lockers: { w: 200, h: 190, d: 40, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, p.h, p.d, p.color || 'kit.metal');
      var n = Math.max(2, Math.round(p.w / 50));
      for (var i = 0; i < n; i++) {
        var x = p.x + i * p.w / n;
        rect(ctx, x + 4, p.y - p.h + 6, p.w / n - 8, p.h - 12, SR.art.draw.tone(C(K, p.color || 'kit.metal'), 0.4), DL);
        for (var v = 0; v < 3; v++) line(ctx, [x + 12, p.y - p.h + 20 + v * 8, x + p.w / n - 12, p.y - p.h + 20 + v * 8], 1.5);
      }
    } },
    barbell: { w: 200, h: 110, d: 60, draw: function (ctx, p, K) {
      line(ctx, [p.x + 20, p.y, p.x + 20, p.y - p.h], 6, C(K, 'kit.metalDark'));
      line(ctx, [p.x + p.w - 20, p.y, p.x + p.w - 20, p.y - p.h], 6, C(K, 'kit.metalDark'));
      line(ctx, [p.x - 10, p.y - p.h + 20, p.x + p.w + 10, p.y - p.h + 20], 5, C(K, 'kit.chrome'));
      rect(ctx, p.x - 4, p.y - p.h - 6, 14, 52, C(K, 'kit.screen'), DL);
      rect(ctx, p.x + p.w - 10, p.y - p.h - 6, 14, 52, C(K, 'kit.screen'), DL);
    } },
    treadmill: { w: 200, h: 130, d: 70, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, 20, p.d, 'kit.screen');
      line(ctx, [p.x + p.w - 20, p.y - 20, p.x + p.w - 10, p.y - p.h + 20], 6, C(K, 'kit.metalDark'));
      rect(ctx, p.x + p.w - 40, p.y - p.h, 50, 26, C(K, p.color || 'kit.metal'), LW);
      rect(ctx, p.x + p.w - 32, p.y - p.h + 6, 24, 12, C(K, 'kit.screenGlow'), 1);
    } },
    plant: { w: 70, h: 120, d: 0, draw: function (ctx, p, K) {
      var cx = p.x + p.w / 2;
      poly(ctx, [p.x + 10, p.y - 44, p.x + p.w - 10, p.y - 44, p.x + p.w - 18, p.y, p.x + 18, p.y], C(K, p.alt || 'kit.pot'));
      var rng = seeded(K, p);
      for (var i = 0; i < 7; i++) {
        var a = -Math.PI / 2 + (i - 3) * 0.42;
        var r = p.h * rng.float(0.45, 0.62);
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * r * 0.45, p.y - 44 + Math.sin(a) * r * 0.62, 12, 26, a + Math.PI / 2, 0, Math.PI * 2);
        fillStroke(ctx, C(K, i % 2 ? 'kit.plant' : 'kit.plantHi'), DL);
      }
    } },
    lamp: { w: 60, h: 190, d: 0, draw: function (ctx, p, K) {
      var cx = p.x + p.w / 2;
      ellipse(ctx, cx, p.y - 3, 22, 6, C(K, 'kit.metalDark'), DL);
      line(ctx, [cx, p.y - 4, cx, p.y - p.h + 40], 4, C(K, 'kit.metalDark'));
      poly(ctx, [cx - 30, p.y - p.h + 44, cx + 30, p.y - p.h + 44, cx + 18, p.y - p.h, cx - 18, p.y - p.h], C(K, p.color || 'kit.lamp'));
    }, anim: function (ctx, p, K) {
      var cx = p.x + p.w / 2, cy = p.y - p.h + 44;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120);
      g.addColorStop(0, SR.art.draw.alpha(C(K, 'kit.lamp'), 0.25)); g.addColorStop(1, SR.art.draw.alpha(C(K, 'kit.lamp'), 0));
      ctx.fillStyle = g; ctx.fillRect(cx - 120, cy - 120, 240, 240);
      ctx.restore();
    } },
    poster: { wall: true, w: 90, h: 120, draw: function (ctx, p, K) {
      rect(ctx, p.x, p.y, p.w, p.h, C(K, p.color || 'kit.poster'));
      var s = txt(p.text);
      if (s) {
        SR.art.draw.text(ctx, s, p.x + p.w / 2, p.y + p.h - 14, { size: 13, weight: 900, role: 'display', align: 'center', color: 'ink', maxWidth: p.w - 10 });
      }
      var st = SR.art.draw.color('ink');
      ctx.beginPath(); var cx = p.x + p.w / 2, cy = p.y + p.h * 0.4, R = p.w * 0.28;
      for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.45 : R; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      ctx.closePath(); fillStroke(ctx, C(K, p.alt || 'kit.paper'), DL); ctx.strokeStyle = st;
    } },
    rug: { w: 300, h: 0, d: 120, draw: function (ctx, p, K) {
      var b0 = back(K, p.x, p.y, p.d), b1 = back(K, p.x + p.w, p.y, p.d);
      poly(ctx, [p.x, p.y, p.x + p.w, p.y, b1[0], b1[1], b0[0], b0[1]], C(K, p.color || 'kit.rug'), DL);
      var i0 = back(K, p.x + 16, p.y - 8, 12), i1 = back(K, p.x + p.w - 16, p.y - 8, 12), i2 = back(K, p.x + p.w - 16, p.y, p.d - 14), i3 = back(K, p.x + 16, p.y, p.d - 14);
      path(ctx, [i0[0], i0[1], i1[0], i1[1], i2[0], i2[1], i3[0], i3[1]]);
      ctx.lineWidth = 3; ctx.strokeStyle = C(K, p.alt || 'kit.rugTrim'); ctx.stroke();
    } },
    vault: { wall: true, w: 220, h: 220, draw: function (ctx, p, K) {
      var cx = p.x + p.w / 2, cy = p.y + p.h / 2, r = p.w / 2;
      rect(ctx, p.x - 14, p.y - 14, p.w + 28, p.h + 28, C(K, 'kit.metalDark'));
      circle(ctx, cx, cy, r, C(K, p.color || 'kit.vault'));
      circle(ctx, cx, cy, r * 0.8, SR.art.draw.tone(C(K, p.color || 'kit.vault'), 1), DL);
      for (var i = 0; i < 6; i++) { var a = i * Math.PI / 3; line(ctx, [cx, cy, cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55], 6, C(K, 'kit.chrome')); }
      circle(ctx, cx, cy, r * 0.16, C(K, 'kit.chrome'), DL);
    } },
    teller: { w: 320, h: 200, d: 60, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, 100, p.d, p.color || '@counter');
      rect(ctx, p.x, p.y - p.h, p.w, p.h - 100, SR.art.draw.alpha(C(K, 'kit.glass'), 0.35), LW);
      rect(ctx, p.x + p.w / 2 - 50, p.y - 150, 100, 50, SR.art.draw.alpha(C(K, 'kit.paper'), 0.4), DL);
      rect(ctx, p.x - 4, p.y - p.h - 14, p.w + 8, 16, C(K, p.alt || '@trim'), LW);
    } },
    watercooler: { w: 60, h: 170, d: 0, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, 100, 30, 'kit.metal');
      rect(ctx, p.x + 8, p.y - p.h, p.w - 16, 64, SR.art.draw.alpha(C(K, 'kit.water'), 0.8), LW);
      rect(ctx, p.x + 22, p.y - 68, 16, 8, C(K, 'kit.red'), 1);
    }, anim: function (ctx, p, K, t) {
      // the glug: a bubble rises every 2.5 s
      var ph = (t % 2.5) / 2.5;
      if (ph < 0.6) circle(ctx, p.x + p.w / 2 + Math.sin(ph * 20) * 4, p.y - 110 - ph * 90, 4 + ph * 3, SR.art.draw.alpha(C(K, 'kit.paper'), 0.9), 1);
    } },
    filing: { w: 80, h: 150, d: 50, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, p.h, p.d, p.color || 'kit.metal');
      for (var i = 0; i < 4; i++) {
        var y = p.y - p.h + 8 + i * (p.h - 12) / 4;
        rect(ctx, p.x + 6, y, p.w - 12, (p.h - 12) / 4 - 6, SR.art.draw.tone(C(K, p.color || 'kit.metal'), 0.4), DL);
        rect(ctx, p.x + p.w / 2 - 10, y + 10, 20, 5, C(K, 'kit.metalDark'), 1);
      }
    } },
    elevator: { wall: true, w: 160, h: 250, draw: function (ctx, p, K) {
      rect(ctx, p.x - 12, p.y - 12, p.w + 24, p.h + 12, C(K, p.alt || 'kit.metalDark'));
      rect(ctx, p.x, p.y, p.w / 2, p.h, C(K, p.color || 'kit.chrome'), DL);
      rect(ctx, p.x + p.w / 2, p.y, p.w / 2, p.h, C(K, p.color || 'kit.chrome'), DL);
      rect(ctx, p.x + p.w / 2 - 20, p.y - 40, 40, 20, C(K, 'kit.screen'), DL);
      circle(ctx, p.x + p.w + 30, p.y + p.h / 2, 8, C(K, 'kit.metal'), DL);
    }, anim: function (ctx, p, K, t) {
      var on = Math.floor(t * 1.5) % 2 === 0;
      circle(ctx, p.x + p.w + 30, p.y + p.h / 2, 5, C(K, on ? 'kit.bulb' : 'kit.metal'), 0);
      rect(ctx, p.x + p.w / 2 - 14, p.y - 36, 28, 12, C(K, on ? 'kit.red' : 'kit.screen'), 0);
    } },
    departures: { wall: true, w: 320, h: 150, draw: function (ctx, p, K) {
      rect(ctx, p.x, p.y, p.w, p.h, C(K, 'kit.screen'));
      for (var r = 0; r < 4; r++) for (var c = 0; c < 12; c++) rect(ctx, p.x + 12 + c * 25, p.y + 14 + r * 32, 21, 24, C(K, 'kit.cabinet'), 1);
    }, anim: function (ctx, p, K, t) {
      // letters flip: each cell shows a bar that changes on a stagger
      ctx.fillStyle = C(K, 'kit.bulb');
      for (var r = 0; r < 4; r++) for (var c = 0; c < 12; c++) {
        var ph = Math.floor(t * 3 + r * 0.7 + c * 0.13) % 5;
        var h = 4 + ph * 3;
        ctx.fillRect(p.x + 16 + c * 25, p.y + 26 + r * 32 - h / 2, 13, h);
      }
    } },
    ticket: { w: 220, h: 220, d: 50, draw: function (ctx, p, K) { PROPS.teller.draw(ctx, p, K); } },
    bench: { w: 220, h: 60, d: 50, draw: function (ctx, p, K) {
      line(ctx, [p.x + 16, p.y, p.x + 16, p.y - 40], 6, C(K, 'kit.metalDark'));
      line(ctx, [p.x + p.w - 16, p.y, p.x + p.w - 16, p.y - 40], 6, C(K, 'kit.metalDark'));
      box(ctx, K, p.x, p.y - 36, p.w, 12, p.d, p.color || 'kit.wood');
      box(ctx, K, p.x, p.y - 70, p.w, 20, 8, p.color || 'kit.wood');
    } },
    ballot: { w: 110, h: 110, d: 60, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, p.h, p.d, p.color || 'kit.ballot');
      rect(ctx, p.x + 25, p.y - p.h - 3, p.w - 50, 6, C(K, 'kit.screen'), DL);
      rect(ctx, p.x + p.w / 2 - 15, p.y - p.h + 30, 30, 30, C(K, 'kit.flagC'), DL);
    } },
    podium: { w: 140, h: 120, d: 60, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, p.h, p.d, p.color || 'kit.wood');
      circle(ctx, p.x + p.w / 2, p.y - p.h / 2, 22, C(K, p.alt || 'kit.gold'), DL);
      line(ctx, [p.x + p.w / 2, p.y - p.h, p.x + p.w / 2 + 10, p.y - p.h - 40], 3);
      circle(ctx, p.x + p.w / 2 + 12, p.y - p.h - 44, 6, C(K, 'kit.screen'), DL);
    } },
    flags: { w: 80, h: 260, d: 0, draw: function (ctx, p, K) {
      ellipse(ctx, p.x + 12, p.y - 3, 18, 5, C(K, 'kit.gold'), DL);
      line(ctx, [p.x + 12, p.y, p.x + 12, p.y - p.h], 5, C(K, 'kit.brass'));
      circle(ctx, p.x + 12, p.y - p.h, 6, C(K, 'kit.gold'), DL);
    }, anim: function (ctx, p, K, t) {
      var cols = [p.color || 'kit.flagA', 'kit.flagB', p.alt || 'kit.flagC'];
      var top = p.y - p.h + 10;
      for (var s = 0; s < 3; s++) {
        var pts = [];
        for (var i = 0; i <= 6; i++) pts.push(p.x + 14 + i * 12, top + s * 22 + Math.sin(t * 3 + i * 0.8) * 4);
        for (var j = 6; j >= 0; j--) pts.push(p.x + 14 + j * 12, top + (s + 1) * 22 + Math.sin(t * 3 + j * 0.8) * 4);
        poly(ctx, pts, C(K, cols[s]), s === 1 ? 0 : 0);
      }
      var o = [];
      for (var k = 0; k <= 6; k++) o.push(p.x + 14 + k * 12, top + Math.sin(t * 3 + k * 0.8) * 4);
      for (var m = 6; m >= 0; m--) o.push(p.x + 14 + m * 12, top + 66 + Math.sin(t * 3 + m * 0.8) * 4);
      path(ctx, o); ctx.lineWidth = DL; ctx.strokeStyle = SR.art.draw.color('inkLine'); ctx.stroke();
    } },
    menuBoard: { wall: true, w: 320, h: 150, draw: function (ctx, p, K) {
      rect(ctx, p.x - 8, p.y - 8, p.w + 16, p.h + 16, C(K, p.alt || '@trim'));
      rect(ctx, p.x, p.y, p.w, p.h, C(K, p.color || 'kit.screen'), DL);
      var items = p.items || [];
      var n = Math.max(1, items.length), cw = p.w / n;
      for (var i = 0; i < items.length; i++) {
        var cx = p.x + cw * (i + 0.5);
        var ic = ICON_ALIAS[items[i]] || items[i];
        if (SR.art.icon && SR.reg.icon[ic]) SR.art.icon(ctx, ic, cx - 30, p.y + 20, 60);
        else circle(ctx, cx, p.y + 50, 24, C(K, 'kit.poster'), DL);
        rect(ctx, cx - 28, p.y + p.h - 34, 56, 10, C(K, 'kit.bulb'), 0);
      }
    } },
    fryer: { w: 120, h: 110, d: 50, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, p.h, p.d, p.color || 'kit.metal');
      var b = back(K, p.x + 10, p.y - p.h, 10), b2 = back(K, p.x + p.w - 10, p.y - p.h, p.d - 10);
      poly(ctx, [p.x + 10, p.y - p.h - 2, p.x + p.w - 10, p.y - p.h - 2, b2[0], b2[1], b[0], b2[1]], C(K, 'kit.beer'), DL);
      line(ctx, [p.x + 20, p.y - p.h - 30, p.x + 40, p.y - p.h], 3);
      rect(ctx, p.x + 10, p.y - p.h - 40, 34, 16, C(K, 'kit.metalDark'), DL);
    }, anim: function (ctx, p, K, t) {
      // bubbling oil and rising steam (ART_AUDIO §9 McSticks)
      for (var i = 0; i < 4; i++) {
        var ph = (t * 0.7 + i / 4) % 1;
        ctx.save(); ctx.globalAlpha *= (1 - ph) * 0.8;
        circle(ctx, p.x + 30 + i * 20 + Math.sin(t * 2 + i) * 6, p.y - p.h - 10 - ph * 90, 8 + ph * 12, C(K, 'kit.steam'), 0);
        ctx.restore();
      }
      for (var j = 0; j < 3; j++) circle(ctx, p.x + 30 + j * 26, p.y - p.h - 4 + Math.sin(t * 9 + j * 2) * 2, 3, C(K, 'kit.foam'), 1);
    } },
    slushee: { w: 110, h: 150, d: 50, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, 60, p.d, p.color || 'kit.metal');
      rect(ctx, p.x + 6, p.y - p.h, 46, 90, SR.art.draw.alpha(C(K, 'kit.slushA'), 0.9), LW);
      rect(ctx, p.x + 58, p.y - p.h, 46, 90, SR.art.draw.alpha(C(K, 'kit.slushB'), 0.9), LW);
    }, anim: function (ctx, p, K, t) {
      // the swirling slushee (ART_AUDIO §9 Five-O)
      for (var k = 0; k < 2; k++) {
        var cx = p.x + 29 + k * 52, cy = p.y - p.h + 45;
        ctx.beginPath();
        for (var i = 0; i < 20; i++) { var a = t * 3 + i * 0.5; ctx.lineTo(cx + Math.cos(a) * (6 + i), cy + Math.sin(a) * (4 + i * 0.6)); }
        ctx.lineWidth = 2; ctx.strokeStyle = C(K, 'kit.paper'); ctx.stroke();
      }
    } },
    fan: { wall: true, w: 200, h: 60, draw: function (ctx, p, K) {
      line(ctx, [p.x + p.w / 2, 0, p.x + p.w / 2, p.y + 20], 4, C(K, 'kit.metalDark'));
      ellipse(ctx, p.x + p.w / 2, p.y + 24, 14, 8, C(K, 'kit.metalDark'), DL);
    }, anim: function (ctx, p, K, t) {
      var cx = p.x + p.w / 2, cy = p.y + 24;
      for (var i = 0; i < 3; i++) {
        var a = t * 6 + i * Math.PI * 2 / 3;
        var ex = cx + Math.cos(a) * p.w / 2, ey = cy + Math.sin(a) * 10;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey - 4); ctx.lineTo(ex, ey + 4); ctx.closePath();
        fillStroke(ctx, C(K, 'kit.wood'), DL);
      }
    } },
    guncase: { w: 220, h: 110, d: 60, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, p.h - 40, p.d, p.color || 'kit.woodDark');
      box(ctx, K, p.x, p.y - p.h + 40, p.w, 40, p.d, 'kit.glassDark', { top: 'kit.glass' });
      for (var i = 0; i < 3; i++) {
        var x = p.x + 30 + i * 60;
        poly(ctx, [x, p.y - p.h + 22, x + 40, p.y - p.h + 22, x + 40, p.y - p.h + 28, x + 16, p.y - p.h + 28, x + 12, p.y - p.h + 38, x + 6, p.y - p.h + 38, x + 8, p.y - p.h + 28, x, p.y - p.h + 28], C(K, 'kit.screen'), 1);
      }
    }, anim: function (ctx, p, K, t) {
      var ph = (t * 0.4) % 1;
      if (ph < 0.3) {
        var x = p.x + p.w * (ph / 0.3);
        ctx.save(); ctx.globalAlpha *= 0.6;
        poly(ctx, [x, p.y - p.h + 40, x + 14, p.y - p.h + 40, x + 30, p.y - p.h + 80, x + 16, p.y - p.h + 80], SR.art.draw.color('white'), 0);
        ctx.restore();
      }
    } },
    fish: { wall: true, w: 130, h: 60, draw: function (ctx, p, K) {
      rect(ctx, p.x, p.y, p.w, p.h, C(K, 'kit.woodDark'));
      poly(ctx, [p.x + 16, p.y + p.h / 2, p.x + 60, p.y + 12, p.x + 100, p.y + p.h / 2, p.x + 60, p.y + p.h - 12], C(K, 'kit.fish'), DL);
      poly(ctx, [p.x + 98, p.y + p.h / 2, p.x + 118, p.y + 14, p.x + 118, p.y + p.h - 14], C(K, 'kit.fish'), DL);
      circle(ctx, p.x + 32, p.y + p.h / 2 - 4, 3, C(K, 'kit.screen'), 0);
    } },
    spotlight: { wall: true, w: 60, h: 40, draw: function (ctx, p, K) {
      line(ctx, [p.x + 30, 0, p.x + 30, p.y], 3);
      poly(ctx, [p.x + 14, p.y, p.x + 46, p.y, p.x + 40, p.y + 30, p.x + 20, p.y + 30], C(K, 'kit.metalDark'), DL);
    }, anim: function (ctx, p, K, t) {
      var sway = Math.sin(t * 0.8 + p.x) * 30;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.2;
      poly(ctx, [p.x + 20, p.y + 30, p.x + 40, p.y + 30, p.x + 110 + sway, K.floorY + 200, p.x - 50 + sway, K.floorY + 200], C(K, 'kit.lamp'), 0);
      ctx.restore();
    } },
    displaybed: { w: 280, h: 90, d: 130, draw: function (ctx, p, K) {
      ellipse(ctx, p.x + p.w / 2, p.y - 6, p.w / 2 + 20, 24, C(K, 'kit.metalDark'));
    }, anim: function (ctx, p, K, t) {
      // the rotating display bed (ART_AUDIO §9 Fine Line): its width breathes as it turns
      var k = 0.75 + 0.25 * Math.cos(t * 0.8);
      var w = p.w * k, x = p.x + (p.w - w) / 2;
      PROPS.bed.draw(ctx, { x: x, y: p.y - 12, w: w, h: p.h, d: p.d * (1.2 - k * 0.4), color: p.color || 'kit.cushion' }, K);
    } },
    clock: { wall: true, w: 70, h: 70, draw: function (ctx, p, K) {
      var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      circle(ctx, cx, cy, p.w / 2, C(K, p.alt || 'kit.woodDark'));
      circle(ctx, cx, cy, p.w / 2 - 6, C(K, 'kit.paper'), DL);
      for (var i = 0; i < 12; i++) { var a = i * Math.PI / 6; line(ctx, [cx + Math.cos(a) * (p.w / 2 - 10), cy + Math.sin(a) * (p.w / 2 - 10), cx + Math.cos(a) * (p.w / 2 - 14), cy + Math.sin(a) * (p.w / 2 - 14)], 2); }
    }, anim: function (ctx, p, K, t, state) {
      var cx = p.x + p.w / 2, cy = p.y + p.h / 2, r = p.w / 2 - 10;
      var min = state && state.clock ? state.clock.min : 720;
      var ha = (min / 720) * Math.PI * 2 - Math.PI / 2, ma = ((min % 60) / 60) * Math.PI * 2 - Math.PI / 2;
      var sa = Math.floor(t) * Math.PI / 30 - Math.PI / 2; // the ticking second hand
      line(ctx, [cx, cy, cx + Math.cos(ha) * r * 0.55, cy + Math.sin(ha) * r * 0.55], 3.5);
      line(ctx, [cx, cy, cx + Math.cos(ma) * r * 0.85, cy + Math.sin(ma) * r * 0.85], 2.5);
      line(ctx, [cx, cy, cx + Math.cos(sa) * r * 0.9, cy + Math.sin(sa) * r * 0.9], 1.2, C(K, 'kit.red'));
    } },
    rateboard: { wall: true, w: 220, h: 120, draw: function (ctx, p, K, t, state) {
      rect(ctx, p.x, p.y, p.w, p.h, C(K, 'kit.screen'));
      var rate = state && state.money && typeof state.money.rate === 'number' ? state.money.rate : 2;
      ctx.fillStyle = C(K, 'kit.bulb');
      ctx.font = SR.art.draw.font(44, 900, 'display'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(SR.text.pct ? SR.text.pct(rate / 100, 2) : rate.toFixed(2), p.x + p.w / 2, p.y + p.h / 2 + 4);
    } },
    pendulum: { wall: true, w: 80, h: 220, draw: function (ctx, p, K) {
      rect(ctx, p.x, p.y, p.w, p.h, C(K, p.color || 'kit.woodDark'));
      circle(ctx, p.x + p.w / 2, p.y + 40, 28, C(K, 'kit.paper'), DL);
      rect(ctx, p.x + 10, p.y + 80, p.w - 20, p.h - 90, SR.art.draw.alpha(C(K, 'kit.glass'), 0.3), DL);
    }, anim: function (ctx, p, K, t) {
      var a = Math.sin(t * Math.PI) * 0.35, px = p.x + p.w / 2, py = p.y + 84;
      var ex = px + Math.sin(a) * 100, ey = py + Math.cos(a) * 100;
      line(ctx, [px, py, ex, ey], 2.5, C(K, 'kit.brass'));
      circle(ctx, ex, ey, 12, C(K, 'kit.gold'), DL);
    } },
    neon: { wall: true, w: 140, h: 140, draw: function (ctx, p, K) {
      // the neon beer mug (ART_AUDIO §9 Sticky's); lit in drawAnim
      ctx.save(); ctx.globalAlpha *= 0.35; neonMug(ctx, p, K, 1); ctx.restore();
    }, anim: function (ctx, p, K, t) {
      var on = !(Math.sin(t * 7.3) > 0.97);
      if (!on) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; neonMug(ctx, p, K, 1); ctx.restore();
    } },
    cabinet: { w: 90, h: 190, d: 60, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, p.h, p.d, p.color || 'kit.cabinet');
      rect(ctx, p.x + 10, p.y - p.h + 26, p.w - 20, 56, C(K, 'kit.screen'), DL);
      poly(ctx, [p.x, p.y - 90, p.x + p.w, p.y - 90, p.x + p.w + 8, p.y - 70, p.x - 8, p.y - 70], C(K, 'kit.metalDark'), DL);
      circle(ctx, p.x + 24, p.y - 80, 5, C(K, 'kit.red'), 1); circle(ctx, p.x + 44, p.y - 80, 5, C(K, 'kit.bulb'), 1);
    }, anim: function (ctx, p, K, t) {
      ctx.save(); ctx.globalAlpha *= 0.6 + 0.3 * Math.sin(t * 4);
      rect(ctx, p.x + 14, p.y - p.h + 30, p.w - 28, 48, C(K, 'kit.screenGlow'), 0);
      ctx.restore();
      rect(ctx, p.x + 18 + ((t * 30) % (p.w - 44)), p.y - p.h + 56, 8, 8, C(K, 'kit.bulb'), 0);
    } },
    fountain: { w: 220, h: 60, d: 90, draw: function (ctx, p, K) {
      var cx = p.x + p.w / 2;
      ellipse(ctx, cx, p.y - 20, p.w / 2, 30, C(K, p.color || 'kit.chrome'));
      ellipse(ctx, cx, p.y - 26, p.w / 2 - 14, 20, C(K, 'kit.water'), DL);
      line(ctx, [cx, p.y - 26, cx, p.y - 90], 8, C(K, p.color || 'kit.chrome'));
    }, anim: function (ctx, p, K, t) {
      var cx = p.x + p.w / 2;
      for (var i = 0; i < 6; i++) {
        var a = i / 6 * Math.PI * 2 + t * 0.5;
        var tx = cx + Math.cos(a) * (p.w / 2 - 30), ty = p.y - 26 + Math.sin(a) * 10;
        ctx.beginPath(); ctx.moveTo(cx, p.y - 92); ctx.quadraticCurveTo((cx + tx) / 2, p.y - 130, tx, ty);
        ctx.lineWidth = 3; ctx.strokeStyle = SR.art.draw.alpha(C(K, 'kit.water'), 0.8); ctx.stroke();
      }
    } },
    reels: { wall: true, w: 360, h: 110, draw: function (ctx, p, K) {
      rect(ctx, p.x, p.y, p.w, p.h, C(K, p.color || 'kit.gold'));
      for (var i = 0; i < 3; i++) rect(ctx, p.x + 16 + i * (p.w - 32) / 3, p.y + 12, (p.w - 32) / 3 - 10, p.h - 24, C(K, 'kit.paper'), DL);
    }, anim: function (ctx, p, K, t) {
      var cols = ['kit.red', 'kit.fabric', 'kit.plant', 'kit.gold'];
      var rw = (p.w - 32) / 3 - 10;
      for (var i = 0; i < 3; i++) {
        var x = p.x + 16 + i * (p.w - 32) / 3;
        ctx.save(); ctx.beginPath(); ctx.rect(x, p.y + 12, rw, p.h - 24); ctx.clip();
        var off = (t * (140 + i * 50)) % 40;
        for (var k = -1; k < 4; k++) circle(ctx, x + rw / 2, p.y + 12 + k * 40 + off, 12, C(K, cols[(k + i + 8) % 4]), 1);
        ctx.restore();
      }
    } },
    chandelier: { wall: true, w: 200, h: 90, draw: function (ctx, p, K) {
      line(ctx, [p.x + p.w / 2, 0, p.x + p.w / 2, p.y], 3);
      ellipse(ctx, p.x + p.w / 2, p.y + 20, p.w / 2, 20, C(K, 'kit.gold'));
      for (var i = 0; i < 7; i++) {
        var x = p.x + 16 + i * (p.w - 32) / 6;
        line(ctx, [x, p.y + 30, x, p.y + 60 + (i % 2) * 14], 1.5, C(K, 'kit.glass'));
        circle(ctx, x, p.y + 64 + (i % 2) * 14, 5, C(K, 'kit.glass'), 1);
      }
    }, anim: function (ctx, p, K, t) {
      var i = Math.floor(t * 4) % 7;
      var x = p.x + 16 + i * (p.w - 32) / 6, y = p.y + 64 + (i % 2) * 14;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      line(ctx, [x - 10, y, x + 10, y], 2, C(K, 'kit.bulb')); line(ctx, [x, y - 10, x, y + 10], 2, C(K, 'kit.bulb'));
      ctx.restore();
    } },
    window: { wall: true, w: 180, h: 140, draw: function (ctx, p, K, t, state) {
      windowStatic(ctx, K, p, state);
    }, anim: function (ctx, p, K, t, state) {
      sky(ctx, [p.x, p.y, p.w, p.h], state);
      windowPanes(ctx, K, p, true);
    } },
    balconydoor: { wall: true, w: 160, h: 290, draw: function (ctx, p, K, t, state) {
      windowStatic(ctx, K, { x: p.x, y: p.y, w: p.w, h: p.h - 10, panes: 2, frame: p.frame }, state);
    }, anim: function (ctx, p, K, t, state) {
      sky(ctx, [p.x, p.y, p.w, p.h - 10], state);
      line(ctx, [p.x, p.y + p.h * 0.7, p.x + p.w, p.y + p.h * 0.7], 4, C(K, 'kit.metalDark'));
      windowPanes(ctx, K, { x: p.x, y: p.y, w: p.w, h: p.h - 10, panes: 2, frame: p.frame }, true);
    } },
    door: { wall: true, w: 110, h: 230, draw: function (ctx, p, K) {
      rect(ctx, p.x - 10, p.y - 10, p.w + 20, p.h + 10, C(K, p.alt || '@trim'));
      rect(ctx, p.x, p.y, p.w, p.h, C(K, p.color || 'kit.wood'), DL);
      rect(ctx, p.x + 14, p.y + 16, p.w - 28, p.h / 2 - 30, SR.art.draw.tone(C(K, p.color || 'kit.wood'), 0.5), DL);
      circle(ctx, p.x + p.w - 18, p.y + p.h / 2 + 10, 6, C(K, 'kit.brass'), DL);
    } },
    answering: { w: 70, h: 30, d: 40, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, p.h, p.d, p.color || 'kit.screen');
      rect(ctx, p.x + 8, p.y - p.h + 8, 24, 10, C(K, 'kit.metal'), 1);
    }, anim: function (ctx, p, K, t, state) {
      // the answering machine blinks while there are unread messages (always in sheets)
      var unread = !state || !state.msgs || state.msgs.some(function (m) { return !m.read; });
      if (unread && Math.floor(t * 2) % 2 === 0) circle(ctx, p.x + p.w - 14, p.y - p.h + 12, 5, C(K, 'kit.red'), 1);
    } },
    heartmonitor: { w: 110, h: 170, d: 40, draw: function (ctx, p, K) {
      line(ctx, [p.x + p.w / 2, p.y, p.x + p.w / 2, p.y - p.h + 80], 5, C(K, 'kit.metalDark'));
      rect(ctx, p.x, p.y - p.h, p.w, 80, C(K, 'kit.screen'));
    }, anim: function (ctx, p, K, t) {
      ctx.save(); ctx.beginPath(); ctx.rect(p.x + 6, p.y - p.h + 6, p.w - 12, 68); ctx.clip();
      var pts = [], base = p.y - p.h + 44;
      for (var i = 0; i <= 20; i++) {
        var x = p.x + 6 + i * (p.w - 12) / 20;
        var ph = ((i / 20) - (t * 0.9) % 1 + 1) % 1;
        var y = ph < 0.05 ? base - 26 : ph < 0.1 ? base + 12 : base;
        pts.push(x, y);
      }
      line(ctx, pts, 2.5, C(K, 'kit.plant'));
      ctx.restore();
    } },
    cot: { w: 240, h: 50, d: 90, draw: function (ctx, p, K) {
      line(ctx, [p.x + 10, p.y, p.x + 10, p.y - 30], 5, C(K, 'kit.metalDark'));
      line(ctx, [p.x + p.w - 10, p.y, p.x + p.w - 10, p.y - 30], 5, C(K, 'kit.metalDark'));
      box(ctx, K, p.x, p.y - 30, p.w, 16, p.d, p.color || 'kit.fabric');
    } },
    bars: { w: 1280, h: 720, d: 0, draw: function (ctx, p, K) {
      for (var x = p.x + 30; x < p.x + p.w; x += 90) rect(ctx, x, 0, 14, p.y, C(K, p.color || 'kit.metalDark'), DL);
      rect(ctx, p.x, 40, p.w, 18, C(K, p.color || 'kit.metalDark'), DL);
    } },
    curtain: { w: 260, h: 300, d: 0, draw: function (ctx, p, K) {
      line(ctx, [p.x - 10, p.y - p.h, p.x + p.w + 10, p.y - p.h], 5, C(K, 'kit.metal'));
      var pts = [p.x, p.y - p.h];
      for (var i = 0; i <= 10; i++) pts.push(p.x + i * p.w / 10 + (i % 2 ? 8 : 0), p.y - 20);
      pts.push(p.x + p.w, p.y - p.h);
      poly(ctx, pts, C(K, p.color || '@accent'), LW);
      for (var j = 1; j < 10; j++) line(ctx, [p.x + j * p.w / 10, p.y - p.h + 4, p.x + j * p.w / 10 + (j % 2 ? 8 : 0), p.y - 24], 1.2);
    } },
    calendar: { wall: true, w: 90, h: 110, draw: function (ctx, p, K, t, state) {
      rect(ctx, p.x, p.y, p.w, p.h, C(K, 'kit.paper'));
      rect(ctx, p.x, p.y, p.w, 24, C(K, 'kit.red'), DL);
      var n = state && state.jail ? (state.jail.served || 0) : 3;
      for (var i = 0; i < Math.min(n + 1, 20); i++) {
        var g = Math.floor(i / 5), k = i % 5, x = p.x + 12 + g * 30 + k * 5, y = p.y + 36 + Math.floor(g / 2) * 34;
        if (k === 4) line(ctx, [x - 22, y + 20, x + 2, y + 4], 2); else line(ctx, [x, y, x, y + 24], 2);
      }
    } },
    portrait: { wall: true, w: 110, h: 130, draw: function (ctx, p, K) {
      rect(ctx, p.x - 10, p.y - 10, p.w + 20, p.h + 20, C(K, p.alt || 'kit.gold'));
      rect(ctx, p.x, p.y, p.w, p.h, C(K, p.color || 'kit.paper'), DL);
      if (SR.art.portraits) {
        ctx.save(); ctx.translate(p.x + (p.w - Math.min(p.w, p.h)) / 2, p.y + (p.h - Math.min(p.w, p.h)));
        SR.art.portraits.draw(ctx, p.person || 'doodle', Math.min(p.w, p.h), p.mood || 'smug');
        ctx.restore();
      }
    } },
    ticker: { wall: true, w: 300, h: 34, draw: function (ctx, p, K) {
      rect(ctx, p.x, p.y, p.w, p.h, C(K, 'kit.screen'));
    }, anim: function (ctx, p, K, t) {
      ctx.save(); ctx.beginPath(); ctx.rect(p.x + 4, p.y + 4, p.w - 8, p.h - 8); ctx.clip();
      ctx.fillStyle = C(K, 'kit.red');
      var off = (t * 60) % 24;
      for (var x = p.x - 24 + off; x < p.x + p.w; x += 24) for (var r = 0; r < 3; r++) if ((Math.floor((x - off) / 24) + r) % 3) ctx.fillRect(x, p.y + 8 + r * 7, 5, 5);
      ctx.restore();
    } },
    throne: { w: 150, h: 230, d: 80, draw: function (ctx, p, K) {
      box(ctx, K, p.x + 10, p.y - 60, p.w - 20, p.h - 60, 30, p.color || 'kit.gold');
      box(ctx, K, p.x, p.y, p.w, 64, p.d, p.color || 'kit.gold');
      rect(ctx, p.x + 26, p.y - p.h + 40, p.w - 52, p.h - 120, C(K, p.alt || 'kit.rug'), DL);
    } },
    banners: { wall: true, w: 400, h: 200, draw: function (ctx, p, K) {
      for (var i = 0; i < 3; i++) {
        var x = p.x + i * p.w / 3 + 20, w = p.w / 3 - 40;
        poly(ctx, [x, p.y, x + w, p.y, x + w, p.y + p.h, x + w / 2, p.y + p.h - 30, x, p.y + p.h], C(K, i % 2 ? (p.alt || 'kit.gold') : (p.color || 'kit.red')));
        circle(ctx, x + w / 2, p.y + p.h / 2 - 10, w / 4, C(K, i % 2 ? (p.color || 'kit.red') : (p.alt || 'kit.gold')), DL);
      }
    } },
    crack: { wall: true, w: 80, h: 120, draw: function (ctx, p) {
      line(ctx, [p.x + 40, p.y, p.x + 30, p.y + 30, p.x + 46, p.y + 56, p.x + 34, p.y + 84, p.x + 42, p.y + 120], 2);
      line(ctx, [p.x + 46, p.y + 56, p.x + 66, p.y + 70], 1.5);
    } },
    boxes: { w: 140, h: 120, d: 60, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, 80, 60, p.d, p.color || 'kit.woodLight');
      box(ctx, K, p.x + 60, p.y, 80, 56, p.d, p.color || 'kit.woodLight');
      box(ctx, K, p.x + 30, p.y - 58, 76, 56, p.d - 10, p.color || 'kit.woodLight');
      line(ctx, [p.x + 68, p.y - 114, p.x + 68, p.y - 60], 3, C(K, 'kit.poster'));
    } },
    trash: { w: 50, h: 70, d: 30, draw: function (ctx, p, K) {
      poly(ctx, [p.x, p.y - p.h, p.x + p.w, p.y - p.h, p.x + p.w - 6, p.y, p.x + 6, p.y], C(K, p.color || 'kit.metalDark'));
      ellipse(ctx, p.x + p.w / 2, p.y - p.h, p.w / 2 + 2, 6, C(K, 'kit.metal'), DL);
    } },
    // ---- furniture pieces (B-08b; the home interiors place them)
    freezer: { w: 160, h: 90, d: 80, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, p.h, p.d, p.color || 'kit.fridge', { top: 'kit.glass' });
      rect(ctx, p.x + p.w - 40, p.y - p.h + 20, 24, 8, C(K, 'kit.metalDark'), DL);
    } },
    minibar: { w: 120, h: 80, d: 50, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y - 10, p.w, p.h - 10, p.d, p.color || 'kit.woodDark');
      circle(ctx, p.x + 16, p.y - 6, 8, C(K, 'kit.metalDark'), DL); circle(ctx, p.x + p.w - 16, p.y - 6, 8, C(K, 'kit.metalDark'), DL);
      var cols = ['kit.plant', 'kit.red', 'kit.beer'];
      for (var i = 0; i < 3; i++) {
        var x = p.x + 20 + i * 32;
        rect(ctx, x, p.y - p.h - 26, 16, 30, C(K, cols[i]), DL); rect(ctx, x + 5, p.y - p.h - 40, 6, 14, C(K, cols[i]), DL);
      }
    } },
    lounge: { w: 300, h: 110, d: 60, draw: function (ctx, p, K) {
      PROPS.bar.draw(ctx, { x: p.x, y: p.y, w: p.w, h: p.h, d: p.d, color: p.color || 'kit.woodDark' }, K);
      PROPS.minibar.draw(ctx, { x: p.x + 20, y: p.y - p.h + 12, w: 120, h: 0.1, d: 1, color: 'kit.woodDark' }, K);
    } },
    books: { w: 120, h: 70, d: 40, draw: function (ctx, p, K) {
      PROPS.table.draw(ctx, { x: p.x, y: p.y, w: p.w, h: 60, d: p.d }, K);
      var cols = ['kit.red', 'kit.fabric', 'kit.plant'];
      for (var i = 0; i < 3; i++) rect(ctx, p.x + 16 + i * 4, p.y - 72 - i * 14, p.w - 40 - i * 8, 14, C(K, cols[i]), DL);
    } },
    library: { w: 240, h: 230, d: 40, draw: function (ctx, p, K) {
      PROPS.shelf.draw(ctx, { x: p.x, y: p.y, w: p.w, h: p.h, d: p.d, type: 'library', color: p.color || 'kit.woodDark' }, K);
    } },
    homegym: { w: 220, h: 170, d: 70, draw: function (ctx, p, K) {
      PROPS.barbell.draw(ctx, { x: p.x, y: p.y, w: p.w * 0.6, h: p.h - 40, d: p.d }, K);
      box(ctx, K, p.x + p.w * 0.66, p.y, p.w * 0.34, 40, p.d, 'kit.fabric');
    } },
    aquarium: { w: 200, h: 150, d: 60, draw: function (ctx, p, K) {
      box(ctx, K, p.x, p.y, p.w, 60, p.d, 'kit.woodDark');
      rect(ctx, p.x, p.y - p.h, p.w, p.h - 60, SR.art.draw.alpha(C(K, 'kit.water'), 0.85), LW);
      rect(ctx, p.x + 2, p.y - 76, p.w - 4, 14, C(K, 'kit.woodLight'), 0);
    }, anim: function (ctx, p, K, t) {
      for (var i = 0; i < 3; i++) {
        var fx = p.x + 20 + ((t * (20 + i * 9) + i * 60) % (p.w - 40)), fy = p.y - p.h + 26 + i * 20;
        poly(ctx, [fx, fy, fx + 18, fy - 7, fx + 18, fy + 7], C(K, 'kit.fish'), 1);
      }
    } },
    satellite: { w: 90, h: 90, d: 0, draw: function (ctx, p, K) { PROPS.skydish.draw(ctx, p, K); } },
  };
  // Menu-board item names that are not icon names (ART_AUDIO §9 writes 'shake').
  var ICON_ALIAS = { shake: 'milkshake', soda: 'slushee', meal: 'megameal', triple: 'tripleburger', candy: 'candybar' };
  // Aliases: the furniture ids of B-08b and ART_AUDIO's names.
  var PROP_ALIAS = { fridge: 'cooler', pc: 'computer', workstation: 'computer', board: 'chalkboard', ring: 'ringrope',
    tellerwindow: 'teller', ticketwindow: 'ticket', slotmachine: 'slot', beertaps: 'taps', filingcabinet: 'filing',
    departuresboard: 'departures', motivational: 'poster', sign: 'poster', counterstool: 'stool' };
  function propDef(type) {
    if (PROPS[type]) return PROPS[type];
    var k = String(type || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (PROP_ALIAS[k]) return PROPS[PROP_ALIAS[k]];
    for (var name in PROPS) if (name.toLowerCase() === k) return PROPS[name];
    return null;
  }

  function neonMug(ctx, p, K, a) {
    var c = C(K, p.color || 'light.neonYellow'), x = p.x, y = p.y, w = p.w, h = p.h;
    ctx.lineWidth = 6; ctx.strokeStyle = c; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.rect(x + w * 0.18, y + h * 0.25, w * 0.5, h * 0.62);
    ctx.moveTo(x + w * 0.68, y + h * 0.38); ctx.quadraticCurveTo(x + w * 0.92, y + h * 0.4, x + w * 0.68, y + h * 0.72);
    ctx.moveTo(x + w * 0.16, y + h * 0.25); ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.05, x + w * 0.44, y + h * 0.2); ctx.quadraticCurveTo(x + w * 0.58, y + h * 0.04, x + w * 0.7, y + h * 0.25);
    ctx.stroke();
    ctx.strokeStyle = C(K, 'light.neonPink');
    ctx.beginPath(); ctx.moveTo(x + w * 0.3, y + h * 0.45); ctx.lineTo(x + w * 0.3, y + h * 0.75); ctx.moveTo(x + w * 0.45, y + h * 0.45); ctx.lineTo(x + w * 0.45, y + h * 0.75); ctx.stroke();
    return a;
  }

  // ---- the renderer -------------------------------------------------------------------------------
  function norm(K, p, type) {
    var d = propDef(type || p.type);
    var q = {};
    for (var k in p) q[k] = p[k];
    if (type) q.type = type;
    if (d) { if (q.w === undefined) q.w = d.w; if (q.h === undefined) q.h = d.h; if (q.d === undefined) q.d = d.d || 0; }
    q.def = d;
    q.sortY = p.sortY !== undefined ? p.sortY : p.y;
    return q;
  }

  // Normalised props are cached per prop (and per picked type), so drawing a frame allocates only
  // the short lists below.
  var normCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function normFor(K, p, type) {
    if (!normCache) return norm(K, p, type);
    var per = normCache.get(p);
    if (!per) { per = {}; normCache.set(p, per); }
    var key = type || '';
    return per[key] || (per[key] = norm(K, p, type));
  }

  function visibleProps(K, state) {
    var out = K.scratch || (K.scratch = []);
    out.length = 0;
    var list = K.def.props || [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (typeof p.when === 'function') { try { if (!p.when(state, K.params)) continue; } catch (e) { continue; } }
      var t2 = null;
      if (typeof p.pick === 'function') { try { t2 = p.pick(state, K.params) || null; } catch (e) { t2 = null; } }
      var q = normFor(K, p, t2);
      if (!q.def) { SR.util.warnOnce('prop:' + q.type, 'SR.art.interior: unknown prop type "' + q.type + '" in ' + K.id); continue; }
      out.push(q);
    }
    return out;
  }

  function drawProp(ctx, K, q, t, state) {
    ctx.save();
    if (q.flip) { ctx.translate(q.x * 2 + q.w, 0); ctx.scale(-1, 1); }
    q.def.draw(ctx, q, K, t, state);
    ctx.restore();
  }

  function customFn(K) {
    var c = K.def.custom;
    if (!c) return null;
    if (typeof c === 'function') return { static: c };
    var f = K.def.fns && K.def.fns[c];
    if (!f) { SR.util.warnOnce('custom:' + K.id + c, 'SR.art.interior: ' + K.id + ' names custom "' + c + '" but has no fns.' + c); return null; }
    return typeof f === 'function' ? { static: f } : f;
  }

  var PLACEHOLDER = {
    wall: { type: 'plain' }, floor: { type: 'planks', perspective: 0.6 },
    window: { x: 90, y: 90, w: 240, h: 150 },
    props: [{ type: 'counter', x: 160, y: 500, w: 420 }, { type: 'plant', x: 640, y: 470 }],
    lights: [{ x: 380, y: 70, r: 240 }],
  };

  function Renderer(id, def) {
    var K = {
      id: id, def: def || PLACEHOLDER, placeholder: !def,
      pid: def && def.palette ? def.palette : (SR.art.palette.int[id] ? id : 'default'),
      floorY: (def && def.floorY) || FLOOR_Y, vp: (def && def.vp) || VP,
    };
    K.kit = kit;
    this.id = id;
    this.def = K.def;
    this.K = K;
  }
  Renderer.prototype.drawStatic = function (ctx, state) {
    var K = this.K;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    drawWall(ctx, K, state);
    if (K.def.window) windowStatic(ctx, K, K.def.window, state);
    var props = visibleProps(K, state);
    var i;
    for (i = 0; i < props.length; i++) if (props[i].def.wall) drawProp(ctx, K, props[i], 0, state);
    drawFloor(ctx, K);
    var floor = props.filter(function (q) { return !q.def.wall; }).sort(function (a, b) { return a.sortY - b.sortY; });
    for (i = 0; i < floor.length; i++) drawProp(ctx, K, floor[i], 0, state);
    var cf = customFn(K);
    if (cf && cf.static) cf.static(ctx, kitFor(K), state);
    drawLights(ctx, K);
    if (SR.art.paper && SR.art.paper.apply) SR.art.paper.apply(ctx, 0, 0, W, H, 0.06);
    ctx.restore();
  };
  Renderer.prototype.drawAnim = function (ctx, t, state, actors) {
    var K = this.K;
    t = t || 0;
    actors = actors || {};
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var props = visibleProps(K, state);
    var i, q;
    if (K.def.window) {
      var w = K.def.window;
      sky(ctx, [w.x, w.y, w.w, w.h], state);
      windowPanes(ctx, K, w, true);
      // wall props that overlap the window stay in front of it, as in the static layer
      for (i = 0; i < props.length; i++) {
        q = props[i];
        if (q.def.wall && q.x < w.x + w.w + 8 && q.x + q.w > w.x - 8 && q.y < w.y + w.h + 8 && q.y + q.h > w.y - 8) drawProp(ctx, K, q, t, state);
      }
    }
    for (i = 0; i < props.length; i++) { q = props[i]; if (q.def.wall && q.def.anim) q.def.anim(ctx, q, K, t, state); }
    // people, in depth order with the props in front of them drawn again
    var people = [];
    var def = K.def;
    var ao = actors.owner || {};
    if (def.owner && ao.visible !== false) {
      people.push({ x: def.owner.x, y: def.owner.y, look: ao.look || def.owner.id || ao.id, clip: clipName(ao.clip || ao.pose || def.owner.pose),
        t: ao.t, mood: ao.mood || moodFor(ao.clip || ao.pose) || def.owner.mood, facing: def.owner.facing || 'down' });
    }
    var ay = actors.you || {};
    if (def.you && ay.visible !== false) {
      var ox = def.owner ? def.owner.x : def.you.x + 1;
      people.push({ x: ay.x !== undefined ? ay.x : def.you.x, y: ay.y !== undefined ? ay.y : def.you.y, player: true, look: ay.look || 'player',
        clip: clipName(ay.clip || ay.pose || def.you.pose), t: ay.t, mood: ay.mood || moodFor(ay.clip || ay.pose), karma: ay.karma,
        facing: ay.facing || def.you.facing || (ox >= def.you.x ? 'right' : 'left') });
    }
    (actors.extra || []).forEach(function (e) { people.push(e); });
    var items = [];
    for (i = 0; i < people.length; i++) items.push({ y: people[i].y, person: people[i] });
    for (i = 0; i < props.length; i++) {
      q = props[i];
      if (q.def.wall) continue;
      var redraw = false;
      for (var j = 0; j < people.length; j++) {
        var pp = people[j], half = 80 * depthScale(K, pp.y);
        if (q.sortY > pp.y && q.x < pp.x + half && q.x + q.w > pp.x - half) { redraw = true; break; }
      }
      if (redraw || q.def.anim) items.push({ y: q.sortY + 0.001, prop: q, redraw: redraw });
    }
    items.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.person) drawPerson(ctx, K, it.person, t);
      else {
        if (it.redraw) drawProp(ctx, K, it.prop, t, state);
        if (it.prop.def.anim) it.prop.def.anim(ctx, it.prop, K, t, state);
      }
    }
    var cf = customFn(K);
    if (cf && cf.anim) cf.anim(ctx, kitFor(K), t, state);
    ctx.restore();
  };

  // ---- the kit API handed to custom draw fns ----------------------------------------------------
  function kitFor(K) {
    if (K.api) { K.api.params = K.params; return K.api; }
    K.api = {
      id: K.id, def: K.def, params: K.params, vp: K.vp, floorY: K.floorY, W: W, H: H,
      color: function (k) { return C(K, k); }, tone: function (k, n) { return T(K, k, n); },
      box: function (ctx, x, y, w, h, d, col, o) { box(ctx, K, x, y, w, h, d, col, o); },
      back: function (x, y, d) { return back(K, x, y, d); },
      depthScale: function (y) { return depthScale(K, y); },
      prop: function (ctx, spec, t, state) { var q = norm(K, spec); if (q.def) { drawProp(ctx, K, q, t || 0, state); if (q.def.anim && t !== undefined) q.def.anim(ctx, q, K, t, state); } },
      person: function (ctx, spec, t) { drawPerson(ctx, K, spec, t || 0); },
      sky: function (ctx, rct, state) { sky(ctx, rct, state); },
      rect: rect, circle: circle, ellipse: ellipse, line: line, poly: poly, LW: LW, DL: DL,
    };
    return K.api;
  }

  var cache = new Map();
  /**
   * The renderer of an interior (registered def, or a neutral placeholder room for an unknown id).
   * @param {string} id
   * @param {object=} params the door resolver's params ({ homeId, mode } for a home door; W1-D
   *   request 6): props' when / pick and custom fns receive them (kit.params)
   * @returns {{id: string, def: object, params: object, drawStatic: function, drawAnim: function}}
   */
  function interior(id, params) {
    var def = SR.reg.interior ? SR.reg.interior[id] : null;
    var hit = cache.get(id);
    var r;
    if (hit && hit.src === def) r = hit.r;
    else { r = new Renderer(id, def || null); cache.set(id, { src: def, r: r }); }
    r.params = r.K.params = params || null;
    return r;
  }
  var kit = { W: W, H: H, FLOOR_Y: FLOOR_Y, VP: VP, FOCAL: FOCAL, PROPS: PROPS, skyAt: skyAt };
  interior.kit = kit;
  /**
   * A renderer for a def that is not registered (the art bible's sample, sheets, previews).
   * @param {string} id a name for caching and the palette set (int.<id>)
   * @param {object} def an interior def
   */
  interior.fromDef = function (id, def) {
    var key = 'def:' + id;
    var hit = cache.get(key);
    if (hit && hit.src === def) return hit.r;
    var r = new Renderer(id, def);
    cache.set(key, { src: def, r: r });
    return r;
  };
  /** @returns {string[]} the prop types the kit draws. */
  interior.types = function () { return Object.keys(PROPS); };
  SR.art.interior = interior;
})();
