// js/world/camera.js — owner: W1-W. SR.world.camera (GDD §3.7, B-15 camera): a critically damped
// spring (ω 8/s) toward a focus point that keeps the player inside a 96 × 64 dead zone plus a
// 0.25 s look-ahead capped at 140 u; three quantized zoom levels (0.8 / 1.0 / 1.25) with driving
// easing one level out; the centre clamped to the island's bounding box ± 480 u. The 3/4
// projection maps a world point (x, y, height z) to the stage: screenY = y - 0.5 z. Node-safe.
(function () {
  'use strict';
  var SR = window.SR;

  function cfg() { return SR.world.cfg || (SR.world.cfg = SR.world.readCfg()); }

  var C = {
    x: 0, y: 0, vx: 0, vy: 0,
    /** The focus the spring follows (the dead-zone anchor). */
    fx: 0, fy: 0,
    /** Current zoom (eased) and the chosen level index (0..2). */
    zoom: 1, level: 1,
    /** An override target { x, y } (the title's drift, a cutscene); null follows the player. */
    target: null,
    W: 1280, H: 720,
  };

  /** @returns {number[]} the camera centre's allowed box [x0, y0, x1, y1] (island bbox ± pad). */
  C.bounds = function () {
    var b = SR.world.geometry.bounds || [0, 0, 5120, 4608], pad = cfg().camPad;
    return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
  };

  function clampCentre() {
    var b = C.bounds();
    C.x = C.x < b[0] ? b[0] : C.x > b[2] ? b[2] : C.x;
    C.y = C.y < b[1] ? b[1] : C.y > b[3] ? b[3] : C.y;
  }

  function levelZoom() {
    var z = cfg().zooms || [0.8, 1, 1.25], p = SR.world.player;
    var lvl = Math.max(0, C.level - (p && p.car ? 1 : 0));
    return z[Math.min(z.length - 1, lvl)];
  }

  /** The point the camera wants: an override, the Fold Rescue's focus, or the player plus look-ahead. */
  function desired() {
    if (C.target) return { x: C.target.x, y: C.target.y, look: false };
    var f = SR.world.fall;
    if (f && f.active && f.active() && f.focus) { var q = f.focus(); return { x: q.x, y: q.y, look: false }; }
    var p = SR.world.player;
    return p ? { x: p.x, y: p.y, look: true } : { x: C.x, y: C.y, look: false };
  }

  /** Resets the camera onto a point (boot, new game). */
  C.reset = function (pt) {
    C.x = C.fx = pt ? pt.x : 0;
    C.y = C.fy = pt ? pt.y : 0;
    C.vx = C.vy = 0;
    C.zoom = levelZoom();
    clampCentre();
  };

  /** Jumps to the desired point with no spring (placing the player, loading a game). */
  C.snap = function (x, y) {
    var d = x === undefined ? desired() : { x: x, y: y };
    C.x = C.fx = d.x; C.y = C.fy = d.y; C.vx = C.vy = 0;
    C.zoom = levelZoom();
    clampCentre();
  };

  /** Advances the spring by dt seconds. */
  C.update = function (dt) {
    var c = cfg(), d = desired(), tx = d.x, ty = d.y;
    if (d.look) {
      var p = SR.world.player, lx = p.vx * c.camLook, ly = p.vy * c.camLook, l = Math.sqrt(lx * lx + ly * ly);
      if (l > c.camLookMax) { lx *= c.camLookMax / l; ly *= c.camLookMax / l; }
      tx += lx; ty += ly;
      // Dead zone: the focus only moves when the wanted point leaves the 96 × 64 box around it.
      var hw = c.camDeadW / 2, hh = c.camDeadH / 2;
      if (tx > C.fx + hw) C.fx = tx - hw; else if (tx < C.fx - hw) C.fx = tx + hw;
      if (ty > C.fy + hh) C.fy = ty - hh; else if (ty < C.fy - hh) C.fy = ty + hh;
    } else {
      C.fx = tx; C.fy = ty;
    }
    // Critically damped spring: a = ω² (target - x) - 2ω v (semi-implicit Euler).
    var w = c.camOmega;
    C.vx += (w * w * (C.fx - C.x) - 2 * w * C.vx) * dt;
    C.vy += (w * w * (C.fy - C.y) - 2 * w * C.vy) * dt;
    C.x += C.vx * dt;
    C.y += C.vy * dt;
    clampCentre();
    // Zoom eases toward its level (driving: one level out) over about driveZoomEase seconds.
    var zt = levelZoom(), k = Math.min(1, dt * 5 / Math.max(0.05, c.driveZoomEase));
    C.zoom += (zt - C.zoom) * k;
    if (Math.abs(zt - C.zoom) < 1e-4) C.zoom = zt;
  };

  /** Chooses a zoom level (0: 0.8, 1: 1.0, 2: 1.25). */
  C.setLevel = function (i) { C.level = Math.max(0, Math.min(2, i | 0)); return C.level; };
  /** One level in (max 1.25). @returns {number} the level */
  C.zoomIn = function () { return C.setLevel(C.level + 1); };
  /** One level out (min 0.8). @returns {number} the level */
  C.zoomOut = function () { return C.setLevel(C.level - 1); };
  /** The gamepad's RS click: 0 → 1 → 2 → 0. @returns {number} the level */
  C.cycle = function () { return C.setLevel((C.level + 1) % 3); };

  /** @returns {number[]} the visible ground rect [x0, y0, x1, y1] in world units. */
  C.view = function () {
    var hw = C.W / 2 / C.zoom, hh = C.H / 2 / C.zoom;
    return [C.x - hw, C.y - hh, C.x + hw, C.y + hh];
  };

  /**
   * World point (x, y, height z) → stage point (logical px), with the 3/4 projection.
   * @returns {{x: number, y: number}}
   */
  C.toScreen = function (x, y, z) {
    return { x: (x - C.x) * C.zoom + C.W / 2, y: (y - (z || 0) * cfg().projection - C.y) * C.zoom + C.H / 2 };
  };

  /** Stage point (logical px) → ground point (z = 0). @returns {{x: number, y: number}} */
  C.toWorld = function (sx, sy) {
    return { x: (sx - C.W / 2) / C.zoom + C.x, y: (sy - C.H / 2) / C.zoom + C.y };
  };

  SR.world.camera = C;
})();
