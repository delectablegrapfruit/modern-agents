// Lull — the Factory, shelved for now: the line (factory.js), its floor (factoryview.js), and here its tab's mode, its
// achievements and the looks it gives. None of this folder is loaded, cached or deployed; the game runs without it.
// To bring it back:
//   index.html   the view below, between Puzzles and the Shop; factory.js before store.js, factoryview.js after
//                render.js, and this file after modes.js (each also in sw.js's FILES; the files back in Game/js/)
//   lull.css     factory.css here, under "factory", and .fac-plate in the touch-action: none list
//   app.js       its tab in TABS after Puzzles ({ id: 'factory', label: 'Factory', icon: 'factory', group: 'modes' }),
//                the mode made in init (and catchUp(true) there, on visibilitychange and on 'shown'), show and hide in
//                setTab, Escape in the key handler, cv-floor in bindGlobal's ResizeObserver, relayout in onResize, frame
//                in frame(), tick in second(), its time in stats.timeMs.factory, and the self-test's 'factory runs'
//   collapse.js  hide and show it as the window rolls up and down on its tab
//   store.js     factory: Factory.create() in the defaults, Factory.repair in loadState, timeMs.factory and
//                lines.factory in the stats; the shop shows the reward looks again (inShop)
//   ui.js        Stats ▸ Factory, its rows in the Overview, and the shop's lock on a reward look
// Its tests (scripts/test.cjs, browser-test.cjs, econ-test.cjs, touch-test.cjs, tabbar-test.cjs) are in the history,
// in the commit that shelved it.
//
// The view, as it was in index.html:
//   <!-- Factory: the floor fills the tab; its parts are buttons, each opening a small card with its upgrade -->
//   <section class="view" id="view-factory" data-tab="factory">
//     <div class="fac-plate" id="fac-plate">
//       <div class="fac-clip"><canvas id="cv-floor" aria-hidden="true"></canvas></div>
//       <div class="fac-hots" id="fac-hots" role="group" aria-label="Factory"></div>
//     </div>
//   </section>
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Factory, UI, fmtInt, fmtLines } = L;
  const { h, toast } = UI;
  const { LINE } = L;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const REWARD_UNLOCKS = [
    { kind: 'palette', id: 'assembly', test: (f) => f.asm.length >= 1 },
    { kind: 'frame', id: 'hazard', test: (f) => f.droppers >= 3 },
    { kind: 'skin', id: 'steel', test: (f) => f.asm.length >= 3 },
    { kind: 'backdrop', id: 'belt', test: (f) => f.stats.delivered >= 500 },
    { kind: 'effect', id: 'sparks', test: (f) => f.beltSpeed >= Factory.topOf('beltSpeed') },
  ];

  // What the line sounds like (existing ids only; each at most every 0.4 s, and only with the window in front).
  const LINE_SOUNDS = { drop: 'stamp', build: 'pack', clear: 'land', full: 'bell' };
  // Nobody around: Lull hidden, or untouched this long. The line runs on for Factory.AWAY_H, then rests.
  const AWAY_IDLE_MS = 10 * 60e3;
  // The sign's name for a screen reader (the sign itself shows no words).
  const SIGN_SAYS = { smooth: 'Factory running smoothly', working: 'Factory working', full: 'Factory held up: the store is full', idle: 'Factory idle' };
  const PLURAL = { 2: 'dominoes', 3: 'trominoes', 4: 'tetrominoes', 5: 'pentominoes' };

  /**
   * The Factory: the floor fills the tab, and its parts are the buttons. Tapping one opens a small card on it with its
   * upgrade (what changes, the price, Buy); an empty spot offers the part itself; the store also sells its loose minos;
   * the sign shows the board's lifetime lines. Lines the board clears go straight into the wallet.
   */
  class FactoryMode {
    constructor(app) {
      this.app = app;
      this.el = document.getElementById('view-factory');
      this.canvas = document.getElementById('cv-floor');
      this.view = new L.FloorView(this.canvas);
      this.plate = document.getElementById('fac-plate');
      this.hots = document.getElementById('fac-hots');
      this.visible = false;
      this.panelAt = 0; this.achAt = 0; this.soundAt = {};
      this.away = null;   // time away not yet told: { seconds, lines, earned }
      this.hotKey = ''; this.signSaid = ''; this.card = null; this.cardFor = null; this.labelsKey = '';
      this.buildHots();
      // A tap anywhere but the card or a part closes the card.
      document.addEventListener('pointerdown', (e) => { if (this.card && !this.card.contains(e.target) && !this.hots.contains(e.target)) this.closeCard(false); }, true);
    }

    get f() { return this.app.store.state.factory; }
    get store() { return this.app.store; }
    get reduced() { return this.app.reducedMotion(); }

    // ---- time ---------------------------------------------------------------------------------------------------------

    /** Nobody around: Lull hidden, or nothing touched for ten minutes. */
    closed() {
      return !!(document.hidden || performance.now() - (this.app.lastActivity || 0) > AWAY_IDLE_MS);
    }

    /** Time away (more than five seconds since the line last ran): replayed in one go, nobody around. */
    catchUp(announce) {
      const f = this.f, now = Date.now();
      let res = null;
      if (now - f.lastTick > 5000 || now < f.lastTick) {
        res = Factory.catchUp(f, now);
        if (res) {
          this.bank();
          if (this.visible) { this.view.settle(); this.away = null; }
          else { const a = this.away || { seconds: 0, lines: 0, earned: 0 }; this.away = { seconds: a.seconds + res.seconds, lines: a.lines + res.lines, earned: a.earned + res.earned }; }
          this.afterChange();
        }
      }
      if (announce && this.away && !this.visible) {
        const a = this.away;
        this.away = null;
        if (a.seconds > 90 && a.lines > 0) toast('While you were away the factory cleared ' + fmtInt(a.lines) + (a.lines === 1 ? ' line' : ' lines') + ' · +' + fmtLines(a.earned) + ' ' + LINE, 'good', 5000);
      }
      return res;
    }

    /** Runs the line up to now; pays what the board cleared. */
    advance() {
      const f = this.f, now = Date.now();
      if (now - f.lastTick > 5000 || now < f.lastTick) { this.catchUp(this.visible && !document.hidden); return []; }
      const evs = Factory.step(f, (now - f.lastTick) / 1000, this.closed());
      f.lastTick = now;
      this.bank();
      return evs;
    }

    /** Whole lines the board has paid go into the wallet. */
    bank() {
      const n = Factory.takeLines(this.f);
      if (!n) return 0;
      this.store.addLines(n, 'factory');
      this.app.refreshWallet(this.visible);
      return n;
    }

    show() {
      this.visible = true;
      this.view.settle();
      this.catchUp(false);
      this.away = null;
      Factory.visit(this.f);
      this.labelsKey = '';
      this.relayout();
      this.update();
    }

    hide() {
      this.visible = false;
      this.closeCard(false);
      this.view.settle();
    }

    /** Every second while the factory is not on screen (and Lull is not hidden): the line runs on. */
    tick() {
      if (this.visible || document.hidden) return;
      this.onEvents(this.advance(), false);
      const now = Date.now();
      if (now - this.achAt > 10000) { this.achAt = now; this.afterChange(false); }
    }

    frame(t, dt) {
      const evs = this.advance(), reduced = this.reduced;
      if (this.roomDirty || (root.devicePixelRatio || 1) !== this.dprSeen) { this.dprSeen = root.devicePixelRatio || 1; this.relayout(); }
      this.view.events(evs, reduced);
      this.onEvents(evs, true);
      this.view.render(dt, this.f, this.app.look(), { wallet: this.store.state.lines });
      this.placeHots();
      this.sayMood();
      if (this.el.classList.contains('fac-still') !== reduced) this.el.classList.toggle('fac-still', reduced);
      if (t - this.panelAt > 250) { this.panelAt = t; this.update(); }
    }

    onEvents(evs, audible) {
      if (!evs.length) return;
      let paid = false;
      for (const e of evs) {
        if (e.kind === 'clear') paid = true;
        if (audible) this.lineSound(LINE_SOUNDS[e.kind]);
      }
      if (paid) this.afterChange();
    }

    lineSound(id) {
      if (!id || document.hidden || !document.hasFocus()) return;
      const now = performance.now();
      if (now - (this.soundAt[id] || 0) < 400) return;
      this.soundAt[id] = now;
      this.app.sound.play(id);
    }

    /** Rewards and achievements after anything changed on the line (and a save, unless it is only the quiet check). */
    afterChange(touch) {
      for (const u of REWARD_UNLOCKS) {
        if (!this.store.owns(u.kind, u.id) && u.test(this.f)) {
          this.store.grantCosmetic(u.kind, u.id);
          toast('Unlocked: ' + L.COSMETICS[u.kind][u.id].name, 'good', 4000);
        }
      }
      this.app.achieve({ mode: 'factory' });
      if (touch !== false) this.store.touch();
    }

    // ---- verbs --------------------------------------------------------------------------------------------------------

    /** Builds the next of a kind; short of lines, it says so (a soft no, and the card's flash). */
    upgrade(kind) {
      const u = Factory.nextUpgrade(this.f, kind);
      if (!u) return false;
      if (this.store.state.lines < u.cost || !this.store.spend(u.cost)) { this.app.sound.play('blocked'); this.flashCard(); return false; }
      Factory.upgrade(this.f, kind);
      this.app.refreshWallet();
      this.app.sound.play('buy');
      this.afterChange();
      this.labelsKey = '';
      this.update();
      if (this.cardFor) this.renderCard(true);
      return true;
    }

    /** Sells every mino in the store at the loose rate. */
    sell() {
      const res = Factory.sell(this.f);
      if (!res) { this.app.sound.play('blocked'); return false; }
      this.bank();
      this.app.sound.play('golden');
      this.afterChange();
      if (this.cardFor) this.renderCard(true);
      return true;
    }

    /** The sign shows the board's lifetime lines for a few seconds (a second tap puts it back). */
    tapSign() {
      this.closeCard(false);
      const on = this.view.toggleCount(this.f.stats.lines);
      this.signSaid = '';
      if (on) this.app.sound.play('rotate');
      return on;
    }

    flashCard() {
      const b = this.card;
      if (!b || this.reduced) return;
      b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
      b.addEventListener('animationend', () => b.classList.remove('flash'), { once: true });
    }

    /** Escape closes the card, back on its part (app.js asks first, on the Factory tab). */
    key(e) {
      if (e.key !== 'Escape' || !this.card) return false;
      this.closeCard(true);
      return true;
    }

    // ---- the parts ----------------------------------------------------------------------------------------------------

    /** A part's name, said by its button. */
    partName(id) {
      const f = this.f, k = Number(id.slice(-1));
      if (id.startsWith('drop')) return k < f.droppers ? 'Dropper ' + (k + 1) : 'Empty dropper spot';
      if (id.startsWith('bay')) return k < f.asm.length ? 'Assembler ' + (k + 1) : 'Empty assembler spot';
      if (id === 'store') return 'Store';
      if (id === 'belt') return 'Belt';
      return SIGN_SAYS[this.view.signMood || 'working'] + '. Show lifetime lines';
    }

    /** One real button over each part of the floor (their order is the floor's, top to bottom). */
    buildHots() {
      this.hotEls = L.FactoryArt.PARTS.map((p) => h('button', {
        class: 'fac-hot', 'data-part': p.id, 'aria-haspopup': p.id === 'sign' ? null : 'dialog', 'aria-expanded': p.id === 'sign' ? null : 'false',
        onclick: () => (p.id === 'sign' ? this.tapSign() : this.openCard(p.id)),
      }));
      this.hots.replaceChildren(...this.hotEls);
      this.hotKey = ''; this.labelsKey = '';
      this.placeHots();
      this.nameHots();
    }

    nameHots() {
      const f = this.f, key = f.droppers + '|' + f.asm.length + '|' + this.signSaid;
      if (key === this.labelsKey) return;
      this.labelsKey = key;
      for (const b of this.hotEls) b.setAttribute('aria-label', this.partName(b.dataset.part));
    }

    placeHots() {
      const key = this.view.layoutKey();
      if (key === this.hotKey) return;
      this.hotKey = key;
      for (const b of this.hotEls) {
        const r = this.view.rect(b.dataset.part, true), x0 = Math.round(r.x), y0 = Math.round(r.y);
        b.style.left = x0 + 'px'; b.style.top = y0 + 'px';
        b.style.width = Math.round(r.x + r.w) - x0 + 'px'; b.style.height = Math.round(r.y + r.h) - y0 + 'px';
      }
      this.placeCard();
    }

    /** The sign's mood, held a moment so a passing state never flickers, and said by its button. */
    sayMood() {
      const m = Factory.mood(this.f).mood, now = performance.now();
      if (m !== this.moodNext) { this.moodNext = m; this.moodAt = now; }
      if (m !== this.view.signMood && (now - this.moodAt > 1200 || !this.view.signMood)) this.view.signMood = m;
      if (this.view.signMood === this.signSaid) return;
      this.signSaid = this.view.signMood;
      this.labelsKey = '';
      this.nameHots();
      this.el.dataset.mood = this.signSaid;
    }

    // ---- the card on a part -------------------------------------------------------------------------------------------

    openCard(id) {
      if (this.cardFor === id) { this.closeCard(true); return; }
      this.closeCard(false);
      this.cardFor = id;
      this.card = h('div', { class: 'fac-card', role: 'dialog' });
      this.plate.appendChild(this.card);
      const hot = this.hotEls.find((b) => b.dataset.part === id);
      if (hot) hot.setAttribute('aria-expanded', 'true');
      this.renderCard(false);
      const first = this.card.querySelector('button:not([aria-disabled="true"])') || this.card.querySelector('button');
      if (first) first.focus({ preventScroll: true });
      else this.card.setAttribute('tabindex', '-1'), this.card.focus({ preventScroll: true });
    }

    closeCard(focusBack) {
      if (!this.card) return false;
      const id = this.cardFor;
      this.card.remove();
      this.card = null; this.cardFor = null;
      const hot = this.hotEls.find((b) => b.dataset.part === id);
      if (hot) { hot.setAttribute('aria-expanded', 'false'); if (focusBack) hot.focus({ preventScroll: true }); }
      return true;
    }

    /** One line of the card: a title, what it does, and its button (a price to buy, or a verb). */
    option(title, meta, label, words, onclick, ok) {
      return h('div', { class: 'fac-opt' }, h('b', null, title), h('small', null, meta),
        h('button', { class: 'btn' + (ok ? ' primary' : ''), 'aria-label': words, 'aria-disabled': ok ? null : 'true',
          onclick: (e) => { if (e.currentTarget.getAttribute('aria-disabled') === 'true') { this.app.sound.play('blocked'); this.flashCard(); return; } onclick(); } }, label));
    }

    /** An upgrade's line: what it changes, and its price (quiet while the wallet is short). */
    upOption(kind, title, meta) {
      const u = Factory.nextUpgrade(this.f, kind), wallet = this.store.state.lines;
      return this.option(title, meta(u), fmtInt(u.cost) + ' ' + LINE, title + ': ' + meta(u).replace(' → ', ' to ') + '. Buy for ' + fmtInt(u.cost) + ' lines', () => this.upgrade(kind), wallet >= u.cost);
    }

    renderCard(keepFocus) {
      const id = this.cardFor, f = this.f, card = this.card;
      if (!card) return;
      const k = Number(id.slice(-1)), kids = [], note = (t) => kids.push(h('p', null, t));
      const focused = keepFocus && card.contains(document.activeElement) ? Array.from(card.querySelectorAll('button')).indexOf(document.activeElement) : -1;
      let title;
      if (id.startsWith('drop')) {
        if (k < f.droppers) {
          title = 'Dropper';
          if (Factory.nextUpgrade(f, 'speed')) kids.push(this.upOption('speed', 'Faster droppers', (u) => u.from + ' s → ' + u.to + ' s a mino'));
          else note('Every dropper at full speed: a mino every ' + Factory.DROP_T[f.speed] + ' s.');
        } else if (k === f.droppers) { title = 'Empty spot'; kids.push(this.upOption('dropper', 'Add a dropper', (u) => u.from + ' → ' + u.to + ' droppers')); }
        else { title = 'Empty spot'; note('Add the dropper to its left first.'); }
      } else if (id.startsWith('bay')) {
        if (k < f.asm.length) {
          title = 'Assembler';
          if (Factory.nextUpgrade(f, 'size')) kids.push(this.upOption('size', 'Bigger pieces', (u) => cap(PLURAL[u.from]) + ' → ' + PLURAL[u.to]));
          else note('Every assembler builds ' + PLURAL[Factory.SIZES[f.size]] + ', the biggest pieces.');
        } else if (k === f.asm.length) {
          title = 'Empty spot';
          kids.push(this.upOption('assembler', k ? 'Add an assembler' : 'First assembler', (u) => (u.from ? u.from + ' → ' + u.to + ' assemblers' : 'Builds ' + PLURAL[Factory.SIZES[f.size]])));
        } else { title = 'Empty spot'; note('Add the assembler to its left first.'); }
      } else if (id === 'store') {
        title = 'Store';
        if (Factory.nextUpgrade(f, 'store')) kids.push(this.upOption('store', 'Bigger store', (u) => u.from + ' → ' + u.to + ' minos'));
        const n = Factory.pileCount(f), worth = (n * Factory.LOOSE_PTS) / Factory.PTS;
        kids.push(this.option('Sell loose minos', n ? n + (n === 1 ? ' mino' : ' minos') + ' · +' + fmtLines(worth) + ' ' + LINE : 'The store is empty', 'Sell',
          n ? 'Sell ' + n + ' loose minos for ' + fmtLines(worth) + ' lines' : 'Sell loose minos: the store is empty', () => this.sell(), n > 0));
      } else {
        title = 'Belt';
        if (Factory.nextUpgrade(f, 'beltSpeed')) kids.push(this.upOption('beltSpeed', 'Faster belt', (u) => 'Whole ride ' + u.from + ' s → ' + u.to + ' s'));
        else note('The belt at full speed: the whole ride in ' + Factory.BELT_T[f.beltSpeed] + ' s.');
      }
      card.setAttribute('aria-label', title);
      card.replaceChildren(h('h3', null, title), ...kids);
      this.cardKey = this.cardState();
      this.placeCard();
      if (focused >= 0) { const b = card.querySelectorAll('button')[focused] || card.querySelector('button'); if (b) b.focus({ preventScroll: true }); }
    }

    /** What the open card shows depends on: the wallet against its prices, and the store's minos. */
    cardState() {
      const f = this.f, w = this.store.state.lines;
      return Factory.KINDS.map((k) => { const u = Factory.nextUpgrade(f, k); return u ? (w >= u.cost ? 1 : 0) : 2; }).join('') + '|' + Factory.pileCount(f) + '|' + f.droppers + '|' + f.asm.length;
    }

    /** The card sits under its part (over it when there is no room below), inside the floor. */
    placeCard() {
      const card = this.card;
      if (!card) return;
      const r = this.view.rect(this.cardFor, false), W = this.plate.clientWidth, H = this.plate.clientHeight, cw = card.offsetWidth, ch = card.offsetHeight, m = 6;
      let x = r.x + r.w / 2 - cw / 2, y = r.y + r.h + m;
      if (y + ch > H - m) y = r.y - ch - m;
      if (y < m) y = Math.max(m, Math.min(H - ch - m, r.y + r.h / 2 - ch / 2));
      x = Math.max(m, Math.min(W - cw - m, x));
      card.style.left = Math.round(x) + 'px'; card.style.top = Math.round(y) + 'px';
    }

    /** Fits the floor to the tab. */
    relayout() {
      const el = this.el;
      if (!el.clientHeight || !el.clientWidth) { this.roomDirty = true; return; }
      this.roomDirty = false;
      this.view.resize(this.plate.clientWidth, this.plate.clientHeight);
      this.hotKey = '';
      this.placeHots();
    }

    update() {
      this.nameHots();
      if (this.card && this.cardState() !== this.cardKey) this.renderCard(true);
    }
  }

  L.Modes.FactoryMode = FactoryMode;

  // Its achievements, the last group (after Lifetime).
  const fst = (s) => s.factory.stats;
  const ftop = (kind) => (L.Factory ? L.Factory.topOf(kind) : 99);
  L.Achievements.group({
    id: 'factory', name: 'Factory', icon: 'factory', after: 'lull',
    list: [
      { id: 'fac_first', name: 'First Delivery', desc: 'Deliver a piece to the factory board.', pay: 15, on: 'factory', test: (s) => fst(s).delivered >= 1 },
      { id: 'fac_hand', name: 'Line by Line', desc: 'Clear 100 lines on the factory board.', pay: 20, on: 'factory', test: (s) => fst(s).lines >= 100, progress: (s) => [fst(s).lines, 100] },
      { id: 'fac_store', name: 'Deep Store', desc: 'Build the biggest store.', pay: 30, on: 'factory', test: (s) => s.factory.storeLevel >= ftop('store'), progress: (s) => [s.factory.storeLevel, ftop('store')] },
      { id: 'fac_three', name: 'Three Droppers', desc: 'Build all 3 droppers.', pay: 40, on: 'factory', test: (s) => s.factory.droppers >= 3, progress: (s) => [s.factory.droppers, 3] },
      { id: 'fac_penta', name: 'Five Up', desc: 'Deliver a pentomino.', pay: 40, on: 'factory', test: (s) => fst(s).bySize[3] >= 1 },
      { id: 'fac_belt', name: 'Express Belt', desc: 'Build the fastest belt.', pay: 40, on: 'factory', test: (s) => s.factory.beltSpeed >= ftop('beltSpeed'), progress: (s) => [s.factory.beltSpeed, ftop('beltSpeed')] },
      { id: 'fac_crew', name: 'Full Crew', desc: 'Build all 3 assemblers.', pay: 55, on: 'factory', test: (s) => s.factory.asm.length >= 3, progress: (s) => [s.factory.asm.length, 3] },
      { id: 'fac_1k', name: 'A Thousand Pieces', desc: 'Deliver 1,000 pieces.', pay: 60, on: 'factory', test: (s) => fst(s).delivered >= 1000, progress: (s) => [fst(s).delivered, 1000] },
      { id: 'fac_days30', name: 'Shift Worker', desc: 'Visit the factory on 30 days.', pay: 60, on: 'factory', test: (s) => fst(s).days >= 30, progress: (s) => [fst(s).days, 30] },
      { id: 'fac_smooth', name: 'Smooth Running', desc: 'Keep the factory running smoothly for an hour in all.', pay: 75, on: 'factory', test: (s) => fst(s).smoothMs >= 3600e3, progress: (s) => [Math.floor(fst(s).smoothMs / 60e3), 60] },
      { id: 'fac_all', name: 'Fully Built', desc: 'Build every factory upgrade.', pay: 175, on: 'factory', test: (s) => !!L.Factory && L.Factory.maxed(s.factory) },

      { id: 'fac_days100', name: 'Old Hand', desc: 'Visit the factory on 100 days.', pay: 325, tier: 'legend', on: 'factory', test: (s) => fst(s).days >= 100, progress: (s) => [fst(s).days, 100] },
      { id: 'fac_10k', name: 'Ten Thousand Pieces', desc: 'Deliver 10,000 pieces.', pay: 350, tier: 'legend', on: 'factory', test: (s) => fst(s).delivered >= 10000, progress: (s) => [fst(s).delivered, 10000] },
      { id: 'fac_mountain', name: 'Mino Mountain', desc: 'Drop 50,000 minos.', pay: 450, tier: 'legend', on: 'factory', test: (s) => fst(s).made >= 50000, progress: (s) => [fst(s).made, 50000] },
    ],
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
