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
      { x: -330, y: -681, w: 82, h: 77 }, // the mansion's own grove (drawn only with dwelling 4) { x: 160, y: -874, w: 110, h: 94 },
      { x: 369, y: -261, w: 110, h: 97 }, { x: 897, y: -261, w: 110, h: 97 },
    ],
    // The unlocked car sitting on the apartment lawn (hotwire it with 350 intelligence).
    parkedCar: { x: -962, y: -620, w: 91, h: 49 },
    // Street people you click on.
    npcs: {
      smokes: { x: -239, y: -602, color: '#33ccff' }, // the smokes kid
      hobo: { x: -253, y: 54, color: '#ff9900' }, // Homeless Harold, outside Sticky's
      dealer: { x: 159.5, y: 606, color: '#b00000' }, // the red-headed stick on the grass by the pawn shop
    },
    // Car lanes on the main road (car centre x) and the stretch they drive.
    lanes: { up: 15, down: -75, yStart: 825, yEnd: -800 },
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

  // One movement sub-step (the body of the original's walk loop). Mutates s.mapx/s.mapy.
  // Returns null, { door: id } or { fall: true }.
  function step(s, xmove, ymove) {
    var drive = s.driving === 1;
    if (xmove < 0) { // walking right
      if (s.mapx > 119) s.mapx += xmove;
      else {
        if (!drive) {
          if (between(s.mapy, -226, -167)) return { door: 'store' };
          if (between(s.mapy, 485, 541)) return { door: 'nli' };
          if (between(s.mapy, 758, 781)) return { door: 'bank' };
          if (between(s.mapy, -524, -501)) return { door: 'pawn' };
        }
        if (between(s.mapy, -4, 328)) s.mapx += xmove;
      }
      if (s.mapx < -660) { s.mapx += 20; return { fall: true }; }
    }
    if (xmove > 0) { // walking left
      if (s.mapx < 447) s.mapx += xmove;
      else {
        if (!drive) {
          if (between(s.mapy, 65, 97)) return { door: 'bar' };
          if (between(s.mapy, -511, -467)) return { door: 'casino' };
          if (between(s.mapy, 302, 346)) return { door: 'mcsticks' };
          if (between(s.mapy, 888, 920) && (s.dwelling === 4 || s.dwelling === 5)) return { door: 'mansion' };
        }
        if (between(s.mapy, 424, 758)) s.mapx += xmove;
      }
      if (s.mapx > 1230) { s.mapx -= 20; return { fall: true }; }
    }
    if (ymove < 0) { // walking down
      if (between(s.mapx, 116, 451)) s.mapy += ymove;
      else {
        if (s.mapx < 119) {
          if (s.mapy > -1) s.mapy += ymove;
          else if (!drive && between(s.mapx, -538, -497)) return { door: 'bus' };
        }
        if (s.mapx > 447) {
          if (s.mapy > 427) s.mapy += ymove;
          else if (!drive && between(s.mapx, 889, 930)) return { door: 'furniture' };
        }
      }
      if (s.mapy < -690) { s.mapy += 20; return { fall: true }; }
    }
    if (ymove > 0) { // walking up
      if (between(s.mapx, 116, 450)) s.mapy += ymove;
      else {
        if (s.mapx < 119) {
          if (s.mapy < 325) s.mapy += ymove;
          else if (!drive && between(s.mapx, -426, -405)) return { door: 'uofs' };
        }
        if (s.mapx > 448) {
          if (s.mapy < 754) s.mapy += ymove;
          else if (!drive && between(s.mapx, 1043, 1069)) return { door: dwellingDoor(s) };
        }
      }
      if (s.mapy > 1014) { s.mapy -= 20; return { fall: true }; }
    }
    return null;
  }

  // One 35 Hz tick of walking. input: { left, right, up, down, shift }.
  // Returns { moved, dist, speed, event } where event is null, { door } or { fall }.
  MAP.walk = function (s, input) {
    var walkspeed = 1;
    if (input.shift && s.items.skateboard === 1) walkspeed = 2;
    if (s.driving === 1 && s.items.car === 1) walkspeed = 3;
    if (s.driving === 1 && s.items.car === 2) walkspeed = 5;
    var xmove = 0, ymove = 0;
    if (input.left) { s.rot = 270; xmove = 4; }
    else if (input.right) { s.rot = 90; xmove = -4; }
    if (input.up) { s.rot = 0; ymove = 4; }
    else if (input.down) { s.rot = 180; ymove = -4; }
    if (xmove && ymove) {
      s.rot = xmove > 0 ? (ymove > 0 ? 315 : 225) : (ymove > 0 ? 45 : 135);
      xmove = (xmove / 4) * 3;
      ymove = (ymove / 4) * 3;
    }
    var moved = !!(xmove || ymove);
    var x0 = s.mapx, y0 = s.mapy;
    var ev = null;
    for (var i = 0; i < walkspeed && moved; i++) {
      ev = step(s, xmove, ymove);
      if (ev) break;
    }
    return {
      moved: moved,
      dist: Math.abs(s.mapx - x0) + Math.abs(s.mapy - y0),
      step: Math.max(Math.abs(xmove), Math.abs(ymove)),
      speed: walkspeed,
      event: ev,
    };
  };

  // Player position in map coordinates.
  MAP.playerPos = function (s) {
    return { x: MAP.PLAYER_X - s.mapx, y: MAP.PLAYER_Y - s.mapy };
  };
  // Stage position of a map point for the current scroll.
  MAP.toStage = function (s, x, y) {
    return { x: s.mapx + x, y: s.mapy + y };
  };
})();
