// The city map scene: walking/skating/driving, the two cars on the main road, falling off the
// paper-thin edges, clicking street people, and the HUD's inventory/stats buttons.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var MAP = SRPG.MAP;
  var rnd = SRPG.rng.random;

  var STUN_TICKS = 40; // the original's knock-down pause after a fall or a car hit
  var CAR_SPEED = 6;

  var st = {
    stun: 0, // ticks of lying on the ground / falling left
    stunKind: null, // 'fall' | 'hit' | 'crash' | 'wake'
    walkPhase: 0,
    stepcount: 0,
    moving: false,
    dealerX: 0,
    dealerDir: 1,
    dealerPause: 0,
    fade: 0,
    panel: null, // open overlay panel element (inventory / stats) — freezes the map
    staticCanvas: null,
    staticKey: '',
  };

  // --- traffic -----------------------------------------------------------------------------
  // Each car: s (state) 0 = driving down, 1 = driving up, 2 = just left the screen, >2 = count-
  // down to the next car (random(s) <= 2 spawns). Same numbers as the original.
  var cars = [newCar(), newCar()];
  function newCar() { return { s: 3, x: 0, y: 0, rot: 0, color: '#ff8800', wait: 0 }; }
  var CAR_COLORS = ['#ff8800', '#ffd000', '#66dd22', '#22ccff', '#ff3355', '#bb66ff', '#ff66cc', '#eeeeee'];

  function tickCar(c) {
    if (c.s < 2) {
      if (c.s === 0) c.y += CAR_SPEED;
      if (c.s === 1) c.y -= CAR_SPEED;
      if (c.y < -885 || c.y > 950) { c.s = 2; c.wait = 32; }
    } else if (c.s === 2) {
      if (--c.wait <= 0) c.s = 500;
    } else if (c.s > 2) {
      c.s -= 1;
      if (!(rnd(c.s) > 2)) {
        c.color = SRPG.rng.pick(CAR_COLORS);
        if (rnd(2) === 0) { c.rot = 0; c.s = 1; c.x = MAP.lanes.up; c.y = MAP.lanes.yStart; }
        else { c.rot = 180; c.s = 0; c.x = MAP.lanes.down; c.y = MAP.lanes.yEnd; }
      }
    }
  }

  function carHits(s) {
    var p = MAP.playerPos(s);
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      if (c.s > 1) continue;
      if (p.x > c.x - 35 && p.x < c.x + 30 && p.y > c.y - 52 && p.y < c.y + 55) return true;
    }
    return false;
  }

  // --- helpers ------------------------------------------------------------------------------
  function S() { return SRPG.game.s; }

  function input() {
    var k = SRPG.engine.keys;
    return {
      left: k.ArrowLeft || k.a,
      right: k.ArrowRight || k.d,
      up: k.ArrowUp || k.w,
      down: k.ArrowDown || k.s,
      shift: k.Shift,
    };
  }

  function knockDown(kind) {
    var s = S();
    st.stun = STUN_TICKS;
    st.stunKind = kind;
    SRPG.engine.releaseAll();
    if (kind === 'fall') SRPG.sound.play('fall');
    if (kind === 'hit') {
      SRPG.sound.play('carhit');
      var r = rnd(3);
      SRPG.game.pushMsg([
        "Hi! I'm calling from 'You-Hit-We-Sue' Personal Injury Lawyers. We heard you were recently run " +
          "over, and we just want you to know we're here for you. Call us!",
        "Hello, this is 'Cash for Skid Marks' Incorporated. We'd love to talk about the tire marks you " +
          "picked up in your recent run-in with a vehicle. Talk soon!",
        "Hi, it's Debbie from StickNews. We got our hands on eyewitness video of that hit-and-run you " +
          "were in. Hope you don't mind if we put it on the air. Toodles!",
      ][r]);
    }
    if (kind === 'crash') SRPG.sound.play('crash');
    s.hp -= kind === 'wake' ? 0 : 10;
  }

  function enter(id) {
    SRPG.engine.releaseAll();
    var def = SRPG.locations[id];
    if (!(def && def.overlay)) SRPG.sound.play('door'); // street people are clicked silently
    SRPG.location.open(id);
  }

  function dealerPos() {
    var d = MAP.npcs.dealer;
    return { x: d.x + st.dealerX, y: d.y };
  }

  function npcAt(s, x, y) {
    // x, y in stage coordinates.
    var hits = [];
    if (s.packNumber < 10) hits.push({ id: 'smokes', p: MAP.npcs.smokes });
    hits.push({ id: 'hobo', p: MAP.npcs.hobo });
    hits.push({ id: 'dealer', p: dealerPos() });
    for (var i = 0; i < hits.length; i++) {
      var q = MAP.toStage(s, hits[i].p.x, hits[i].p.y);
      if (Math.abs(q.x - x) < 14 && Math.abs(q.y - y) < 14) return hits[i].id;
    }
    if (s.items.car === 0) {
      var pc = MAP.parkedCar;
      var a = MAP.toStage(s, pc.x, pc.y);
      if (x >= a.x && x <= a.x + pc.w && y >= a.y && y <= a.y + pc.h) return 'parkedcar';
    }
    return null;
  }

  // Pre-render the static city (ground, roads, buildings) once; redraw when what's shown changes.
  // Rendered at the screen's pixel scale (capped at 2 to bound memory) so the map stays sharp.
  function staticLayer(s) {
    var k = Math.min(2, SRPG.engine.pixelScale || 1);
    var key = [s.dwelling, s.items.car === 0 ? 1 : 0, k].join('|');
    if (st.staticCanvas && st.staticKey === key) return st.staticCanvas;
    var B = SRPG.mapArt.BOUNDS;
    var c = st.staticCanvas || document.createElement('canvas');
    c.width = Math.ceil(B.w * k);
    c.height = Math.ceil(B.h * k);
    var cx = c.getContext('2d');
    cx.clearRect(0, 0, c.width, c.height);
    cx.save();
    cx.scale(k, k);
    cx.translate(-B.x, -B.y);
    SRPG.mapArt.drawStatic(cx, s);
    cx.restore();
    st.staticCanvas = c;
    st.staticKey = key;
    return c;
  }

  // --- scene --------------------------------------------------------------------------------
  var city = {
    cars: cars, // exposed for tests
    st: st,

    enter: function (params) {
      var s = S();
      SRPG.game.onEnterCity();
      st.panel = null;
      st.fade = params.fade === false ? 0 : 10;
      if (params.wake) knockDown('wake');
      SRPG.sound.music('main');
      SRPG.ui.clear();
    },

    tick: function () {
      var s = S();
      if (!s || s.over) return;
      if (s.hp <= 0) { SRPG.game.die(); return; }
      if (st.fade > 0) st.fade--;
      if (st.panel || SRPG.ui.modalOpen) return; // the original stops the whole map for panels

      // dealer paces up and down the alley
      if (st.dealerPause > 0) st.dealerPause--;
      else {
        st.dealerX += st.dealerDir * 1.2;
        var span = MAP.npcs.dealer.pace.x1 - MAP.npcs.dealer.pace.x0;
        if (st.dealerX > span || st.dealerX < 0) {
          st.dealerDir *= -1;
          st.dealerX = Math.max(0, Math.min(span, st.dealerX));
          st.dealerPause = 35 + rnd(70);
        }
      }

      cars.forEach(tickCar);

      if (st.stun > 0) {
        st.stun--;
        return;
      }

      var r = MAP.walk(s, input());
      st.moving = r.moved && r.dist > 0;
      if (st.moving) {
        st.walkPhase += 0.35 * r.speed;
        st.stepcount += r.step;
        if (st.stepcount >= 12) {
          st.stepcount = 0;
          if (s.driving !== 1) SRPG.sound.play(r.speed === 2 ? 'skate' : 'footstep');
        }
      }
      if (r.event) {
        if (r.event.fall) { knockDown('fall'); return; }
        if (r.event.door) { enter(r.event.door); return; }
      }
      if (carHits(s)) knockDown(s.driving === 1 ? 'crash' : 'hit');
    },

    onKey: function (k) {
      var s = S();
      if (st.panel) { if (k === 'Escape') city.closePanel(); return; }
      if (k === 'c' && (s.items.car === 1 || s.items.car === 2) && st.stun === 0) {
        SRPG.sound.play('ignition');
        st.fade = 10;
        s.driving = s.driving === 1 ? 0 : 1;
      }
      if (k === 'i') city.openPanel('inventory');
      if (k === 'Escape') city.openPanel('stats');
    },

    onClick: function (x, y) {
      var s = S();
      if (st.panel || SRPG.ui.modalOpen || s.over) return;
      var h = SRPG.hud.hit(x, y);
      if (h) { city.openPanel(h); return; }
      if (st.stun > 0) return;
      var who = npcAt(s, x, y);
      if (who) enter(who);
    },

    openPanel: function (which) {
      if (st.panel) return;
      SRPG.engine.releaseAll();
      SRPG.sound.play('click');
      st.panel = SRPG.panels[which](function () { st.panel = null; });
    },
    closePanel: function () {
      if (st.panel && st.panel.close) st.panel.close();
      st.panel = null;
    },

    render: function (ctx) {
      var s = S();
      if (!s) return;
      city.renderWorld(ctx);
      SRPG.hud.draw(ctx, s, 'map');
      if (st.fade > 0) {
        ctx.fillStyle = 'rgba(0,0,0,' + st.fade / 10 + ')';
        ctx.fillRect(0, 0, SRPG.W, SRPG.H);
      }
    },

    // Sky, map, street people, player and cars (no HUD) — also used under street dialogs.
    renderWorld: function (ctx) {
      var s = S();
      var H = SRPG.H;
      SRPG.mapArt.drawSky(ctx, s, SRPG.engine.frame);
      var B = SRPG.mapArt.BOUNDS;
      ctx.drawImage(staticLayer(s), s.mapx + B.x, s.mapy + B.y, B.w, B.h);

      var t = SRPG.engine.frame;
      var sp = SRPG.sprites;
      // parked car on the lawn
      if (s.items.car === 0) {
        var pc = MAP.parkedCar;
        var pq = MAP.toStage(s, pc.x + pc.w / 2, pc.y + pc.h / 2);
        sp.car(ctx, pq.x, pq.y, { rot: 270, color: '#ffd000', parked: true });
      }
      // street people
      if (s.packNumber < 10) {
        var q1 = MAP.toStage(s, MAP.npcs.smokes.x, MAP.npcs.smokes.y);
        sp.npc(ctx, q1.x, q1.y, { color: MAP.npcs.smokes.color, rot: 180, phase: Math.sin(t / 20) * 0.3, kind: 'smokes' });
      }
      var q2 = MAP.toStage(s, MAP.npcs.hobo.x, MAP.npcs.hobo.y);
      sp.npc(ctx, q2.x, q2.y, { color: MAP.npcs.hobo.color, rot: 90, phase: 0, kind: 'hobo' });
      var dp = dealerPos();
      var q3 = MAP.toStage(s, dp.x, dp.y);
      sp.npc(ctx, q3.x, q3.y, { color: MAP.npcs.dealer.color, rot: st.dealerDir > 0 ? 90 : 270,
        phase: st.dealerPause > 0 ? 0 : t / 3, kind: 'dealer' });

      // the player (drawn below the cars, as in the original)
      var mode = s.driving === 1 ? (s.items.car === 2 ? 'sportscar' : 'car') : (SRPG.engine.keys.Shift && s.items.skateboard === 1 ? 'skate' : 'walk');
      var anim = null, prog = 0;
      if (st.stun > 0) {
        anim = st.stunKind;
        prog = 1 - st.stun / STUN_TICKS;
      }
      sp.player(ctx, MAP.PLAYER_X, MAP.PLAYER_Y, {
        rot: s.rot, color: SRPG.game.personColor(s.karma), phase: st.moving ? st.walkPhase : null,
        mode: mode, anim: anim, t: prog,
      });

      cars.forEach(function (c) {
        if (c.s > 1) return;
        var q = MAP.toStage(s, c.x, c.y);
        if (q.y < -80 || q.y > H + 80) return;
        sp.car(ctx, q.x, q.y, { rot: c.rot, color: c.color });
      });
    },
  };

  SRPG.city = city;
  SRPG.registerScreen('city', city);
})();
