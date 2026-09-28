// Street people: dialogs drawn over the frozen city map (the original's root frames 7-10).
//   dealer     the red stick in the alley by the pawn shop: cocaine, $400 a gram
//   hobo       Homeless Harold outside Sticky's: give $10 or a bottle of booze
//   smokes     the smokes kid by the mansion: give him a pack of smokes
//   parkedcar  the unlocked car on the apartment lawn: hotwire it (350 intelligence)
// Rules, prices and time costs are the original's; the lines are reworded.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var ui = SRPG.ui;
  var rnd = SRPG.rng.random;

  var FONT = '"Arial Black", "Arial Bold", Arial, Helvetica, sans-serif';
  // Every street dialog uses the same blue panel, text field and button row.
  var PANEL = { x: 100, y: 84, w: 356, h: 202 };
  var TEXT = { x: 129, y: 98.5, w: 311 }; // centred, word-wrapped 12px text (stage coords)
  var ROW_Y = 229; // top of the button icons
  var LEAVE_X = 357;

  // location.js builds a fresh `g` on every entry, so per-visit state (the dialog text, which
  // buttons are shown) lives on it and resets exactly when the original re-ran its frame script.
  function visit(g, init) {
    if (!g.visit) g.visit = init(g.s);
    return g.visit;
  }

  function esc(t) { return SRPG.util.escape(t).replace(/\n/g, '<br>'); }

  function textBox(parent, html, x, y, w, align) {
    var t = ui.el('div', 'nopoint', parent, html);
    t.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;' +
      'font:bold 12px ' + FONT + ';color:#000;line-height:16.85px;text-align:' + (align || 'center') + ';white-space:normal';
    return t;
  }

  function label(text, big) {
    // Button labels are the original's 12px text in a button scaled to 75% (9px); prices and the
    // hotwire/leave labels use its 14px size.
    return '<span style="font-size:' + (big ? 10.5 : 9) + 'px;text-transform:none;white-space:nowrap">' + text + '</span>';
  }

  function button(g, parent, o) {
    var b = ui.iconButton(parent, { icon: o.icon, label: o.label, x: o.x - PANEL.x - 1, y: ROW_Y - PANEL.y - 1, w: o.w || 150, size: 36, id: o.id }, function () {
      o.onClick(g);
      if (SRPG.engine.sceneName === 'location' && SRPG.location.current === g.def.id) g.refresh();
    });
    var l = b.querySelector('.lbl');
    l.style.marginLeft = (o.gap != null ? o.gap : 6) + 'px';
    // Labels sit a little below the icon's middle in the original, the ones with the bigger
    // 14px pieces lower still (Flash drops the line to the taller baseline).
    l.style.position = 'relative';
    l.style.top = (o.dy != null ? o.dy : 1) + 'px';
    return b;
  }

  // The dialog: blue panel, the text (centred field, or a fixed left-aligned block for the
  // dealer), the action buttons and LEAVE.
  function dialog(g, text, buttons, opts) {
    opts = opts || {};
    var p = ui.panel(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
    p.setAttribute('data-loc', g.def.id);
    // (child positions are offset by the panel's 1px border)
    if (opts.fixed) textBox(p, text, opts.fixed.x - PANEL.x - 1, opts.fixed.y - PANEL.y - 1, opts.fixed.w, 'left');
    else textBox(p, text, TEXT.x - PANEL.x - 1, TEXT.y - PANEL.y - 1, TEXT.w, 'center').setAttribute('data-id', 'npc-text');
    buttons.forEach(function (b) { if (!b.hidden) button(g, p, b); });
    button(g, p, { icon: 'leave', label: label('LEAVE', true), x: LEAVE_X, w: 90, id: 'leave', gap: 5, dy: 2.5, onClick: function (gg) { gg.leave(); } });
    return { custom: true };
  }

  // --- the dealer (frame 7) --------------------------------------------------------------------
  SRPG.registerLocation({
    id: 'dealer',
    overlay: true,
    view: function (g) {
      return dialog(g,
        '"Yo man, step over here a sec. You wanna peep some<br>top-shelf merchandise? Trust me, man, you gonna<br>' +
        'rake in HUGE stacks off this certified, purified,<br>straight-outta-Colombia product. How much you<br>' +
        'want me to hook you up with?"',
        [{
          icon: 'cocaine', id: 'cocaine', x: 127, w: 150, gap: 9, dy: 2.5,
          label: label('1g Cocaine&nbsp; - &nbsp;<span style="font-size:10.5px">$400</span>'),
          onClick: function (gg) {
            // cash > 399 and fewer than 99 grams
            var s = gg.s;
            if (s.cash > 399 && s.items.cocaine < 99) {
              s.cash -= 400;
              s.items.cocaine += 1;
              gg.sfx('purchase');
            } else gg.error();
          },
        }],
        { fixed: { x: 116, y: 99, w: 330 } });
    },
  });

  // --- Homeless Harold (frame 8) ---------------------------------------------------------------
  var HOBO_MONEY = [
    'Much obliged! This is going straight into the bank. Money you leave in the bank grows a little every night, you know.',
    "So generous! With my luck lately I was about ready to swipe a gun and knock over the bank. Course, I haven't got the charm to pull that off. The corner store, though, maybe... *mumble*",
    'Much appreciated, sir.',
    "Thanks, sir. Gets awful cold with no roof over your head, awful cold. *Sigh* Wish MY backpack had a button to go home... *grumble grumble*",
    "Thank you, good sir! That puts me in mind of a tale... *mumble*...so I tell 'em NAPOLEON was NUTS! NUUUUTS!!! Just like...*mumble*... and THAT'S how come I don't go to the mall no more.",
    "You're so kind, reminds me of... *mumble*... a fella I used to know... *mumble*... so I tell him, I tell him (this is just before he breaks the news about my liver) I tell him, Jimmy, what've you got in your hands there?",
    "Thanks a bunch! *mumble*...in my day we only had rocks and hats for toys. And rocks ain't good eatin', you know. Gosh, I miss taily and scratchy and bitey and fuzzy.",
    "Bless you! But BEWARE! Step through that first door... and you're neither inside nor outside anymore. LIMBO. There's a Buddha in your belly, and your chakras will lead the way... yes.. *mumble*",
  ];
  var HOBO_BOOZE = [
    'Did I ever tell you how much I lo...*mumble*',
    '*hic*...I really apprec...appre...apprish...*hic*...thanks a lot.',
    "*hic*...Lemme tell ya...I'm not as drinked as you thunk I am...*buuuuurp*...wouldn't say no to another, kind sir...*hic*",
    "Ahh, lovely, lovely nectar...*hic*...it's what got me to where I am...*burp*...right now...*mumble*",
    '*warbling off key* Row, row, row your boat, gently down the...*hic*',
    '*glug glug glug* Aaaahhh...*snort*...much obliged...*hic*...miss.',
    '*sluuuurp*...hey, who turned out the lights...*hic*',
    "You tryin' to get me sloshed? 'Cause if you are...it's workin'...*hic*",
  ];

  SRPG.registerLocation({
    id: 'hobo',
    overlay: true,
    view: function (g) {
      // GIVE BOOZE is hidden when you arrive with no beer; it stays as it was until you come back.
      var v = visit(g, function (s) { return { text: 'Got any spare change, friend?', booze: s.booze !== 0 }; });
      return dialog(g, esc(v.text), [{
        icon: 'give10', id: 'give10', x: 126, w: 96, gap: 10, dy: 2.5,
        label: label('GIVE&nbsp; <span style="font-size:10.5px">$10</span>'),
        onClick: function (gg) {
          var s = gg.s;
          if (s.time < 24 && s.cash > 9) {
            gg.sfx('purchase');
            s.cash -= 10;
            s.time += 1;
            gg.addKarma(2);
            if (s.hoboMoney === 0) {
              v.text = 'Oh, bless you! Such a charming thing to do... *mumble*\n\n\n(CHARM INCREASED BY 6)';
              s.charm = Math.min(s.charm + 6, 999);
              s.hoboMoney = 1;
            } else v.text = HOBO_MONEY[rnd(8)];
          } else gg.error();
        },
      }, {
        icon: 'givebooze', id: 'givebooze', x: 232, w: 104, gap: 5, dy: 2, hidden: !v.booze,
        label: label('GIVE BOOZE'),
        onClick: function (gg) {
          // No karma for booze, and no purchase sound.
          var s = gg.s;
          if (s.time < 24 && !(s.booze < 1)) {
            s.booze -= 1;
            s.time += 1;
            if (s.hoboBooze === 0) {
              v.text = 'Hooch! Sweet, precious hooch!\n\n\n(CHARM INCREASED BY 8)';
              s.charm = Math.min(s.charm + 8, 999);
              s.hoboBooze = 1;
            } else v.text = HOBO_BOOZE[rnd(8)];
          } else gg.error();
        },
      }]);
    },
  });

  // --- the smokes kid (frame 9) ----------------------------------------------------------------
  var KID_THANKS = [
    "Awesome, dude! You're soooo rad!",
    "Whoa man, you're the best! Now my girlfriend can quit bumming my smokes!",
    '*hack hack* Mmmm yeah...that hits the spot.',
    "Sweet, cigs! The kids at school pay me big bucks for these!",
    'Cool, thanks man. Hey, could you grab the menthols next time? Thanks.',
    '*cough cough* Niiiiiiice...*hack*',
    'Dude, can you, like, adopt me or something?',
    'Thanks man! And I was actually gonna quit, too...oh well! Got a lighter?',
  ];

  SRPG.registerLocation({
    id: 'smokes',
    overlay: true,
    view: function (g) {
      var v = visit(g, function (s) {
        return {
          text: s.smokesKid === 0
            ? "Yo dude! Got any smokes? I'm totally old enough, it's just...I.. um.. uh.. left my ID at home!\nC'mon?"
            : 'Yo dude!\n*Cough* *Hack*\nAppreciate the *wheeze* smokes, man...',
          give: true,
        };
      });
      return dialog(g, esc(v.text), [{
        icon: 'givesmokes', id: 'givesmokes', x: 126.6, w: 120, gap: 6, hidden: !v.give,
        label: label('GIVE&nbsp; SMOKES'),
        onClick: function (gg) {
          var s = gg.s;
          if (s.time < 24 && s.items.smokes > 0) {
            s.time += 1;
            s.items.smokes -= 1;
            s.packNumber += 1;
            gg.addKarma(-2);
            if (s.smokesKid === 0) {
              v.text = "Awesome, dude! You're sooo rad! Here, you can HAVE this!\n\n\n(SKATEBOARD RECEIVED - CHECK INVENTORY)";
              s.items.skateboard = 1;
              s.smokesKid = 1;
            } else if (!(s.packNumber < 10)) {
              // The tenth pack finishes him off: his GIVE SMOKES button goes, he is gone from the
              // street for good (city.js hides him at packNumber >= 10), the police call, and a
              // further -30 karma — applied without the usual clamp, as in the original.
              v.text = "Thanks *cough cough* man! ...*hack cough*...I don't think...I'm gonna make it...*gag*";
              v.give = false;
              gg.msg("Detective McHolland here...I've got reason to think you were mixed up in a teenage boy's " +
                "death from smoking way too much. I'd go find myself a lawyer if I were you, punk..");
              s.karma -= 30;
            } else v.text = KID_THANKS[rnd(8)];
          } else gg.error();
        },
      }]);
    },
  });

  // --- the parked car (frame 10) ---------------------------------------------------------------
  SRPG.registerLocation({
    id: 'parkedcar',
    overlay: true,
    view: function (g) {
      var v = visit(g, function (s) {
        return { text: 'Looks like somebody left their car parked out on the lawn with the doors unlocked.', show: s.items.car !== 1 };
      });
      return dialog(g, esc(v.text), [{
        icon: 'hotwire', id: 'hotwire', x: 125, w: 180, gap: 5, dy: 2.5, hidden: !v.show,
        label: label('ATTEMPT TO HOTWIRE', true),
        onClick: function (gg) {
          // One hour either way. The original has no clock check here (so this can run past 24:00).
          var s = gg.s;
          if (s.intelligence < 350) {
            s.time += 1;
            v.text = "No dice. You'd need a lot more brains to figure out which wires go where!";
          } else {
            s.items.car = 1; // the car is yours: it leaves the lawn, press 'c' to drive
            v.show = false;
            s.time += 1;
            v.text = "It's running! Press 'c' whenever you feel like driving, and press 'c' again to hop back out.";
          }
        },
      }]);
    },
  });
})();
