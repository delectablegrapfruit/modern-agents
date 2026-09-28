// The city of the 2nd Dimension: geometry and the walking rules.
//
// Coordinates. The original scrolls the map instead of the player: the map is drawn offset by
// (mapx, mapy) and the player always stands at stage point PLAYER_X, PLAYER_Y. A map point (X, Y)
// appears on the stage at (mapx + X, mapy + Y), so the player's own map position is
// (PLAYER_X - mapx, PLAYER_Y - mapy). All geometry below is in map coordinates, measured from the
// original's map; walking uses the original's mapx/mapy limits verbatim.
(function () {
  'use strict';
  var SRPG = window.SRPG;

  var MAP = (SRPG.MAP = {
    PLAYER_X: 247,
    PLAYER_Y: 197,

    // Outline of the paper-thin ground; everything outside is sky. The bus lot (between the
    // parked bus and the depot) is a hole in the ground.
    ground: [
      [-1040, -760], [-574, -760], [-574, -824], [437, -824], [437, -331], [918, -331], [918, 410],
      [442, 410], [442, 898], [-457, 898], [-457, -21], [-1040, -21],
    ],
    holes: [{ x: 519.5, y: 224, w: 73.5, h: 186 }],
    // Thickness of the ground shown along the west and south edges (dirt / rock), in map px.
    edge: 22,

    // Roads: asphalt rectangles, sidewalks either side, yellow centre dashes.
    roads: {
      vertical: { asphalt: { x: -126, y: -824, w: 181, h: 1722 }, sidewalkL: { x: -211, w: 85 }, sidewalkR: { x: 55, w: 86 }, center: -35 },
      west: { asphalt: { x: -995, y: -488, w: 784, h: 192 }, sidewalkT: { y: -568, h: 80 }, sidewalkB: { y: -296, h: 79 }, center: -394 },
      east: { asphalt: { x: 141, y: -56, w: 777, h: 189 }, sidewalkT: { y: -136, h: 80 }, sidewalkB: { y: 133, h: 80 }, center: 37 },
    },
    dash: { len: 54, period: 112, width: 13 },

    // Building footprints (map px, including the visible side walls) and where their doors are.
    // face: which side the door is on. These drive the map art; entering uses DOORS below.
    buildings: {
      apartment: { x: -976, y: -760, w: 398, h: 128, door: { x: -816, y: -665, w: 70, h: 61 }, face: 'south', name: 'Apartment' },
      castle: { x: -574, y: -948, w: 360, h: 311, face: 'east', name: 'Castle', dwelling: 5 },
      mansion: { x: -407, y: -813, w: 196, h: 193, door: { x: -228, y: -728, w: 17, h: 42 }, face: 'east', name: 'Mansion', dwelling: 4 },
      bank: { x: 141, y: -827, w: 296, h: 333, door: { x: 141, y: -620, w: 30, h: 71 }, face: 'west', name: 'Bank' },
      nli: { x: 141, y: -582, w: 299, h: 415, door: { x: 141, y: -384, w: 35, h: 104 }, face: 'west', name: 'New Lines Incorporated' },
      uofs: { x: 418, y: -331, w: 497, h: 169, door: { x: 643, y: -186, w: 39, h: 24 }, face: 'south', name: 'U of S' },
      furniture: { x: -960, y: -192, w: 394, h: 171, door: { x: -690, y: -217, w: 60, h: 25 }, face: 'north', name: 'Fine Line Furnishings' },
      mcsticks: { x: -566, y: -213, w: 352, h: 236, door: { x: -214, y: -149, w: 5, h: 44 }, face: 'east', name: 'McSticks' },
      bar: { x: -457, y: 40, w: 193, h: 352, door: { x: -264, y: 92, w: 55, h: 49 }, face: 'east', name: "Sticky's Liquor" },
      casino: { x: -457, y: 496, w: 223, h: 352, door: { x: -280, y: 656, w: 71, h: 60 }, face: 'east', name: 'Silver Lining Casino' },
      store: { x: 141, y: 216, w: 316, h: 341, door: { x: 141, y: 315, w: 35, h: 121 }, face: 'west', name: 'Funkytown Five-O' },
      pawn: { x: 141, y: 579, w: 301, h: 313, door: { x: 141, y: 650, w: 35, h: 77 }, face: 'west', name: 'Pawn Shop' },
      bus: { x: 611, y: 216, w: 319, h: 194, door: { x: 744, y: 213, w: 41, h: 12 }, face: 'north', name: 'Bus Depot', bus: { x: 482, y: 221, w: 41, h: 189 } },
    },
    trees: [
      { x: -330, y: -681, w: 82, h: 77 }, // the mansion's own grove (drawn only with dwelling 4)
      { x: 160, y: -874, w: 110, h: 94 }, // on the bank's lawn, leaning out over the north edge
      { x: 369, y: -261, w: 110, h: 97 }, { x: 897, y: -261, w: 110, h: 97 },
    ],
    // The unlocked car sitting on the apartment lawn (hotwire it with 350 intelligence).
    parkedCar: { x: -962, y: -620, w: 91, h: 49 },
    // Street people you click on (where they are drawn).
    npcs: {
      smokes: { x: -239, y: -602, color: '#33ccff' }, // the smokes kid
      hobo: { x: -253, y: 54, color: '#ff9900' }, // Homeless Harold, outside Sticky's
      dealer: { x: 159.5, y: 606, color: '#b00000' }, // the red-headed stick on the grass by the pawn shop
    },
    // What a click has to hit: the hit shapes of the original's buttons (NPC3button, NPC2, NPC1),
    // in map coordinates. The dealer's covers the stretch he paces up and down.
    npcHit: {
      smokes: { x0: -249.96, x1: -226.17, y0: -613.45, y1: -585.4 },
      hobo: { x0: -263.65, x1: -231.85, y0: 39.18, y1: 70.98 },
      dealer: { x0: 143.1, x1: 175.6, y0: 563.45, y1: 628.95 },
    },
    // The parked car's button is the car picture itself (turned to face east): its outline.
    parkedCarHit: [
      [-898.38, -621.5], [-897.63, -616.5], [-910.88, -616.5], [-910.88, -615.5], [-949.38, -615.5],
      [-949.38, -614.5], [-956.88, -614.5], [-956.88, -613.5], [-960.38, -613.5], [-960.38, -612.5],
      [-961.63, -612.5], [-962.63, -610.5], [-964.63, -594.5], [-964.38, -587.5], [-962.63, -576.5],
      [-961.63, -574.5], [-960.38, -574.5], [-960.38, -573.5], [-957.13, -573.5], [-957.13, -572.5],
      [-951.13, -572.5], [-951.13, -571.5], [-911.38, -571.5], [-911.38, -570.5], [-897.63, -570.5],
      [-898.38, -565.5], [-896.88, -565.5], [-894.38, -570.5], [-881.63, -570.5], [-881.63, -571.5],
      [-878.63, -571.5], [-878.63, -572.5], [-877.13, -572.5], [-872.88, -580.5], [-870.88, -589.5],
      [-870.88, -597.5], [-872.38, -604.5], [-875.13, -610.5], [-875.88, -610.5], [-877.38, -613.5],
      [-878.38, -613.5], [-878.38, -614.5], [-879.88, -614.5], [-879.88, -615.5], [-882.13, -615.5],
      [-882.13, -616.5], [-894.38, -616.5], [-896.88, -621.5],
    ],
    // Car lanes on the main road (car centre x) and the stretch they drive.
    lanes: { up: 15, down: -75, yStart: 825, yEnd: -800 },
    // The person clip's exact stage position, used by the car collision test.
    PERSON_X: 247.15,
    PERSON_Y: 197.55,
  });

  // --- Doors: entering a building by walking into it (the original's mapx/mapy windows). ---
  // Each maps to a location id (see js/locations/*).
  function dwellingDoor(s) { return s.dwelling > 3 ? 'oldapartment' : 'home'; }

  // Leaving a building nudges the map 8 px away from the door, as the original did.
  MAP.exitNudge = {
    store: { mapx: 8 }, nli: { mapx: 8 }, bank: { mapx: 8 }, pawn: { mapx: 8 },
    bar: { mapx: -8 }, casino: { mapx: -8 }, mcsticks: { mapx: -8 },
    mansion: { mapy: -8 }, bus: { mapx: 8 }, furniture: { mapy: 8 }, uofs: { mapy: -8 },
    home: { mapy: -8 }, oldapartment: { mapy: -8 },
  };

  function between(v, lo, hi) { return v > lo && v < hi; }

  // --- Walking: the walk clip (sprite 720) --------------------------------------------------
  // The clip has two frames and loops, so its two scripts take turns, one per tick:
  //   frame 1 reads the keys (MAP.readKeys) and runs the walk loop with the doors,
  //   frame 2 runs the walk loop again with frame 1's xmove / ymove, without the doors.
  // The clip is re-created (starting at frame 1) whenever the root timeline comes back to the map.

  // Frame 1's key handling. input: { left, right, up, down, shift } (arrows or A D W S).
  // Sets s.rot as the original does and returns { xmove, ymove, walkspeed, moving, step }:
  // step is what the footstep counter adds this frame.
  MAP.readKeys = function (s, input) {
    var walkspeed = 1;
    if (input.shift && s.items.skateboard === 1) walkspeed = 2;
    if (s.driving === 1 && s.items.car === 1) walkspeed = 3;
    if (s.driving === 1 && s.items.car === 2) walkspeed = 5;
    // Two if / else pairs (after the left branch the bytecode jumps past the right test, after up
    // past down): with both keys of a pair down, left beats right and up beats down.
    var xmove = 0, ymove = 0;
    if (input.left) { s.rot = 270; xmove = 4; } else if (input.right) { s.rot = 90; xmove = -4; }
    if (input.up) { s.rot = 0; ymove = 4; } else if (input.down) { s.rot = 180; ymove = -4; }
    var nowmoving = Math.abs(xmove) + Math.abs(ymove);
    var step = 0;
    if (nowmoving !== 0) {
      // The diagonal facings test the keys (not the move), in this order. The right + down test
      // has an empty body in the original, so that diagonal keeps facing down. With left, right
      // and up all held the player walks up-left but ends up facing 45 (up-right).
      if (input.left && input.up) s.rot = 315;
      if (input.up && input.right) s.rot = 45;
      if (input.down && input.left) s.rot = 225;
      step = Math.max(Math.abs(xmove), Math.abs(ymove)); // counted before the diagonal cut
      if (nowmoving === 8) {
        xmove = (xmove / 4) * 3;
        ymove = (ymove / 4) * 3;
      }
    }
    return { xmove: xmove, ymove: ymove, walkspeed: walkspeed, moving: nowmoving !== 0, step: step };
  };

  // The walk loop: walkspeed sub-steps of (xmove, ymove) with the original's mapx / mapy limits
  // verbatim. doors: true for frame 1, false for frame 2. A door or a fall ends it on the spot: the
  // original zeroes the move (m is updated in place) and sends the root timeline to the building or
  // to frame 3, which removes the walk clip, so the rest of its script never runs (Ruffle stops a
  // script whose clip is gone): no step on the other axis, no further sub-step, no traffic.
  // Returns { event, falls }: event is null, { door: id } or { fall: true }; falls is 1 for an edge
  // fall (10 HP), else 0.
  MAP.walkLoop = function (s, m, doors) {
    var out = { event: null, falls: 0 };
    var walkin = doors && s.driving === 0;
    function door(id, axis) { m[axis] = 0; out.event = { door: id }; return out; }
    function fall(axis) { m[axis] = 0; out.falls = 1; out.event = { fall: true }; return out; }
    for (var i = 0; i < m.walkspeed; i++) {
      if (m.xmove < 0) { // walking right
        if (s.mapx > 119) s.mapx += m.xmove;
        else {
          if (walkin) {
            if (between(s.mapy, -226, -167)) return door('store', 'xmove');
            if (between(s.mapy, 485, 541)) return door('nli', 'xmove');
            if (between(s.mapy, 758, 781)) return door('bank', 'xmove');
            if (between(s.mapy, -524, -501)) return door('pawn', 'xmove');
          }
          if (between(s.mapy, -4, 328)) s.mapx += m.xmove;
        }
        if (s.mapx < -660) { s.mapx += 20; return fall('xmove'); }
      }
      if (m.xmove > 0) { // walking left
        if (s.mapx < 447) s.mapx += m.xmove;
        else {
          if (walkin) {
            if (between(s.mapy, 65, 97)) return door('bar', 'xmove');
            if (between(s.mapy, -511, -467)) return door('casino', 'xmove');
            if (between(s.mapy, 302, 346)) return door('mcsticks', 'xmove');
            if (between(s.mapy, 888, 920) && (s.dwelling === 4 || s.dwelling === 5)) return door('mansion', 'xmove');
          }
          if (between(s.mapy, 424, 758)) s.mapx += m.xmove;
        }
        if (s.mapx > 1230) { s.mapx -= 20; return fall('xmove'); }
      }
      if (m.ymove < 0) { // walking down
        if (doors) {
          if (between(s.mapx, 116, 451)) s.mapy += m.ymove;
          else {
            if (s.mapx < 119) {
              if (s.mapy > -1) s.mapy += m.ymove;
              else if (walkin && between(s.mapx, -538, -497)) return door('bus', 'ymove');
            }
            if (s.mapx > 447) {
              if (s.mapy > 427) s.mapy += m.ymove;
              else if (walkin && between(s.mapx, 889, 930)) return door('furniture', 'ymove');
            }
          }
        } else {
          // Frame 2's copy has its last test outside the else, so from mapx 448 to 450 (south of
          // mapy 427) a step down moves twice.
          if (between(s.mapx, 116, 451)) s.mapy += m.ymove;
          else if (s.mapx < 119 && s.mapy > -1) s.mapy += m.ymove;
          if (s.mapx > 447 && s.mapy > 427) s.mapy += m.ymove;
        }
        if (s.mapy < -690) { s.mapy += 20; return fall('ymove'); }
      }
      if (m.ymove > 0) { // walking up
        if (doors) {
          if (between(s.mapx, 116, 450)) s.mapy += m.ymove;
          else {
            if (s.mapx < 119) {
              if (s.mapy < 325) s.mapy += m.ymove;
              else if (walkin && between(s.mapx, -426, -405)) return door('uofs', 'ymove');
            }
            if (s.mapx > 448) {
              if (s.mapy < 754) s.mapy += m.ymove;
              else if (walkin && between(s.mapx, 1043, 1069)) return door(dwellingDoor(s), 'ymove');
            }
          }
        } else {
          // likewise: at mapx 449 (north of mapy 754) a step up moves twice
          if (between(s.mapx, 116, 450)) s.mapy += m.ymove;
          else if (s.mapx < 119 && s.mapy < 325) s.mapy += m.ymove;
          if (s.mapx > 448 && s.mapy < 754) s.mapy += m.ymove;
        }
        if (s.mapy > 1014) { s.mapy -= 20; return fall('ymove'); }
      }
    }
    return out;
  };

  // One frame-1 tick of walking: the keys, then the walk loop with the doors. input: { left,
  // right, up, down, shift }. Returns { moved, dist, step, speed, event, falls, move } where move
  // is the { xmove, ymove, walkspeed } left for frame 2.
  MAP.walk = function (s, input) {
    var m = MAP.readKeys(s, input);
    var x0 = s.mapx, y0 = s.mapy;
    var r = MAP.walkLoop(s, m, true);
    return {
      moved: m.moving,
      dist: Math.abs(s.mapx - x0) + Math.abs(s.mapy - y0),
      step: m.step,
      speed: m.walkspeed,
      event: r.event,
      falls: r.falls,
      move: m,
    };
  };

  // Does a click at map point (x, y) hit this street person / the parked car?
  MAP.npcHitTest = function (id, x, y) {
    if (id === 'parkedcar') return inPoly(MAP.parkedCarHit, x, y);
    var b = MAP.npcHit[id];
    return !!b && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  };
  function inPoly(pts, x, y) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Player position in map coordinates.
  MAP.playerPos = function (s) {
    return { x: MAP.PLAYER_X - s.mapx, y: MAP.PLAYER_Y - s.mapy };
  };
  // Stage position of a map point for the current scroll.
  MAP.toStage = function (s, x, y) {
    return { x: s.mapx + x, y: s.mapy + y };
  };
})();
