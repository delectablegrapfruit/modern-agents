// js/render/worldui.js — owner: W1-G. World-space UI on the canvas (ARCHITECTURE §9.1 step 10,
// UI.md §2.3, §5.5): door tags (the place name from 96 to 160 u, with the interact key hint inside
// 96 u), name tags over named people (within 200 u), prompts and "!" markers requested each frame
// by the city systems, pooled float texts ("+2 INT": rise 40 u over 900 ms, ease-out, fade the
// last 300 ms) and the click-to-walk dotted ink route. Text keeps its size at every zoom.
(function () {
  'use strict';
  var SR = window.SR;

  var DOOR_TAG = 160;          // a plain name tag from 96 to 160 u (GDD §3.6; tuning.world.door.tag wins)
  var DOOR_PROMPT = 96;        // the interact range: the tag carries the key hint (tuning.world.door.prompt)
  var NAME_TAG = 200;          // name tags over named people within 200 u
  var FLOAT_RISE = 40, FLOAT_MS = 900, FLOAT_FADE_MS = 300;
  var FLOAT_MAX = 24;
  var UI_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  var DISPLAY_FONT = '"Arial Black", "Segoe UI Black", "Helvetica Neue", Arial, sans-serif';

  function L() { return SR.render.lib; }
  function num(v) { return typeof v === 'number' && isFinite(v); }

  var floats = [];
  var nFloats = 0;
  var queued = [];             // this frame's immediate items: { kind, x, y, z, text, key }
  var nQueued = 0;
  var route = null;            // explicit route points (else the player's path)
  var widths = {};
  var nWidths = 0;

  function measure(ctx, font, text) {
    var k = font + '|' + text;
    var w = widths[k];
    if (w === undefined) {
      if (nWidths > 400) { widths = {}; nWidths = 0; }
      ctx.font = font;
      w = widths[k] = ctx.measureText(text).width;
      nWidths++;
    }
    return w;
  }

  function queue(kind, x, y, text, opts) {
    var it = queued[nQueued] || (queued[nQueued] = {});
    it.kind = kind; it.x = x; it.y = y; it.text = text || '';
    it.z = opts && num(opts.z) ? opts.z : 0;
    it.key = opts && opts.key ? opts.key : null;
    nQueued++;
    return it;
  }

  /** Shows a name tag over a world point for this frame. @param {{z: number, key: string}=} opts key: a key hint glyph */
  function tag(x, y, text, opts) { return queue('tag', x, y, text, opts); }
  /** Shows a prompt bubble ("[E] Talk") over a world point for this frame. */
  function prompt(x, y, text, opts) { return queue('prompt', x, y, text, opts); }
  /** Shows a "!" marker over a world point (a pedestrian's head) for this frame. */
  function marker(x, y, opts) { return queue('marker', x, y, '!', opts); }

  /**
   * Starts a float text at a world point (the pool recycles the oldest when full).
   * @param {number} x
   * @param {number} y feet position; the text starts above the head
   * @param {string} text already localized ("+2 INT")
   * @param {string=} colour a palette key or a stat name (str, int, cha, hp, money, time, heat, karma)
   */
  function float(x, y, text, colour) {
    var f;
    if (nFloats < FLOAT_MAX) f = floats[nFloats] || (floats[nFloats] = {});
    else { f = floats[0]; floats.push(floats.shift()); nFloats--; }
    f.x = x; f.y = y; f.text = String(text); f.t0 = L().now(); f.colour = colour || 'ink';
    nFloats++;
    return f;
  }

  /** Sets the click-to-walk route (world points) or clears it with null; without one the player's path is drawn. */
  function setRoute(points) { route = Array.isArray(points) && points.length ? points : null; }

  function statColour(c) {
    var stats = { str: 1, int: 1, cha: 1, hp: 1, money: 1, time: 1, heat: 1, karma: 1 };
    if (stats[c]) return L().pal(['ui.' + c, c === 'karma' ? 'ui.karma-zero' : 'ink'], 0.3);
    return L().pal([c, 'ink'], 0.2);
  }

  function keyGlyph() {
    var I = SR.input;
    var code = 'KeyE';
    if (I && typeof I.bindings === 'function') {
      try { var b = I.bindings('interact'); if (b && b.length) code = b[0]; } catch (e) { /* default */ }
    }
    if (SR.text && SR.text.has && SR.text.has('key.' + code)) return SR.text('key.' + code);
    return String(code).replace(/^Key|^Digit|^Numpad/, '');
  }

  function placeName(id, def) {
    var key = def && typeof def.name === 'string' ? def.name : 'place.' + id;
    return L().text(key, null, '') || L().text('place.' + id, null, '');
  }

  // ---------------------------------------------------------------------------------------------
  // Drawing (stage transform; world points projected with the frame's view)
  // ---------------------------------------------------------------------------------------------

  function sx(v, x) { return (x * v.ppu + v.tx) / v.s; }
  function sy(v, y) { return (y * v.ppu + v.ty) / v.s; }

  function pill(ctx, cx, cy, text, key, strong) {
    var font = '700 14px ' + UI_FONT;
    var tw = measure(ctx, font, text);
    var kw = key ? measure(ctx, '800 12px ' + UI_FONT, key) + 12 : 0;
    var w = tw + 16 + (key ? kw + 6 : 0), h = 24;
    var x = Math.round(cx - w / 2), y = Math.round(cy - h);
    var paper = L().pal(['ui.paper-0', 'paperEdge'], 0.98), ink = L().pal(['ui.ink-900', 'ink'], 0.1);
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.18;
    ctx.beginPath(); rr(ctx, x + 2, y + 2, w, h, 12); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = paper;
    ctx.beginPath(); rr(ctx, x, y, w, h, 12); ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = strong ? 2 : 1.5;
    ctx.stroke();
    var tx = x + 8;
    if (key) {
      ctx.fillStyle = L().pal(['ui.focus', 'lanePaint'], 0.85);
      ctx.beginPath(); rr(ctx, tx - 2, y + 4, kw, 16, 4); ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = ink;
      ctx.font = '800 12px ' + UI_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(key, tx - 2 + kw / 2, y + 12.5);
      tx += kw + 6;
    }
    ctx.fillStyle = ink;
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, tx, y + 12.5);
    L().count.fills += key ? 5 : 3;
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawRoute(ctx, v) {
    var A = SR.render.actors;
    var p = A && A.player ? A.player() : null;
    var pts = route || (p && Array.isArray(p.path) && p.path.length ? p.path : null);
    if (!pts) return;
    L().worldTransform(ctx, v);
    ctx.save();
    ctx.strokeStyle = L().pal(['ui.ink-900', 'ink'], 0.1);
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 4 / v.zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([0.1, 12 / v.zoom]);
    ctx.lineDashOffset = -v.t * 18;
    ctx.beginPath();
    var start = p && num(p.x) ? [p.x, p.y] : null;
    var first = true;
    if (start) { ctx.moveTo(start[0], start[1]); first = false; }
    for (var i = 0; i < pts.length; i++) {
      var q = pts[i], x = Array.isArray(q) ? q[0] : q.x, y = Array.isArray(q) ? q[1] : q.y;
      if (!num(x) || !num(y)) continue;
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // A ring at the destination.
    var last = pts[pts.length - 1], lx = Array.isArray(last) ? last[0] : last.x, ly = Array.isArray(last) ? last[1] : last.y;
    ctx.setLineDash([]);
    ctx.lineWidth = 2.5 / v.zoom;
    ctx.beginPath(); ctx.ellipse(lx, ly, 12, 6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function doorAnchor(dr) {
    // Over the door's sign: the facade above a south door, the awning's outer edge, the north porch.
    var f = String(dr.face || 'S').toUpperCase();
    return { x: dr.x + (f === 'E' ? 16 : f === 'W' ? -16 : 0), y: f === 'S' ? dr.y - 70 : f === 'N' ? dr.y - 60 : dr.y - 64 };
  }

  function doorLabel(nameKey, tagKey, fallbackId, def) {
    var name = L().text(nameKey, null, '') || placeName(fallbackId, def);
    var tag = tagKey ? L().text(tagKey, null, '') : '';
    return name && tag ? name + ' · ' + tag : name;
  }

  function doorTags(ctx, v, m) {
    if (SR.render.worldui.doorTags === false) return;
    var D = SR.world && SR.world.doors, G = SR.world && SR.world.geometry;
    var byId = m.doorById || (m.doorById = m.doors.reduce(function (o, d) { o[d.id] = d; o[d.building] = o[d.building] || d; return o; }, {}));
    if (D && G && G.built && Array.isArray(D.tags) && SR.world.player) {
      // The live world decides which doors are in range (W1-W doors: prompt within 96 u, tags to 160 u).
      if (D.prompt && D.prompt.kind === 'enter' && byId[D.prompt.door]) {
        var pd = byId[D.prompt.door], pt = D.tagFor ? D.tagFor(D.prompt.door) : null;
        var pa = doorAnchor(pd.door);
        pill(ctx, sx(v, pa.x), sy(v, pa.y), doorLabel(D.prompt.name, pt && pt.tag, pd.building, pd.geom.def), keyGlyph(), true);
      }
      for (var k = 0; k < D.tags.length; k++) {
        var tg = D.tags[k], dd = byId[tg.door];
        if (!dd) continue;
        var ta = doorAnchor(dd.door);
        pill(ctx, sx(v, ta.x), sy(v, ta.y), doorLabel(tg.name, tg.tag, dd.building, dd.geom.def), null, false);
      }
      return;
    }
    var A = SR.render.actors;
    var p = A && A.playerPos ? A.playerPos() : null;
    if (!p) return;
    var key = null;
    var tagR = L().tune('world.door.tag', DOOR_TAG), promptR = L().tune('world.door.prompt', DOOR_PROMPT);
    for (var i = 0; i < m.doors.length; i++) {
      var d = m.doors[i], dr = d.door;
      var dx = dr.x - p.x, dy = dr.y - p.y;
      if (Math.abs(dx) > tagR || Math.abs(dy) > tagR) continue;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > tagR) continue;
      var name = placeName(d.building, d.geom.def);
      if (!name) continue;
      var an = doorAnchor(dr);
      if (dist <= promptR && key === null) key = keyGlyph();
      pill(ctx, sx(v, an.x), sy(v, an.y), name, dist <= promptR ? key : null, dist <= promptR);
    }
  }

  function nameTags(ctx, v) {
    var A = SR.render.actors;
    var p = A && A.playerPos ? A.playerPos() : null;
    var W = SR.world || {};
    var list = W.streetnpcs && (Array.isArray(W.streetnpcs.people) ? W.streetnpcs.people : Array.isArray(W.streetnpcs.list) ? W.streetnpcs.list : null);
    if (!p || !list) return;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !num(e.x) || e.visible === false) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) > NAME_TAG) continue;
      var def = SR.reg.person && SR.reg.person[e.id];
      var name = def && typeof def.name === 'string' ? L().text(def.name, null, '') : '';
      if (name) pill(ctx, sx(v, e.x), sy(v, e.y - 62), name, null, false);
    }
  }

  function drawQueued(ctx, v) {
    for (var i = 0; i < nQueued; i++) {
      var it = queued[i];
      var x = sx(v, it.x), y = sy(v, it.y - 0.5 * it.z);
      if (it.kind === 'marker') {
        var ink = L().pal(['ui.ink-900', 'ink'], 0.1);
        var bob = Math.sin(v.t * 5) * 3;
        ctx.fillStyle = L().pal(['ui.focus', 'lanePaint'], 0.85);
        ctx.beginPath(); ctx.arc(x, y - 70 + bob, 11, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = ink;
        ctx.font = '900 16px ' + DISPLAY_FONT;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', x, y - 69 + bob);
        L().count.fills += 2;
      } else {
        pill(ctx, x, y - (it.kind === 'prompt' ? 64 : 60) * Math.min(1, v.zoom), it.text, it.key, it.kind === 'prompt');
      }
    }
    nQueued = 0;
  }

  function drawFloats(ctx, v) {
    var now = L().now();
    for (var i = 0; i < nFloats; i++) {
      var f = floats[i];
      var ms = (now - f.t0) * 1000;
      if (ms >= FLOAT_MS || ms < 0) {
        floats.splice(i, 1);
        floats.push(f);
        nFloats--;
        i--;
        continue;
      }
      var k = SR.util.easeOut(ms / FLOAT_MS);
      var alpha = ms > FLOAT_MS - FLOAT_FADE_MS ? (FLOAT_MS - ms) / FLOAT_FADE_MS : 1;
      var x = sx(v, f.x), y = sy(v, f.y - 60 - FLOAT_RISE * k);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '900 20px ' + DISPLAY_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = L().pal(['fx.floatOutline', 'ink'], 0.1);
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = statColour(f.colour);
      ctx.fillText(f.text, x, y);
      ctx.restore();
      L().count.fills++;
    }
  }

  /** Step 10: the route, door and name tags, this frame's prompts and markers, the float texts. */
  function draw(ctx, v, m) {
    drawRoute(ctx, v);
    L().stageTransform(ctx, v);
    ctx.save();
    if (m) doorTags(ctx, v, m);
    nameTags(ctx, v);
    drawQueued(ctx, v);
    drawFloats(ctx, v);
    ctx.restore();
  }

  SR.render.worldui = {
    tag: tag,
    prompt: prompt,
    marker: marker,
    float: float,
    route: setRoute,
    draw: draw,
    /** false turns off the automatic door tags (a scene that draws its own). */
    doorTags: true,
    /** @returns {{floats: number, queued: number}} */
    stats: function () { return { floats: nFloats, queued: nQueued, route: route ? route.length : 0 }; },
  };
})();
