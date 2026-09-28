// Core rules shared by every screen: the current state, karma/stat/money helpers, answering-machine
// messages, the night's sleep (day advance, bank interest, stocks, furniture, loan deadline, end
// of game), the election nomination check, net worth and the end-of-game rank.
// Numbers are the original's (Stick RPG Complete v1.22).
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var rnd = SRPG.rng.random;

  var JOB_TITLES = [null, 'McSlave', 'Janitor', 'Mail Room Clerk', 'Salesperson', 'Executive',
    'Vice President', 'CEO', 'Dictator of Sticks', 'President of Sticks'];

  // Body colour by karma: blue at 0, lighter to white at +100, purple to red at -100.
  var GOOD = [0x0066cc, 0x017cf8, 0x218ffe, 0x45a2fe, 0x70b7fe, 0x8fc8fe, 0xbfdfff, 0xdfefff, 0xeef7ff, 0xffffff];
  var EVIL = [0x0066cc, 0x0110c9, 0x6500ca, 0x9700ca, 0xba01c9, 0xc9018d, 0xca005b, 0xca001a, 0xca0000, 0xca0000];

  var game = (SRPG.game = {
    s: null, // the current game state (SRPG.newState())

    JOB_TITLES: JOB_TITLES,

    start: function (s) {
      game.s = s;
      SRPG.sound.setMusic(!!s.music);
    },

    // --- karma / stats / money ---------------------------------------------------------------
    karmaAdjust: function () {
      var s = game.s;
      if (s.karma > 100) s.karma = 100;
      if (s.karma < -100) s.karma = -100;
    },
    addKarma: function (n) {
      game.s.karma += n;
      game.karmaAdjust();
    },
    // Strength, intelligence and charm cap at 999. Strength gains also raise max HP by the same
    // amount (the original adds to hpmax even when strength is already capped).
    addStat: function (name, n) {
      var s = game.s;
      s[name] = Math.min(s[name] + n, 999);
      if (name === 'strength') s.hpmax += n;
    },
    // Restore HP up to max.
    heal: function (n) {
      var s = game.s;
      s.hp = Math.min(s.hp + n, s.hpmax);
    },
    // Lose HP; returns true when this killed the player (the HUD then shows YOU DIED).
    hurt: function (n) {
      game.s.hp -= n;
      return game.s.hp <= 0;
    },
    netWorth: function (s) {
      s = s || game.s;
      return s.cash + s.bankcash - s.bankloan;
    },
    jobTitle: function (s) {
      return JOB_TITLES[(s || game.s).job] || '';
    },
    personColor: function (karma) {
      var k = karma == null ? game.s.karma : karma;
      // 0..10 -> first shade, 11..20 -> second ... 91..100 -> last; the same going negative.
      var i = Math.max(0, Math.min(9, Math.ceil(Math.abs(k) / 10) - 1));
      return SRPG.draw.hex((k >= 0 ? GOOD : EVIL)[i]);
    },
    pushMsg: function (text) {
      game.s.msgs.push(text);
    },

    // --- entering the city: nomination check and stat caps (the original's root frame 2) -----
    onEnterCity: function () {
      var s = game.s;
      if (s.cash >= 200000 && s.dwelling === 5 && s.electionMessage === 0 &&
          s.intelligence >= 777 && s.strength >= 777 && s.charm >= 777 && s.karma < 0) {
        game.pushMsg('United Nations of Stick here. Word of your wicked riches and power has reached us, and ' +
          'you are now a candidate for Dictator of all Stick Nations. Ring us back if you feel like campaigning!');
        s.electionMessage = 1;
      }
      if (s.cash >= 200000 && s.dwelling === 5 && s.electionMessage === 0 &&
          s.intelligence >= 666 && s.strength >= 666 && s.charm >= 666 && s.karma > 0) {
        game.pushMsg('United Nations of Stick here. Word of your kindly riches and power has reached us, and ' +
          'you are now a candidate for President of all Stick Nations. Ring us back if you feel like campaigning!');
        s.electionMessage = 2;
      }
      if (s.intelligence > 999) s.intelligence = 999;
      if (s.strength > 999) s.strength = 999;
      if (s.charm > 999) s.charm = 999;
    },

    // --- sleep -------------------------------------------------------------------------------
    // One night's sleep at home. mansion = true when sleeping in the mansion or castle (the Deep
    // Freeze and the political salary only count there, as in the original).
    // Returns { lines: [...], dead: bool, ended: bool } — the caller shows the summary, or the
    // death / results screen.
    sleep: function (mansion) {
      var s = game.s;
      var out = { bank: '', hp: '', pills: '', int: '', str: '', cha: '', earn: '', dead: false, ended: false };
      s.day += 1;

      // Stocks drift. The first stock moves up to $0.25 a day, the others up to $1; never below $1.
      SRPG.STOCKS.forEach(function (k, i) {
        var st = s.stocks[k];
        var rate = SRPG.rng.float() * (i === 0 ? 0.25 : 1);
        var dir = rnd(2) === 0 ? -1 : 1;
        st.prev = st.price;
        st.price = st.price + rate * dir;
        if (!(st.price > 1)) st.price = 1;
      });

      // Interest on savings and on the loan, then the rate drifts by -0.5..+0.4 (never below 0).
      // (the original's int(): truncation to a 32-bit integer)
      s.bankcash += (s.bankcash * (s.bankrate / 100)) | 0;
      s.bankloan += (s.bankloan * (s.bankrate / 100)) | 0;
      s.bankrate += rnd(10) / 10 - 0.5;
      if (s.bankrate < 0) s.bankrate = 0;

      // Loan deadline. The checks run in sequence, exactly as the original's.
      if (s.bankloandays > 1) {
        s.bankloandays -= 1;
        out.bank = s.bankloandays + ' days left to pay off your loan ($' + s.bankloan + ')';
      }
      if (s.bankloandays === 1) {
        s.bankloandays -= 1;
        out.bank = s.bankloandays + ' day left to pay off your loan ($' + s.bankloan + ')';
      }
      // The bank's "collection agents" pay a visit: YOU DIED. In the original the jump to the death
      // frame doesn't stop the button script, so the rest of the night still happens first.
      if (s.bankloandays === 0) out.dead = true;

      var restore = 20;
      if (s.items.bed === 1) restore = 30;
      if (mansion && s.items.bed === 1 && s.items.freezer === 1) restore = 40;
      if (s.items.pills > 0) {
        out.pills = '(CAFFEINE PILLS USED)';
        restore -= 20;
      }
      s.hp += restore;
      if (s.hp > s.hpmax) {
        restore -= s.hp - s.hpmax;
        s.hp = s.hpmax;
      }
      out.hp = restore + ' HP RESTORED!';

      if (s.items.books === 1) {
        out.int = '+1 INTELLIGENCE GAINED! (XGENICA COLL.)';
        s.intelligence = Math.min(s.intelligence + 1, 999);
      }
      if (s.items.minibar === 1) {
        out.cha = '+1 CHARM GAINED! (MINIBAR)';
        s.charm = Math.min(s.charm + 1, 999);
      }
      if (s.items.treadmill === 1) {
        out.str = '+1 STRENGTH GAINED! (TREADMILL)';
        s.strength = Math.min(s.strength + 1, 999);
        s.hpmax += 1;
      }
      if (mansion && (s.job === 8 || s.job === 9)) {
        out.earn = 'Political career earns you $5000 today.';
        s.cash += 5000;
      }

      // Wake-up time: 8 AM; caffeine pills (one is used up) and the alarm clock each take 4 hours
      // off, so both together give a full 24-hour day starting at midnight.
      s.time = 8;
      if (s.items.pills > 0) {
        s.items.pills -= 1;
        s.time -= 4;
      }
      if (s.items.alarm > 0) s.time -= 4;

      if (s.day === 365) {
        game.pushMsg("Hey hey! Your friendly game developer on the line with a big CONGRATS-A-RAMA! A whole " +
          "virtual YEAR survived! A shiny sports car is yours now. Tap 'C' while walking to hop in or out.");
        s.items.car = 2;
      }

      if (game.timeUp()) out.ended = true;
      if (out.dead) s.hp = 0;
      out.lines = [out.bank, out.hp, out.pills, out.int, out.str, out.cha, out.earn].filter(Boolean);
      return out;
    },

    // True once a timed game has run past its last day.
    timeUp: function () {
      var s = game.s;
      return s.gamelength !== 0 && s.day > s.gamelength;
    },

    // --- end of game ------------------------------------------------------------------------
    // The rank stamped on the results screen. Thresholds as in the original, including its
    // quirk: the $250,000 tier is checked before the $100,000 one, so it can never show.
    rank: function (s) {
      s = s || game.s;
      var n = game.netWorth(s);
      var names;
      if (s.karma > 20) {
        names = ['WUSS', 'GIRL SCOUT', 'BOY SCOUT', 'GOOD SAMARITAN', 'EXTRAORDINARILY GOOD', 'SELFLESS MILLIONAIRE',
          'PHILANTHROPIST', 'SAINT', 'APOSTLE', 'MR. DOG'];
      } else if (s.karma < -20) {
        names = ['JUVENILE DELINQUENT', 'WHITE COLLAR CRIMINAL', 'PETTY CRIMINAL', 'CAR JACKER', 'EXTRAORDINARILY EVIL',
          'DRUG LORD', 'UNDENIABLY WICKED', 'GENUINE HELLRAISER', 'SEED OF EVIL', 'MR. NATAS'];
      } else {
        names = ['NOVICE', 'MEDIOCRE', 'EXCEPTIONAL', 'EXTRAORDINARY', 'GENIUS', 'MILLIONAIRE', 'MULTIMILLIONAIRE',
          'DEMI GOD', 'GOD', 'BILLIONAIRE GOD'];
      }
      var r = 'HOPELESS';
      if (n > 0) r = 'UTTER FAILURE';
      if (n > 100) r = 'LOSER';
      if (n > 500) r = 'INCOMPETENT';
      if (n > 1000) r = names[0];
      if (n > 4000) r = names[1];
      if (n > 10000) r = names[2];
      if (n > 250000) r = names[3];
      if (n > 100000) r = names[4];
      if (n > 1000000) r = names[5];
      if (n > 2000000) r = names[6];
      if (n > 10000000) r = names[7];
      if (n > 100000000) r = names[8];
      if (n > 1000000000) r = names[9];
      return r;
    },

    gameLengthLabel: function (s) {
      var g = (s || game.s).gamelength;
      if (g === 15) return 'Short Game (15 DAYS)';
      if (g === 40) return 'Medium Game (40 DAYS)';
      if (g === 100) return 'Long Game (100 DAYS)';
      return 'Unlimited Game';
    },

    // Show the results screen (time up, quit, or after YOU DIED).
    endGame: function () {
      game.s.over = true;
      SRPG.engine.go('results');
    },
    // HP ran out: the YOU DIED screen, which then goes on to the results.
    die: function () {
      game.s.hp = 0;
      game.s.over = true;
      SRPG.engine.go('death');
    },
  });
})();
