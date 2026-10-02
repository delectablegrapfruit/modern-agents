// js/ui/screens/newgame.js — owner: W2-Front. The new-game wizard (UI §5.3; GDD §5; BALANCE B-02):
// a centred 960 × 560 paper card with a 3-step header (1 Length & Rules · 2 Character · 3 Name &
// Look), Back and Next.
//   Step 1: Length (Short 15 · Medium 40 · Long 100 · Unlimited; Custom 7-365 with the P2
//     `customLength` flag) and Difficulty (Relaxed · Standard · Hardcore), each with a one-line note.
//   Step 2: three paper dice roll (animated) for STR / INT / CHA plus the extra points (orig: each
//     stat rand(1..10), rand(3..9) extra; SR.rules.state.roll on the wizard's own stream), − / +
//     steppers that move points between a stat and the pool (orig: down to 0; unspent points are
//     lost), Roll again (unlimited, orig) and Fair start (7 / 7 / 7 + 6); live readouts: HP (= STR +
//     15) and when NLI would hire you (INT 20, B-05).
//   Step 3: the name TextField (≤ 16), a rotating stick preview in karma-neutral blue, the accessory
//     carousel (P1; shown with the `wardrobe` flag until the lead names its flag), the tutorial
//     toggle and Begin. Naming yourself PAPERGOD shows a wink and no warning (B-02: the cheat).
// Begin builds the state (SR.rules.state.create), makes it live (SR.save.load), writes a Hardcore
// run's ironman slot at once, and plays the intro.
// Load-time rule: defines functions only.
(function () {
  'use strict';
  var SR = window.SR;

  var STATS = ['str', 'int', 'cha'];
  var DICE_SEC = 0.6, DICE_FLIP = 0.07;        // the dice tumble, and how often a tumbling face changes
  var DIE = 72;                                // a die's canvas (CSS px)
  var PREVIEW_W = 180, PREVIEW_H = 220;        // the stick preview (CSS px)
  var TURN_SEC = 0.9;                          // the preview turns to its next facing
  var FACINGS = ['right', 'down', 'left', 'down'];
  var ACCESSORIES = ['none', 'cap', 'beanie', 'glasses', 'bowtie', 'scarf', 'headphones', 'tophat'];   // UI §5.3 (P1)
  var CUSTOM_MIN = 7, CUSTOM_MAX = 365;        // GDD §5 (P2)

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function text(k, v) { return SR.text(k, v); }
  function T() { return SR.tuning.start; }

  function lengths() { return (SR.tuning.endgame && SR.tuning.endgame.hof && SR.tuning.endgame.hof.lengths) || [15, 40, 100, 0]; }
  /** The standard lengths' names follow their Hall of Fame buckets (B-18 `hof.lengths`); any other length is Custom. */
  function lengthId(n) {
    var E = SR.rules.endgame;
    if (lengths().indexOf(n) < 0) return 'custom';
    return E && typeof E.hofBucket === 'function' ? E.hofBucket(n) : ['short', 'medium', 'long', 'unlimited'][lengths().indexOf(n)];
  }
  function difficulties() { return Object.keys(SR.tuning.difficulty || { relaxed: 1, standard: 1, hardcore: 1 }); }
  function nliInt() { var j = SR.tuning.jobs && SR.tuning.jobs.janitor; return j ? j.int : 20; }

  /** The wizard's state; `seed` picks the new game's seed and the dice stream. */
  function create(opts) {
    opts = opts || {};
    var seed = typeof opts.seed === 'number' ? opts.seed >>> 0 : (SR.rng.fx.next() >>> 0);
    var p = null;
    try { p = SR.save.profile(); } catch (e) { p = null; }
    var runs = p && p.totals && p.totals.runs ? p.totals.runs : 0;
    var W = {
      seed: seed, rng: SR.rng.create(SR.util.hash(seed, 'roll')), step: 1,
      length: 40, custom: 40, difficulty: 'standard',
      base: null, stats: null, pool: 0, rolls: 0, fair: false,
      name: '', acc: 'none', tutorial: runs === 0,
      dice: { t: DICE_SEC, flip: 0, faces: { str: 1, int: 1, cha: 1 } },
      turn: 0, facing: 0,
    };
    roll(W);
    W.dice.t = DICE_SEC;                    // the first roll lands as the card opens (no tumble)
    return W;
  }

  /** Roll again (orig: unlimited): each stat rand(1..10) and rand(3..9) extra (B-02). */
  function roll(W) {
    var r = SR.rules.state.roll(W.rng);
    W.base = { str: r.str, int: r.int, cha: r.cha };
    W.stats = { str: r.str, int: r.int, cha: r.cha };
    W.pool = r.extra;
    W.rolls++;
    W.fair = false;
    W.dice.t = 0;
  }
  /** Fair start: 7 / 7 / 7 + 6 (B-02). */
  function fair(W) {
    var f = SR.rules.state.fair();
    W.base = { str: f.str, int: f.int, cha: f.cha };
    W.stats = { str: f.str, int: f.int, cha: f.cha };
    W.pool = f.extra;
    W.fair = true;
    W.dice.t = DICE_SEC;
  }
  /** Moves one point between a stat and the pool (orig: a stat may go down to 0). */
  function step(W, stat, d) {
    if (d > 0 && W.pool > 0 && W.stats[stat] < T().statCap) { W.stats[stat]++; W.pool--; return true; }
    if (d < 0 && W.stats[stat] > 0) { W.stats[stat]--; W.pool++; return true; }
    return false;
  }
  function gameLength(W) { return W.length === -1 ? W.custom : W.length; }
  function cheatName(name) { var c = T().cheat; return !!(c && String(name || '').trim().toUpperCase() === c.name); }

  /** The options for SR.rules.state.create. */
  function options(W) {
    var o = { seed: W.seed, name: W.name.trim(), stats: { str: W.stats.str, int: W.stats.int, cha: W.stats.cha },
      difficulty: W.difficulty, length: gameLength(W), tutorial: !!W.tutorial };
    if (SR.features.wardrobe && W.acc !== 'none') o.look = { acc: W.acc };
    return o;
  }

  // ------------------------------------------------------------------------------------------------
  // Drawing: the paper dice and the stick preview (canvas; palette keys only)
  // ------------------------------------------------------------------------------------------------
  function sizeCanvas(cv, w, hh) {
    var k = ((SR.stage && SR.stage.uiK) || 1) * (window.devicePixelRatio || 1);
    var bw = Math.round(w * k), bh = Math.round(hh * k);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    var ctx = cv.getContext('2d');
    if (ctx) { ctx.setTransform(k, 0, 0, k, 0, 0); ctx.clearRect(0, 0, w, hh); }
    return ctx;
  }

  function drawDie(cv, value, stat, tumble) {
    var ctx = sizeCanvas(cv, DIE, DIE);
    if (!ctx) return;
    var A = SR.art.draw, s = DIE;
    ctx.save();
    ctx.translate(s / 2, s / 2);
    if (tumble) ctx.rotate(tumble);
    A.shadow(ctx, function (g) { A.roundRect(g, -s * 0.38, -s * 0.38, s * 0.76, s * 0.76, 10); }, { dx: 3, dy: 4 });
    A.roundRect(ctx, -s * 0.38, -s * 0.38, s * 0.76, s * 0.76, 10);
    A.paperFill(ctx, 'ui.paper-0');
    A.inkStroke(ctx, 2.5);
    ctx.fillStyle = A.color('ui.' + stat);
    ctx.fillRect(-s * 0.38 + 6, -s * 0.38 + 5, s * 0.76 - 12, 4);
    A.text(ctx, String(value), 0, s * 0.14, { size: 30, role: 'display', color: 'ui.ink-900', align: 'center' });
    ctx.restore();
  }

  function drawPreview(cv, W) {
    var ctx = sizeCanvas(cv, PREVIEW_W, PREVIEW_H);
    if (!ctx) return;
    var A = SR.art.draw;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(PREVIEW_W / 2, PREVIEW_H - 26, 56, 12, 0, 0, Math.PI * 2);
    A.paperFill(ctx, 'ui.paper-3');
    if (SR.art.stick && typeof SR.art.stick.draw === 'function') {
      var look = { acc: SR.features.wardrobe && W.acc !== 'none' ? [W.acc] : [] };
      try {
        SR.art.stick.draw(ctx, 'idle', { x: PREVIEW_W / 2, y: PREVIEW_H - 28, view: 'side', facing: FACINGS[W.facing], scale: 1.05,
          player: true, karma: 0, look: look, t: W.turn, shadow: false });
      } catch (e) { SR.util.warnOnce('newgame.preview', 'newgame: the stick preview failed (' + e.message + ')'); }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------------------------------------
  // The card
  // ------------------------------------------------------------------------------------------------
  /**
   * Builds the wizard into root.
   * @param {HTMLElement} root
   * @param {{seed: number, onBack: function, onBegin: function(object)}} opts onBegin gets the
   *   SR.rules.state.create options
   * @returns {object} the handle: { W, el, update(dt), back(), next(), destroy() }
   */
  function mount(root, opts) {
    opts = opts || {};
    var W = create(opts);
    var U = { W: W, scope: null, dice: {}, values: {}, destroyed: false };
    var steps = h('ol', { class: 'ng-steps', 'data-id': 'ng-steps', 'aria-label': text('front.new.title') });
    var body = h('div', { class: 'ng-body', 'data-id': 'ng-body' });
    var backBtn = SR.ui.button({ id: 'ng-back', label: 'ui.back', hint: 'back', onClick: function () { U.back(); } });
    var nextBtn = SR.ui.button({ id: 'ng-next', label: 'front.new.next', variant: 'primary', onClick: function () { U.next(); } });
    var card = h('section', { class: 'ng-card paper', 'data-id': 'newgame', role: 'dialog', 'aria-label': text('front.new.title') },
      h('h1', { class: 'ng-title t-h2' }, text('front.new.title')), steps, body,
      h('div', { class: 'ng-foot' }, backBtn, nextBtn));
    root.appendChild(card);
    U.el = card;

    function header() {
      D().clear(steps);
      [1, 2, 3].forEach(function (n) {
        steps.appendChild(h('li', { class: ['ng-step', n === W.step ? 'is-current' : '', n < W.step ? 'is-done' : ''], 'data-id': 'ng-step-' + n,
          'aria-current': n === W.step ? 'step' : null }, text('front.new.step' + n)));
      });
      nextBtn.update({ label: W.step === 3 ? 'front.new.begin' : 'front.new.next' });
    }

    function segField(id, label, value, options, onChange, note) {
      var noteEl = h('p', { class: 'ng-note', 'data-id': id + '-note' }, note);
      var seg = SR.ui.segmented({ id: id, label: label, value: value, options: options, onChange: function (v) { onChange(v, noteEl); } });
      return h('div', { class: 'ng-field' }, h('h2', { class: 'ng-label' }, text(label)), seg, noteEl);
    }

    function step1() {
      var lens = lengths().map(function (n) { return { id: lengthId(n), label: text('front.new.len.' + lengthId(n), { n: n }) }; });
      if (SR.features.customLength) lens.push({ id: 'custom', label: text('front.new.len.custom') });
      var customBox = h('div', { class: 'ng-custom' });
      var cur = W.length === -1 ? 'custom' : lengthId(W.length);
      function lenNote(id) { return text('front.new.len.' + id + '.note', { n: id === 'custom' ? W.custom : W.length }); }
      function showCustom() {
        D().clear(customBox);
        if (W.length !== -1) return;
        customBox.appendChild(SR.ui.numberField({ id: 'ng-custom', label: 'front.new.len.customDays', value: W.custom, min: CUSTOM_MIN, max: CUSTOM_MAX,
          step: 1, quick: [], onChange: function (v) { W.custom = v; } }));
      }
      body.appendChild(segField('ng-length', 'front.new.length', cur, lens, function (id, noteEl) {
        W.length = id === 'custom' ? -1 : lengths().filter(function (n) { return lengthId(n) === id; })[0];
        noteEl.textContent = lenNote(id);
        showCustom();
      }, lenNote(cur)));
      body.appendChild(customBox);
      showCustom();
      body.appendChild(segField('ng-diff', 'front.new.difficulty', W.difficulty,
        difficulties().map(function (d) { return { id: d, label: text('front.diff.' + d) }; }), function (d, noteEl) {
          W.difficulty = d;
          noteEl.textContent = text('front.new.diff.' + d + '.note', { cash: SR.text.money(T().cash[d] || 0) });
        }, text('front.new.diff.' + W.difficulty + '.note', { cash: SR.text.money(T().cash[W.difficulty] || 0) })));
    }

    function statRow(st) {
      var cv = h('canvas', { class: 'ng-die', 'data-id': 'ng-die-' + st, 'aria-hidden': 'true', style: { width: DIE + 'px', height: DIE + 'px' } });
      var val = h('span', { class: 'ng-stat-v', 'data-id': 'ng-' + st + '-value' });
      U.dice[st] = cv; U.values[st] = val;
      var minus = SR.ui.button({ id: 'ng-' + st + '-minus', label: 'front.new.less', vars: { stat: text('ui.stat.' + st) }, size: 's', onClick: function () { if (step(W, st, -1)) refresh(); else D().refuse(minus); } });
      var plus = SR.ui.button({ id: 'ng-' + st + '-plus', label: 'front.new.more', vars: { stat: text('ui.stat.' + st) }, size: 's', onClick: function () { if (step(W, st, 1)) refresh(); else D().refuse(plus); } });
      return h('div', { class: 'ng-stat ng-stat--' + st, 'data-id': 'ng-stat-' + st },
        cv, h('span', { class: 'ng-stat-name' }, text('ui.statLong.' + st)), minus, val, plus);
    }

    var readHp = null, readNli = null, readPool = null, readLeft = null;
    function step2() {
      var rows = h('div', { class: 'ng-stats' });
      STATS.forEach(function (st) { rows.appendChild(statRow(st)); });
      readPool = h('p', { class: 'ng-pool', 'data-id': 'ng-pool', 'aria-live': 'polite' });
      readHp = h('p', { class: 'ng-read', 'data-id': 'ng-hp' });
      readNli = h('p', { class: 'ng-read', 'data-id': 'ng-nli' });
      readLeft = h('p', { class: 'ng-note', 'data-id': 'ng-left' });
      body.appendChild(h('div', { class: 'ng-two' }, rows,
        h('div', { class: 'ng-side' }, readPool,
          SR.ui.button({ id: 'ng-roll', label: 'front.new.roll', onClick: function () { roll(W); D().sfx('toggle'); refresh(); } }),
          SR.ui.button({ id: 'ng-fair', label: 'front.new.fair', onClick: function () { fair(W); D().sfx('toggle'); refresh(); } }),
          readHp, readNli, readLeft)));
    }

    var nameField = null, wink = null, preview = null, accLabel = null;
    function step3() {
      nameField = SR.ui.textField({ id: 'ng-name', label: 'front.new.name', value: W.name, maxLength: T().nameMax,
        hint: 'front.new.nameHint', onChange: function (v) { W.name = v; nameField.update({ error: '' }); winkShow(); },
        onSubmit: function () { U.next(); } });
      wink = h('p', { class: 'ng-wink', 'data-id': 'ng-wink', hidden: true }, text('front.new.wink'));
      preview = h('canvas', { class: 'ng-preview', 'data-id': 'ng-preview', 'aria-hidden': 'true', style: { width: PREVIEW_W + 'px', height: PREVIEW_H + 'px' } });
      var left = h('div', { class: 'ng-col' }, nameField, wink);
      if (SR.features.wardrobe) {
        accLabel = h('span', { class: 'ng-acc-name', 'data-id': 'ng-acc' });
        var turnAcc = function (d) { var i = ACCESSORIES.indexOf(W.acc); W.acc = ACCESSORIES[(i + d + ACCESSORIES.length) % ACCESSORIES.length]; refresh(); };
        left.appendChild(h('div', { class: 'ng-acc', role: 'group', 'aria-label': text('front.new.acc') },
          h('span', { class: 'ng-label' }, text('front.new.acc')),
          SR.ui.button({ id: 'ng-acc-prev', label: 'front.new.accPrev', size: 's', onClick: function () { turnAcc(-1); } }), accLabel,
          SR.ui.button({ id: 'ng-acc-next', label: 'front.new.accNext', size: 's', onClick: function () { turnAcc(1); } })));
      }
      left.appendChild(SR.ui.toggle({ id: 'ng-tutorial', label: 'front.new.tutorial', value: W.tutorial, onChange: function (v) { W.tutorial = v; } }));
      body.appendChild(h('div', { class: 'ng-two' }, left, h('figure', { class: 'ng-fig' }, preview)));
      winkShow();
    }
    function winkShow() { if (wink) wink.hidden = !cheatName(W.name); }

    function refresh() {
      if (W.step === 2) {
        STATS.forEach(function (st) { U.values[st].textContent = String(W.stats[st]); drawDie(U.dice[st], W.stats[st], st, 0); });
        readPool.textContent = text('front.new.pool', { n: W.pool });
        readHp.textContent = text('front.new.hp', { hp: T().hpMaxBase + W.stats.str });
        var need = nliInt();
        readNli.textContent = W.stats.int >= need ? text('front.new.nliNow') : text('front.new.nli', { n: need });
        readLeft.textContent = W.pool > 0 ? text('front.new.unspent') : '';
      }
      if (W.step === 3) {
        if (accLabel) accLabel.textContent = text('front.new.accessory.' + W.acc);
        drawPreview(preview, W);
      }
    }

    function show() {
      var had = SR.ui.focus.focused();
      if (SR.ui.tooltip && SR.ui.tooltip.hide) SR.ui.tooltip.hide();   // a control's tip would outlive its step
      D().clear(body);
      nameField = null; wink = null; preview = null; accLabel = null;
      header();
      if (W.step === 1) step1(); else if (W.step === 2) step2(); else step3();
      refresh();
      if (U.scope) {
        var first = W.step === 3 && nameField ? nameField.input : body.querySelector('[data-nav]');
        if (W.step === 3 && nameField) SR.ui.focus.focus(nameField.input);          // type the name, Enter begins
        else if (!had || !card.contains(had) || !had.isConnected) SR.ui.focus.focus(first || nextBtn);
        else if (had !== nextBtn && had !== backBtn) SR.ui.focus.focus(first || nextBtn);
      }
      D().announce(text('front.new.step' + W.step));
    }

    /** Back: the previous step, or the title from the first. */
    U.back = function () {
      if (W.step > 1) { W.step--; D().sfx('close'); show(); return true; }
      if (opts.onBack) opts.onBack();
      return true;
    };
    /** Next, or Begin on the last step (a name is needed, orig). */
    U.next = function () {
      if (W.step < 3) { W.step++; D().sfx('click'); show(); return true; }
      W.name = nameField ? nameField.value : W.name;
      if (!W.name.trim()) { nameField.update({ error: 'front.new.needName' }); D().refuse(nameField.input); SR.ui.focus.focus(nameField.input); return false; }
      if (opts.onBegin) opts.onBegin(options(W));
      return true;
    };
    /** Per fixed step: the dice tumble, the preview turns. */
    U.update = function (dt) {
      if (U.destroyed) return;
      if (W.step === 2 && W.dice.t < DICE_SEC) {
        W.dice.t += dt;
        W.dice.flip += dt;
        var done = W.dice.t >= DICE_SEC || D().fast();
        if (done) { W.dice.t = DICE_SEC; refresh(); }
        else if (W.dice.flip >= DICE_FLIP) {
          W.dice.flip = 0;
          STATS.forEach(function (st) {
            var r = SR.tuning.start.statRoll;
            drawDie(U.dice[st], SR.rng.fx.int(r[0], r[1]), st, D().reduced() ? 0 : SR.rng.fx.float(-0.5, 0.5));
          });
        }
      }
      if (W.step === 3 && preview && !D().reduced()) {
        W.turn += dt;
        if (W.turn >= TURN_SEC) { W.turn = 0; W.facing = (W.facing + 1) % FACINGS.length; drawPreview(preview, W); }
      }
    };
    U.destroy = function () {
      U.destroyed = true;
      if (U.scope) SR.ui.focus.pop(U.scope);
      U.scope = null;
    };

    show();
    U.scope = SR.ui.focus.push(card, { id: 'newgame' });
    return U;
  }

  SR.ui.newgame = { mount: mount, create: create, roll: roll, fair: fair, step: step, options: options, cheatName: cheatName, ACCESSORIES: ACCESSORIES.slice() };
})();
