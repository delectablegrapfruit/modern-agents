// The city map scene (root frames 2-4): the walk clip (sprite 720) walking, skating and driving,
// the two cars on the main road, falling off the paper-thin edges, the knock-down pause (root
// frame 3), clicking street people, and the HUD's inventory / stats panels (root frames 5-6).
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var MAP = SRPG.MAP;
  var rnd = SRPG.rng.random;

  var KNOCKDOWN = 40; // root frame 3 counts fcount up to 40, then goes back to frame 2
  var CAR_SPEED = 6;
  var CAR_GONE = 33; // the car clip's last frame ("carNs = 500; stop"); nothing shows from frame 27
  var CAR2_RESET = 32; // person clip 328 -> 360 ("car2s = 500"), see fall()

  var st = {
    stun: 0, // knock-down ticks left (root frame 3: 40 - fcount); 0 = walking
    stunKind: null, // 'fall' | 'hit' | 'crash'
    walkFrame: 1, // the walk clip's frame that runs next (1: keys + doors, 2: walk again)
    move: { xmove: 0, ymove: 0, walkspeed: 1, moving: false, step: 0 }, // frame 1's, reused by frame 2
    walkPhase: 0,
    stepcount: 0,
    moving: false,
    car2At: 0, // engine frame at which the person clip reaches its frame 360 (0 = not due)
    panel: null, // open overlay panel element (inventory / stats) — the map stops under it
    game: null, // the state the cars belong to (a new game or a load starts them over)
    staticCanvas: null,
    staticKey: '',
  };

  // --- traffic -----------------------------------------------------------------------------
  // car1 and car2. s is the original's carNs: 0 = driving down, 1 = driving up, 2 = rolling off the
  // end of the road (its clip plays frames 2-33 and the last one sets 500), > 2 = count-down to the
  // next car (every walk frame 1: s - 1, and a new car when random(s) <= 2). clip is the car clip's
  // frame (1 = the car, 2-33 its roll off the edge); sx, sy its stage position as last set, which
  // is what the collision test reads. A new car is the one yellow car recoloured with Flash's
  // colour transform: blue x150%, red or green cut by random(100)%. car2 is placed with blue x150%.
  var DEFAULT_TINT = [null, { r: 100, g: 100, b: 150 }];
  var cars = [newCar(0), newCar(1)];
  function newCar(i) {
    return { s: 3, x: 0, y: 0, rot: 0, tint: DEFAULT_TINT[i], clip: 1, sx: null, sy: null, placed: false };
  }
  function resetCar(c, i) {
    var n = newCar(i);
    for (var k in n) c[k] = n[k];
  }

  // The car clips play their own timelines (frame 1 has a stop): the roll off the edge.
  function carClips() {
    cars.forEach(function (c) {
      if (c.clip > 1 && c.clip < CAR_GONE) {
        c.clip++;
        if (c.clip === CAR_GONE) c.s = 500;
      }
    });
  }
  // Moving cars drive on; past either end of the road they roll off (clip gotoAndPlay(2)).
  function moveCars() {
    cars.forEach(function (c) {
      if (c.s < 2) {
        if (c.s === 0) c.y += CAR_SPEED;
        if (c.s === 1) c.y -= CAR_SPEED;
        if (c.y < -885 || c.y > 950) { c.s = 2; c.clip = 2; }
      }
    });
  }
  // Walk frame 1 only: the count-down and a new car.
  function spawnCars() {
    cars.forEach(function (c) {
      if (c.s > 2) {
        c.s -= 1;
        if (!(rnd(c.s) > 2)) {
          var tran = rnd(100), t1 = rnd(2);
          c.tint = { r: 100 - t1 * tran, g: 100 - (1 - t1) * tran, b: 150 };
          if (rnd(2) === 0) { c.rot = 0; c.s = 1; c.x = MAP.lanes.up; c.y = MAP.lanes.yStart; }
          else { c.rot = 180; c.s = 0; c.x = MAP.lanes.down; c.y = MAP.lanes.yEnd; }
          c.clip = 1;
          c.placed = true;
        }
      }
    });
  }
  // carN._x / _y = carNx + mapx / carNy + mapy, at the end of every walk and knock-down frame.
  function placeCars(s) {
    cars.forEach(function (c) {
      if (!c.placed) return;
      c.sx = c.x + s.mapx;
      c.sy = c.y + s.mapy;
    });
  }
  // Walk frame 2's test, against where the cars were last put (whatever their state).
  function carHits() {
    var px = MAP.PERSON_X, py = MAP.PERSON_Y;
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      if (c.sx === null) continue;
      if (px > c.sx - 35 && px < c.sx + 30 && py > c.sy - 52 && py < c.sy + 55) return true;
    }
    return false;
  }

  // --- helpers ------------------------------------------------------------------------------
  function S() { return SRPG.game.s; }

  // Arrow keys or W A S D (the walk clip's kUp 87, kLeft 65, kDown 83, kRight 68); Shift skates.
  function input() {
    var k = SRPG.engine.keys;
    return {
      left: !!(k.ArrowLeft || k.a),
      right: !!(k.ArrowRight || k.d),
      up: !!(k.ArrowUp || k.w),
      down: !!(k.ArrowDown || k.s),
      shift: !!k.Shift,
    };
  }

  var HIT_MESSAGES = [
    "Hi there! This is 'You-Hit-We-Sue' Personal Injury Lawyers. Word is a car flattened you not " +
      "long ago, and we'd like you to know we've got your back. Give us a ring!",
    "Hello, 'Cash for Skid Marks' Incorporated calling. We'd love to chat about the tire tracks " +
      "you picked up in your recent close encounter with a vehicle. Speak soon!",
    "Hi, it's Debbie at StickNews. Someone sold me eyewitness video of that hit-and-run you were " +
      "part of. You won't mind if we put it on the air, right? Toodles!",
  ];

  // Falling off the edge: person clip frame 185 (the fall sound). Driving, the clip goes to 328
  // instead, and plays on to frame 360, which sets car2s = 500 (a leftover from the car clip):
  // 32 ticks later the second car stops where it is.
  function fall(s) {
    SRPG.sound.play('fall');
    st.stunKind = 'fall';
    st.car2At = s.driving === 1 ? SRPG.engine.frame + CAR2_RESET : 0;
  }
  // Hit by a car (person clip 230: a random lawyer / reporter message) or, driving, a crash (361).
  function hitByCar(s) {
    st.move.xmove = 0;
    st.move.ymove = 0;
    s.hp -= 10;
    st.car2At = 0;
    if (s.driving === 0) {
      st.stunKind = 'hit';
      SRPG.sound.play('carhit');
      SRPG.game.pushMsg(HIT_MESSAGES[rnd(3)]);
    } else {
      st.stunKind = 'crash';
      SRPG.sound.play('crash');
    }
  }

  // One frame of the walk clip. Its script runs to the end; the root timeline's last goto (a door
  // or root frame 3) then takes effect.
  function walkClip(s) {
    var frame = st.walkFrame;
    st.walkFrame = frame === 1 ? 2 : 1;
    var knocked = false;
    if (frame === 1) {
      var m = MAP.readKeys(s, input());
      st.move = m;
      st.moving = m.moving; // the walk animation follows the keys held, even against a wall
      if (m.moving) {
        st.walkPhase += 0.35 * m.walkspeed;
        st.stepcount += m.step;
        if (st.stepcount >= 12) {
          st.stepcount = 0;
          if (m.walkspeed === 1) SRPG.sound.play('footstep');
          if (m.walkspeed === 2) SRPG.sound.play('skate');
        }
      }
    }
    var r = MAP.walkLoop(s, st.move, frame === 1);
    if (r.falls) {
      s.hp -= 10 * r.falls;
      fall(s);
      knocked = true;
    }
    moveCars();
    if (frame === 1) spawnCars();
    else if (carHits()) {
      hitByCar(s);
      knocked = true;
    }
    placeCars(s);
    if (r.event && r.event.door) { enterLocation(r.event.door); return; } // a door after a fall wins
    if (knocked) {
      st.stun = KNOCKDOWN;
      knockdownFrame(s); // root frame 3's script runs in the same tick: fcount = 1
    }
  }

  // Root frame 3 (looped by frame 4): fcount + 1, the moving cars drive on (no new ones), and at 40
  // back to frame 2, where a new walk clip starts at its frame 1 straight away.
  function knockdownFrame(s) {
    st.stun--;
    moveCars();
    placeCars(s);
    if (st.stun === 0) {
      arrive(s, false);
      walkClip(s);
    }
  }

  // Root frame 2 is entered: its script (nomination check, stat caps) and a new walk clip.
  // rebuild: coming back from a screen without the map (a building, a new game, a load), so the
  // person and car clips are new too: the person faces up, the cars show their frame 1 (even one
  // that was rolling off the edge, which then stays put for good) with their placement colours.
  function arrive(s, rebuild) {
    SRPG.game.onEnterCity();
    st.stun = 0;
    st.walkFrame = 1;
    st.moving = false;
    st.car2At = 0; // person.gotoAndPlay(20)
    if (rebuild) {
      s.rot = 0;
      cars.forEach(function (c, i) {
        c.clip = 1;
        c.rot = 0;
        c.tint = DEFAULT_TINT[i];
      });
    }
  }

  function enterLocation(id) {
    SRPG.engine.releaseAll();
    SRPG.location.open(id);
  }

  // Which street person (or the parked car) a click at stage point (x, y) lands on.
  function npcAt(s, x, y) {
    var mx = x - s.mapx, my = y - s.mapy;
    if (s.packNumber < 10 && MAP.npcHitTest('smokes', mx, my)) return 'smokes';
    if (s.items.car === 0 && MAP.npcHitTest('parkedcar', mx, my)) return 'parkedcar';
    if (MAP.npcHitTest('dealer', mx, my)) return 'dealer';
    if (MAP.npcHitTest('hobo', mx, my)) return 'hobo';
    return null;
  }

  // The dealer's own 87-frame clip: he walks 29 px north, waits, walks back and waits again.
  function dealerPos() {
    var d = MAP.npcs.dealer;
    var f = SRPG.engine.frame % 87;
    var dy = f < 24 ? (-29 * f) / 24 : f < 44 ? -29 : f < 64 ? -29 + (29 * (f - 44)) / 20 : 0;
    return { x: d.x, y: d.y + dy, walking: f < 24 || (f >= 44 && f < 64), rot: f < 44 ? 0 : 180 };
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

    // params.fade: true (the black clip from frame 1, as when getting into the car) or 19 (from
    // frame 11: the arrival after the intro or a load, which also starts the city music whether
    // or not music is switched on). Coming back from a building there is no fade.
    // params.rebuild: the map was gone (a building): new person and car clips.
    enter: function (params) {
      var s = S();
      var fresh = st.game !== s; // a new game or a load: root frame 1's variables start over
      if (fresh) {
        st.game = s;
        cars.forEach(resetCar);
        st.stepcount = 0;
        st.walkPhase = 0;
        st.car2At = 0;
      }
      // the person clip reached frame 360 while a street dialog was up (dialogTick normally lands
      // it on time; this catches a dialog opened some other way)
      if (!fresh && !params.rebuild && st.car2At && SRPG.engine.frame >= st.car2At) cars[1].s = 500;
      st.panel = null;
      st.stunKind = null;
      arrive(s, fresh || !!params.rebuild);
      var arrival = typeof params.fade === 'number' && params.fade > 10;
      if (arrival) SRPG.engine.blackPlay(11);
      else if (params.fade === true || params.fade > 0) SRPG.engine.blackPlay(1);
      SRPG.sound.music('main', arrival);
      SRPG.ui.clear();
    },

    tick: function () {
      var s = S();
      if (!s || s.over) return;
      if (s.hp <= 0) { SRPG.game.die(); return; } // the HP bar sends you to YOU DIED
      carClips(); // the car and person clips play on under the panels too
      if (st.car2At && SRPG.engine.frame >= st.car2At) { cars[1].s = 500; st.car2At = 0; }
      if (st.panel) { if (st.panel.tick) st.panel.tick(); return; }
      if (SRPG.ui.modalOpen) return;
      if (st.stun > 0) knockdownFrame(s);
      else walkClip(s);
    },

    // 'c' (the walk clip's key handler, so not while knocked down or in a panel): getting in plays
    // the ignition and the black fade; getting out is silent.
    // I / Esc are this version's shortcuts for the two HUD buttons (the original has none), so they
    // work only when the buttons are there; Esc also closes a panel, like its X.
    onKey: function (k) {
      var s = S();
      if (!s || s.over) return;
      if (st.panel) {
        if (k === 'Escape') { city.closePanel(); arrive(s, false); }
        return;
      }
      if (st.stun > 0) return;
      if (k === 'i') { city.openPanel('inventory'); return; }
      if (k === 'Escape') { city.openPanel('stats'); return; }
      if (k === 'c' && (s.items.car === 1 || s.items.car === 2)) {
        if (s.driving === 0) {
          SRPG.sound.play('ignition');
          SRPG.engine.blackPlay(1);
          s.driving = 1;
        } else if (s.driving === 1) s.driving = 0;
      }
    },

    // The HUD buttons are not on root frames 3, 5 and 6 (SRPG.hud.hit is null while knocked down
    // or with a panel up), but the street people are buttons on the map itself, so they can be
    // clicked even then (a panel open at the time goes away with its root frame).
    onClick: function (x, y) {
      var s = S();
      if (!s || SRPG.ui.modalOpen || s.over) return;
      var h = SRPG.hud.hit(x, y);
      if (h && !st.panel) { city.openPanel(h); return; }
      var who = npcAt(s, x, y);
      if (!who) return;
      if (st.panel) city.closePanel();
      enterLocation(who);
    },

    // Root frames 5 / 6. Closing one goes back to root frame 2 (its script, a new walk clip).
    openPanel: function (which) {
      if (st.panel) return;
      SRPG.engine.releaseAll();
      st.panel = SRPG.panels[which](function () {
        st.panel = null;
        var s = S();
        if (s && !s.over && SRPG.engine.sceneName === 'city') arrive(s, false);
      });
    },
    closePanel: function () {
      if (st.panel && st.panel.close) st.panel.close();
      st.panel = null;
    },

    // Root frames 7-10: a street dialog over the map. The walk clip is gone (no walking, no traffic
    // moving or counting down), but the car clips and the person clip play on under it, so a roll
    // off the road finishes and a car2s = 500 from the person clip lands. location.js calls this
    // every tick while a street dialog is up.
    dialogTick: function () {
      carClips();
      if (st.car2At && SRPG.engine.frame >= st.car2At) { cars[1].s = 500; st.car2At = 0; }
    },

    // Take the cars off the road, as if they had just rolled off its ends (they count down to new
    // ones). For tests and screenshots.
    clearTraffic: function () {
      cars.forEach(function (c) {
        c.s = 500;
        c.clip = CAR_GONE;
        c.placed = false;
        c.sx = c.sy = null;
      });
    },

    render: function (ctx) {
      var s = S();
      if (!s) return;
      city.renderWorld(ctx);
      SRPG.hud.draw(ctx, s, 'map');
      SRPG.engine.drawBlack(ctx);
    },

    // Sky, map, street people, player and cars (no HUD) — also used under street dialogs.
    renderWorld: function (ctx) {
      var s = S();
      var H = SRPG.H;
      SRPG.mapArt.drawSky(ctx, s, SRPG.engine.frame);
      var B = SRPG.mapArt.BOUNDS;
      ctx.drawImage(staticLayer(s), s.mapx + B.x, s.mapy + B.y, B.w, B.h);
      if (SRPG.mapArt.drawAnimated) SRPG.mapArt.drawAnimated(ctx, s, SRPG.engine.frame);

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
      sp.npc(ctx, q3.x, q3.y, { color: MAP.npcs.dealer.color, rot: dp.rot, phase: dp.walking ? t : 0, kind: 'dealer' });

      // the player (drawn below the cars, as in the original)
      var mode = s.driving === 1 ? (s.items.car === 2 ? 'sportscar' : 'car') : (SRPG.engine.keys.Shift && s.items.skateboard === 1 ? 'skate' : 'walk');
      var anim = null, prog = 0;
      if (st.stun > 0) {
        anim = st.stunKind;
        prog = (KNOCKDOWN - 1 - st.stun) / KNOCKDOWN;
      }
      sp.player(ctx, MAP.PLAYER_X, MAP.PLAYER_Y, {
        rot: s.rot, color: SRPG.game.personColor(s.karma), phase: st.moving ? st.walkPhase : null,
        mode: mode, anim: anim, t: prog,
      });

      cars.forEach(function (c) {
        if (!c.placed || c.clip >= CAR_GONE) return;
        var q = MAP.toStage(s, c.x, c.y);
        if (q.y < -80 || q.y > H + 80) return;
        sp.car(ctx, q.x, q.y, { rot: c.rot, tint: c.tint, fall: c.clip - 1 });
      });
    },
  };

  SRPG.city = city;
  SRPG.registerScreen('city', city);
})();
