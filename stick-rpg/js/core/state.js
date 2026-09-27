// Game state. Field names follow the original's variables so the rules read like the original.
// Plain JSON, so it saves as-is. Rules that change it live in game.js and the location modules.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var SAVE_KEY = 'srpg.save';

  // Start of a new game on the map: the west road, just left of the junction.
  SRPG.START_MAPX = 456;
  SRPG.START_MAPY = 630;

  SRPG.STOCKS = ['XGS', 'FSY', 'DYC', 'MLG', 'SR2', 'SAR'];

  SRPG.newState = function (opts) {
    opts = opts || {};
    var rnd = SRPG.rng.random;
    var stocks = {};
    SRPG.STOCKS.forEach(function (k) {
      var p = rnd(10) + 1;
      stocks[k] = { price: p, prev: p, units: 0, bought: 0 };
    });
    var str = opts.strength != null ? opts.strength : 5;
    return {
      v: 1,
      pname: opts.pname || 'Anonymous',
      gamelength: opts.gamelength != null ? opts.gamelength : 0, // 15, 40, 100 or 0 = unlimited
      day: 1,
      time: 8, // hour of the day, 0..24; almost every action adds hours
      cash: opts.cash != null ? opts.cash : 100,
      bankcash: 0,
      bankloan: 0,
      bankloandays: -1, // -1 = no loan
      bankrate: rnd(50) / 10 + 1, // percent per day, drifts every night
      strength: str,
      intelligence: opts.intelligence != null ? opts.intelligence : 5,
      charm: opts.charm != null ? opts.charm : 5,
      karma: 0, // -100..100
      hpmax: str + 15,
      hp: str + 15,
      job: 1, // 1 McSlave, 2 Janitor, 3 Mail Room Clerk, 4 Salesperson, 5 Executive, 6 VP, 7 CEO, 8 Dictator, 9 President
      barfight: 1, // bar fights won + 1: scales opponents and prize money
      dwelling: 1, // 1 apartment, 2 bigger apartment, 3 penthouse suite, 4 mansion, 5 castle
      items: {
        smokes: 0, pills: 0, knife: 0, gun: 0, ammo: 0, alarm: 0, cocaine: 0, skateboard: 0,
        car: 0, // 0 none, 1 hotwired junker (x3 speed), 2 sports car (x5 speed, day 365 gift)
        cellPhone: 0, bed: 0, tv: 0, computer: 0, treadmill: 0, satellite: 0, books: 0, freezer: 0, minibar: 0,
      },
      booze: 0, // bottles of beer (commodity)
      packNumber: 0, // packs of smokes given to the smokes kid (10 kills him)
      hoboMoney: 0, // gave Harold money once (first gift gives charm)
      hoboBooze: 0, // gave Harold booze once
      smokesKid: 0, // gave the smokes kid a pack once (skateboard received)
      msgs: [
        "Heyyy... yeah. It's Richard, the manager down at McSticks. So, um, you got the job. " +
          "Just come in and start whenever, okay? Okaaay. Bye now.",
      ],
      dealMessages: [0, 0, 0, 0, 0],
      electionMessage: 0, // 1 nominated Dictator, 2 nominated President, 3 ran or declined
      stocks: stocks,
      mapx: SRPG.START_MAPX,
      mapy: SRPG.START_MAPY,
      rot: 270, // facing, degrees (0 up, 90 right, 180 down, 270 left)
      driving: 0,
      music: 1,
      optimize: 1,
      fps: 0,
      over: false,
    };
  };

  SRPG.save = {
    // The original kept a single save ("Game saved" / "Previous game overwritten").
    write: function (state) {
      var existed = SRPG.save.exists();
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      } catch (e) {
        return null;
      }
      return existed ? 'Previous game overwritten' : 'Game saved';
    },
    exists: function () {
      try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    },
    // Loading puts you back on the street at the start junction, as the original did
    // (position was never saved).
    read: function () {
      try {
        var raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        var s = SRPG.save.migrate(JSON.parse(raw));
        s.mapx = SRPG.START_MAPX;
        s.mapy = SRPG.START_MAPY - 8;
        s.driving = 0;
        s.over = false;
        return s;
      } catch (e) {
        return null;
      }
    },
    remove: function () {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    },
    // Fill in fields added after a save was written, so old saves keep loading.
    migrate: function (s) {
      var fresh = SRPG.newState();
      for (var k in fresh) if (!(k in s)) s[k] = fresh[k];
      for (var j in fresh.items) if (!(j in s.items)) s.items[j] = 0;
      return s;
    },
  };
})();
