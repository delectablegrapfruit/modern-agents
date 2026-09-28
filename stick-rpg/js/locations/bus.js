// The bus depot (root frame 50): ride to another city to sell cocaine or bottles of booze, and the
// arrival screen (frame 51) with its offer (TAKE IT) or bad news (HEAD BACK). Every check, random
// range and outcome follows the original's six destination handlers, which differ slightly
// (ticket, how strong you must be, what the buyers want, how much product gets you busted).
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var ui = SRPG.ui;
  var D = SRPG.draw;
  var esc = SRPG.util.escape;
  var rnd = SRPG.rng.random;
  var FONT = '"Arial Black", "Arial Bold", Arial, Helvetica, sans-serif';

  var BOOZE_SELL = 6; // the original's boozeSell / cokeSell divisors
  var COKE_SELL = 5;

  // The six buses. robbery = Math.round(Math.random() * range) + 100 is the strength you need;
  // want: 'random' = random(2), 0 = booze, 1 = cocaine; bust: how much product gets you arrested
  // (Brooklyn's check is ">= 50", the others "> 50"). The names are the places each handler's
  // stories mention.
  var CITIES = [
    { id: 'brooklyn', label: 'Brooklyn, NY', price: 115, range: 125, want: 'random', bustAt: 50,
      jumped: 'Brooklyn', lost: 'New York', scouts: 'New York', cats: 'Brooklyn', slip: 'New York', col: 0, row: 0 },
    { id: 'detroit', label: 'Detroit, MI', price: 100, range: 150, want: 1, bustAt: 51,
      jumped: 'Detroit', lost: 'the Motor City', scouts: 'Detroit', cats: 'Detroit', slip: 'Detroit', col: 0, row: 1 },
    { id: 'losangeles', label: 'Los Angeles, CA', price: 100, range: 150, want: 1, bustAt: 51,
      jumped: 'LA', lost: 'Los Angeles', scouts: 'LA', cats: 'LA', slip: 'LA', col: 0, row: 2 },
    { id: 'chicago', label: 'Chicago, IL', price: 115, range: 125, want: 0, bustAt: 51,
      jumped: 'Chicago', lost: 'the Windy City', scouts: 'Chicago', cats: 'Chicago', slip: 'Chicago', col: 1, row: 0 },
    { id: 'camden', label: 'Camden, NJ', price: 130, range: 110, want: 0, bustAt: 51,
      jumped: 'Camden', lost: 'Camden', scouts: 'Camden', cats: 'Camden', slip: 'Camden', col: 1, row: 1 },
    { id: 'lasvegas', label: 'Las Vegas, NV', price: 130, range: 110, want: 'random', bustAt: 51,
      jumped: 'Las Vegas', lost: 'Vegas', scouts: 'Vegas', cats: 'Las Vegas', slip: 'Vegas', col: 1, row: 2 },
  ];

  // What happened on the trip (the original's sellSummary texts, reworded).
  var TEXT = {
    nothing: 'You get to the city and realize you brought nothing to sell.  Long, pricey bus trips are fun and ' +
      'all, but maybe load up on goods before the next one.',
    lawyers: 'Somewhere along the highway, a roving band of bargain-bin lawyers cleans you out of every dollar ' +
      'and your whole stash.  Bring some protection next time.',
    jumped: function (c) {
      return 'The moment your feet hit the pavement in ' + c.jumped + ', three dudes and a girl jump you and take ' +
        "every dollar you have, plus your stash.  Might be time to start packin' heat.";
    },
    lost: function (c) {
      return 'You wander around lost in ' + c.lost + ' until a pimp kindly points you back to the station...and ' +
        'then mugs you.  Your money and stash are gone.  A firearm might be a smart investment.';
    },
    noAmmo: 'You swagger through the streets hunting for buyers.  A crew of thugs with baseball bats sizes you up ' +
      'and heads your way.  You whip out your gun and squeeze the trigger...*click*  Empty.  They hold a home run ' +
      'derby on your backside and walk off with your cash and stash.',
    scouts: function (c) {
      return 'In ' + c.scouts + ', you smear dog poop all over a girl scout troop\'s hopscotch court.  Troop 61 ' +
        'leaves you sprawled on the pavement minus your cash and stash, chewing on stale cookies.  Maybe hit the ' +
        'gym a little more.';
    },
    cats: function (c) {
      return 'You hop off the bus and stroll around ' + c.cats + '.  Passing a dark alley, you hear something ' +
        'behind you.  Three huge alley cats pounce from every side and you black out beside a trash bin.  Some ' +
        'bum wandering by helps himself to your wallet and stash.  Weak as a kitten, indeed!';
    },
    slip: function (c) {
      return 'Nobody in ' + c.slip + ' wants to buy, and it\'s making you grumpy.  Not watching your feet, you ' +
        'skid on a discarded condom and whack your skull against a park bench.  While you bleed on the ' +
        'sidewalk, squirrels scamper off carrying your wallet and stash.  Get tougher!';
    },
    noPhone: 'You burn the whole day looking for buyers, but nobody deals with a punk who doesn\'t even own a ' +
      "cell phone.  When 'the craving' hits, how would they ever get hold of you??",
    busted: 'Rolling in with that much product gets you noticed - by the police.  They haul you off, keep the ' +
      'goods and the gun, and lock you in the state pen for 5 days.',
    screwed: 'Some new contacts set up a meet behind an empty warehouse.  The deal is going great...until ' +
      "something heavy slams into the back of your skull.  Face down on the pavement, it hits you: you've been " +
      'played!\nYour whole stash is gone.',
    offer: function (q, what, offer) {
      return "You've made it to the city and a buyer offers you this deal - " + q + what + 'for $' + offer + '.';
    },
    nobody: 'You made it to the city, but nobody wants what you\'re selling.  Try again some other time, chump.',
  };
  var COMMODITY = [' bottles of booze ', ' grams of cocaine '];

  // Voicemails from the buyers (one of five, at most once each, 50% chance per sale).
  var DEAL_MSGS = [
    "Yo...Marco here...you know, from the city.  That product you sold me?  Straight fire, man.  Let's do " +
      'business again real soon.  Peace!',
    "Hey sweetie, Taquisha here...we did a little business last night.  I like how you operate.  Turn up that " +
      "charm a bit more and maybe I'll pay better next time.  Later, baby!",
    "Yo yo, DJ Beefstick in the house!  Everybody at the club was lovin' your stash!  Come back with more soon, " +
      "but don't carry too much or the cops gonna notice...lata foo'!",
    '...Antonio calling.  When you come back to the city, find me.  Some friends of mine want in on what ' +
      "you're selling.  Sweet-talk them better and the price goes up.  Ciao.",
    "Listen up, punk!  This here is MY turf!  You come dealin' on my corner again and you gonna catch a bullet " +
      'in yo behind!',
  ];

  // screen: 'depot' (frame 50) | 'city' (frame 51). trip: { summary, offer, quantity, which }.
  // passedAll is the original's never-reset flag (set by the first deal that got past the
  // ambush roll); it gates the offer together with the same conditions, so it only matters once.
  var st = { screen: 'depot', trip: null, passedAll: 0, taken: false };

  function S() { return SRPG.game.s; }

  // --- the trip (one destination button) ----------------------------------------------------------
  // Returns null when the bus can't be taken (error sound): the ticket must be affordable and it
  // must be exactly midnight (time 0: the buses leave at the very start of the day).
  function travel(s, city) {
    var trip = { city: city.id, summary: '', offer: 0, quantity: 0, which: 0 };
    if (!(s.cash > city.price - 1 && s.time === 0)) return null;
    s.cash -= city.price;
    var robbery = Math.round(SRPG.rng.float() * city.range) + 100;
    var it = s.items;
    var rand;
    var wipe = function () {
      s.cash = 0;
      it.cocaine = 0;
      s.booze = 0;
    };
    var busted = city.bustAt === 50 ? (!(it.cocaine < 50) || !(s.booze < 50)) : (it.cocaine > 50 || s.booze > 50);
    if (it.cocaine === 0 && s.booze === 0) {
      trip.summary = TEXT.nothing;
    } else if (it.gun === 0) {
      rand = rnd(3);
      trip.summary = [TEXT.lawyers, TEXT.jumped(city), TEXT.lost(city)][rand];
      wipe();
    } else if (it.gun === 1 && it.ammo === 0) {
      trip.summary = TEXT.noAmmo;
      wipe();
    } else if (robbery > s.strength) {
      rand = rnd(3);
      trip.summary = [TEXT.scouts(city), TEXT.cats(city), TEXT.slip(city)][rand];
      wipe();
    } else if (it.cellPhone === 0) {
      trip.summary = TEXT.noPhone;
    } else if (busted) {
      trip.summary = TEXT.busted;
      s.day += 5;
      s.booze = 0;
      it.cocaine = 0;
      it.gun = 0;
      it.ammo = 0;
    } else if (!(s.strength < robbery) && it.cellPhone === 1 && it.gun === 1 && (it.cocaine > 0 || s.booze > 0)) {
      rand = rnd(10);
      if (rand === 3) {
        trip.summary = TEXT.screwed;
        s.booze = 0;
        it.cocaine = 0;
      } else {
        st.passedAll = 1;
      }
    }
    // The offer: what the buyers want, a price per unit from your charm (+/- a little), for all of it.
    if (st.passedAll === 1 && !(s.strength < robbery) && it.cellPhone === 1 && it.gun === 1 && (it.cocaine > 0 || s.booze > 0)) {
      trip.which = city.want === 'random' ? rnd(2) : city.want;
      var offer = 0;
      var sign;
      if (trip.which === 0) {
        offer = s.charm / BOOZE_SELL;
        if (offer > 50) offer = 50;
        rand = rnd(5);
        sign = rnd(2);
        if (sign === 0) offer -= rand;
        if (sign === 1) offer += rand;
        if (!(offer > 5)) offer = 5;
      }
      if (trip.which === 1) {
        offer = 10 * (s.charm / COKE_SELL);
        if (offer > 600) offer = 600;
        rand = rnd(50);
        sign = rnd(2);
        if (sign === 0) offer -= rand;
        if (sign === 1) offer += rand;
        if (!(offer > 50)) offer = 50;
      }
      trip.quantity = trip.which === 0 ? s.booze : it.cocaine;
      if (trip.quantity > 0) {
        trip.offer = Math.round(offer * trip.quantity);
        trip.summary = TEXT.offer(trip.quantity, COMMODITY[trip.which], trip.offer);
      } else {
        trip.summary = TEXT.nobody;
        trip.offer = 0;
        trip.quantity = 0;
        trip.which = 0;
      }
    }
    // Frame 51: an empty story means nobody showed up.
    if (trip.offer === 0 && trip.summary === '') trip.summary = TEXT.nobody;
    return trip;
  }

  // TAKE IT: -5 karma, maybe a voicemail from a new contact, the money, and the goods are gone.
  function takeOffer(s, trip) {
    SRPG.game.addKarma(-5);
    var rand = rnd(10);
    if (rand < 5 && s.dealMessages[rand] === 0) {
      SRPG.game.pushMsg(DEAL_MSGS[rand]);
      s.dealMessages[rand] = 1;
    }
    s.cash += trip.offer;
    if (trip.which === 0) s.booze -= trip.quantity;
    if (trip.which === 1) s.items.cocaine -= trip.quantity;
  }

  // HEAD BACK: the trip took the whole day. (Jail can push the game past its last day.)
  function headBack() {
    var s = S();
    s.time = 24;
    st.screen = 'depot';
    st.trip = null;
    st.taken = false;
    if (SRPG.game.timeUp()) {
      SRPG.game.endGame();
      return;
    }
    SRPG.location.leave();
  }

  // --- screens -------------------------------------------------------------------------------------
  function text(html, x, y, opts) {
    opts = opts || {};
    var size = opts.size || 12;
    var e = ui.el('div', 'nopoint', null, html);
    // Without Arial Black the bold fallback is widened 12% (Arial Black's measure), as the shared
    // style does for menus; a sized box is narrowed to match, so it wraps and centres the same.
    var k = SRPG.hud && SRPG.hud.fonts && SRPG.hud.fonts().black ? 1 : 1.12;
    e.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;font:bold ' + size + 'px ' + FONT + ';color:' +
      (opts.color || '#000') + ';line-height:' + (opts.lh || 17) + 'px;white-space:' + (opts.wrap ? 'pre-wrap' : 'pre') +
      ';text-align:' + (opts.align || 'left') + ';' + (opts.w ? 'width:' + (opts.w / k) + 'px;' : '') +
      (k !== 1 ? 'transform:scaleX(' + k + ');transform-origin:0 0;' : '');
    if (opts.id) e.setAttribute('data-text', opts.id);
    return e;
  }

  function iconBtn(o, onClick) {
    var b = ui.iconButton(null, { icon: o.icon, label: '<span>' + o.label + '</span>', x: o.x, y: o.y, w: o.w || 150, size: o.size || 36, id: o.id },
      function () { onClick(); });
    var lbl = b.querySelector('.lbl');
    lbl.style.fontSize = (o.font || 10.5) + 'px';
    lbl.style.marginLeft = (o.gap != null ? o.gap : 4) + 'px';
    if (o.lh) lbl.style.lineHeight = o.lh + 'px';
    if (o.mixed) lbl.style.textTransform = 'none';
    return b;
  }

  function panel() {
    var p = ui.panel(154, 84, 356, 252);
    p.setAttribute('data-loc', 'bus');
    return p;
  }

  // The six bus buttons, placed one by one in the original: [tile x, tile y, label top] (stage px).
  // Their tiles are 40 x 36 and sit a little above the middle of the three-line labels.
  var BUS_SPOTS = [
    [[171.5, 142.5, 141.25], [171.5, 192, 190.1], [171.5, 241, 240.4]],
    [[346.5, 143, 141], [345.5, 193, 192.4], [345.5, 243, 243.6]],
  ];
  function busTile(b, dy) {
    var tile = b.querySelector('.ico');
    tile.style.width = '40px';
    tile.style.height = '36px';
    tile.style.alignSelf = 'flex-start';
    tile.style.marginTop = dy + 'px';
    var cv = tile.querySelector('canvas');
    if (cv) cv.style.margin = '-1.25px 0 0 0.25px'; // the 38 px picture, centred (the tile clips it)
  }

  function showDepot() {
    panel();
    text('"This is the bus depot.  Our buses roll out at the very\nstart of the day.  Miss them and you\'re outta luck."', 164, 98);
    CITIES.forEach(function (c) {
      var at = BUS_SPOTS[c.col][c.row];
      var b = iconBtn({ icon: 'bus', label: 'Sell Commodities -<br>' + esc(c.label) + '<br>$' + c.price, x: at[0],
        y: at[2], size: 38, font: 11, lh: 14, w: 165, id: 'bus_' + c.id, gap: 4, mixed: true }, function () {
        var s = S();
        var trip = travel(s, c);
        if (!trip) {
          SRPG.sound.play('error');
          refresh();
          return;
        }
        SRPG.sound.play('purchase');
        st.trip = trip;
        st.taken = false;
        st.screen = 'city';
        refresh();
      });
      busTile(b, at[1] - at[2]);
    });
    iconBtn({ icon: 'leave', label: 'LEAVE', x: 345, y: 294, w: 81, id: 'leave' }, function () {
      SRPG.location.leave();
    });
  }

  function showCity() {
    var trip = st.trip || { summary: TEXT.nobody, offer: 0 };
    panel();
    text('SELL COMMODITIES', 149.5, 88, { color: '#000066', w: 356, align: 'center' });
    text(esc(trip.summary), 174, 110, { size: 14, w: 316, align: 'center', wrap: true, lh: 20, id: 'summary' });
    if (trip.offer > 0 && !st.taken) {
      iconBtn({ icon: 'work', label: 'TAKE IT', x: 179, y: 297, w: 90, id: 'takeit' }, function () {
        takeOffer(S(), trip);
        st.taken = true;
        SRPG.sound.play('work');
        refresh();
      });
    }
    iconBtn({ icon: 'leave', label: 'HEAD BACK', x: 386.5, y: 297.5, w: 110, id: 'headback' }, headBack);
  }

  function refresh() {
    if (SRPG.location.current === 'bus') SRPG.location.g.refresh();
  }

  // --- art -----------------------------------------------------------------------------------------
  // Ticket machine: a white-topped grey box with a green readout, on a grey plinth.
  function kiosk(ctx, dx) {
    D.poly(ctx, [dx + 50, 148.5, dx + 157, 148.5, dx + 167, 161, dx + 74, 161], '#cccccc', '#000', 1);
    D.poly(ctx, [dx + 50, 148.5, dx + 74, 161, dx + 74, 182, dx + 50, 169], '#999999', '#000', 1);
    D.rect(ctx, dx + 74, 161, 93, 21, '#666666', '#000', 1);
    D.poly(ctx, [dx + 72.5, 74, dx + 145, 74, dx + 155, 105, dx + 84, 105], '#ffffff', '#000', 1);
    D.poly(ctx, [dx + 72.5, 74, dx + 84, 105, dx + 84, 161, dx + 72.5, 153], '#999999', '#000', 1);
    D.rect(ctx, dx + 84, 105, 71, 56, '#cccccc', '#000', 1);
    D.rect(ctx, dx + 89, 111.5, 63, 17, '#006600', '#000', 1);
    D.text(ctx, '0.', dx + 149, 124.5, { size: 10, align: 'right', color: '#00ff00', font: '"Courier New", monospace' });
  }

  function depotBackground(ctx) {
    D.rect(ctx, 0, 0, 550, 142.5, '#009999');
    D.rect(ctx, 0, 142.5, 550, 50, '#af8c72');
    D.line(ctx, 0, 142.5, 550, 142.5, '#663333', 1);
    D.rect(ctx, 0, 192, 550, 126, '#916953');
    D.line(ctx, 0, 192, 550, 192, '#663333', 1);
    var g = ctx.createLinearGradient(0, 318, 550, 400);
    g.addColorStop(0, '#8e8b6d');
    g.addColorStop(1, '#6a5423');
    ctx.fillStyle = g;
    ctx.fillRect(0, 318, 550, 82);
    D.line(ctx, 0, 318, 550, 318, '#333', 1);
    kiosk(ctx, 0);
    kiosk(ctx, 184);
    kiosk(ctx, 376);
    // fares list
    D.rect(ctx, 169, 48, 54, 52, '#cccccc', '#000', 1);
    D.text(ctx, 'Fares', 196, 56, { size: 8, align: 'center', color: '#000' });
    D.line(ctx, 174, 58.5, 218, 58.5, '#000', 0.8);
    D.text(ctx, 'XGen Studios...', 196, 65, { size: 3, align: 'center', color: '#000' });
    D.text(ctx, 'Flash games for', 196, 73, { size: 3, align: 'center', color: '#000' });
    D.text(ctx, 'everyone!', 196, 77, { size: 3, align: 'center', color: '#000' });
    // safety poster: a bus on the road
    D.rect(ctx, 355, 50, 76, 75, '#eaeaea', '#000', 1);
    D.poly(ctx, [355, 50, 384, 50, 355, 78], '#006600');
    D.poly(ctx, [431, 50, 431, 64, 412, 50], '#006600');
    D.poly(ctx, [357, 125, 431, 76, 431, 125], '#666666');
    ctx.save();
    ctx.translate(393, 88);
    ctx.rotate(-0.55);
    D.roundRect(ctx, -34, -12, 68, 24, 4, '#ffffff', '#000099', 1);
    D.rect(ctx, -32, -2, 64, 6, '#00ccff', '#000099', 0.6);
    D.circle(ctx, -18, 12, 4, '#464646', '#000', 0.8);
    D.circle(ctx, 18, 12, 4, '#464646', '#000', 0.8);
    ctx.restore();
    ['Safety is', 'our top', 'priority.'].forEach(function (l, i) {
      D.text(ctx, l, 361, 70 + i * 14, { size: 10, color: '#000' });
      D.text(ctx, l, 360, 69 + i * 14, { size: 10, color: '#ccccff' });
    });
  }

  function hatch(ctx, y0, y1) {
    D.rect(ctx, 0, y0, 550, y1 - y0, '#cccccc');
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (var x = -20; x < 570; x += 34) {
      ctx.moveTo(x + 12, y0);
      ctx.lineTo(x, y1);
    }
    ctx.stroke();
    D.line(ctx, 0, y0, 550, y0, '#333333', 1);
  }

  function cityBackground(ctx) {
    // brick-brown buildings either side of a dark alley
    D.rect(ctx, 0, 0, 550, 264, '#834101');
    D.rect(ctx, 120, 0, 113, 264, '#000000');
    var g = ctx.createLinearGradient(233, 0, 347, 0);
    g.addColorStop(0, '#000000');
    g.addColorStop(1, '#834101');
    ctx.fillStyle = g;
    ctx.fillRect(233, 0, 114, 264);
    D.line(ctx, 120, 0, 120, 264, '#000', 1);
    // alley: a loading ramp, a trash can, somebody's tag on the wall
    var g2 = ctx.createLinearGradient(125, 0, 250, 0);
    g2.addColorStop(0, '#000000');
    g2.addColorStop(1, '#333333');
    ctx.fillStyle = g2;
    ctx.fillRect(120, 187, 227, 77);
    D.poly(ctx, [240, 196, 263, 196, 347, 263, 322, 263], '#666666', '#000', 0.6);
    D.rect(ctx, 241, 182, 15, 22, '#666666', '#000', 0.8);
    ctx.beginPath();
    ctx.ellipse(248.5, 182, 7.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#999999';
    ctx.fill();
    ctx.save();
    ctx.translate(300, 178);
    ctx.rotate(0.12);
    var rb = ctx.createLinearGradient(-30, 0, 30, 0);
    ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff'].forEach(function (c, i) { rb.addColorStop(i / 5, c); });
    D.text(ctx, 'URBE', 0, 8, { size: 20, align: 'center', color: rb, stroke: '#000', strokeWidth: 2, italic: true });
    ctx.restore();
    // windows
    [[0, 48, 28, 55], [418, 48, 63, 55]].forEach(function (w) {
      D.rect(ctx, w[0], w[1], w[2], w[3], '#00ccff', '#000', 1);
      D.line(ctx, w[0] + w[2] - 20, w[1] + 3, w[0] + w[2] - 4, w[1] + 15, '#ffffff', 1);
      D.line(ctx, w[0] + w[2] - 24, w[1] + 3, w[0] + w[2] - 8, w[1] + 15, '#ffffff', 1);
    });
    // storefront on the right
    D.rect(ctx, 470, 197, 80, 9, '#999999', '#000', 0.8);
    var g3 = ctx.createLinearGradient(0, 206, 0, 264);
    g3.addColorStop(0, '#00ccff');
    g3.addColorStop(1, '#0066cc');
    ctx.fillStyle = g3;
    ctx.fillRect(478, 206, 72, 58);
    [510, 534].forEach(function (x) { D.line(ctx, x, 206, x, 264, '#003366', 1.5); });
    D.rect(ctx, 470, 206, 8, 58, '#cccccc', '#000', 0.8);
    // street
    hatch(ctx, 264, 284);
    D.rect(ctx, 0, 284, 550, 7, '#333333');
    D.rect(ctx, 0, 291, 550, 84, '#666666');
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(0, 329.5);
    ctx.lineTo(550, 329.5);
    ctx.stroke();
    ctx.setLineDash([]);
    hatch(ctx, 375, 400);
  }

  SRPG.registerLocation({
    id: 'bus',
    hud: 'inside',
    music: 'inside',
    exit: 'bus',
    panel: { x: 154, y: 84, w: 356, h: 252 },
    onEnter: function () {
      st.screen = 'depot';
      st.trip = null;
      st.taken = false;
    },
    onLeave: function () {
      st.screen = 'depot';
      st.trip = null;
      st.taken = false;
    },
    background: function (ctx) {
      if (st.screen === 'city') cityBackground(ctx);
      else depotBackground(ctx);
    },
    view: function () {
      if (st.screen === 'city') showCity();
      else showDepot();
      return { custom: true };
    },
  });

  SRPG.bus = { CITIES: CITIES, TEXT: TEXT, DEAL_MSGS: DEAL_MSGS, travel: travel, takeOffer: takeOffer, state: st };
})();
