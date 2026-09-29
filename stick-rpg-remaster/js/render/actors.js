// js/render/actors.js — owner: W1-G. People and cars in the Y-sorted pass (ARCHITECTURE §9.1 step 5,
// §8.2): the player, pedestrians, named people and cars, drawn as vectors every frame through
// SR.art.stick.draw and SR.art.vehicles.draw (W1-A) at their interpolated positions, with simple
// placeholders while those modules are stubs. It also answers the other passes: the focus rects of
// the occlusion fade (GDD §3.7), the player's position, the cars for the headlights and the boxes
// the grade must cover. Sources are the world systems' lists, plus any registered with source().
(function () {
  'use strict';
  var SR = window.SR;

  var STANDEE_H = 52;          // adult city standee (ART_AUDIO §7)
  var CULL = 90;               // u of margin around the view

  function L() { return SR.render.lib; }
  function num(v) { return typeof v === 'number' && isFinite(v); }

  var extra = {};              // name -> { fn, kind }
  var frameCars = [];
  var frameBoxes = [];         // [x0, y0, x1, y1, ...] of this frame's actors (flat)
  var frameFocus = [];         // standee rects of the player, named people and marked pedestrians
  var player = null;
  var warned = {};
  var stickOpts = {};
  var carOpts = {};

  /**
   * Registers an extra actor source (tests, sheets, later systems): fn() → array of entities.
   * @param {string} name
   * @param {function(): object[]|null} fn
   * @param {string=} kind 'stick' (default: people) | 'car' | 'player'
   */
  function source(name, fn, kind) {
    if (fn === null || fn === undefined) { delete extra[name]; return; }
    extra[name] = { fn: fn, kind: kind || 'stick' };
  }

  /** @returns {Array|null} the first array property of obj among names. */
  function listOf(obj, names) {
    if (!obj) return null;
    for (var i = 0; i < names.length; i++) if (Array.isArray(obj[names[i]])) return obj[names[i]];
    if (typeof obj.list === 'function') {
      try { var l = obj.list(); if (Array.isArray(l)) return l; } catch (e) { return null; }
    }
    return null;
  }

  /** @returns {object|null} the player entity from SR.world.player (the module, its body, or an entity field). */
  function playerEntity() {
    var P = SR.world && SR.world.player;
    if (!P) return null;
    var cands = [P.entity, P.body, P.e, P.state, P];
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (c && typeof c === 'object' && num(c.x) && num(c.y)) return c;
    }
    return null;
  }

  function alive(e) { return e && num(e.x) && num(e.y) && e.active !== false && e.visible !== false && e.hidden !== true; }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function posOf(e, alpha, out) {
    var a = num(alpha) ? alpha : 1;
    out.x = num(e.px) ? lerp(e.px, e.x, a) : e.x;
    out.y = num(e.py) ? lerp(e.py, e.y, a) : e.y;
    return out;
  }

  var tmp = { x: 0, y: 0 };
  var cur = { v: null, push: null, alpha: 1, n: 0, playerAdded: false };

  function add(e, kind) {
    if (!alive(e)) return;
    var v = cur.v;
    posOf(e, cur.alpha, tmp);
    if (tmp.x < v.x0 - CULL || tmp.x > v.x1 + CULL || tmp.y < v.y0 - 20 || tmp.y > v.y1 + STANDEE_H + CULL) return;
    if (kind === 'player' || kind === 'person' || e.marker) frameFocus.push([tmp.x - 12, tmp.y - STANDEE_H - (e.marker ? 30 : 0), tmp.x + 12, tmp.y]);
    if (kind === 'player') cur.playerAdded = true;
    cur.push(sortKey(tmp.x, tmp.y, kind), 'actor', e, kind, cur.alpha);
    if (kind === 'car') {
      frameCars.push(e);
      frameBoxes.push(tmp.x - 60, tmp.y - 50, tmp.x + 60, tmp.y + 34);
    } else {
      frameBoxes.push(tmp.x - 16, tmp.y - STANDEE_H - 8, tmp.x + 16, tmp.y + 8);
    }
    cur.n++;
  }

  // People standing on an east / west door mat sort in front of that building: its awning hangs
  // over them, and drawing them after it keeps them readable at every door (GDD §3.6).
  var awnings = null, awningModel = null;
  function sortKey(x, y, kind) {
    if (kind === 'car') return y;
    var m = SR.render.lib.model();
    if (m && awningModel !== m) {
      awningModel = m;
      awnings = m.doors.filter(function (d) { return d.geom.awning && d.geom.porch; })
        .map(function (d) { return { r: d.geom.porch, key: d.geom.sortY + 0.5 }; });
    }
    if (awnings) {
      for (var i = 0; i < awnings.length; i++) {
        var r = awnings[i].r;
        if (x >= r[0] - 14 && x <= r[2] + 14 && y >= r[1] && y <= r[3]) return awnings[i].key;
      }
    }
    return y;
  }

  function addList(list, kind) { if (list) for (var i = 0; i < list.length; i++) add(list[i], kind); }

  var extraNames = [];

  /** Pushes the visible actors into the Y-sorted pass. @returns {number} how many */
  function collect(v, m, push, alpha) {
    frameCars.length = 0;
    frameBoxes.length = 0;
    frameFocus.length = 0;
    cur.v = v; cur.push = push; cur.alpha = alpha; cur.n = 0; cur.playerAdded = false;
    player = playerEntity();
    var W = SR.world || {};
    addList(listOf(W.traffic, ['cars', 'list', 'pool']), 'car');
    addList(listOf(W.pedestrians, ['peds', 'list', 'pool']), 'ped');
    addList(listOf(W.streetnpcs, ['people', 'list', 'npcs']), 'person');
    addList(listOf(W.police, ['officers', 'list']), 'ped');
    extraNames.length = 0;
    for (var name in extra) extraNames.push(name);
    for (var k = 0; k < extraNames.length; k++) {
      var src = extra[extraNames[k]], list = null;
      try { list = src.fn(); } catch (e) { warnOnce('src:' + extraNames[k], 'SR.render.actors: source "' + extraNames[k] + '" threw: ' + e.message); }
      if (!list) continue;
      if (!Array.isArray(list)) { addExtra(list, src.kind); continue; }
      for (var r = 0; r < list.length; r++) addExtra(list[r], src.kind);
    }
    if (player && !cur.playerAdded) add(player, 'player');
    cur.push = null;
    return cur.n;
  }

  function addExtra(ent, srcKind) {
    if (!ent) return;
    var kind = ent.kind === 'player' ? 'player' : srcKind === 'car' ? 'car' : srcKind === 'player' ? 'player' : ent.named ? 'person' : 'ped';
    if (kind === 'player') player = ent;
    add(ent, kind);
  }

  function warnOnce(key, msg) {
    if (warned[key]) return;
    warned[key] = true;
    SR.util.warnOnce('render.actors:' + key, msg);
  }

  /** @returns {string} 'up' | 'down' | 'left' | 'right' from a facing: a name, or degrees clockwise from north (the world's convention, W1-W player.facing). */
  function facing(f, vx, vy) {
    if (typeof f === 'string') {
      var s = f.toLowerCase();
      if (s === 'n' || s === 'up' || s === 'north') return 'up';
      if (s === 's' || s === 'down' || s === 'south') return 'down';
      if (s === 'e' || s === 'right' || s === 'east') return 'right';
      if (s === 'w' || s === 'left' || s === 'west') return 'left';
    }
    var ax, ay;
    if (num(f)) {
      var r = f * Math.PI / 180;
      ax = Math.sin(r); ay = -Math.cos(r);
    } else if (num(vx) && num(vy) && (vx || vy)) { ax = vx; ay = vy; }
    else return 'down';
    return Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
  }

  function moving(e) { return !!(e.moving || (num(e.vx) && num(e.vy) && (Math.abs(e.vx) + Math.abs(e.vy) > 5)) || e.state === 'walk' || e.state === 'flee'); }

  function clipOf(e, kind) {
    if (e.clip) return e.clip;
    if (e.pose && typeof e.pose === 'string') return e.pose;
    if (kind === 'player') {
      if (e.knockdown > 0) return 'knocked';
      if (e.teeter > 0) return 'teeter';
      if (e.mode === 'skate') return 'skate';
    }
    if (e.state === 'wave') return 'wave';
    if (e.state === 'hop') return 'shock';
    if (e.state === 'pause' || e.state === 'idle') return 'idle';
    return moving(e) ? 'walk' : 'idle';
  }

  /**
   * Draws one actor (ctx in world units).
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} e the entity
   * @param {string} kind 'player' | 'ped' | 'person' | 'car'
   * @param {object} v the frame's view
   * @param {number} alpha interpolation alpha
   */
  function draw(ctx, e, kind, v, alpha) {
    posOf(e, alpha, tmp);
    var x = tmp.x, y = tmp.y;
    if (kind === 'car' || (kind === 'player' && e.mode === 'drive')) { drawCar(ctx, e, kind, x, y, v); return; }
    var S = SR.art.stick;
    if (S && typeof S.draw === 'function' && !warned.stickFailed) {
      var o = stickOpts;
      o.x = x; o.y = y; o.view = 'city';
      o.facing = facing(e.facing, e.vx, e.vy);
      o.t = (num(e.animT) ? e.animT : v.t) + (num(e.phase) ? e.phase : 0);
      o.player = kind === 'player';
      o.look = e.look !== undefined ? e.look : kind === 'person' ? e.id : kind === 'ped' ? (num(e.lookId) ? e.lookId : num(e.n) ? e.n : e.id) : undefined;
      o.mount = kind === 'player' && e.mode === 'skate' ? 'board' : undefined;
      o.rot = num(e.rot) ? e.rot : undefined;
      o.mood = e.mood;
      o.alpha = num(e.alpha) ? e.alpha : undefined;
      o.karma = undefined;
      try {
        S.draw(ctx, clipOf(e, kind), o);
        return;
      } catch (err) {
        warnOnce('stickFailed', 'SR.render.actors: SR.art.stick.draw threw (' + err.message + '); placeholders from now on');
        warned.stickFailed = true;
      }
    }
    placeholderStick(ctx, e, kind, x, y, v);
  }

  // Traffic cars are rigid: while one drives along one of the 8 directions it is drawn from a
  // sprite cached per type, direction, lamp state and zoom (one drawImage instead of ~20 fills);
  // a car between directions (turning at a junction) and the player's car are drawn as vectors.
  var carSprites = {};
  var nCarSprites = 0;
  var carPx = 0;
  var SNAP = 0.035;              // radians (2°)
  var SPRITE_DPR_MAX = 1.5;

  function carSprite(V, type, dir, v, lamps, brake, phase) {
    var sc = v.bz * Math.min(v.s, SPRITE_DPR_MAX);
    var key = type + '|' + dir + '|' + (lamps ? 1 : 0) + (brake ? 1 : 0) + phase + '|' + Math.round(sc * 1000);
    var hit = carSprites[key];
    if (hit) return hit;
    if (nCarSprites >= 64) { carSprites = {}; nCarSprites = 0; carPx = 0; }
    var sz = V.size ? V.size(type) : null;
    var L0 = sz && sz.L ? sz.L : 110, W0 = sz && sz.W ? sz.W : 56, H0 = sz && sz.H ? sz.H : 50;
    var half = Math.max(L0, W0) / 2 + 14, up = half + H0 * 0.5 + 16, down = half + 12;
    var c = document.createElement('canvas');
    c.width = Math.ceil(2 * half * sc); c.height = Math.ceil((up + down) * sc);
    var x = c.getContext('2d');
    x.setTransform(sc, 0, 0, sc, half * sc, up * sc);
    var o = { t: phase * 0.5 + 0.01, brake: brake, lights: lamps, shadow: true };
    V.draw(x, type, dir, 0, 0, o);
    hit = carSprites[key] = { canvas: c, ax: half, ay: up, w: 2 * half, h: up + down, px: c.width * c.height };
    nCarSprites++;
    carPx += hit.px;
    return hit;
  }

  function drawCar(ctx, e, kind, x, y, v) {
    var V = SR.art.vehicles;
    var type = e.kind && typeof e.kind === 'string' && e.kind !== 'player' ? e.kind : e.car || (kind === 'player' ? 'junker' : 'sedan');
    var ang = num(e.a) ? e.a : num(e.angle) ? e.angle : 0;
    if (V && typeof V.draw === 'function' && !warned.carFailed) {
      var dir = V.dirFromAngle ? V.dirFromAngle(ang) : 0;
      var brake = !!(e.braking || e.brake), lamps = v.light > 0.2;
      try {
        var snapped = Math.abs(((ang - dir * Math.PI / 4) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) < SNAP;
        if (kind !== 'player' && snapped) {
          var phase = type === 'police' && !L().flashReduction() ? Math.floor(v.t * 2) % 2 : 0;
          var sp = carSprite(V, type, dir, v, lamps, brake, phase);
          ctx.drawImage(sp.canvas, x - sp.ax, y - sp.ay, sp.w, sp.h);
          L().count.images++;
          return;
        }
        var o = carOpts;
        o.angle = ang; o.t = v.t; o.brake = brake; o.lights = lamps;
        o.driver = kind === 'player' ? true : undefined;
        V.draw(ctx, type, dir, x, y, o);
        return;
      } catch (err) {
        warnOnce('carFailed', 'SR.render.actors: SR.art.vehicles.draw threw (' + err.message + '); placeholders from now on');
        warned.carFailed = true;
      }
    }
    placeholderCar(ctx, type, ang, x, y);
  }

  // Placeholders (W1-A's rig and vehicles replace them): a 52 u standee and a 96 × 52 box.
  function placeholderStick(ctx, e, kind, x, y, v) {
    var pal = L().pal;
    var ink = pal('ink', 0.1);
    var head = kind === 'player' ? karmaHead() : pal(['npc.' + npcHead(e), 'npc.grey', 'stone'], 0.7);
    var t = v.t + (num(e.phase) ? e.phase : 0);
    var swing = moving(e) ? Math.sin(t * Math.PI * 4) * 6 : 0;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.ellipse(x + 4, y + 3, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - swing, y); ctx.lineTo(x, y - 22); ctx.lineTo(x + swing, y);
    ctx.moveTo(x, y - 22); ctx.lineTo(x, y - 40);
    ctx.moveTo(x - 9 + swing * 0.5, y - 28); ctx.lineTo(x, y - 38); ctx.lineTo(x + 9 - swing * 0.5, y - 28);
    ctx.stroke();
    ctx.fillStyle = head;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y - 47, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    L().count.fills += 2;
  }

  function npcHead(e) {
    var names = ['sage', 'mustard', 'sand', 'grey', 'mint', 'olive', 'peach', 'clay', 'moss', 'stone', 'butter', 'taupe'];
    var n = num(e.n) ? e.n : Math.floor(L().hash01(String(e.id)) * names.length);
    return names[((n % names.length) + names.length) % names.length];
  }

  function karmaHead() {
    var S = SR.art.stick;
    var k = SR.state && SR.state.stats && num(SR.state.stats.karma) ? SR.state.stats.karma : 0;
    if (S && typeof S.karmaColor === 'function') {
      try { var c = S.karmaColor(k); if (typeof c === 'string') return c; } catch (e) { /* fall through */ }
    }
    // BALANCE B-04c: band i = clamp(ceil(|karma| / 10) - 1, 0, 9).
    var i = Math.max(0, Math.min(9, Math.ceil(Math.abs(k) / 10) - 1));
    return L().pal((k < 0 ? 'karma.evil.' : 'karma.good.') + i, 0.4);
  }

  function placeholderCar(ctx, type, ang, x, y) {
    var pal = L().pal;
    var body = pal(['car.' + type, 'car.sedan', 'stone'], 0.6);
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = pal('ink', 0.1);
    ctx.beginPath(); ctx.ellipse(4, 4, 50, 28, ang, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.translate(0, -10);
    ctx.rotate(ang);
    ctx.fillStyle = L().tone(body, -1);
    ctx.fillRect(-48, -26, 96, 52);
    ctx.fillStyle = body;
    ctx.fillRect(-48, -26, 96, 44);
    ctx.fillStyle = pal(['car.glass', 'glass'], 0.8);
    ctx.fillRect(4, -20, 20, 34);
    ctx.strokeStyle = pal('ink', 0.1);
    ctx.lineWidth = 2;
    ctx.strokeRect(-48, -26, 96, 52);
    ctx.restore();
    L().count.fills += 4;
  }

  /** @returns {number[][]} this frame's focus rects for the occlusion fade: the player, named people and markers (standee boxes). */
  function focus(v) {
    var out = frameFocus.slice();
    var mk = listOf(SR.world && SR.world.markers, ['list', 'markers']);
    if (mk) mk.forEach(function (e) { if (alive(e)) out.push([e.x - 12, e.y - STANDEE_H - 30, e.x + 12, e.y]); });
    return out;
  }

  /** @returns {{x: number, y: number}|null} the player's feet. */
  function playerPos() {
    var p = player || playerEntity();
    return p && num(p.x) && num(p.y) ? { x: p.x, y: p.y } : null;
  }

  /** @returns {object[]} the cars drawn this frame (headlights). */
  function cars() { return frameCars; }

  /** Adds this frame's actor boxes to a Path2D (the grade covers them where they rise into the sky). */
  function gradeRects(v, path) {
    for (var i = 0; i < frameBoxes.length; i += 4) path.rect(frameBoxes[i], frameBoxes[i + 1], frameBoxes[i + 2] - frameBoxes[i], frameBoxes[i + 3] - frameBoxes[i + 1]);
  }

  SR.render.actors = {
    source: source,
    collect: collect,
    draw: draw,
    focus: focus,
    playerPos: playerPos,
    player: function () { return player || playerEntity(); },
    cars: cars,
    gradeRects: gradeRects,
    facing: facing,
    /** @returns {{count: number, px: number}} the car sprite cache (device px). */
    stats: function () { return { count: nCarSprites, px: carPx }; },
  };
})();
