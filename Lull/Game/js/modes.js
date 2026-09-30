// Lull — the three things to do: Free Play (Classic is one of its board modes: js/classicview.js), Puzzles, and the Factory.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Game, Board, CELL, Pieces, Puzzles, Factory, Render, UI, ITEMS, ITEM_ORDER, ITEM_GROUPS, FREEBIES, itemCount, Chain, Combos, Luck, Pay, Gifts, Earn, Library, fmt, fmtInt, fmtLines, fmtClock, fmtDuration, dateKey } = L;
  const { h, toast } = UI;
  const ico = UI.icon;
  const { LINE } = L;

  const ARROWS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const LOGICAL = { moveL: [-1, 0], moveR: [1, 0], lower: [0, -1], rotate: [0, 1] };
  const INVERT = { moveL: 'moveR', moveR: 'moveL', cw: 'ccw', ccw: 'cw', rotate: 'rotateInv' };

  // Mouse aim (BoardMode.follow): the pointer must be this far (in cells) past a column's edge before the piece
  // follows it there — enough to soak up hand jitter on the line, small enough that a deliberate nudge moves at once.
  // A slip into the next column within CLICK_GRACE_MS before a click is taken as the click's own wobble (pressing a
  // button drags the pointer for a few tens of milliseconds), not as aim.
  const AIM_STICK = 0.15, CLICK_GRACE_MS = 60;
  // After a piece is set, drop and set inputs (Space, a click, the ↓ press that sets on the stack) are ignored this
  // long, so a double press or double click never drops the next piece unseen: a key or button bounce or a quick
  // double-tap lands within ~150 ms, while aiming a new piece takes longer than this. Moving and turning still work,
  // and Classic's gravity and lock delay are never held up by it.
  const SET_GRACE_MS = 180;

  // Items that change the board at once (Board): one that leaves it empty is a fresh start. The rest change the piece
  // in play (Shapers, Choice, Tools) or what the next clears pay (Luck); those can be taken back until the piece sets.
  const ACTS_NOW = new Set(['settle', 'flip', 'trapdoor', 'tornado', 'rewind']);
  // Tools: the piece in play turns into one.
  const SPECIALS = new Set(['patch', 'phase', 'drill', 'bomb', 'laser', 'blackhole']);

  /**
   * An Undo button, the same wherever it is (the Board full card, the puzzle bar and card): how many Undos are held,
   * or, with none, the one price of one (ITEMS.rewind.price, as Hint shows its price). Its tooltip and label say the
   * same in words; foot is its key, where it has one; note, a line under it (a puzzle: what the Undo costs in pay).
   */
  function undoButton(store, attrs, glyph, label, foot, note) {
    const it = ITEMS.rewind, n = store.state.inventory.rewind || 0;
    const says = (n ? n + ' ' + (n > 1 ? it.plural : it.name) + ' held' : 'Buys one for ' + fmtInt(it.price) + ' ' + LINE) + (note ? '\n' + note : '');
    return h('button', Object.assign({ 'aria-label': 'Undo, ' + (n ? n + ' held' : 'costs ' + fmtInt(it.price) + ' lines'), 'data-tip-title': 'Undo', 'data-tip': says }, foot ? { 'data-tip-foot': foot } : null, attrs),
      glyph, label ? h('span', { class: 'lbl' }, label) : null, n ? h('span', { class: 'cnt' }, String(n)) : h('span', { class: 'gem' }, LINE + fmtInt(it.price)));
  }

  // A small wrapped box, drawn (never an emoji).
  const GIFT_ICON = L.Icons.icon('gift');

  /**
   * The sound of a lock. r.heardLater: plain rows the board plays out after the lock and are heard then, not now (a
   * recipe's controller sets it: Jelly's cascade, wave by wave); unset, every row is heard at the lock.
   */
  function playLockSound(snd, r) {
    const own = r.lines - (r.plain || 0), lines = r.lines - (r.heardLater || 0);
    if (r.special === 'blackhole' || r.special === 'bomb') { snd.play('boom'); if (lines) setTimeout(() => snd.play('clear', lines), 150); }
    else if (r.special === 'drill' || r.special === 'laser') { snd.play('drill'); if (lines) setTimeout(() => snd.play('quad'), 150); }
    else if (r.special === 'settle' && lines) snd.play('quad');
    else if (lines && !own) snd.play('clear', lines);
    else if (r.perfect) snd.play('perfect');
    else if (r.tspin) snd.play('tspin');
    else if (own >= 4) snd.play('quad');
    else if (own) snd.play('clear', own);
    else snd.play('lock');
    if (r.combo >= 2) setTimeout(() => snd.play('combo', r.combo), 120);
  }

  // ---- shared board controller ------------------------------------------------------------------------------------

  /** One figure in a board's status bar: a small spaced label over the value. */
  function stat(label, value, cls, tip) {
    return h('span', { class: 'stat' + (cls ? ' ' + cls : ''), 'data-tip': tip || null }, h('i', null, label + ' '), h('b', null, value));
  }

  class BoardMode {
    constructor(app, canvasId, overlayId) {
      this.app = app;
      this.canvas = document.getElementById(canvasId);
      this.overlay = document.getElementById(overlayId);
      this.view = new Render.BoardView(this.canvas);
      this.game = null;
      this.inverted = false;
      this.wheelAt = 0;
      this.setGrace = SET_GRACE_MS;
      this.bindMouse();
      this.bindTouch();
      if (!app.hints && L.Hints) app.hints = new L.Hints.Coach(app); // control hints (js/hints.js)
    }

    get settings() { return this.app.store.state.settings; }
    get reduced() { return this.app.reducedMotion(); }

    attachGame(game, view) {
      this.game = game;
      this.view.attach(game, view);
      this.view.setLook(this.app.look());
      this.view.resize();
      game.on('lock', (r) => { if (r.special !== 'settle') { this.setAt = this.now(); if (this.app.hints) this.app.hints.lock(); } this.onLock(r); });
      game.on('blocked', () => { if (this.quiet) return; this.app.sound.play('blocked'); this.view.bump(this.reduced); });
      game.on('spawn', () => {
        // A new piece meets the pointer where it is.
        if (this.pointer && this.settings.mouse && this.lastInput === 'mouse') setTimeout(() => this.follow(), 0);
      });
      game.on('topout', () => this.onTopout && this.onTopout());
      // A hold swap refused: the held piece has no room anywhere above the stack (nothing changed).
      game.on('noroom', () => toast('No room', 'bad'));
      game.on('empty', () => this.onEmpty && this.onEmpty());
      game.on('flip', (moves) => this.view.onMoves(moves, 'x', this.reduced));
      game.on('tornado', (moves) => { this.view.onTornado(moves, this.reduced); this.app.sound.play('drill'); });
      game.on('trapdoor', (row) => { this.view.onTrapdoor(row, this.reduced); this.app.sound.play('boom'); });
    }

    mapArrow(act) {
      const [sx, sy] = ARROWS[act];
      for (const [name, [dx, dy]] of Object.entries(LOGICAL)) {
        const [a, b] = this.view.screenDir(dx, dy);
        if (a === sx && b === sy) return name;
      }
      return null;
    }

    action(act, rep) {
      const g = this.game;
      if (!g || this.blocked()) return false;
      let a = ARROWS[act] ? this.mapArrow(act) : act;
      const asked = a; // what the key does on this board, before Inverted Controls (for the control hints)
      if (this.inverted && INVERT[a]) a = INVERT[a];
      let ok = false;
      const snd = this.app.sound;
      const prevPiece = g.piece, before = g.piece ? g.absCells() : null, beforeColor = g.piece ? this.view.colorOf(g.piece.type.color) : null;
      if (this.settling(a)) return false;
      switch (a) {
        case 'moveL': ok = g.move(-1); if (ok) snd.play('move'); break;
        case 'moveR': ok = g.move(1); if (ok) snd.play('move'); break;
        case 'lower': {
          if (this.softDrop) { ok = this.softDrop(rep); break; }
          const p = g.piece;
          if (rep && (!p || g.mods.heavy || !g.fitsAt(p, p.rot, p.x, p.y - 1))) return false;
          ok = !!g.lower();
          break;
        }
        case 'rotate': if (rep) return false; ok = g.rotate(1); if (ok) snd.play('rotate'); break;
        case 'rotateInv': if (rep) return false; ok = g.rotate(-1); if (ok) snd.play('rotate'); break;
        case 'cw': ok = g.rotate(1); if (ok) snd.play('rotate'); break;
        case 'ccw': ok = g.rotate(-1); if (ok) snd.play('rotate'); break;
        case 'r180': ok = g.rotate(2); if (ok) snd.play('rotate'); break;
        case 'drop': ok = !!g.drop(); break;
        case 'hold': ok = g.holdPiece(); if (ok) snd.play('hold'); this.afterHold && this.afterHold(); break;
        default: ok = this.modeAction ? this.modeAction(a, rep) : false;
      }
      if (ok && before && /^(moveL|moveR|rotate|rotateInv|cw|ccw|r180|lower)$/.test(a) && g.piece === prevPiece) {
        this.view.trail(before, beforeColor, this.reduced);
        if (a === 'lower' && !rep) snd.play('lower');
        // The recipe's view parts animate a move or a turn their own way (Jelly's wobble).
        if (this.view.parts.length) this.view.partsCall(/^move/.test(a) ? 'onMove' : a === 'lower' ? 'onLower' : 'onRotate', a, this.reduced);
      }
      this.view.dirty = true;
      // Keys are in charge until the mouse moves again (so arrows work with the pointer resting on the board).
      if (!this.mouseActing && !this.touchActing) { this.lastInput = 'key'; this.view.pointerCol = null; this.rawCol = null; }
      if (this.app.hints && prevPiece) this.app.hints.action(this, { act, a: asked, ok, rep: !!rep, mouse: !!this.mouseActing, touch: !!this.touchActing, piece: prevPiece, set: (a === 'drop' || a === 'lower') && g.piece !== prevPiece });
      if (this.afterAction) this.afterAction(a);
      return ok;
    }

    blocked() { return false; }

    /**
     * The time the set grace (SET_GRACE_MS) and a finger resting down the board (TouchGestures.tick) go by: the
     * page's own. Test hook: a test may set mode.clock (ms on the performance.now() timeline) for a moment, so that
     * the inputs it sends are a set number of ms apart however slowly a busy machine delivers them, and delete it
     * after. Nothing in the game sets it.
     */
    now() { return this.clock ? this.clock() : performance.now(); }

    /** True while a drop or set would come too soon after the last piece was set (see SET_GRACE_MS). */
    settling(a) {
      if (!this.setAt || this.now() - this.setAt >= this.setGrace) return false;
      if (a === 'drop') return true;
      // ↓ only counts when it would set the piece (lowering through the air is movement); Classic's soft drop never.
      const g = this.game, p = g.piece;
      return a === 'lower' && !this.softDrop && !!p && (g.mods.heavy || !g.fitsAt(p, p.rot, p.x, p.y - 1));
    }

    /**
     * Mouse-only play (left and right buttons, wheel, pointer):
     *  - point: the piece slides sideways to the pointer's column, at its own height (so it never slips under a
     *    ledge on its own; lower it past one with the wheel, then slide)
     *  - left click (anywhere on the board's canvas): drop it straight down
     *  - right click: turn clockwise
     *  - wheel (down): lower one row
     *  - click the HOLD box: hold / swap back
     */
    bindMouse() {
      const c = this.canvas;
      const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      this.pointer = null;
      const enabled = () => this.settings.mouse && this.game && !this.blocked();
      const mouse = (fn) => { this.mouseActing = true; this.lastInput = 'mouse'; try { fn(); } finally { this.mouseActing = false; } };
      // Pointer events, mouse only (a finger or a pen is bindTouch's); a tap's emulated mouse events, which could come
      // a moment after it, are ignored too (as a click, a tap would hard-drop the piece).
      const isMouse = (e) => (e.pointerType || 'mouse') === 'mouse' && !(L.Touch && L.Touch.recent());
      c.addEventListener('pointermove', (e) => {
        if (!isMouse(e)) return;
        const p = pos(e), moved = !this.pointer || Math.abs(p[0] - this.pointer[0]) + Math.abs(p[1] - this.pointer[1]) > 1;
        this.pointer = p;
        if (!enabled()) return;
        if (moved) this.lastInput = 'mouse';
        const hold = this.view.onHold(...this.pointer);
        if (hold !== this.view.holdHover) { this.view.holdHover = hold; this.view.dirty = true; }
        if (moved) this.follow(e.timeStamp);
        c.style.cursor = hold ? 'pointer' : 'default';
      });
      c.addEventListener('pointerleave', (e) => { if ((e.pointerType || 'mouse') !== 'mouse') return; this.pointer = null; this.rawCol = null; this.view.pointerCol = null; this.view.holdHover = false; this.view.dirty = true; });
      c.addEventListener('pointerdown', (e) => {
        if (!isMouse(e) || !enabled()) return;
        if (performance.now() - this.app.focusedAt < 300) return; // the click that brought the window forward
        const [px, py] = pos(e);
        this.pointer = [px, py];
        // A press the board's controller takes (mapInput 'click' answers true: Battle's first Next slot) does nothing else.
        if (this.mapInput('click', [px, py], e) === true) return;
        if (e.button === 0 && this.view.onHold(px, py)) { mouse(() => this.action('hold')); return; }
        if (e.button === 2) { mouse(() => { this.follow(); this.action('cw'); this.follow(); }); return; }
        if (e.button !== 0) return;
        mouse(() => {
          // Timed by the events' own stamps (when the hand moved and pressed), not by when the page got round to them.
          const t = e.timeStamp || performance.now();
          this.follow(t);
          // Click grace: a pointer that slipped into the next column just before the click (within CLICK_GRACE_MS)
          // does not count; the piece drops where it had settled.
          if (this.prevCol != null && t - this.colAt < CLICK_GRACE_MS) this.aimAt(this.prevCol);
          this.action('drop');
        });
      });
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      c.addEventListener('wheel', (e) => {
        if (!enabled() || (L.Touch && L.Touch.recent())) return;
        e.preventDefault();
        const now = performance.now();
        if (e.deltaY <= 1 || now - this.wheelAt < 45) return;
        this.wheelAt = now;
        // The wheel only ever lowers: it never sets the piece (that is the left button's job).
        mouse(() => { this.follow(); if (this.action('lower', true)) this.app.sound.play('lower'); });
      }, { passive: false });
    }

    /** Slides the piece toward the pointer's column, at the height it floats at (t: when the pointer got there, for the click grace). */
    follow(t) {
      const g = this.game;
      if (!this.pointer || !g || !g.piece || g.over || !this.settings.mouse) return;
      const [px, py] = this.pointer, cur = this.rawCol;
      const cell = this.view.cellClamped(px, py);
      if (!cell) return;
      let col = cell.x;
      // Sticky aim: stay in the current column until the pointer is past its edge by AIM_STICK of a cell.
      if (cur != null && col !== cur && this.view.lay) {
        const d = this.view.lay.s * AIM_STICK;
        for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) { const c = this.view.cellClamped(px + dx, py + dy); if (c && c.x === cur) { col = cur; break; } }
      }
      // Inverted Controls turn the mouse around too: the piece goes to the mirror of the pointer's column. A board's
      // controller can aim elsewhere (mapInput 'aim': Mirror's copy follows the pointer when it is the nearer).
      const target = this.mapInput('aim', this.inverted ? g.w - 1 - col : col, this.pointer);
      if (col !== cur) { this.prevCol = this.target; this.colAt = t || performance.now(); this.rawCol = col; this.target = target; }
      this.aimAt(target);
      this.view.pointerCol = col;
    }

    /** What an input means on this board (Free Play asks its controller: ctl.input); elsewhere, what it says. */
    mapInput(kind, v) { return v; }

    aimAt(col) {
      const g = this.game;
      // The recipe's view parts hear each step of a mouse slide as a move, as they do a key's (Jelly's wobble).
      const parts = this.view.parts && this.view.parts.length ? this.view : null;
      this.quiet = true;
      for (let i = 0; i < g.w; i++) {
        const x0 = parts && g.piece ? g.piece.x : 0;
        if (!g.moveToward(col)) break;
        if (parts && g.piece) {
          let d = g.piece.x - x0;
          if (g.board.wrap) { d = ((d % g.w) + g.w) % g.w; if (d > g.w / 2) d -= g.w; }
          if (d) parts.partsCall('onMove', d < 0 ? 'moveL' : 'moveR', this.reduced);
        }
      }
      this.quiet = false;
      this.view.dirty = true;
    }

    /**
     * Touch play (js/touch.js reads the gestures; this carries them out, in the screen's directions like the arrows):
     *  - drag along the piece's sideways axis: a cell per step of finger travel (Settings: Drag sensitivity)
     *  - drag toward the floor: lower a row per step (never sets the piece; in Classic a finger resting down the board
     *    keeps lowering)
     *  - swipe toward the floor: hard drop; away from it: hold
     *  - tap: turn (right half clockwise, left half counter-clockwise; or always clockwise: Settings ▸ Tap to turn)
     *  - two-finger tap: turn 180°; tap HOLD: hold
     * Only the canvas starts a gesture: the bars, buttons, cards and toasts are elements of their own.
     */
    bindTouch() {
      const c = this.canvas, Touch = L.Touch;
      if (!Touch || !L.TouchGestures) return;
      this.gest = new L.TouchGestures((it) => this.touchIntent(it));
      const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      const isTouch = (e) => e.pointerType === 'touch' || e.pointerType === 'pen';
      const events = (e) => (e.getCoalescedEvents && e.getCoalescedEvents().length ? e.getCoalescedEvents() : [e]);
      c.addEventListener('pointerdown', (e) => {
        if (!isTouch(e)) return;
        e.preventDefault(); // no emulated mouse events (a click would drop the piece), no text selection
        Touch.boardDown(e.pointerId);
        try { c.setPointerCapture(e.pointerId); } catch (err) { /* the pointer is gone already */ }
        this.app.activity && this.app.activity();
        const [x, y] = pos(e), t = e.timeStamp || performance.now();
        if (this.gest.active) { this.gest.down(e.pointerId, x, y, t); return; }
        const opts = this.touchOpts(x, y);
        this.touchAt = [x, y];
        // A controller may turn a gesture's sideways moves around (swap: Mirror, a touch that starts on the copy's side).
        this.touchSwap = !!(opts && opts.swap);
        this.gest.down(e.pointerId, x, y, t, opts);
        if (opts && !opts.tapOnly && this.touchIntercept && this.touchIntercept()) this.gest.consume();
        this.touchPiece = this.game && this.game.piece;
      });
      c.addEventListener('pointermove', (e) => {
        if (!isTouch(e) || !this.gest.active) return;
        e.preventDefault();
        this.touchGuard();
        for (const ce of events(e)) { const [x, y] = pos(ce); this.gest.move(e.pointerId, x, y, ce.timeStamp || e.timeStamp || performance.now()); }
      });
      const end = (e) => {
        if (!isTouch(e)) return;
        Touch.boardUp(e.pointerId);
        if (e.type === 'pointercancel') { this.gest.cancel(e.pointerId); return; }
        this.touchGuard();
        const [x, y] = pos(e);
        this.gest.up(e.pointerId, x, y, e.timeStamp || performance.now());
      };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', end);
      c.addEventListener('lostpointercapture', (e) => { if (isTouch(e)) Touch.boardUp(e.pointerId); });
    }

    /** The frame a new touch is read in (see TouchGestures.down), or null when a touch here does nothing. */
    touchOpts(x, y) {
      const st = this.settings, g = this.game;
      if (!st.touch || !g || UI.modalOpen()) return null;
      const tapOnly = !!(this.touchTapStarts && this.touchTapStarts());
      if (!tapOnly && this.blocked()) return null;
      const lay = this.view.lay;
      if (!lay) return null;
      // The screen's axes on this board, as the arrows see them: the one that moves the piece, and toward its floor.
      const floor = ['down', 'left', 'right', 'up'].find((a) => this.mapArrow(a) === 'lower') || 'down';
      this.touchFloor = floor;
      const slide = /^move/.test(this.mapArrow('left')) ? 'x' : 'y';
      return this.mapInput('touch', {
        step: L.Touch.stepFor(lay.s, st.touchSens), flickV: L.Touch.T.FLICK_V[st.touchFlick != null ? st.touchFlick : 1] || 1.1,
        flickMin: Math.max(L.Touch.T.FLICK_MIN, L.Touch.T.FLICK_MIN_CELLS * lay.s), slide, floor: ARROWS[floor],
        centerX: lay.board.x + lay.board.w / 2, onHold: this.view.onHoldTouch(x, y),
        softMs: this.softDrop ? Math.max(16, st.lowerRepeat || 70) : 0, tapOnly,
      }, [x, y]);
    }

    /** Mid-touch: a card or a window that came up takes the rest of it; a new piece takes its lowering, drop and hold. */
    touchGuard() {
      if (!this.gest.active) return;
      if (UI.modalOpen() || (this.blocked() && !(this.touchTapStarts && this.touchTapStarts()))) { this.gest.consume(); return; }
      if (this.game && this.game.piece !== this.touchPiece) { this.touchPiece = this.game.piece; this.gest.newPiece(); }
    }

    /** One gesture's intent, through action() like a key (so Inverted Controls, the set grace and the hints apply). */
    touchIntent(it) {
      if (!this.game || UI.modalOpen()) return false;
      this.touchActing = true;
      this.lastInput = 'touch';
      this.view.pointerCol = null; this.rawCol = null;
      let ok = false;
      try {
        switch (it.type) {
          case 'move': ok = this.action(this.touchSwap ? this.touchSlideSwap(it.dir) : it.dir, !it.fresh); break;
          case 'lower': ok = this.action(this.touchFloor || 'down', true); if (ok) this.app.sound.play('lower'); break;
          case 'drop': ok = this.action('drop'); break;
          case 'hold': ok = this.action('hold'); break;
          case 'r180': ok = this.action('r180'); break;
          case 'tap':
            if (this.touchTapStarts && this.touchTapStarts()) { ok = this.action('drop'); break; }
            {
              const side = this.mapInput('tap', it.side, this.touchAt);
              // Taken by the board's controller (null or false: Battle's tap on the first Next slot): nothing turns.
              if (side === null || side === false) { ok = true; break; }
              ok = this.action(this.settings.tapTurn === 'cw' ? 'rotate' : side === 'left' ? 'ccw' : 'cw');
            }
            break;
        }
      } finally { this.touchActing = false; }
      // The piece in play after our own drop or hold is the next one: not a change under the finger.
      if (this.game) this.touchPiece = this.game.piece;
      if (ok && !it.undo) L.Touch.haptic(it.type === 'drop' || it.type === 'hold' ? 8 : 4);
      return ok;
    }

    /** A gesture's sideways move turned around (touchSwap): the opposite screen direction. */
    touchSlideSwap(dir) { return { left: 'right', right: 'left', up: 'down', down: 'up' }[dir]; }

    showCard(content, cls) {
      this.overlay.replaceChildren(h('div', { class: 'card' + (cls ? ' ' + cls : '') }, content));
      this.overlay.classList.remove('hidden');
    }
    hideCard() { this.overlay.classList.add('hidden'); this.overlay.replaceChildren(); }
    get cardOpen() { return !this.overlay.classList.contains('hidden'); }

    frame(now, dt) {
      if (this.gest && this.gest.active) { this.touchGuard(); this.gest.tick(this.clock ? this.clock() : now); }
      // A board whose recipe has no control hints (R.hints false: Battle) never shows one.
      if (this.app.hints) {
        if (!(this.game && this.game.rules && this.game.rules.hints === false)) { this.hintsOff = false; this.app.hints.frame(this, now, dt); }
        else if (!this.hintsOff) { this.hintsOff = true; if (this.app.hints.hide) this.app.hints.hide(); }
      }
      this.view.reducedMotion = this.reduced;
      this.view.fx.update(dt);
      if (this.view.needsFrame()) {
        // An animated look (Prism, Rainbow, a moving backdrop) draws every frame from cached sprites and layers; under
        // reduced motion the look is still, so only real changes draw.
        if (this.view.look && this.view.look.still !== this.reduced) this.view.setLook(this.app.look());
        this.view.render(now);
        // The bars under the board line up with its plate.
        const lay = this.view.lay;
        if (lay && lay.plate.w !== this.plateW) { this.plateW = lay.plate.w; this.canvas.closest('.view').style.setProperty('--plate-w', lay.plate.w + 'px'); }
      }
    }
  }

  // ---- free play ----------------------------------------------------------------------------------------------------

  /**
   * What runs a Relaxed board: PlayMode asks its controller (this.ctl) at every turn. The plain controller is today's
   * Free Play, exactly; each of the board recipe's parts can give its own (Recipe.part's controller(play, game)), and
   * they are composed over the plain one in the parts' order (Recipe.compose): a hook a part gives replaces the one
   * before it (reached while it runs as this.base), and frame, pause, attach, detach, input, onKey, action, tiles,
   * status and cards gather every part's. Its name is `id` (never `key`). Hooks, called with this = the controller:
   *   view: 'single' | 'battle'     the board view's layout (another than 'single' is drawn by a view part: BoardView.shell)
   *   timed: false                  a clock that runs while play.canRun() (Battle's)
   *   frame(now, dt, running)       every frame on the Play tab; running is play.canRun()
   *   pause(why)                    play has to stop: 'blur', 'pointer' (it left the window), 'hidden', 'tab', 'modal',
   *                                 'collapse' (app.onAway and the frame loop)
   *   counts() -> bool              this second counts as played on the board (s.playMs, the Played tile)
   *   pay(r) -> banked              what a lock's rows pay (plain: Pay.clear with gold, a boost, Double or Nothing)
   *   onLock(r)                     a piece (or Settle) was set: the plain one pays, keeps the records, finds combos,
   *                                 plays the sound and checks achievements (r.heardLater, set before it: rows the
   *                                 part plays out and sounds itself later, left out of the lock's sound)
   *   onEnd(kind, silent)           the board ended ('topout'): kind is 'full', or the part's own that ended it (its
   *                                 engine calls game.end('wilted') in its step: game.endKind, kept in the save); its card
   *   cards: { kind(play, kind) -> content }   a card by kind (full: the Board full card)
   *   status(parts, { stat, prev }) -> [elements]   the status bar's figures; parts: { lines, score, chain, side }, the
   *                                 plain ones; stat(label, value, cls, tip) makes one more; prev: the list before it
   *   bar(el) -> true               it drew the bar under the board itself (plain: the power-up groups)
   *   tiles(game) -> [[value, label]]   more tiles for the board in play's summary (the Board full and Retire cards;
   *                                 a record's own numbers are its uiPart's tiles)
   *   onKey(e) -> true              a key it took, before the game's own keys (Battle's S, Shift+S)
   *   action(a, rep) -> ok          an action the game does not know (P: 'pause')
   *   input(kind, v, pos) -> v      what an input means here: 'aim' (the mouse's target column), 'touch' (a gesture's
   *                                 options; swap: true turns its sideways moves around), 'tap' ('left' or 'right';
   *                                 null or false: it took the tap, nothing turns), 'click' ([x, y], the event: true
   *                                 when it took a mouse press on the board, before hold and drop)
   *   fx() -> lay                   the layout effects over the board are placed in (a view with two boards: yours)
   *   attach(game) / detach()       its board came into play / is leaving it
   */
  function plainController(play) {
    return {
      id: 'plain', view: 'single', timed: false,
      frame() {},
      pause() {},
      counts: () => true,
      pay: (r) => play.payClear(r),
      onLock: (r) => play.plainLock(r),
      onEnd: (kind, silent) => play.boardFull(kind, silent),
      cards: { full: (pm) => pm.fullCard() },
      status: (parts) => [parts.lines, parts.score, parts.chain, parts.side],
      bar: () => false,
      tiles: () => [],
      onKey: () => false,
      action: () => false,
      input: (kind, v) => v,
      fx: () => play.view.lay,
      attach() {},
      detach() {},
    };
  }

  class PlayMode extends BoardMode {
    constructor(app) {
      super(app, 'cv-play', 'play-overlay');
      // Boards come in many sizes: a small one is drawn at most 1.4 times a Standard board's cells (render.js, layout).
      this.view.opts.cellCap = 1.4;
      this.status = document.getElementById('play-status');
      this.itembar = document.getElementById('itembar');
      // The board library (js/library.js): a record for the board in play, shelved ones, retired ones.
      const B = Library.ensure(app.store.state, Date.now());
      let game = null;
      const saved = app.store.state.free;
      // A board in play of a size no board can have (a save edited by hand) is not resumed: a new one takes its place.
      if (saved && Library.playable(saved)) { try { game = new Game({ saved, previewCount: this.settings.preview }); } catch (e) { game = null; } }
      if (!game) game = new Game({ w: B.size.w, h: B.size.h, recipe: B.recipe, previewCount: this.settings.preview });
      game.previewCount = this.settings.preview;
      this.thumbs = new Map(); // thumbnail images (data URLs) by board, stack and look
      this.attachGame(game, {});
      this.view.showBank = true;
      // The daily gift's button says when the next one comes; it is kept current as the time passes.
      this.giftTimer = setInterval(() => this.renderGift(), 60000);
      this.snapshot();
      this.renderItems();
      this.renderStatus();
      if (game.over) this.onTopout(true);
      // Undo is shared with Puzzles: one bought or used there (or given) shows here at once, on the bar and on a
      // Board full card that is up (redrawn silently, so it is not counted as another top-out).
      app.store.on('items', () => { this.renderItems(); if (this.cardOpen && this.game.over) this.onTopout(true); });
    }

    snapshot() { this.lastS = { holds: this.game.s.holds, rotations: this.game.s.rotations, moves: this.game.s.moves, lowers: this.game.s.lowers, drops: this.game.s.drops }; }

    syncCounters() {
      const F = this.app.store.state.stats.free;
      for (const k of Object.keys(this.lastS)) {
        const d = this.game.s[k] - this.lastS[k];
        if (d > 0) F[k] += d;
      }
      this.snapshot();
    }

    afterHold() { this.syncCounters(); if (this.armed) { this.armed = null; this.renderItems(); } }

    /** A board comes into play: its controller (the plain one, or its recipe's) and the view's layout for it. */
    attachGame(game, view) {
      if (this.ctl && this.ctl.detach) this.ctl.detach();
      this.ctl = this.makeController(game);
      super.attachGame(game, view);
      // A lock the recipe refuses (a part's refuseLock: Battle's "Set it on your board") says why.
      game.on('refused', (note) => { if (note) toast(String(note), 'bad', 1800); });
      this.view.layoutName = this.ctl.view || 'single';
      this.ctl.attach(game);
    }

    /** The plain controller (today's Free Play), with the recipe parts' own composed over it (see plainController). */
    makeController(game) {
      const base = plainController(this);
      const own = L.Recipe && game && game.recipe ? L.Recipe.controllers(this, game) : [];
      return own.length ? L.Recipe.compose(base, own) : base;
    }

    /**
     * Whether a timed board's clock may run now: Free Play in front, nothing over the board (a window, a card), the
     * page shown and the window focused, and a board in play (Classic's running() and document.hasFocus()).
     */
    canRun() {
      return this.app.tab === 'play' && !(L.Collapse && L.Collapse.on) && !UI.modalOpen() && !this.cardOpen && !this.fullView && !document.hidden && document.hasFocus() && !!this.game && !this.game.over;
    }

    frame(now, dt) {
      // A window over the board pauses its controller (a timed one stops its clock; the plain one has none).
      const modal = UI.modalOpen();
      if (modal && !this.modalUp) this.ctl.pause('modal');
      this.modalUp = modal;
      // While a retired board is in full view (a window too), it is what is drawn; the board in play waits, untouched.
      if (this.fullView) { this.fullView.frame(now, dt); return; }
      this.ctl.frame(now, dt, this.canRun());
      super.frame(now, dt);
    }

    /** Actions the game does not know go to the controller (Battle's pause). */
    modeAction(a, rep) { return !!this.ctl.action(a, rep); }

    /**
     * A controller may take an action before the game's own (its gate(act, rep): an answer other than undefined is the
     * action's result; Classic's Space starts it, P pauses, a hard drop may be off), hold the board still (blocked),
     * let a tap start it (tapStarts), lower it its own way (softDrop) and hear each move (afterAction).
     */
    action(act, rep) {
      const t = this.ctl && typeof this.ctl.gate === 'function' ? this.ctl.gate(act, rep) : undefined;
      return t !== undefined ? t : super.action(act, rep);
    }
    blocked() { return !!(this.ctl && typeof this.ctl.blocked === 'function' && this.ctl.blocked()); }
    touchTapStarts() { return !!(this.ctl && typeof this.ctl.tapStarts === 'function' && this.ctl.tapStarts()); }
    get softDrop() { const c = this.ctl; return c && typeof c.softDrop === 'function' ? (rep) => c.softDrop(rep) : null; }
    afterAction(a) { if (this.ctl && typeof this.ctl.afterAction === 'function') this.ctl.afterAction(a); }

    /** A key the controller takes before the game's own keys (its onKey). */
    key(e) { return typeof this.ctl.onKey === 'function' && this.ctl.onKey(e) === true; }

    mapInput(kind, v, pos) { return this.ctl.input(kind, v, pos); }

    /** Where effects over the board are placed: the board of the controller's view (fx), or the one view's. */
    fxLay() { return this.ctl.fx() || this.view.lay; }

    onLock(r) { this.ctl.onLock(r); }

    /**
     * What a lock's rows pay on a plain board (js/items.js, Pay): a quad or T-spin (or 5+ lines) is worth one extra;
     * the multiplier — the back-to-back streak alone, an eighth a link, ×2.5 at most (twenty in a row) — multiplies
     * it; gold triples that, and a combo's boost adds its share. All of it in Standard lines, by the board's worth.
     * Sets r.banked, r.mult (and r.golden, r.boost, r.double) and banks it on the board; returns what it paid.
     */
    payClear(r) {
      const g = this.game, s = g.s;
      const paid = Pay.clear(s, r, g.rules);
      const pay = paid.pay;
      if (paid.golden) {
        // Gold on the board is spent one clear at a time (the last of it on a wide board pays its share).
        r.golden = true;
        const b = this.fxLay().board, left = Pay.clearsLeft(s.gold, g.rules);
        this.view.fx.text('GOLDEN ' + Chain.fmt(paid.goldX) + (left > 0 ? ' · ' + left + ' left' : ''), b.x + b.w / 2, b.y + b.h * 0.3, '#ffd35a', 18);
        this.app.sound.play('golden');
      }
      if (paid.boost) r.boost = paid.boost;
      if (paid.double) {
        // Double or Nothing: this clear decided it.
        const won = paid.double === 'won', b = this.fxLay().board;
        r.double = paid.double;
        this.view.fx.text(won ? 'DOUBLE' : 'NOTHING', b.x + b.w / 2, b.y + b.h * 0.3, won ? '#ffd35a' : '#9aa3b2', 18);
        if (won) this.app.sound.play('golden');
      }
      r.banked = pay; r.mult = s.mult;
      // Gold spent on a chain of 20 or more, built by hand (Midas): counted clear by clear, reset by any other.
      s.goldRun = r.golden && r.hand && (s.hchain || 0) >= 20 ? (s.goldRun || 0) + 1 : 0;
      s.banked = Library.bank((s.banked || 0) + pay);
      return pay;
    }

    /** A lock on a plain board: what it pays, the records, combos, the sound and the achievements. */
    plainLock(r) {
      const st = this.app.store, F = st.state.stats.free, g = this.game;
      this.syncCounters();
      if (this.armed) { this.armed = null; this.renderItems(); }
      // What the lines pay (js/items.js, Pay): a quad set by hand or a T-spin is worth one extra; the multiplier — the
      // back-to-back streak alone, ×0.05 a link after the first, ×2 at most (twenty-one in a row) — multiplies it; gold
      // doubles that, and a combo's boost adds its share. All of it in Standard lines, by the board's width. The chain
      // (streak plus combo) is counted beside it, for the record.
      const s = g.s;
      s.chain = Chain.count(g); s.bestChain = Math.max(s.bestChain || 0, s.chain);
      s.mult = Pay.mult(g); s.bestMult = Math.max(s.bestMult || 1, s.mult);
      F.bestChain = Math.max(F.bestChain || 0, s.chain); F.bestMult = Math.max(F.bestMult || 1, s.mult);
      r.chain = s.chain;
      g.notePace(r, Date.now());
      // Every row pays by the board's worth (Library.worth: its width and recipe): a line 5 wide is half a Standard
      // line, 20 wide two. What pays and counts is r.own, the rows' own cells (a row's FOREIGN cells never pay).
      const lk = Library.worth(g);
      if (r.lines) this.ctl.pay(r);
      if (r.netSaved) { const b = this.fxLay().board; this.view.fx.text('SAFETY NET', b.x + b.w / 2, b.y + b.h * 0.3, '#8fe3ff', 16); }
      if (r.special !== 'settle') {
        F.pieces++;
        st.day().pieces++;
        const key = Pieces.TYPES[r.type] && Pieces.TYPES[r.type].family === 'tetromino' ? r.type : (Pieces.get(r.type) || { family: 'other' }).family;
        F.byType[key] = (F.byType[key] || 0) + 1;
      }
      if (r.lines) {
        // Lifetime lines and records are in Standard lines; the board's own count (s.lines) and clears stay as cleared.
        F.lines = Library.bank(F.lines + r.own * lk);
        F.clears[Math.min(5, r.lines)]++;
        if (r.banked) st.addLines(r.banked, 'play');
        this.app.refreshWallet(true);
        // A power-up for every hundred (Standard) lines on a board (counted in the save, so a rewound clear never pays twice).
        const due = Earn.lines(st.state.earn, s.startedAt, s.own * lk, (s.own - r.own) * lk);
        for (let k = 0; k < due; k++) this.earnItem();
      }
      const found = Combos.detect(r, g);
      if (r.tspin) { F.tspins++; F.tspinLines += r.lines; }
      if (r.perfect) F.perfect++;
      // Set by a piece (an item's lines are plain: never a quad), on a board where the feats count (R.feats: a narrow
      // quad is a few pieces).
      if (r.quad && g.rules.feats) st.day().quad = 1;
      F.maxCombo = Math.max(F.maxCombo, g.s.maxCombo);
      F.maxB2B = Math.max(F.maxB2B, g.s.maxB2B);
      F.bestScore = Math.max(F.bestScore, g.s.score);
      F.bestLines = Math.max(F.bestLines, Library.bank(g.s.own * lk));
      const snd = this.app.sound;
      playLockSound(snd, r);
      this.view.onLock(r, this.reduced);
      // The announcer, if asked for here too (Settings ▸ Sound).
      const st2 = this.app.settings;
      if (st2.announcerRelaxed && st2.announcer !== false && st2.sound) {
        const say = L.Announcer.phrase(r, false);
        if (say) L.Announcer.say(say);
      }
      found.forEach((id, i) => this.combo(id, i));
      this.renderStatus();
      st.touch();
      this.app.achieve({ mode: 'play', r, g });
    }

    /**
     * A combo (js/items.js): its reward — lines, a boost for the next few clears, points — shrinking each time it
     * comes round in the board library (Library.taper: a new board is not a fresh start); a small callout on the board; and, the first time it is ever found, a power-up.
     */
    combo(id, i) {
      const st = this.app.store, g = this.game, s = g.s, c = Combos.get(id);
      s.combos = s.combos || {};
      const k = Library.taper(st.state.boards || Library.ensure(st.state, Date.now()), id, s.combos[id]), rw = Combos.reward(c, k);
      // Its lines are Standard lines: a board narrower or wider than Standard is paid by its width, as every clear is.
      const lines = Library.bank(rw.lines * Library.worth(g));
      s.combos[id] = (s.combos[id] || 0) + 1;
      if (lines) { st.addLines(lines, 'combos'); s.banked = Library.bank((s.banked || 0) + lines); this.app.refreshWallet(true); }
      if (rw.boost) s.boost = { x: Math.max(rw.boost.x, s.boost ? s.boost.x : 1), left: Math.max(rw.boost.clears, s.boost ? s.boost.left : 0) };
      s.score += rw.score;
      const book = st.state.combos = st.state.combos || {};
      const first = !book[id];
      book[id] = book[id] || { n: 0, lines: 0, first: Date.now() };
      book[id].n++; book[id].lines = Library.bank(book[id].lines + lines);
      const bits = [lines ? '+' + fmtLines(lines) + ' ' + LINE : null, rw.boost ? Chain.fmt(rw.boost.x) + ' for ' + rw.boost.clears + ' clears' : null, !lines && !rw.boost ? '+' + fmtInt(rw.score) + ' points' : null].filter(Boolean);
      this.view.callout(c.name, bits.join(' · '), i, this.reduced);
      setTimeout(() => this.app.sound.play('combo', 3 + Math.min(4, i * 2)), 260 + i * 180);
      if (first) setTimeout(() => this.earnItem(), 900 + i * 300);
    }

    /** A power-up earned in play (js/items.js, Earn): drawn by rarity from the power-ups, into the bag (an Undo as its pack), with a quiet toast. */
    earnItem() {
      const id = Gifts.draw(Math.random, 1)[0];
      if (!id) return;
      const n = this.app.store.grant(id);
      toast(itemCount(id, n), 'good', 2200, 'item-' + id);
      this.renderItems();
    }

    /**
     * The Board full card: the board's numbers, and Undo (whenever there is a placement to take back: how many are held,
     * or the price), Boards and Retire. The numbers scroll on a short screen; the buttons always show.
     */
    onTopout(silent) { this.ctl.onEnd(this.game.endKind || 'full', silent); }

    /** The board ended (plain: full): counted (unless silent: a redraw), and its card (the controller's cards[kind]). */
    boardFull(kind, silent) {
      const F = this.app.store.state.stats.free;
      if (!silent) { F.topouts++; this.app.store.touch(); }
      const card = this.ctl.cards[kind] || this.ctl.cards.full;
      this.showCard(card(this, kind), 'topout');
      this.fadeEdges(this.overlay.querySelector('.board-sum'));
    }

    /** The Board full card's content: the board's summary, then Undo, Boards and Retire. */
    fullCard() {
      const g = this.game;
      return [
        h('h2', null, 'Board full'),
        this.boardSummary(Library.summarize(g.s, Date.now(), g), g.recipe, this.ctl.tiles(g)),
        h('div', { class: 'row' },
          g.history.length ? undoButton(this.app.store, { class: 'btn', id: 'topout-undo', onclick: () => this.topoutUndo() }, ico('item-rewind'), ITEMS.rewind.name) : null,
          h('button', { class: 'btn', onclick: () => this.openLibrary() }, ico('boards'), 'Boards'),
          h('button', { class: 'btn primary', onclick: () => this.newBoard('full') }, ico('retire'), 'Retire')),
      ];
    }

    /**
     * The Board full card's Undo, paid as the puzzle Undo is: one held is used; with none, one is bought at its price
     * and used at once (the price is on the button, so no question); with none and too few lines, nothing happens but a
     * note.
     */
    topoutUndo() {
      const st = this.app.store, it = ITEMS.rewind;
      if (!this.game.history.length) return;
      if (!(st.state.inventory.rewind > 0)) {
        if (st.state.lines < it.price + this.rewindRefund()) { toast('Not enough lines', 'bad'); this.app.sound.play('error'); return; }
        if (!st.buyItem('rewind')) return;
        this.app.refreshWallet();
      }
      this.apply('rewind');
    }

    /** A scrolling list's cut edges fade (fade-t, fade-b) while there is more that way, as the card resizes too. */
    fadeEdges(el) {
      if (this.edgesRO) { this.edgesRO.disconnect(); this.edgesRO = null; }
      if (!el) return;
      const edges = () => {
        el.classList.toggle('fade-t', el.scrollTop > 1);
        el.classList.toggle('fade-b', el.scrollTop + el.clientHeight < el.scrollHeight - 1);
      };
      edges();
      el.addEventListener('scroll', edges, { passive: true });
      if (root.ResizeObserver) { this.edgesRO = new ResizeObserver(edges); this.edgesRO.observe(el); }
    }

    /**
     * The lines an Undo takes back from the wallet: what the last placement banked. A bought Undo needs its price and
     * these, or the wallet would go below zero.
     */
    rewindRefund() {
      const g = this.game, last = g && g.history[g.history.length - 1];
      return last ? Math.round(Math.max(0, (g.s.banked || 0) - (last.s.banked || 0)) * 100) / 100 : 0;
    }

    /**
     * A board's lifelong numbers (Library.summarize), as a grid of small tiles. Its size is the summary's own (a record,
     * or one made with it), else the board in play's (the full board's card). Lines is the board's own count; Lines
     * banked is what it paid, in Standard lines. Then the board's recipe (a Board tile), each part's own numbers from
     * the summary (m.ext: a uiPart's tiles(ext, recipe, m) -> [[value, label]]), and extra (the controller's tiles for
     * the board in play).
     */
    boardSummary(m, recipe, extra) {
      const sz = m.w ? m : this.game;
      // The board's recipe in words (Recipe.label: nothing on a default board), and a controller's own tiles.
      const label = recipe && L.Recipe ? L.Recipe.label(recipe) : '';
      const items = Object.entries(m.items || {}).filter(([id, n]) => n > 0 && ITEMS[id]).sort((a, b) => b[1] - a[1]);
      const nItems = items.reduce((a, [, n]) => a + n, 0);
      const ppm = m.playMs > 30000 ? (m.pieces / (m.playMs / 60000)).toFixed(1) : '—';
      const tile = (v, l) => h('div', { class: 'bs' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
      return h('div', { class: 'board-sum' },
        tile(m.life ? fmtDuration(m.life) : '—', 'Lifetime'), tile(m.playMs ? fmtDuration(m.playMs) : '—', 'Played'), tile(fmtInt(m.pieces), 'Pieces'),
        tile(fmtInt(m.lines), 'Lines'), tile(fmtInt(m.score), 'Score'), tile(ppm, 'Pieces / min'),
        tile(fmtInt(m.quads), 'Quads'), tile(fmtInt(m.tspins), 'T-spins'), tile(fmtInt(m.perfect), 'Perfect clears'),
        tile(fmtInt(m.maxCombo), 'Best combo'), tile(fmtInt(m.maxB2B), 'Best back-to-back'), tile(fmtInt(m.chain), 'Best chain'),
        tile(fmtInt(m.hchain), 'Best chain, no power-ups'), tile(fmtLines(m.banked) + ' ' + LINE, 'Lines banked'), tile(fmtInt(m.combos), 'Combos'),
        tile(Library.sizeLabel(sz.w, sz.h), 'Size'),
        h('div', { class: 'bs span2' }, h('div', { class: 'v' }, nItems ? fmtInt(nItems) + ' used' : 'none'), h('div', { class: 'l' }, 'Power-ups' + (items.length ? ': ' + items.slice(0, 6).map(([id, n]) => ITEMS[id].name + (n > 1 ? ' ×' + n : '')).join(', ') : ''))),
        label ? h('div', { class: 'bs span2 board-tile', title: label }, h('div', { class: 'v' }, label), h('div', { class: 'l' }, 'Board')) : null,
        this.partTiles(m, recipe).map(([v, l]) => tile(v, l)),
        (extra || []).map(([v, l]) => tile(v, l)));
    }

    /** Each part's own numbers kept in a board's summary (m.ext, by part), as its uiPart shows them (tiles). */
    partTiles(m, recipe) {
      const ext = m && m.ext, R = L.Recipe;
      if (!ext || typeof ext !== 'object' || !R) return [];
      const out = [];
      for (const u of R.uis()) if (typeof u.tiles === 'function' && ext[u.key] != null) out.push(...(u.tiles(ext[u.key], recipe, m) || []));
      return out;
    }

    /**
     * A library row's tags: Playing, Full (a board that ended full: not one a part ended its own way), then each part's
     * (a uiPart's tags(recipe, x, info) -> [{ text, cls }]: Protect's Wilted, Battle's "vs Steady 3–2"; x is the part's
     * saved state, or its summary numbers on a retired record; info: { cur, over, ended, reason, retired }).
     */
    rowTags(recipe, xs, info) {
      const out = [];
      if (info.cur) out.push(h('span', { class: 'tag on' }, 'Playing'));
      if (info.retired ? info.reason === 'full' : info.over && !info.ended) out.push(h('span', { class: 'tag full' }, 'Full'));
      const R = L.Recipe, uis = R && recipe ? R.uis().filter((u) => typeof u.tags === 'function') : [];
      // The board in play's state is read only when a part asks for it.
      if (uis.length && typeof xs === 'function') xs = xs();
      for (const u of uis) {
        for (const t of u.tags(recipe, xs && typeof xs === 'object' ? xs[u.key] : undefined, info) || []) if (t && t.text) out.push(h('span', { class: 'tag' + (t.cls ? ' ' + t.cls : '') }, String(t.text)));
      }
      return out;
    }

    /** Stats ▸ Free Play's log of past boards (kept apart from the library's records; deleting a record keeps it). */
    logBoard(s, reason, size) {
      if (!s || !s.pieces) return;
      const F = this.app.store.state.stats.free, now = Date.now(), m = Library.summarize(s, now);
      F.boardLog = F.boardLog || [];
      size = size || this.game;
      const entry = { at: now, reason: reason || 'manual', w: size.w, h: size.h, life: m.life, playMs: m.playMs, pieces: m.pieces, lines: m.lines, score: m.score, quads: m.quads, tspins: m.tspins, perfect: m.perfect, maxCombo: m.maxCombo, chain: m.chain, items: Object.values(m.items).reduce((a, b) => a + b, 0) };
      // A board of another recipe than the default keeps it (thin: Recipe.thin), for its label in Past boards.
      if (L.Recipe && size.recipe && !L.Recipe.isDefault(size.recipe)) entry.recipe = L.Recipe.thin(size.recipe);
      F.boardLog.unshift(entry);
      if (F.boardLog.length > 30) F.boardLog.length = 30;
    }

    /**
     * Retires the board in play (to the library's retired records) and starts a new one in its place: a new game with
     * its own seed, nothing of the old one's piece, queue or random stream. Saved at once.
     */
    newBoard(reason) {
      const st = this.app.store, now = Date.now();
      Library.ensure(st.state, now);
      this.syncCounters();
      const s = this.game.s, size = { w: this.game.w, h: this.game.h }, recipe = this.game.recipe;
      if (s.pieces) {
        this.logBoard(s, reason);
        Library.retire(st.state, st.state.boards.cur, this.game.toJSON(), now, reason);
        Library.newCurrent(st.state, now);
      }
      // The new board is the old one's size and recipe: nothing asks (New board is where they are chosen).
      this.freshGame(size, recipe);
      this.persist();
    }

    /**
     * A new, empty game for the board in play (after Retire, Delete or New board), at `size` and of `recipe` (the size
     * clamped to what a board of it can be): by default the size and recipe last chosen in the New board window.
     */
    freshGame(size, recipe) {
      const B = this.app.store.state.boards;
      const r = recipe || B.recipe || (L.Recipe && L.Recipe.DEFAULT);
      const z = Library.clampSize(size || B.size, r);
      this.app.store.state.stats.free.boards++;
      this.setGame(new Game({ w: z.w, h: z.h, recipe: r, previewCount: this.settings.preview }));
    }

    // ---- the board library -------------------------------------------------------------------------------------------

    /**
     * True for a board nothing has been done on yet (a new board from it would be the same board): no piece set, an
     * empty stack (as the recipe sees it: Protect's sprout does not count, Game.isClean) and no power-up used on it
     * (gold, a net or a Giant waiting there would be lost with it).
     */
    untouched() {
      const s = this.game.s;
      return !s.pieces && this.game.isClean() && !Object.values(s.items || {}).some((n) => n > 0) && !s.gold && !s.double && !s.net && !s.boost;
    }

    /** Is the board in play of this recipe (Recipe.equal: the same board, whatever order its keys were written in)? */
    sameRecipe(r) { return !L.Recipe || L.Recipe.equal(r || L.Recipe.DEFAULT, this.game.recipe || L.Recipe.DEFAULT); }

    /** The board in play as saved, marked when it is full (for the library's list). */
    boardJSON() { const j = this.game.toJSON(); if (this.game.over) j.over = true; return j; }

    /** A different board comes into play: a new game object, everything about the old one's piece in hand let go. */
    setGame(game) {
      this.armed = null;
      this.tray = null;
      this.hideCard();
      game.previewCount = this.settings.preview;
      this.attachGame(game, {});
      this.view.showBank = true;
      this.snapshot();
      this.renderItems();
      this.renderStatus();
      if (game.over) this.onTopout(true);
    }

    /** Saves the board in play and the save at once (a library change is never left to the next autosave). */
    persist() { this.save(); this.app.store.save(); }

    /**
     * Shelves the board in play and starts a new one (its own seed) at `size` and of `recipe`, by default the ones last chosen. A board
     * nothing has been done on is not shelved (it would be an empty board kept): it is made again at that size, in its
     * own record. False when the library is full, or when an untouched board would be made again as it is.
     */
    shelveAndNew(size, recipe) {
      const st = this.app.store, now = Date.now(), r = recipe || st.state.boards.recipe || (L.Recipe && L.Recipe.DEFAULT), z = Library.clampSize(size || st.state.boards.size, r);
      if (this.untouched()) {
        // An untouched board of another recipe is made again with it, as one of another size is.
        if (!size && z.w === this.game.w && z.h === this.game.h && this.sameRecipe(r)) return false;
        this.setGame(new Game({ w: z.w, h: z.h, recipe: r, previewCount: this.settings.preview }));
        this.app.sound.play('hold');
        this.persist();
        return true;
      }
      if (Library.full(st.state.boards)) { toast('Library full', 'bad'); this.app.sound.play('error'); return false; }
      this.syncCounters();
      Library.startNew(st.state, this.boardJSON(), now);
      this.freshGame(z, r);
      this.app.sound.play('hold');
      this.persist();
      return true;
    }

    /**
     * The New board window: the board's size and recipe, and Create. On top, always: the empty well drawn small and the
     * Width and Height steppers. Under them four tabs (Size, Shapes, Modifiers, Mode), each with a short value, and one
     * panel: Size has the presets; Shapes its chips (Normal, and each shapes part's); Modifiers a switch for each
     * modifier; Mode the modes and the level of the one chosen. It opens on the Size tab, with focus on Width, at the
     * size and recipe last chosen. The last choice wins (Recipe.resolve): an option the choice rules out moves to an
     * allowed one (and comes back when it is allowed again), and the live region says what changed; an option the
     * other choices rule out stays in place, off (aria-disabled), and a press on it shows why in one muted line. The
     * size shown is the one asked for, clamped to what a board of the recipe can be (Recipe.clampSize), so it comes
     * back when the recipe allows it again. Create remembers both and makes the board (shelveAndNew). `done(true)` once
     * a board was made.
     *
     * The feature parts fill it through Recipe.uiPart({ key, order, … }), every field optional:
     *   chips: [{ value, name, piece | sample(ctx, px, look) }]   Shapes chips (path 'shapes.preset'); Normal is built in
     *   tab: 'shapes' | 'mods' | 'mode' | 'size', panel(r, api) -> element   more in that tab's panel, under its options
     *   value(r) -> text          the Shapes tab's short value ("Frantic", "Custom")
     *   mod: 'jelly', name        Modifiers: its switch's name        mode: 'protect', name   Mode: its button's name
     *   levels(r) -> { path, values: [[value, label]] } | null      the level row of its mode
     *   stepper(r, key) -> { label } | null   a stepper's name ('w', 'h': Battle's Height is Rows)
     *   presets(r) -> [[name, w, h]] | null   the Size tab's presets
     *   sizeFor(r, asked) -> asked | null     the size to show once the recipe changed (Battle keeps its own)
     *   commit(r, size) -> { recipe, size } | null   what Create makes
     *   said(path, value, r) -> text | null   a value of its own in words, for the live region (Custom's sources), where
     *                             a chip's or a level's name does not say it
     *   tags(r, x, info) -> [{ text, cls }]   more tags on its boards' library rows (see PlayMode.rowTags)
     *   tiles(ext, r, m) -> [[value, label]]  its numbers on a board's summary, from the summary's ext (Recipe.summary)
     * api: { recipe, choose(path, value), why(text), refresh(), look, app }. A panel's control keeps focus through a
     * refresh when it carries data-focus="a name of its own" (or an id, or data-path and data-value as the options do);
     * one that cannot be found again leaves focus on the tab, never outside the window (where Enter is Create).
     *
     * With `edit` ({ id, recipe, size, json }: a saved board), it is Edit rules: the same window on that board's
     * recipe and size, with Apply in place of Create. Apply's price is on it (Recipe.editPrice: a flat price for each
     * section changed; nothing when nothing did); a size that would cut the stack, or rules the board cannot take as
     * it stands, are refused with the reason (Library.rebuild); a mode a board keeps for life (Protect) can be neither
     * entered nor left (Recipe.editConflicts). Apply spends the lines and changes the board (applyEdit).
     */
    openNewBoard(done, edit) {
      const st = this.app.store, B = st.state.boards, R = L.Recipe;
      const clone = (v) => JSON.parse(JSON.stringify(v));
      let recipe = R.normalize(edit ? edit.recipe : B.recipe), memo = {}, tab = 'size';
      // What was asked for (any size a board can have) and what is shown (that, as a board of this recipe can be).
      let asked = Library.clampSize(edit ? edit.size : B.size), z = R.clampSize(asked, recipe), lim = R.limits(recipe);
      /** Every option ruled out now: the recipe's conflicts, and in an edit what the board keeps for life. */
      const conflictsOf = (r) => (edit ? Object.assign(R.editConflicts(edit.recipe, r), R.conflicts(r)) : R.conflicts(r));
      let applyBtn = null, price = null, lastCut = null;
      const uis = () => R.uis();
      const cap = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);
      const modName = (k) => { const u = uis().find((x) => x.mod === k); return (u && u.name) || cap(k); };
      const modeName = (m) => { const u = uis().find((x) => x.mode === m); return (u && u.name) || cap(m); };
      const idOf = (path, v) => path + '=' + (typeof v === 'string' ? v : JSON.stringify(v));
      const lk = UI.lookWith(this.app), look = { skin: lk.skin, color: (c) => lk.colors[c], colors: lk.colors, t: 0, alpha: 1 };
      /** The chips of the Shapes tab: Normal, then each shapes part's. */
      const chips = () => {
        const out = [{ path: 'shapes.preset', value: 'normal', name: 'Normal', piece: 'T' }];
        for (const u of uis()) for (const c of u.chips || []) {
          const k = out.findIndex((o) => o.value === c.value && o.path === (c.path || 'shapes.preset'));
          const chip = Object.assign({ path: 'shapes.preset' }, c);
          if (k >= 0) out[k] = chip; else out.push(chip);
        }
        return out;
      };
      /** The modifiers a part brings (options mods.k), in the recipe's order. */
      const mods = () => R.MODS.filter((k) => R.options().some((o) => o.path === 'mods.' + k));
      const modes = () => (R.options().find((o) => o.path === 'mode') || { values: ['plain'] }).values;
      const tabValue = (k) => {
        if (k === 'shapes') {
          const u = uis().find((x) => x.value);
          const v = u && u.value(recipe);
          if (v) return v;
          const c = chips().find((x) => R.canon(R.getPath(recipe, x.path)) === R.canon(x.value));
          return c ? c.name : 'Normal';
        }
        if (k === 'mods') { const on = R.MODS.filter((m) => recipe.mods && recipe.mods[m]); return !on.length ? 'Off' : on.length === 1 ? modName(on[0]) : on.length === 2 ? 'Both' : on.length + ' on'; }
        if (k === 'mode') return modeName(recipe.mode);
        return '';
      };
      const TABS = [['size', 'Size'], ['shapes', 'Shapes'], ['mods', 'Modifiers'], ['mode', 'Mode']];

      const preview = h('canvas', { class: 'nb-preview', 'aria-hidden': 'true' });
      const presetList = () => { for (const u of uis()) { const p = u.presets && u.presets(recipe); if (p) return p; } return [['Small', 6, 12], ['Standard', Library.STANDARD.w, Library.STANDARD.h], ['Tall', 8, 30], ['Wide', 16, 16]]; };
      /** One stepper: its label, −, the number (a spin button: ↑ ↓, Page Up / Down by 5, Home, End) and +. */
      const stepper = (key, label) => {
        const minus = h('button', { type: 'button', class: 'icon-btn nb-step', 'aria-label': 'Fewer ' + (key === 'w' ? 'columns' : 'rows'), html: L.Icons.icon('minus'), onclick: () => set({ [key]: z[key] - 1 }, true) });
        const plus = h('button', { type: 'button', class: 'icon-btn nb-step', 'aria-label': 'More ' + (key === 'w' ? 'columns' : 'rows'), html: L.Icons.icon('plus'), onclick: () => set({ [key]: z[key] + 1 }, true) });
        const val = h('div', { class: 'nb-val', role: 'spinbutton', tabindex: '0', 'aria-label': label, 'data-k': key });
        const name = h('span', { class: 'nb-label' }, label);
        val.addEventListener('keydown', (e) => {
          const by = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 }[e.key];
          if (by) set({ [key]: z[key] + by });
          else if (e.key === 'Home') set({ [key]: lim[key][0] });
          else if (e.key === 'End') set({ [key]: lim[key][1] });
          else return;
          e.preventDefault(); e.stopPropagation();
        });
        return { el: h('div', { class: 'nb-row' }, name, h('div', { class: 'nb-stepper' }, minus, val, plus)), minus, plus, val, name, key, label };
      };
      const steppers = [stepper('w', 'Width'), stepper('h', 'Height')];
      const paint = () => {
        // The empty well at this size, fitted in a fixed box on whole device pixels (as the library's thumbnails).
        const dpr = Math.min(3, root.devicePixelRatio || 1);
        const boxW = 76, boxH = 124;
        const c = Math.max(1, Math.floor(Math.min(boxW * dpr / z.w, boxH * dpr / z.h)));
        const W = z.w * c, H = z.h * c;
        preview.width = W; preview.height = H;
        preview.style.width = W / dpr + 'px'; preview.style.height = H / dpr + 'px';
        // In an edit, the board's own stack at the size shown (none where that size would cut it).
        const cut = edit ? Library.reshape(edit.json, z.w, z.h).json : null;
        const cells = cut ? cut.cells.map((v) => v & CELL.COLOR) : undefined;
        Render.previewBoard(preview.getContext('2d'), { x: 0, y: 0, w: W, h: H }, z.w, z.h, recipe, this.app.theme, cells ? { cell: c, dpr, cells, look: Render.makeLook(this.app.store.state.equipped, this.app.theme, 0, true) } : { cell: c, dpr });
      };
      // A button, a preset or an option changes what does not have focus: the change is read out (VoiceOver).
      const live = h('div', { class: 'nb-live', 'aria-live': 'polite' });
      const why = h('p', { class: 'nb-why' });
      const showWhy = (text) => { why.textContent = text || ''; if (text) live.textContent = text; };

      // ---- the tabs and the panel ----
      const tabBtns = TABS.map(([k, name]) => h('button', {
        type: 'button', role: 'tab', class: 'nb-tab' + (k === 'size' ? ' solo' : ''), id: 'nb-tab-' + k, 'data-tab': k, 'aria-controls': 'nb-panel',
        onclick: () => select(k),
      }, h('b', { class: 'nm' }, name), k === 'size' ? null : h('span', { class: 'vl' })));
      const tabs = h('div', { class: 'nb-tabs', role: 'tablist', 'aria-label': 'Board options' }, tabBtns);
      tabs.addEventListener('keydown', (e) => {
        const i = TABS.findIndex(([k]) => k === tab);
        const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
        if (j == null) return;
        e.preventDefault(); e.stopPropagation();
        const k = TABS[(j + TABS.length) % TABS.length][0];
        select(k);
        tabBtns.find((b) => b.dataset.tab === k).focus();
      });
      const content = h('div', { class: 'nb-content' });
      const panel = h('div', { class: 'nb-panel', role: 'tabpanel', id: 'nb-panel' }, content, why);
      const select = (k) => { if (k !== tab) { tab = k; showWhy(''); } refresh(); };

      /** An option's button: pressed when the recipe has it, off (with why) when the other choices rule it out. */
      const option = (path, value, cls, kids, role) => {
        const bad = conflictsOf(recipe)[idOf(path, value)] || null;
        const on = R.canon(R.getPath(recipe, path)) === R.canon(value);
        return h('button', Object.assign({ type: 'button', class: cls, 'data-path': path, 'data-value': typeof value === 'string' ? value : JSON.stringify(value), 'aria-disabled': bad ? 'true' : null, 'data-tip': bad, onclick: () => choose(path, value) },
          role === 'switch' ? { role: 'switch', 'aria-checked': String(on) } : { 'aria-pressed': String(on) }), kids);
      };
      const said = (path, v) => {
        if (path.startsWith('mods.')) return modName(path.slice(5)) + (v ? ' on' : ' off');
        if (path === 'mode') return modeName(v);
        const c = chips().find((x) => x.path === path && R.canon(x.value) === R.canon(v));
        if (c) return c.name;
        for (const u of uis()) { const lv = u.levels && u.levels(recipe); const hit = lv && lv.path === path && lv.values.find(([x]) => R.canon(x) === R.canon(v)); if (hit) return hit[1]; }
        // A part names its own values (Custom's sources: "4 and 5 blocks").
        for (const u of uis()) { const t = typeof u.said === 'function' ? u.said(path, v, recipe) : null; if (t) return String(t); }
        return cap(typeof v === 'string' ? v : JSON.stringify(v));
      };
      /** A choice: refused with its reason when ruled out; else made, and whatever it rules out moves (the last choice wins). */
      const choose = (path, value) => {
        const bad = conflictsOf(recipe)[idOf(path, value)];
        if (bad) { showWhy(bad); return; }
        const next = clone(recipe);
        R.setPath(next, path, value);
        const res = R.resolve(next, path, memo);
        memo = res.memo;
        const was = z;
        recipe = res.recipe;
        for (const u of uis()) if (u.sizeFor) { const a = u.sizeFor(recipe, asked); if (a) asked = a; }
        showWhy('');
        refresh();
        const words = [said(path, R.getPath(recipe, path))].concat(res.changes.map((c) => said(c.path, c.to)));
        if (was.w !== z.w || was.h !== z.h) words.push(Library.sizeLabel(z.w, z.h));
        live.textContent = words.join(', ');
      };
      const api = { get recipe() { return recipe; }, choose, why: showWhy, refresh: () => refresh(), look, app: this.app, option, edit: edit || null };
      const extras = (k) => uis().filter((u) => u.tab === k && u.panel).map((u) => u.panel(recipe, api)).filter(Boolean);
      const panels = {
        size: () => {
          const list = presetList();
          return [h('div', { class: 'nb-presets', role: 'group', 'aria-label': 'Presets', style: { gridTemplateColumns: 'repeat(' + Math.min(4, list.length) + ', minmax(0, 1fr))' } }, list.map(([name, w, hh]) => {
            const fits = R.sizeOk(w, hh, recipe);
            return h('button', { type: 'button', class: 'nb-preset', 'data-w': String(w), 'data-h': String(hh), 'aria-pressed': String(w === z.w && hh === z.h), 'aria-disabled': fits ? null : 'true',
              onclick: () => { if (!fits) { showWhy('Smallest here is ' + Library.sizeLabel(lim.w[0], lim.h[0])); return; } set({ w, h: hh }, true); } },
            h('b', null, name), h('span', null, Library.sizeLabel(w, hh)));
          }))].concat(extras('size'));
        },
        shapes: () => [h('div', { class: 'nb-chips', role: 'group', 'aria-label': 'Shapes' }, chips().map((c) => option(c.path, c.value, 'nb-chip',
          [UI.canvasFor(28, 28, (ctx) => { if (c.sample) c.sample(ctx, 28, look); else if (c.piece) Render.drawPieceIn(ctx, { id: c.piece }, { x: 0, y: 0, w: 28, h: 28 }, 7, look); }), h('span', { class: 'nm' + (/\S{10,}/.test(c.name) ? ' long' : '') }, c.name)])))].concat(extras('shapes')),
        mods: () => {
          const list = mods();
          return [list.length ? h('div', { class: 'nb-mods', role: 'group', 'aria-label': 'Modifiers' }, list.map((k) => option('mods.' + k, !recipe.mods[k], 'nb-switch',
            [h('span', { class: 'nm' }, modName(k)), h('span', { class: 'sw', 'aria-hidden': 'true' })], 'switch')))
            : h('p', { class: 'nb-none' }, 'None')].concat(extras('mods'));
        },
        mode: () => {
          const u = uis().find((x) => x.mode === recipe.mode), lv = u && u.levels ? u.levels(recipe) : null;
          return [h('div', { class: 'nb-modes seg', role: 'group', 'aria-label': 'Mode' }, modes().map((m) => option('mode', m, 'nb-mode', modeName(m)))),
            lv ? h('div', { class: 'nb-lvl seg', role: 'group', 'aria-label': 'Level' }, lv.values.map(([v, name]) => option(lv.path, v, 'nb-level', name))) : null].concat(extras('mode'));
        },
      };
      // A switch shows the recipe's state: a press asks for the other one (option() is built with the value to choose).
      const fixSwitches = () => content.querySelectorAll('.nb-switch').forEach((b) => b.setAttribute('aria-checked', String(!!R.getPath(recipe, b.dataset.path))));
      const refresh = () => {
        lim = R.limits(recipe);
        z = R.clampSize(asked, recipe);
        tabBtns.forEach((b) => {
          const on = b.dataset.tab === tab;
          b.setAttribute('aria-selected', String(on));
          b.tabIndex = on ? 0 : -1;
          const vl = b.querySelector('.vl');
          if (vl) { vl.textContent = tabValue(b.dataset.tab); b.title = b.querySelector('.nm').textContent + ': ' + vl.textContent; }
        });
        panel.setAttribute('aria-labelledby', 'nb-tab-' + tab);
        panel.dataset.tab = tab;
        const focused = content.contains(document.activeElement) ? document.activeElement : null;
        // The option that had focus keeps it through the redraw (a switch by its path: its value to choose flips; a
        // part's control by its data-focus or id).
        const again = focused && (focused.dataset.focus ? '[data-focus="' + CSS.escape(focused.dataset.focus) + '"]' : focused.id ? '#' + CSS.escape(focused.id)
          : focused.dataset.path ? '[data-path="' + focused.dataset.path + '"]' + (focused.getAttribute('role') === 'switch' ? '' : '[data-value="' + CSS.escape(focused.dataset.value) + '"]') : focused.dataset.w ? '[data-w="' + focused.dataset.w + '"][data-h="' + focused.dataset.h + '"]' : null);
        content.replaceChildren(...panels[tab]().filter(Boolean));
        fixSwitches();
        if (focused) {
          // Not found again: focus stays in the window, on the tab (outside it, Enter would be Create).
          const f = again && content.querySelector(again);
          if (f) f.focus(); else tabBtns.find((b) => b.dataset.tab === tab).focus();
        }
        for (const sp of steppers) {
          const t = uis().map((u) => u.stepper && u.stepper(recipe, sp.key)).find(Boolean);
          const label = (t && t.label) || sp.label;
          sp.name.textContent = label;
          sp.val.setAttribute('aria-label', label);
          const [lo, hi] = lim[sp.key];
          sp.val.textContent = String(z[sp.key]);
          sp.val.setAttribute('aria-valuemin', String(lo));
          sp.val.setAttribute('aria-valuemax', String(hi));
          sp.val.setAttribute('aria-valuenow', String(z[sp.key]));
          // Off at the limit, but never disabled: a disabled button would drop focus out of the window, where Enter
          // is Create. It keeps focus and a press does nothing (the size is clamped).
          sp.minus.setAttribute('aria-disabled', String(z[sp.key] <= lo));
          sp.plus.setAttribute('aria-disabled', String(z[sp.key] >= hi));
        }
        paint();
        if (edit) {
          // Apply says its price, and is quiet when the size would cut the stack (a press says why).
          price = R.editPrice(edit.recipe, recipe, edit.size, z);
          const cut = (z.w !== edit.size.w || z.h !== edit.size.h) ? Library.reshape(edit.json, z.w, z.h).why : null;
          price.why = cut || null;
          if (applyBtn) {
            applyBtn.replaceChildren(...['Apply', price.cost ? h('span', { class: 'gem' }, ' ' + LINE + fmtInt(price.cost)) : null].filter(Boolean));
            applyBtn.setAttribute('aria-label', price.cost ? 'Apply, costs ' + fmtInt(price.cost) + ' lines' : 'Apply');
            applyBtn.setAttribute('aria-disabled', String(!!cut));
            if (cut) why.textContent = cut;
            else if (why.textContent && why.textContent === lastCut) why.textContent = '';
            lastCut = cut;
          }
        }
      };
      const set = (o, say) => {
        const was = z;
        // Only what was changed: the other side keeps what was asked (a Height a recipe holds lower comes back).
        asked = Library.clampSize(Object.assign({}, asked, o));
        refresh();
        if (say && (was.w !== z.w || was.h !== z.h)) live.textContent = was.h === z.h ? steppers[0].name.textContent + ' ' + z.w : was.w === z.w ? steppers[1].name.textContent + ' ' + z.h : Library.sizeLabel(z.w, z.h);
      };
      refresh();
      const body = h('div', { class: 'nb-body' },
        h('div', { class: 'nb-main' }, h('div', { class: 'nb-well' }, preview), h('div', { class: 'nb-fields' }, steppers.map((sp) => sp.el))),
        tabs, panel, live);
      const handle = UI.openModal({
        title: edit ? 'Edit rules' : 'New board', icon: edit ? 'settings' : 'newBoard', cls: 'modal-newboard' + (edit ? ' modal-edit' : ''), body,
        buttons: [{ label: 'Cancel' }, edit ? { label: 'Apply', kind: 'primary', onClick: () => this.applyEdit(edit, recipe, { w: z.w, h: z.h }, price, (text) => { showWhy(text); this.app.sound.play('error'); }, done) } : { label: 'Create', kind: 'primary', onClick: () => {
          let out = { recipe, size: { w: z.w, h: z.h } };
          for (const u of uis()) if (u.commit) out = u.commit(out.recipe, out.size) || out;
          B.size = { w: out.size.w, h: out.size.h };
          B.recipe = R.normalize(out.recipe);
          const made = this.shelveAndNew(B.size, B.recipe);
          if (!made) st.touch();
          if (done) done(made);
        } }],
      });
      if (edit) { applyBtn = handle.el.querySelector('footer .btn.primary'); refresh(); }
      // Enter on a button (a stepper's, a preset, a tab, an option, Cancel, Close) presses that button; anywhere else
      // it is Create.
      handle.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest('button') && !e.target.closest('.btn.primary')) e.stopPropagation(); });
      steppers[0].val.focus();
      // For the tests: the window's recipe and size as they stand.
      handle.nb = { get recipe() { return recipe; }, get size() { return z; }, get price() { return price; }, select, choose };
      this.lastNB = handle;
      return handle;
    }

    /**
     * Edit rules for a saved board (the one in play, or a shelved one): the New board window on its recipe and size.
     * A board that ended keeps its rules (the action is not offered).
     */
    openEditRules(id, done) {
      const B = this.app.store.state.boards, rec = Library.find(B, id);
      if (!rec) return null;
      const cur = id === B.cur, json = cur ? this.boardJSON() : rec.game;
      if (!json || json.over || json.ended) { toast('A board that ended keeps its rules', 'bad'); return null; }
      const R = L.Recipe;
      return this.openNewBoard(done, { id, recipe: R.normalize(json.recipe), size: { w: json.w, h: json.h }, json });
    }

    /**
     * Apply in Edit rules: nothing changed closes it for nothing; else the board is rebuilt with the new rules
     * (Library.rebuild: refused, with why, when the stack or the piece would not fit), the price is spent (short: Not
     * enough lines, nothing changes) and the board changes where it is: in play (a new game object: no Undo history),
     * or on the shelf. False keeps the window open.
     */
    applyEdit(edit, recipe, size, price, why, done) {
      const st = this.app.store, B = st.state.boards, R = L.Recipe;
      price = price || R.editPrice(edit.recipe, recipe, edit.size, size);
      if (!price.cost) { if (done) done(false); return true; }
      const res = Library.rebuild(edit.json, recipe, size);
      if (res.why) { why(res.why); return false; }
      if (st.state.lines < price.cost) { why('Not enough lines'); toast('Not enough lines', 'bad'); return false; }
      const cur = edit.id === B.cur, rec = Library.find(B, edit.id);
      if (!rec) return true;
      st.spend(price.cost);
      this.app.refreshWallet();
      if (cur) {
        this.syncCounters();
        this.setGame(res.game);
      } else rec.game = res.json;
      this.app.sound.play('hold');
      toast('Rules changed', 'good', 1600);
      this.persist();
      if (done) done(true);
      return true;
    }

    /** Resumes a shelved board exactly as it was left; the one in play is shelved as it stands. */
    switchTo(id) {
      const st = this.app.store;
      const json = Library.open(st.state, id, this.boardJSON(), Date.now());
      if (!json) return false;
      this.syncCounters();
      let game = null;
      if (Library.playable(json)) { try { game = new Game({ saved: json, previewCount: this.settings.preview }); } catch (e) { game = null; } }
      if (!game) {
        const r = L.Recipe ? L.Recipe.normalize(json.recipe) : undefined, z = Library.clampSize(json, r);
        game = new Game({ w: z.w, h: z.h, recipe: r, previewCount: this.settings.preview });
      }
      this.setGame(game);
      this.app.sound.play('hold');
      this.persist();
      return true;
    }

    /** Retires a board after showing its life: the one in play (a new one takes its place) or a shelved one. */
    confirmRetire(id, after) {
      const st = this.app.store, B = st.state.boards, rec = Library.find(B, id);
      if (!rec) return;
      const cur = id === B.cur, s = cur ? this.game.s : rec.game && rec.game.s;
      if (!s || !s.pieces) return;
      UI.openModal({
        title: 'Retire ' + rec.name + '?', icon: 'retire', width: 420, cls: 'modal-retire',
        body: [this.boardSummary(Library.summarize(s, Date.now(), cur ? this.game : rec.game), cur ? this.game.recipe : rec.game.recipe, cur ? this.ctl.tiles(this.game) : []), B.retired.length >= Library.MAX_RETIRED ? h('p', { class: 'lib-note' }, 'Oldest retired board is removed') : null],
        buttons: [{ label: 'Cancel' }, { label: 'Retire', kind: 'primary', onClick: () => { this.retire(id); if (after) after(); } }],
      });
    }

    retire(id) {
      const st = this.app.store, B = st.state.boards;
      // Why it ended: full, or a part's own end (Protect's 'wilted'), or retired by hand.
      if (id === B.cur) { this.newBoard(this.game.over ? this.game.endKind || 'full' : 'manual'); return; }
      const rec = Library.find(B, id);
      if (!rec || !rec.game) return;
      const why = rec.game.over ? rec.game.ended || 'full' : 'manual';
      this.logBoard(rec.game.s, why, rec.game);
      Library.retire(st.state, id, rec.game, Date.now(), why);
      this.persist();
    }

    /** Deletes a board for good, after asking; the one in play is replaced by a new board. */
    confirmDelete(id, after) {
      const B = this.app.store.state.boards, rec = Library.find(B, id) || Library.findRetired(B, id);
      if (!rec) return;
      UI.confirm('Delete ' + rec.name + '?', null, 'Delete', () => { this.deleteBoard(id); if (after) after(); }, 'danger', 'trash');
    }

    deleteBoard(id) {
      const st = this.app.store, B = st.state.boards, now = Date.now();
      if (Library.findRetired(B, id)) { Library.removeRetired(B, id); this.persist(); return; }
      if (id === B.cur) {
        // The board that takes its place is its size and recipe.
        const size = { w: this.game.w, h: this.game.h }, recipe = this.game.recipe;
        this.syncCounters();
        Library.remove(st.state, id);
        Library.newCurrent(st.state, now);
        this.freshGame(size, recipe);
      } else Library.remove(st.state, id);
      this.persist();
    }

    rename(id, raw) {
      const name = Library.rename(this.app.store.state.boards, id, raw);
      if (name) this.persist();
      return name;
    }

    /**
     * A board's stack in miniature, in the current palette (still: Prism at rest), as an image. Drawn on whole device
     * pixels, as plain squares (a skin's detail does not survive at three pixels a cell), so it stays crisp at any
     * scale. Every thumbnail is the size of a Standard board's (three pixels a cell): a smaller board sits in the middle
     * of it at that scale, a larger one is fitted in, at one device pixel a cell or more, so every row is as tall. Cached by board, stack, look and scale, so it is redrawn only when one of those
     * changed.
     */
    thumb(id, cells, w, hh, recipe, tip) {
      const eq = this.app.store.state.equipped, theme = this.app.theme;
      const dpr = Math.min(3, root.devicePixelRatio || 1);
      const str = typeof cells === 'string' ? cells : Library.encodeCells(cells);
      // A view part can draw its option over the stack (Render.previewBoard: Mirror's line, the sprout): by recipe too.
      const rk = recipe && L.Recipe && !L.Recipe.isDefault(recipe) ? L.Recipe.key(recipe) : '';
      const key = [id, eq.palette, theme.name, theme.wellTop, dpr, w, hh, str, rk].join('|');
      let url = this.thumbs.get(id);
      if (!url || url.key !== key) {
        const vals = (typeof cells === 'string' ? Library.decodeCells(cells) : cells) || [];
        // The box a Standard board fills (three pixels a cell, or whole device pixels near it); any size is fitted in it.
        const c0 = Math.max(3, Math.round(3 * dpr)), BW = Library.STANDARD.w * c0, BH = Library.STANDARD.h * c0;
        const c = Math.max(1, Math.min(c0, Math.floor(BW / w), Math.floor(BH / hh))), pad = Math.max(2, Math.round(2 * dpr));
        const W = BW + pad * 2, H = BH + pad * 2, ww = w * c + pad * 2, wh = hh * c + pad * 2;
        const ox = Math.floor((W - ww) / 2), oy = Math.floor((H - wh) / 2);
        const look = Render.makeLook(eq, theme, 0, true);
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        Render.previewBoard(cv.getContext('2d'), { x: ox, y: oy, w: ww, h: wh }, w, hh, recipe, theme, { style: 'thumb', cell: c, pad, dpr, cells: vals, look });
        url = { key, src: cv.toDataURL(), W: W / dpr, H: H / dpr };
        this.thumbs.set(id, url);
        if (this.thumbs.size > 80) this.thumbs.delete(this.thumbs.keys().next().value);
      }
      return h('img', { class: 'lib-thumb', src: url.src, alt: '', 'data-tip': tip || null, style: { width: url.W + 'px', height: url.H + 'px' } });
    }

    /**
     * The Boards window: Saved (the board in play first, then the rest by when they were last played) and Retired.
     * A saved board resumes with a click (or Enter); each has Rename, Retire and Delete. A retired one opens its
     * summary; View (or its thumbnail) shows it in full view; it can be deleted. New board shelves the one in play.
     * One at a time: asked again, the open one stays.
     */
    openLibrary() {
      if (this.libHandle && this.libHandle.el.isConnected) return this.libHandle;
      const st = this.app.store;
      Library.ensure(st.state, Date.now());
      this.hideCard();
      let tab = 'saved', handle = null, editing = null;
      const list = h('div', { class: 'lib-list' });
      const when = (t) => {
        if (!t) return '';
        const d = new Date(t), now = new Date();
        return d.toDateString() === now.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
      };
      const act = (icon, label, fn, cls) => h('button', { class: 'icon-btn' + (cls ? ' ' + cls : ''), 'aria-label': label, 'data-tip': label, html: L.Icons.icon(icon), onclick: (e) => { e.stopPropagation(); fn(); } });
      // An empty slot where a row has no Retire, so the actions stay in their columns down the list.
      const gap = () => h('span', { class: 'icon-btn ph', 'aria-hidden': 'true' });
      const close = () => handle && handle.close();
      // The row at position i of the tab as it is now (after a board left it: the one that took its place, or the last).
      const focusAt = (i) => {
        const opens = [...list.querySelectorAll('.lib-open')];
        const f = opens[Math.max(0, Math.min(opens.length - 1, i))];
        if (f && f.focus) f.focus();
      };
      const indexOf = (id) => [...list.querySelectorAll('.lib-row')].findIndex((r) => r.dataset.id === id);
      // After a board was retired or deleted: redrawn, and, once the dialog asking has gone, focus on the nearest row.
      const afterGone = (id) => { const i = Math.max(0, indexOf(id)); return () => { draw(); setTimeout(() => { if (handle && handle.el.isConnected) focusAt(i); }, 0); }; };
      const nameEl = (rec, B) => {
        if (editing !== rec.id) return h('div', { class: 't' }, rec.name);
        const input = h('input', { type: 'text', class: 'lib-name', value: rec.name, maxlength: String(Library.NAME_MAX), 'aria-label': 'Name', spellcheck: 'false' });
        let done = false;
        // Enter or Esc: redrawn at once, focus back on the row. Focus gone elsewhere (a click, Tab): the name is kept
        // and only the field turns back into the name, so whatever was clicked or tabbed to is still there and gets
        // it; the row is rebuilt once that click is over.
        const finish = (keep, away) => {
          if (done) return;
          done = true;
          if (keep) this.rename(rec.id, input.value);
          if (editing === rec.id) editing = null;
          if (!away) { draw(rec.id); return; }
          const row = input.closest('.lib-row');
          input.replaceWith(h('div', { class: 't' }, rec.name));
          const rebuild = () => setTimeout(() => {
            if (!row.isConnected || editing || !(handle && handle.el.isConnected)) return;
            const a = document.activeElement, inRow = row.contains(a), label = inRow && a.getAttribute('aria-label');
            const fresh = savedRow(rec, st.state.boards);
            row.replaceWith(fresh);
            if (inRow) { const f = label && fresh.querySelector('.lib-acts [aria-label="' + label + '"]'); (f || fresh.querySelector('.lib-open')).focus(); }
          }, 0);
          if (pointerDown) window.addEventListener('pointerup', rebuild, { once: true }); else rebuild();
        };
        input.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); finish(true); }
          else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        });
        // A field taken out by a redraw (not by the player) says nothing.
        input.addEventListener('blur', () => { if (input.isConnected) finish(true, true); });
        input.addEventListener('click', (e) => e.stopPropagation());
        return input;
      };
      let pointerDown = false;
      const down = () => { pointerDown = true; }, up = () => { pointerDown = false; };
      window.addEventListener('pointerdown', down, true);
      window.addEventListener('pointerup', up, true);
      const savedRow = (rec, B) => {
        const cur = rec.id === B.cur, g = cur ? null : rec.game;
        const s = cur ? this.game.s : (g && g.s) || {};
        const full = cur ? this.game.over : !!(g && g.over);
        const cells = cur ? this.game.board.cells : g ? g.cells : [];
        const z = cur ? this.game : Library.clampSize(g), w = z.w, hh = z.h;
        const recipe = cur ? this.game.recipe : g && g.recipe, label = recipe && L.Recipe ? L.Recipe.label(recipe) : '', short = label && L.Recipe.label(recipe, true);
        const open = h(editing === rec.id ? 'div' : 'button', {
          class: 'lib-open', 'data-id': rec.id, 'aria-label': editing === rec.id ? null : (cur ? rec.name + ', in play' : 'Play ' + rec.name),
          onclick: editing === rec.id ? null : () => { if (!cur) this.switchTo(rec.id); close(); },
        }, this.thumb(rec.id, cells, w, hh, recipe), h('div', { class: 'grow' }, nameEl(rec, B),
          h('div', { class: 'd' + (short ? ' labelled' : '') }, this.rowTags(recipe, cur ? () => this.game.toJSON().x : g && g.x, { cur, over: full, ended: cur ? this.game.endKind || null : (g && g.ended) || null, retired: false }),
            // The size, when, then the board's recipe in short (Recipe.label: nothing on a default board; in full as its
            // tip), so an ellipsis only ever takes the label.
            h('span', { class: 'sz', title: label || null }, [Library.sizeLabel(w, hh), cur ? null : when(rec.touched), short].filter(Boolean).join(' · ')),
            h('span', { class: 'st' }, ['Lines ' + fmtInt(s.lines || 0), 'Score ' + fmtInt(s.score || 0)].join(' · ')))));
        return h('div', { class: 'lib-row' + (cur ? ' current' : ''), 'data-id': rec.id }, open,
          h('div', { class: 'lib-acts' },
            act('rename', 'Rename', () => { editing = rec.id; draw(); }),
            full || (g && g.ended) ? gap() : act('settings', 'Edit rules', () => this.openEditRules(rec.id, (made) => { if (made && handle && handle.el.isConnected) draw(rec.id); })),
            s.pieces ? act('retire', 'Retire', () => this.confirmRetire(rec.id, afterGone(rec.id))) : gap(),
            act('trash', 'Delete', () => this.confirmDelete(rec.id, afterGone(rec.id)), 'del')));
      };
      // A retired row opens its record; its thumbnail (or View) opens the board in full view.
      const retiredRow = (e) => {
        const label = e.recipe && L.Recipe ? L.Recipe.label(e.recipe) : '', short = label && L.Recipe.label(e.recipe, true);
        return h('div', { class: 'lib-row retired', 'data-id': e.id },
        h('button', { class: 'lib-open', 'data-id': e.id, 'aria-label': e.name, onclick: (ev) => { if (ev.target.closest && ev.target.closest('.lib-thumb')) this.openRetiredView(e.id, ev.currentTarget); else this.openRetired(e.id, afterGone(e.id)); } },
          this.thumb(e.id, e.cells, e.w, e.h, e.recipe, 'View'),
          h('div', { class: 'grow' }, h('div', { class: 't' }, e.name),
            h('div', { class: 'd' + (short ? ' labelled' : '') }, this.rowTags(e.recipe, e.sum && e.sum.ext, { cur: false, over: e.reason !== 'manual', ended: e.reason !== 'manual' && e.reason !== 'full' ? e.reason : null, reason: e.reason, retired: true }),
              h('span', { class: 'sz', title: label || null }, [when(e.at), Library.sizeLabel(e.w, e.h), short].filter(Boolean).join(' · ')),
              h('span', { class: 'st' }, ['Lines ' + fmtInt(e.sum.lines || 0), 'Score ' + fmtInt(e.sum.score || 0)].join(' · '))))),
        h('div', { class: 'lib-acts' },
          h('button', { class: 'icon-btn fv-open', 'aria-label': 'View', 'data-tip': 'View', html: L.Icons.icon('expand'), onclick: (ev) => { ev.stopPropagation(); this.openRetiredView(e.id, ev.currentTarget); } }),
          act('trash', 'Delete', () => this.confirmDelete(e.id, afterGone(e.id)), 'del')));
      };
      const newBtn = h('button', { class: 'btn sm primary lib-new', 'aria-label': 'New board', onclick: () => this.openNewBoard((made) => { if (made && handle && handle.el.isConnected) { tab = 'saved'; editing = null; draw(st.state.boards.cur); } }) }, ico('newBoard'), h('span', { class: 'lbl' }, 'New board'));
      const seg = h('div', { class: 'seg lib-tabs' }, [['saved', 'Saved'], ['retired', 'Retired']].map(([k, l]) =>
        h('button', { 'data-k': k, 'aria-pressed': String(k === tab), onclick: () => { tab = k; editing = null; draw(); } }, l, h('span', { class: 'c' }))));
      const draw = (focusId) => {
        const B = st.state.boards;
        seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === tab)));
        seg.querySelector('[data-k="saved"] .c').textContent = B.list.length + '/' + Library.MAX_ACTIVE;
        seg.querySelector('[data-k="retired"] .c').textContent = String(B.retired.length);
        // Full, a board that was played cannot be shelved; an untouched one can still be made again at another size.
        const isFull = Library.full(B) && !this.untouched();
        newBtn.disabled = isFull;
        newBtn.dataset.tip = isFull ? 'Library full' : 'New board';
        const rows = tab === 'saved' ? Library.ordered(B).map((r) => savedRow(r, B)) : B.retired.map(retiredRow);
        list.replaceChildren(...(rows.length ? rows : [h('p', { class: 'empty' }, 'None')]));
        const field = list.querySelector('input.lib-name');
        if (field) { field.focus(); field.select(); }
        else if (focusId) { const f = list.querySelector('.lib-open[data-id="' + focusId + '"]'); if (f && f.focus) f.focus(); }
      };
      // ↑ ↓ step between boards.
      list.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const opens = [...list.querySelectorAll('button.lib-open')], i = opens.indexOf(document.activeElement);
        if (i < 0) return;
        e.preventDefault(); e.stopPropagation();
        const n = opens[Math.max(0, Math.min(opens.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (n) n.focus();
      });
      draw();
      handle = UI.openModal({
        title: 'Boards', icon: 'boards', width: 460, cls: 'modal-lib', body: h('div', { class: 'lib-wrap' }, h('div', { class: 'lib-head' }, seg, newBtn), list),
        // Closed on a full board (from its card's Boards button): the card comes back.
        onClose: () => {
          this.libHandle = null;
          window.removeEventListener('pointerdown', down, true);
          window.removeEventListener('pointerup', up, true);
          if (this.game.over && !this.cardOpen) this.onTopout(true);
        },
      });
      this.libHandle = handle;
      // Focus on the board in play, so ↑ ↓ and Enter work straight away (however the window was opened).
      const first = list.querySelector('button.lib-open');
      if (first) first.focus();
      return handle;
    }

    /** A retired record's dates (started, retired; beside its thumbnail when asked) and its summary. */
    recordBody(e, withThumb) {
      const day = (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      return [h('div', { class: 'lib-dates' }, withThumb ? this.thumb(e.id, e.cells, e.w, e.h, e.recipe) : null, h('div', null, h('div', null, h('i', null, 'Started '), day(e.sum.startedAt || e.created)), h('div', null, h('i', null, 'Retired '), day(e.at)))), this.boardSummary(e.sum, e.recipe)];
    }

    /** A retired board's record: its name, when it lived, its summary. Read-only; View shows it in full; it can be deleted. */
    openRetired(id, after) {
      const B = this.app.store.state.boards, e = Library.findRetired(B, id);
      if (!e) return;
      // Delete asks first; only once it is done does the record close (Cancel leaves it open, where it was).
      const rec = UI.openModal({
        title: e.name, icon: 'retire', width: 420, cls: 'modal-retire',
        body: this.recordBody(e, true),
        buttons: [{ label: 'Delete', kind: 'danger', onClick: () => { this.confirmDelete(id, () => { rec.close(); if (after) after(); }); return false; } },
          { label: 'View', kind: 'fv-view', onClick: () => { this.openRetiredView(id, rec.el.querySelector('footer .fv-view')); return false; } },
          { label: 'Close', kind: 'primary' }],
      });
      return rec;
    }

    /**
     * A retired board in full view (js/retiredview.js): at play size where the board in play is, read-only, with
     * Previous and Next through the retired boards; Back or Esc returns, focus to `back`. One at a time.
     */
    openRetiredView(id, back) {
      if (this.fullView || !Library.findRetired(this.app.store.state.boards, id)) return this.fullView || null;
      // A record that cannot be drawn opens nothing (the view makes its first board before it opens a thing).
      try { this.fullView = new L.RetiredView(this, id, back || document.activeElement); } catch (err) { console.warn('Lull: a retired board could not be drawn', err); return null; }
      return this.fullView;
    }

    blocked() { return this.cardOpen || !!this.fullView; }

    renderStatus() {
      const s = this.game.s;
      const side = s.gold > 0 ? stat('Gold', String(Pay.clearsLeft(s.gold, this.game.rules)), 'opt gold', 'Next clears pay ×' + Luck.GOLD_X)
        : s.double ? stat('Luck', 'Double', 'opt gold', ITEMS.double.desc)
        : s.net > 0 ? stat('Luck', 'Net', 'opt boost', ITEMS.net.desc)
        : s.boost ? stat('Boost', Chain.fmt(s.boost.x) + ' · ' + Pay.clearsLeft(s.boost.left, this.game.rules), 'opt boost', 'Next ' + Pay.clearsLeft(s.boost.left, this.game.rules) + ' clears pay ' + Chain.fmt(s.boost.x))
        : stat('Pieces', fmtInt(s.pieces), 'opt');
      // The plain figures; the board's controller lays out the bar from them (Protect's Leaves in place of Score).
      const parts = {
        lines: stat('Lines', fmtInt(s.lines)),
        score: stat('Score', fmtInt(s.score)),
        chain: h('span', { class: 'stat ' + (s.chain > 1 ? 'chain' : 'slot-off'), 'data-tip-title': 'Chain', 'data-tip': 'Back-to-back plus combo. ' + (s.hand === false ? 'Power-ups on the board.' : 'No power-ups on the board: ' + (s.hchain || 0) + '.') },
          h('i', null, 'Chain '), h('b', null, String(s.chain || 0), h('span', { class: 'mult' }, ' · ' + Chain.fmt(s.mult || 1)))),
        side,
      };
      this.status.replaceChildren(
        h('div', { class: 'stats' }, this.ctl.status(parts, { stat })),
        h('div', { class: 'acts' },
          this.giftBtn(),
          h('button', { class: 'btn sm boards-btn', 'aria-label': 'Boards', 'data-tip': 'Boards', onclick: () => this.openLibrary() }, ico('boards'), h('span', { class: 'lbl' }, 'Boards'))));
    }

    // ---- the daily gift ------------------------------------------------------------------------------------------------

    /** The gift's button: bright when a gift is waiting, quiet (with how long until the next one) once opened. */
    giftBtn() {
      const st = this.app.store.state, now = Date.now(), ready = Gifts.ready(st, now);
      const tip = ready ? 'Daily gift' : 'Next gift in ' + fmtDuration(Math.max(60000, Gifts.left(st, now)));
      const el = h('button', { class: 'btn sm gift-btn' + (ready ? ' ready' : '') + (this.reduced ? ' still' : ''), id: 'gift-btn', 'aria-label': 'Daily gift', 'data-tip-title': ready ? null : 'Daily gift', 'data-tip': tip, onclick: () => this.openGift() },
        h('span', { class: 'gift-i', html: GIFT_ICON }));
      return el;
    }

    renderGift() {
      const old = document.getElementById('gift-btn');
      if (old) old.replaceWith(this.giftBtn());
    }

    /**
     * Opens the gift: the three entries are booked and saved first (so closing early loses nothing), then turned over
     * one after another — a power-up (an Undo says it is five), or a free puzzle hint. Not ready yet: a quiet note of
     * how long until it is.
     */
    openGift() {
      const st = this.app.store;
      const ids = st.openGift(Date.now());
      if (!ids) {
        toast('Next gift in ' + fmtDuration(Math.max(60000, Gifts.left(st.state, Date.now()))), '', 1800);
        return;
      }
      const cards = ids.map((id, i) => {
        const free = FREEBIES[id], it = free || ITEMS[id], name = free ? it.name : itemCount(id, L.packOf(id));
        return h('div', { class: 'gift-card ' + it.rarity, 'data-gift': id, style: { animationDelay: (0.25 + i * 0.35) + 's' }, 'data-tip-title': name, 'data-tip': it.desc },
          h('div', { class: 'gift-face' }, h('span', { class: 'gi', html: L.Icons.icon(free ? it.icon : 'item-' + id) }), h('b', null, name), it.rarity !== 'common' ? h('small', null, it.rarity) : null));
      });
      UI.openModal({ title: 'Daily gift', icon: 'gift', width: 340, cls: 'modal-gift' + (this.reduced ? ' still' : ''), body: h('div', { class: 'gift-cards' }, cards), buttons: [{ label: 'Keep', kind: 'primary' }] });
      ids.forEach((_, i) => setTimeout(() => this.app.sound.play('combo', 3 + i * 2), 350 + i * 350));
      this.renderItems();
      this.renderGift();
    }

    /**
     * The item bar: one button per type, with how many you hold. A button opens its tray above the bar; the tray shows
     * the type's items (hover one for what it does): one you hold says how many, one you have none of says its price
     * (dimmed when the wallet is short). Click to use; one you have none of is bought and used. Esc closes it.
     */
    renderItems() {
      // A controller with a bar of its own (Battle: Send, Start over, Pause) draws it instead of the power-ups.
      this.itembar.classList.remove('cl-bar');
      if (this.ctl.bar(this.itembar) === true) { this.tray = null; this.renderTray(); return; }
      const inv = this.app.store.state.inventory;
      const armedId = this.armed && this.armed.piece === this.game.piece ? this.armed.id : null;
      this.itembar.replaceChildren(...ITEM_GROUPS.map((g) => {
        const ids = ITEM_ORDER.filter((id) => ITEMS[id].group === g.id);
        const have = ids.reduce((a, id) => a + (inv[id] || 0), 0);
        const open = this.tray === g.id, on = armedId && ids.includes(armedId);
        return h('button', {
          class: 'group-btn' + (open ? ' open' : '') + (on ? ' on' : ''), 'data-group': g.id,
          'aria-label': g.name, 'data-tip': g.name,
          onclick: () => this.openTray(open ? null : g.id),
        }, h('span', { class: 'gi', html: L.Icons.icon('group-' + g.id) }), h('span', { class: 'gl' }, g.short || g.name), have ? h('span', { class: 'n' }, String(have)) : null);
      }));
      this.renderTray();
    }

    openTray(id) {
      this.tray = id;
      this.app.sound.play(id ? 'rotate' : 'lower');
      this.renderItems();
    }

    renderTray() {
      let el = this.trayEl;
      if (!el) { el = this.trayEl = h('div', { class: 'item-tray hidden' }); this.itembar.parentElement.appendChild(el); }
      const g = ITEM_GROUPS.find((x) => x.id === this.tray);
      el.classList.toggle('hidden', !g);
      if (!g) { el.replaceChildren(); return; }
      const inv = this.app.store.state.inventory, wallet = this.app.store.state.lines;
      const ids = ITEM_ORDER.filter((id) => ITEMS[id].group === g.id);
      el.style.setProperty('--tray-at', ITEM_GROUPS.indexOf(g) / (ITEM_GROUPS.length - 1));
      el.replaceChildren(
        h('div', { class: 'tray-head' }, h('b', null, ico('group-' + g.id), g.name), h('button', { class: 'icon-btn', title: 'Close', 'aria-label': 'Close', html: UI.ICONS.close, onclick: () => this.openTray(null) })),
        h('div', { class: 'tray-items' }, ids.map((id) => {
          const it = ITEMS[id], n = inv[id] || 0, price = this.app.store.priceOf(id, this.game);
          const on = this.armed && this.armed.id === id && this.armed.piece === this.game.piece;
          // One this board refuses (its recipe's rules: R.refuse, or a part's allow) stays in its place, off, with why.
          const why = this.game.allow(id);
          return h('button', {
            class: 'item-btn' + (n || on ? '' : ' empty') + (!n && !on && wallet < price ? ' poor' : '') + (on ? ' on' : '') + (why ? ' refused' : ''), 'data-item': id,
            'data-rarity': it.rarity === 'common' ? null : it.rarity, 'aria-disabled': why ? 'true' : null,
            'data-tip-title': it.name, 'data-tip-icon': 'item-' + id, 'data-tip': why || it.desc,
            'data-tip-foot': on ? 'Again to take it back' : null,
            onclick: () => this.useItem(id),
          }, h('span', { class: 'ii', html: L.Icons.icon('item-' + id) }), h('span', { class: 'il' }, it.name), h('span', { class: 'n' }, n || on ? String(n) : LINE + price));
        })));
    }

    /** A touch on the board with a tray open closes the tray, and does nothing else. */
    touchIntercept() { if (!this.tray) return false; this.openTray(null); return true; }

    /** Esc closes an open tray first (the app's own Esc handling comes after). */
    closeTray() { if (!this.tray) return false; this.openTray(null); return true; }

    /** Uses one you hold; with none, asks once (its name and a Buy & use button with the price), then buys and uses it. */
    useItem(id) {
      const st = this.app.store, it = ITEMS[id];
      if (!it) return;
      if (this.cardOpen && id !== 'rewind') return;
      if (this.armed && this.armed.id === id && this.armed.piece === this.game.piece) { this.disarm(); return; }
      // Refused on this board (Game.allow: the recipe's rules and parts): nothing is spent or bought; the reason shows.
      const why = this.game.allow(id);
      if (why) { toast(why, 'bad'); this.app.sound.play('error'); return; }
      if (!this.game.piece && id !== 'rewind') { toast('No piece in play', 'bad'); return; }
      if (!st.state.inventory[id]) {
        // Its price on this board (Store.priceOf: a Safety Net costs what it can keep at this width).
        const price = st.priceOf(id, this.game);
        if (st.state.lines < price) { toast(it.name + ' · ' + fmtInt(price) + ' ' + LINE, 'bad'); this.app.sound.play('error'); return; }
        // An Undo also takes back what the last placement banked: the wallet must cover both.
        const short = () => id === 'rewind' && st.state.lines < it.price + this.rewindRefund();
        if (short()) { toast('Not enough lines', 'bad'); this.app.sound.play('error'); return; }
        UI.confirm(it.name, h('p', null, it.desc), 'Buy & use · ' + fmtInt(price) + ' ' + LINE, () => {
          if (short()) { toast('Not enough lines', 'bad'); this.app.sound.play('error'); return; }
          if (st.buyItem(id, 1, this.game)) { this.app.refreshWallet(); this.apply(id); }
        }, 'primary', 'item-' + id);
        return;
      }
      this.apply(id);
    }

    /**
     * Items that change the piece in play, or what the next clears pay, can be taken back: press the item again
     * (before the piece is set) and the old piece (and the queue) returns and the item goes back in the bag.
     */
    disarm() {
      const a = this.armed, g = this.game, st = this.app.store;
      this.armed = null;
      if (!a || g.piece !== a.piece) return;
      if (a.id === 'golden') g.s.gold = Math.max(0, (g.s.gold || 0) - Luck.GOLD_CLEARS);
      else if (a.id === 'double') g.s.double = false;
      else if (a.id === 'net') g.s.net = Math.max(0, (g.s.net || 0) - 1);
      else if (!g.replacePiece(a.prev)) { toast('No room to take it back', 'bad'); return; }
      if (a.queue) g.queue = a.queue;
      st.state.inventory[a.id] = (st.state.inventory[a.id] || 0) + 1;
      const used = st.state.stats.items.used;
      used[a.id] = Math.max(0, (used[a.id] || 0) - 1);
      // Taken back before it did anything: the board never used it, and play by hand goes on where it was.
      if (g.s.items && g.s.items[a.id]) g.s.items[a.id]--;
      g.restoreHand(a.hand);
      st.touch();
      this.app.sound.play('hold');
      this.view.itemFx('undo', g.piece, this.reduced);
      this.renderItems();
      this.renderStatus();
      this.view.dirty = true;
    }

    apply(id) {
      const g = this.game, st = this.app.store;
      const cur = g.piece;
      const prev = cur ? Object.assign({}, cur.entry, { special: cur.special || null }) : null;
      const queue = g.queue.map((e) => Object.assign({}, e));
      const done = () => {
        const hand = g.handState();
        if (!ACTS_NOW.has(id) && g.piece) this.armed = { id, piece: g.piece, prev, hand, queue: id === 'pick' ? queue : null };
        this.view.itemFx(id, g.piece, this.reduced);
        this.tray = null;
        g.s.items = g.s.items || {};
        g.s.items[id] = (g.s.items[id] || 0) + 1;
        // Anything that touches the pieces or the board ends play by hand (achievements); Luck never touches either.
        if (ITEMS[id].group !== 'luck') g.noteItem(ACTS_NOW.has(id));
        st.useItem(id);
        this.app.sound.play('item');
        this.renderItems();
        this.renderStatus();
        this.view.dirty = true;
      };
      const noRoom = () => toast('No room', 'bad');
      /** The piece in play becomes another, tagged with the item that made it (for its combos). */
      const become = (entry) => { if (g.replacePiece(Object.assign({ tag: id }, entry))) done(); else noRoom(); };
      if (SPECIALS.has(id)) { if (g.setSpecial(id)) done(); else noRoom(); return; }
      switch (id) {
        // Another piece from where this board's pieces come from (its dealer; today's: one of the seven).
        case 'reroll': become({ id: g.dealer.reroll(g, cur && cur.type.id) }); break;
        case 'mirror': become({ id: Pieces.mirrorOf(cur.type).id, special: cur.special, tag: cur.entry.tag || null }); break;
        case 'pebble': become({ id: 'M1' }); break;
        case 'noodle': become({ id: Pieces.customType([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]).id }); break;
        case 'giant': {
          const base = Pieces.TYPES[cur.type.id] && Pieces.TYPES[cur.type.id].family === 'tetromino' ? cur.type.id : null;
          if (!base) { toast('Giant: standard pieces only', 'bad'); return; }
          become({ id: Pieces.bigOf(base).id, special: cur.special });
          break;
        }
        case 'blueprint':
          UI.openBlueprint(this.app, (cells) => { if (cells) become({ id: Pieces.customType(cells).id }); });
          break;
        case 'order':
          // The pieces this board's dealer can give (a board of the seven: today's list, with the small three).
          UI.openOrderSlip(this.app, (pick) => { if (pick) become({ id: pick }); }, g.dealer === L.BAG_DEALER ? null : g.dealer.candidates(g));
          break;
        case 'pick':
          UI.openPickOfThree(this.app, g.queue.slice(0, 3), (i) => { if (i == null) return; if (g.pickFromQueue(i)) done(); else noRoom(); });
          break;
        case 'fit': if (g.bestFit()) done(); else noRoom(); break;
        case 'settle': if (g.settle()) done(); else toast(g.board.isEmpty() ? 'Board is empty' : 'No room. Move the piece first', 'bad'); break;
        case 'tornado': if (g.tornado()) done(); else toast(g.board.isEmpty() ? 'Board is empty' : 'No room. Move the piece first', 'bad'); break;
        case 'trapdoor': if (g.trapdoor()) done(); else toast([...Array(g.w).keys()].some((x) => g.board.get(x, 0)) ? 'No room. Move the piece first' : 'Bottom row is empty', 'bad'); break;
        case 'flip': if (g.flipWorld()) done(); else toast(g.board.isEmpty() ? 'Board is empty' : 'No room. Move the piece first', 'bad'); break;
        case 'golden':
          // Gold stays on the board for the next five clears, whatever piece makes them.
          g.s.gold = (g.s.gold || 0) + Luck.GOLD_CLEARS;
          done();
          break;
        case 'double':
          if (g.s.double) { toast('Already on', 'bad'); return; }
          g.s.double = true;
          done();
          break;
        case 'net':
          if (g.s.net > 0) { toast('Already on', 'bad'); return; }
          g.s.net = 1;
          done();
          break;
        case 'rewind': {
          // What the placement banked goes back in full: a wallet that has spent it since cannot take the placement
          // back (an Undo would pay otherwise), and the Undo held is kept.
          const need = this.rewindRefund();
          if (st.state.lines < need) { toast('Not enough lines', 'bad'); this.app.sound.play('error'); return; }
          const banked0 = g.s.banked || 0;
          const res = g.undo();
          if (!res) { toast('Nothing to undo', 'bad'); return; }
          if (this.app.hints) this.app.hints.undo();
          const refund = Math.round(Math.max(0, banked0 - (g.s.banked || 0)) * 100) / 100;
          if (refund) st.addLines(-refund, 'rewind');
          if (res.own) st.state.stats.free.lines = Math.max(0, Library.bank(st.state.stats.free.lines - res.own * Library.worth(g)));
          if (refund || res.lines) this.app.refreshWallet();
          this.hideCard();
          // The card is gone and the board under it is live: a second click or tap of the same press (a double
          // click) must not drop the piece just brought back, as after a set (see SET_GRACE_MS).
          this.setAt = this.now();
          this.snapshot();
          done();
          break;
        }
        default: break;
      }
    }

    save() { this.app.store.state.free = this.game.toJSON(); }
  }

  // ---- puzzles ------------------------------------------------------------------------------------------------------

  // Small line icons for the Puzzles tab: every wildcard gets its own (Hold and Wraparound share a glyph otherwise).
  // The wildcards, goals and the tab's tools, from the one icon set (js/icons.js).
  const PZ_ICONS = new Proxy({}, { get: (_, k) => L.Icons.icon({ clear: 'goal-clear', lines: 'goal-lines', gems: 'goal-gems', daily: 'daily', seed: 'seed', history: 'history', copy: 'copy', hint: 'hint', check: 'checkCircle', undo: 'undo', retry: 'retry', skip: 'skip', next: 'next' }[k] || 'mod-' + String(k)) });
  const icon = (k, cls) => h('span', { class: 'pz-i' + (cls ? ' ' + cls : ''), html: PZ_ICONS[k] || '' });
  // Short names for when a card is narrow; the full name is always in the tooltip.
  const MOD_SHORT = { big: 'Big', odd: 'Odd', wrap: 'Wrap', invert: 'Inverted', flip: 'Flipped', blind: 'Blind', vanish: 'Vanish', spin: 'Both Ways', mono: 'Mono' };
  // The keys a wildcard is about, shown under its description.
  const MOD_KEYS = { spin: 'Z turns counter-clockwise · A turns 180°', hold: 'C holds', side: 'Arrows follow the screen', flip: 'Arrows follow the screen' };
  /** The keys line for a wildcard in a puzzle: Inverted Controls swap the turns, so Z turns clockwise there. */
  const modKeys = (m, mods) => (m === 'spin' && mods.includes('invert') ? 'Z turns clockwise here (controls are inverted) · A turns 180°' : MOD_KEYS[m] || null);
  // The same, in gestures, for a touch player.
  const MOD_TOUCH = { spin: 'Tap left turns counter-clockwise · Two fingers: 180°', hold: 'Swipe ↑ or tap HOLD holds', side: 'Swipes follow the screen', flip: 'Swipes follow the screen' };
  const modTouch = (m, mods, tapTurn) => (m === 'spin' && tapTurn === 'cw' ? 'Two fingers: 180°' : m === 'spin' && mods.includes('invert') ? 'Tap left turns clockwise here (controls are inverted) · Two fingers: 180°' : MOD_TOUCH[m] || null);
  /** "2026-09-26" → "Sat, Sep 26" (with the year when it is not this one); short: "Sep 26", no weekday. */
  function dayLabel(key, short) {
    if (!/^\d{4}-\d\d-\d\d$/.test(key)) return String(key);
    const [y, m, d] = key.split('-').map(Number), dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString([], { weekday: short ? undefined : 'short', day: 'numeric', month: 'short', year: y === new Date().getFullYear() ? undefined : 'numeric' });
  }

  // The info line's parts that give way, first to last: the piece count, the weekday, the difficulty, a Daily's date.
  const FIT_ID = ['no-count', 'no-day', 'no-diff', 'no-date'];

  class PuzzleMode extends BoardMode {
    constructor(app) {
      super(app, 'cv-puzzle', 'puz-overlay');
      this.puzzle = null;
      const $ = (id) => document.getElementById(id);
      this.el = {
        diff: $('puz-diff'), title: $('puz-title'), id: $('puz-id'), dot: $('puz-dot'), seed: $('puz-seed'), save: $('puz-save'),
        goal: $('puz-goal'), mods: $('puz-mods'), actions: $('puz-actions'), daily: $('puz-daily'), seedBtn: $('puz-seedbtn'), history: $('puz-history'),
        view: $('view-puzzle'),
      };
      this.el.seedBtn.replaceChildren(icon('seed'), h('span', { class: 'lbl' }, 'Seed'));
      this.el.history.replaceChildren(icon('history'), h('span', { class: 'lbl' }, 'History'));
      this.el.seedBtn.addEventListener('click', () => this.askSeed());
      this.el.daily.addEventListener('click', () => this.loadDaily());
      this.el.history.addEventListener('click', () => this.openHistory());
      this.el.save.addEventListener('click', () => { const p = this.puzzle; if (p) this.toggleSaved(p.seed, { diff: p.diff, title: p.title, mods: p.mods, number: this.meta.number, daily: this.meta.daily }); });
      this.el.seed.addEventListener('click', () => { if (this.puzzle) { UI.copyText(this.puzzle.seed); toast('Copied', 'good', 1200); } });
      // Wildcard chips explain themselves on hover (the tooltip) and on a click or tap (a small card that stays).
      this.el.mods.addEventListener('click', (e) => { const b = e.target.closest('.mod'); if (b) this.togglePop(b); });
      document.addEventListener('pointerdown', (e) => { if (this.pop && !e.target.closest('.mod, .puz-pop')) this.closePop(); }, true);
      document.addEventListener('keydown', () => this.closePop(), true);
      // Chips shorten, then drop to icons, rather than wrap: the card keeps one height whatever the puzzle.
      // The bar does the same with its Daily / Seed / History labels: words when they fit, icons alone when not.
      if (root.ResizeObserver) {
        new ResizeObserver(() => { this.closePop(); this.fitMods(); }).observe(this.el.mods);
        new ResizeObserver(() => this.fitNav()).observe(this.el.daily.closest('.puz-bar'));
        new ResizeObserver(() => this.fitId()).observe(this.el.id);
      }
      this.renderDiff();
      this.renderNav();
      // Undos are shared with Relaxed, and a free hint comes from its gift: counts shown here follow both.
      // The failed card's Undo, if it is up (it stays up across tabs), is redrawn too, so it never shows a stale count.
      app.store.on('items', () => {
        this.renderActions();
        const b = this.overlay.querySelector('#puz-card-undo');
        if (b) b.replaceWith(this.undoBtn({ class: 'btn', id: 'puz-card-undo' }, 'Undo'));
      });
    }

    get ps() { return this.app.store.state.puzzle; }
    get pstats() { return this.app.store.state.stats.puzzle; }
    /** Counter-clockwise puzzles (off by default): new puzzles come from the both-ways seeds. */
    get spin() { return !!this.app.settings.ccwPuzzles; }
    /** Puzzles solved against how many there are: every seed of a difficulty (or all three), doubled when both-ways seeds are in play. */
    volume(diff) {
      const ds = diff ? [diff] : ['E', 'M', 'H'];
      const solved = ds.reduce((n, d) => n + ((this.pstats[d] || {}).solved || 0), 0);
      return fmtInt(solved) + ' of ' + fmtInt(ds.length * Puzzles.SEEDS_PER_DIFF * (this.spin ? 2 : 1)) + (diff ? ' ' + Puzzles.DIFFS[diff].name : '') + ' puzzles solved';
    }

    show() { if (!this.puzzle) this.loadCurrent(); else this.renderNav(); }

    loadCurrent() {
      const cur = this.ps.current;
      if (cur && cur.seed && Puzzles.parseSeed(cur.seed)) this.load(cur.seed, cur, true);
      else this.loadNumbered(this.ps.diff);
    }

    loadNumbered(diff, n) {
      n = n || this.ps.next[diff] || 1;
      this.load(Puzzles.numberedSeed(diff, n, this.spin), { number: n });
    }

    loadDaily() {
      const key = L.dateKey();
      this.load(Puzzles.dailySeed(this.ps.diff, key, this.spin), { daily: key });
    }

    askSeed() {
      const input = h('input', { type: 'text', placeholder: 'M-3K7Q2XA', value: '', spellcheck: 'false', autocomplete: 'off' });
      // A line under the field reads the seed as it is typed: which difficulty, whether it turns both ways, which day.
      const status = h('div', { class: 'seed-status' });
      const read = () => {
        const v = input.value.trim(), p = Puzzles.parseSeed(v);
        status.className = 'seed-status' + (p ? ' ok' : v ? ' bad' : '');
        if (!v) { status.replaceChildren(); return; }
        if (!p) { status.replaceChildren('Not a seed'); return; }
        const d = Puzzles.DIFFS[p.diff], dd = Puzzles.dailyDateOf(p.seed);
        status.replaceChildren(h('span', { class: 'dot', style: { background: d.color } }), d.name + (p.spin ? ' · both ways' : '') + (this.ps.solved[p.seed] ? ' · solved' : '') + (dd && dd.key ? ' · the Daily for ' + dayLabel(dd.key) : ''));
      };
      input.addEventListener('input', read);
      read();
      const diffName = Puzzles.DIFFS[this.ps.diff].name;
      const body = h('div', { class: 'seed-modal' },
        input, status);
      UI.openModal({
        title: 'Play a seed', body, cls: 'modal-seed',
        buttons: [{ label: 'Random ' + diffName, onClick: () => { this.load(Puzzles.randomSeed(this.ps.diff, this.spin), {}); } },
          { label: 'Play', kind: 'primary', onClick: () => {
            const p = Puzzles.parseSeed(input.value);
            if (!p) { read(); status.classList.add('bad'); input.focus(); return false; }
            this.load(p.seed, {});
          } }],
      });
    }

    load(seed, meta, resume) {
      const p = Puzzles.generate(seed);
      if (!p) { toast('Could not build that puzzle', 'bad'); return; }
      // Leaving a puzzle you had started on (and never solved) ends a run of first-try solves.
      if (this.puzzle && !this.done && this.game && (this.game.s.pieces || (this.ps.current && this.ps.current.attempts > 0)) && !this.ps.solved[this.puzzle.seed]) this.pstats.firstRun = 0;
      this.puzzle = p;
      this.meta = { number: meta.number || null, daily: meta.daily || null };
      this.ps.diff = p.diff;
      const same = resume && this.ps.current && this.ps.current.seed === seed;
      // Tries, a hint and Undos stay with the seed (ps.tries), whatever was played in between: what solving pays
      // never starts over by leaving, reloading or coming back. `live`: the attempt in play has set a piece (counted).
      const kept = this.tries(seed), was = same ? this.ps.current : {};
      this.ps.current = {
        seed, number: this.meta.number, daily: this.meta.daily, ms: same ? was.ms || 0 : 0,
        attempts: kept ? kept.n : same ? was.attempts || 0 : 0, hint: kept ? kept.hint : same ? !!was.hint : false,
        undos: kept ? kept.undos : same ? was.undos || 0 : 0, live: !!(same && was.live),
        // The attempt's board, as it stood (keepBoard): a reload goes on with it rather than dealing a fresh one.
        board: same && was.live && was.board ? was.board : null,
      };
      if (!same) this.record({ seed, diff: p.diff, title: p.title, number: this.meta.number, daily: this.meta.daily, mods: p.mods.slice(), at: Date.now(), attempts: kept ? kept.n : 0, solved: !!this.ps.solved[seed], ms: 0 });
      if (!same) {
        this.pstats[p.diff].played++;
        for (const m of p.mods) { const r = this.pstats.mods[m] || (this.pstats.mods[m] = { seen: 0, solved: 0 }); r.seen++; }
      }
      this.app.store.touch();
      this.start(same);
      this.renderDiff();
      this.renderHead();
      this.renderNav();
    }

    /**
     * A fresh attempt, or (resume) the one a reload or relaunch interrupted, which is not counted again: its board comes
     * back as it stood (ps.current.board: the cells, the piece in play, the queue and hold, the lines toward the goal;
     * the Undo history stays behind, as in Free Play). An attempt that set a piece and cannot come back — no board kept,
     * or one that had run out — is over: the fresh board is the next try once a piece is set, as Retry is.
     */
    start(resume) {
      const p = this.puzzle;
      const has = (m) => p.mods.includes(m);
      const opts = { mods: { noRotate: has('rigid'), heavy: has('heavy'), noHold: !has('hold'), vanish: has('vanish') }, previewCount: 8, maxHistory: 80 };
      const cur = this.ps.current, kept = resume && cur && cur.live ? this.restoreBoard(cur.board, opts) : null;
      const game = kept ? kept.game : new Game(Object.assign({ board: Board.fromArray(p.w, p.h, p.cells, { wrap: p.wrap }), queue: p.pieces }, opts));
      this.inverted = has('invert');
      this.lines = kept ? kept.lines : 0;
      this.done = false;
      this.doneHint = false;
      this.failedShown = false;
      this.startedAt = performance.now();
      // A solved puzzle has no current entry any more: Retry or Replay starts a fresh one.
      if (!this.ps.current) this.ps.current = { seed: p.seed, number: this.meta.number, daily: this.meta.daily, attempts: 0, ms: 0, live: false };
      // A try counts once it sets a piece (onLock), so opening a puzzle, or Retry before a piece is set, costs nothing.
      if (!kept) { this.ps.current.live = false; this.ps.current.board = null; }
      this.attachGame(game, { rot: has('side') ? 90 : has('flip') ? 180 : 0, fog: has('fog'), mono: has('mono'), blind: has('blind'), vanish: has('vanish'), wrap: p.wrap });
      this.hideCard();
      this.updateHint();
      this.renderGoal();
      this.renderActions();
      this.renderPay();
    }

    blocked() { return this.cardOpen; }

    /** The saved attempt `b` ({ game, lines }) as a game to go on with, or null when it cannot be (broken, or run out). */
    restoreBoard(b, opts) {
      const p = this.puzzle;
      if (!b || !b.game || b.game.w !== p.w || b.game.h !== p.h || !b.game.fixed) return null;
      try {
        const game = new Game(Object.assign({ saved: b.game }, opts));
        if (!game.piece || game.over) return null;
        return { game, lines: Math.max(0, b.lines | 0) };
      } catch (e) { return null; }
    }

    /** Keeps the attempt in play with the seed's entry (after each piece and on every save), so a reload goes on with it. */
    keepBoard() {
      const cur = this.ps.current;
      if (!cur || !this.puzzle || cur.seed !== this.puzzle.seed || !this.game) return;
      cur.board = cur.live && !this.done ? { game: JSON.parse(JSON.stringify(this.game.toJSON())), lines: this.lines } : null;
    }

    /** The tries kept with a seed not yet solved (ps.tries): { n, hint, undos }, or null. */
    tries(seed) {
      const t = this.ps.tries && this.ps.tries[seed];
      return t && typeof t === 'object' ? t : null;
    }

    /** Writes the current attempt's count, hint and Undos to the seed's record (only while it is unsolved). */
    keepTries() {
      const cur = this.ps.current, p = this.puzzle;
      if (!cur || !p || this.ps.solved[p.seed]) return;
      const T = this.ps.tries || (this.ps.tries = {});
      if (!T[p.seed]) {
        const keys = Object.keys(T);
        if (keys.length >= (L.TRIES_MAX || 3000)) delete T[keys[0]];
      }
      T[p.seed] = { n: cur.attempts || 0, hint: !!cur.hint, undos: cur.undos || 0 };
    }

    /** What solving would pay now (Puzzles.pay, with its steps), or null for a seed already solved. A try that has not
     *  set a piece yet is the next one. */
    payNow() {
      const p = this.puzzle, cur = this.ps.current;
      if (!p || !cur || this.ps.solved[p.seed]) return null;
      return Puzzles.pay(p.diff, { try: (cur.attempts || 0) + (cur.live ? 0 : 1), undos: cur.undos || 0, hint: !!cur.hint, daily: this.dailyX() });
    }

    /** Does solving this puzzle earn the Daily's ×2? A Daily whose date and difficulty have not had it (either turn). */
    dailyX() { return !!(this.puzzle && this.meta.daily) && Puzzles.dailyDue(this.ps, this.meta.daily, this.puzzle.diff); }

    /** The try a hint bought now would be on (the next one while this one has set nothing), and its price: nothing on
     *  a puzzle already solved, which pays nothing. */
    hintCost() {
      const p = this.puzzle, cur = this.ps.current;
      if (this.ps.solved[p.seed]) return 0;
      return Puzzles.hintCost(p.diff, ((cur && cur.attempts) || 0) + (cur && cur.live ? 0 : 1));
    }

    onLock(r) {
      // The first piece set counts the try (ps.tries keeps it with the seed, the history row shows it).
      const cur = this.ps.current;
      if (cur && !cur.live && !this.done) {
        cur.live = true;
        cur.attempts = (cur.attempts || 0) + 1;
        const hEntry = this.historyEntry();
        if (hEntry) { hEntry.attempts = (hEntry.attempts || 0) + 1; hEntry.at = Date.now(); }
        this.keepTries();
        this.app.store.touch();
        this.renderPay();
      }
      this.lines += r.lines;
      this.view.onLock(r, this.reduced);
      const snd = this.app.sound, g = this.game;
      const met = Puzzles.goalMet(this.puzzle, g.board, this.lines);
      // The last piece set without meeting the goal: that is a failure, so no cheerful clear (the fail sound follows).
      const last = !met && !g.queue.length && !g.hold;
      if (last) snd.play('lock'); else playLockSound(snd, r);
      if (met) this.solved();
      else this.keepBoard();
      this.updateHint();
      this.renderGoal();
      this.renderActions();
    }

    onEmpty() { if (!this.done) this.failed('Out of pieces'); }
    onTopout() { if (!this.done) this.failed('No room for the next piece'); }

    /** Time on this puzzle: what was banked (by saves, across reloads and retries) plus the clock since. */
    elapsed() { return (this.ps.current.ms || 0) + (performance.now() - this.startedAt); }

    /** Banks the running time into the saved entry and restarts the clock, so a save never counts time twice. */
    bankTime() {
      if (!this.puzzle || this.done || !this.ps.current) return;
      const now = performance.now();
      this.ps.current.ms = Math.round(this.elapsed());
      this.startedAt = now;
      this.keepBoard();
    }

    solved() {
      if (this.done) return;
      this.done = true;
      const p = this.puzzle, st = this.app.store, S = this.pstats[p.diff], cur = this.ps.current;
      const ms = Math.round(this.elapsed());
      const first = !this.ps.solved[p.seed];
      let reward = 0, paid = null;
      if (first) {
        paid = Puzzles.pay(p.diff, { try: cur.attempts, undos: cur.undos || 0, hint: !!cur.hint, daily: this.dailyX() });
        reward = paid.pay;
        if (paid.daily) Puzzles.noteDaily(this.ps, this.meta.daily, p.diff);
        if (this.ps.tries) delete this.ps.tries[p.seed];
        this.ps.solved[p.seed] = { ms: Math.round(ms), attempts: cur.attempts, at: Date.now() };
        const hEntry = this.historyEntry();
        if (hEntry) { hEntry.solved = true; hEntry.ms = Math.round(ms); hEntry.solvedAt = Date.now(); }
        const keys = Object.keys(this.ps.solved);
        if (keys.length > 3000) delete this.ps.solved[keys[0]];
        S.solved++;
        S.attempts += cur.attempts;
        if (cur.attempts === 1) S.firstTry++;
        S.totalMs += ms;
        S.bestMs = S.bestMs ? Math.min(S.bestMs, ms) : ms;
        S.streak++;
        S.bestStreak = Math.max(S.bestStreak, S.streak);
        for (const m of p.mods) { const r = this.pstats.mods[m] || (this.pstats.mods[m] = { seen: 1, solved: 0 }); r.solved++; if (p.diff === 'H') r.hard = (r.hard || 0) + 1; }
        if (this.meta.daily) { this.pstats.daily++; this.pstats.lastDaily = this.meta.daily; }
        this.countRuns(p, cur);
        st.day().puzzles++;
        if (p.diff === 'H') st.day().hard = 1;
        if (reward) { st.addLines(reward, 'puzzles'); this.app.refreshWallet(true); }
        this.app.achieve({ mode: 'puzzle', diff: p.diff, firstTry: cur.attempts === 1, hinted: !!cur.hint, undos: cur.undos || 0, ms, mods: p.mods });
      }
      if (this.meta.number && this.ps.next[p.diff] <= this.meta.number) this.ps.next[p.diff] = this.meta.number + 1;
      this.doneHint = !!cur.hint; // the Hint button shows how it was solved, with no price, once ps.current is gone
      this.ps.current = null;
      st.touch();
      this.app.sound.play('solve');
      // A quiet card: what it took and what it paid, then the way on. The board stays visible around it.
      const tile = (v, l, cls) => h('div', { class: 'bs' + (cls ? ' ' + cls : '') }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
      this.showCard(h('div', { class: 'puz-result solved' },
        h('span', { class: 'pz-i ring', html: L.Icons.icon('check') }),
        h('h2', null, 'Solved'),
        h('div', { class: 'board-sum' },
          tile(fmtClock(ms), 'Time'),
          tile(String(cur.attempts), cur.attempts === 1 ? 'Try' : 'Tries'),
          reward ? tile(h('span', null, '+' + reward, ' ', h('span', { class: 'gem' }, LINE)), 'Lines', 'pay')
            : tile('—', 'Solved before')),
        paid ? h('p', { class: 'pz-pay-steps' }, Puzzles.paySteps(p.diff, paid)) : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => this.retry() }, 'Replay'),
          h('button', { class: 'btn primary', onclick: () => this.next() }, 'Next puzzle'))));
      this.renderHead();
      this.renderDiff();
      this.renderNav();
      this.renderActions();
    }

    /** Runs for achievements (see Achievements.puzzleRuns); today's Dailies are noted in the day log too. */
    countRuns(p, cur) {
      const key = this.meta.daily;
      L.Achievements.puzzleRuns(this.pstats, cur.attempts === 1 && !cur.hint, key);
      if (key && key === L.dateKey()) { const d = this.app.store.day(); if (!(d.dailies || '').includes(p.diff)) d.dailies = (d.dailies || '') + p.diff; }
    }

    failed(why) {
      if (this.failedShown) return;
      this.failedShown = true;
      if (this.app.hints) this.app.hints.attemptEnded(this);
      if (!this.ps.solved[this.puzzle.seed]) this.pstats.firstRun = 0;
      this.pstats[this.puzzle.diff].fails++;
      this.app.store.touch();
      this.app.sound.play('fail');
      // Not a loss, just a board that did not work out: say how close it came and offer the two ways back.
      const prog = this.progress();
      this.showCard(h('div', { class: 'puz-result failed' },
        this.ring(prog.frac),
        h('h2', null, why),
        prog.text ? h('p', null, prog.text) : null,
        h('div', { class: 'row' },
          this.undoBtn({ class: 'btn', id: 'puz-card-undo' }, 'Undo'),
          h('button', Object.assign({ class: 'btn primary', onclick: () => this.retry() }, this.retryTip()), icon('retry'), 'Retry'))));
    }

    retry() {
      if (this.app.hints && !this.done && this.game && this.game.s.pieces >= 2) this.app.hints.attemptEnded(this);
      const before = this.payNow();
      this.hideCard();
      this.start();
      this.renderHead();
      this.notePayDrop(before, 'Try ' + ((this.ps.current && this.ps.current.attempts) + 1));
    }

    /** A quiet note when an Undo or a Retry lowered what solving pays (the Pays line says it too; this reaches the keys). */
    notePayDrop(before, why) {
      const now = this.payNow();
      if (before && now && now.pay < before.pay) toast(why + ' · Pays ' + LINE + now.pay, null, 1800);
    }

    /** The next try's pay, for Retry's tooltip, while this try has set a piece (so Retry costs one). */
    retryTip() {
      const now = this.payNow(), cur = this.ps.current;
      if (!now || this.done || !cur || !cur.live) return { 'data-tip': 'Retry' };
      const next = Puzzles.pay(this.puzzle.diff, { try: now.try + 1, undos: cur.undos || 0, hint: !!cur.hint, daily: now.daily });
      return { 'data-tip-title': 'Retry', 'data-tip': 'The next try pays ' + LINE + next.pay + (next.pay < now.pay ? ' (now ' + LINE + now.pay + ')' : '') };
    }

    /** What one more Undo costs in pay (the first-try ×1.5 on a clean try), for its tooltip; null when nothing. */
    undoNote() {
      const now = this.payNow(), cur = this.ps.current;
      if (!now || this.done || !cur || !this.game || !this.game.history.length) return null;
      const after = Puzzles.pay(this.puzzle.diff, { try: now.try, undos: (cur.undos || 0) + 1, hint: !!cur.hint, daily: now.daily });
      return after.pay < now.pay ? 'Ends the first-try ×' + Puzzles.PAY.CLEAN + ': Pays ' + LINE + now.pay + ' → ' + LINE + after.pay : null;
    }

    /**
     * Takes back the last piece, for one Undo (the power-up 'rewind', shared with Relaxed): one held is used; with none,
     * one is bought at its price and used at once (the price is on the button, so no question); with none and too few
     * lines, nothing happens but a note. Only an undo that happens is paid for, once.
     */
    undo() {
      if (this.done || !this.game || !this.game.history.length) return false;
      const st = this.app.store, it = ITEMS.rewind;
      if (!(st.state.inventory.rewind > 0) && st.state.lines < it.price) { toast('Not enough lines', 'bad'); this.app.sound.play('error'); return false; }
      const before = this.payNow();
      const res = this.game.undo();
      if (!res) return false;
      if (st.useOrBuy('rewind') === 'bought') this.app.refreshWallet();
      if (this.app.hints) this.app.hints.undo();
      if (this.ps.current) { this.ps.current.undos = (this.ps.current.undos || 0) + 1; this.keepTries(); }
      this.lines -= res.lines;
      this.keepBoard();
      this.notePayDrop(before, 'No first-try ×' + Puzzles.PAY.CLEAN);
      this.failedShown = false;
      this.hideCard();
      this.setAt = this.now(); // a second click of the press that took it back does not set the piece (SET_GRACE_MS)
      this.updateHint();
      this.renderGoal();
      this.renderActions();
      this.renderPay();
      this.view.dirty = true;
      return true;
    }

    next() {
      const p = this.puzzle;
      // Skipping ends the streak, and (unless it was solved before) the run of first-try solves too.
      if (!this.done) { this.pstats[p.diff].streak = 0; if (!this.ps.solved[p.seed]) this.pstats.firstRun = 0; }
      const diff = this.ps.diff;
      if (this.meta.number) { this.ps.next[diff] = Math.max(this.ps.next[diff], this.meta.number + 1); }
      this.loadNumbered(diff, this.ps.next[diff]);
    }

    setDiff(d) {
      if (this.puzzle && this.puzzle.diff === d && !this.done) return;
      this.ps.diff = d;
      this.loadNumbered(d);
    }

    // ---- history ----------------------------------------------------------------------------------------------------

    record(entry) {
      const hist = this.ps.history;
      const i = hist.findIndex((e) => e.seed === entry.seed);
      if (i >= 0) { const old = hist.splice(i, 1)[0]; entry.attempts = old.attempts; entry.solved = old.solved || entry.solved; entry.ms = old.ms; entry.solvedAt = old.solvedAt; }
      hist.unshift(entry);
      if (hist.length > 200) hist.length = 200;
    }

    historyEntry() { return this.puzzle ? this.ps.history.find((e) => e.seed === this.puzzle.seed) : null; }

    isSaved(seed) { return this.ps.saved.some((e) => e.seed === seed); }

    /** Saves (or unsaves) a seed, with enough to list it without generating the puzzle. */
    toggleSaved(seed, info) {
      const i = this.ps.saved.findIndex((e) => e.seed === seed);
      // The star fills or empties, with a sound: no note needed.
      if (i >= 0) this.ps.saved.splice(i, 1);
      else this.ps.saved.unshift({ seed, diff: info.diff, title: info.title, mods: info.mods || [], number: info.number || null, daily: info.daily || null, at: Date.now() });
      this.app.store.touch();
      this.app.sound.play('hold');
      this.renderSaveBtn();
    }

    renderSaveBtn() {
      const on = this.puzzle && this.isSaved(this.puzzle.seed);
      this.el.save.innerHTML = L.Icons.icon(on ? 'starOn' : 'star');
      this.el.save.classList.toggle('on', !!on);
      this.el.save.title = on ? 'Saved' : 'Save seed';
      this.el.save.setAttribute('aria-label', on ? 'Saved' : 'Save seed');
      this.el.save.setAttribute('aria-pressed', String(!!on));
    }

    openHistory(start) {
      let filter = start || 'all', handle = null;
      const list = h('div', { class: 'hist' });
      const rowsFor = (k) => {
        const hist = this.ps.history, byseed = new Map(hist.map((e) => [e.seed, e]));
        return k === 'saved'
          ? this.ps.saved.map((s) => Object.assign({ saved: true, attempts: 0 }, s, byseed.get(s.seed) ? { solved: byseed.get(s.seed).solved, ms: byseed.get(s.seed).ms, attempts: byseed.get(s.seed).attempts } : {}))
          : hist.filter((e) => k === 'all' || (k === 'solved' ? e.solved : !e.solved));
      };
      const draw = () => {
        const rows = rowsFor(filter);
        list.replaceChildren(...(rows.length ? rows.map((e) => {
          const d = Puzzles.DIFFS[e.diff];
          const label = e.daily ? 'Daily · ' + dayLabel(e.daily) : e.number ? d.name + ' #' + e.number : d.name + ' · seed';
          const saved = this.isSaved(e.seed);
          const status = e.solved ? '✓ ' + (e.ms ? fmtClock(e.ms) : 'solved') : e.attempts ? 'unsolved' : 'not played';
          const tries = e.attempts ? e.attempts + (e.attempts === 1 ? ' try' : ' tries') : null;
          const date = new Date(e.at).toLocaleDateString([], { month: 'short', day: 'numeric' });
          const current = this.puzzle && this.puzzle.seed === e.seed;
          return h('div', { class: 'hist-row' + (e.solved ? ' solved' : '') + (current ? ' current' : '') },
            h('span', { class: 'dot', style: { background: d.color }, title: d.name }),
            h('div', { class: 'grow' },
              h('div', { class: 't', title: label + ' · ' + e.title }, e.title, h('span', { class: 'sub' }, ' · ' + label)),
              h('div', { class: 'd' }, h('span', { class: 'st' }, [status, tries, date].filter(Boolean).join(' · ')),
                e.mods && e.mods.length ? h('span', { class: 'mods' }, e.mods.map((m) => h('span', { class: 'pz-i', title: (Puzzles.MODS[m] || { name: m }).name, html: PZ_ICONS[m] || '' }))) : null)),
            h('button', { class: 'seedchip', title: 'Copy', onclick: () => { UI.copyText(e.seed); toast('Copied', 'good', 1200); } }, e.seed),
            h('button', { class: 'icon-btn star' + (saved ? ' on' : ''), title: saved ? 'Saved' : 'Save seed', 'aria-pressed': String(!!saved), onclick: () => { this.toggleSaved(e.seed, e); draw(); }, html: L.Icons.icon(saved ? 'starOn' : 'star') }),
            h('button', { class: 'icon-btn play', title: current ? 'In play' : e.solved ? 'Replay' : 'Play', onclick: () => { handle.close(); if (!current) this.load(e.seed, { number: e.number, daily: e.daily }); }, html: L.Icons.icon('playIcon') }));
        }) : [h('p', { class: 'empty' }, filter === 'saved' ? 'No saved seeds' : 'None')]));
        // Counts on the tabs, so an empty list is no surprise.
        seg.querySelectorAll('button').forEach((b) => { b.querySelector('.c').textContent = rowsFor(b.dataset.k).length; });
      };
      const tabs = [['all', 'All'], ['unsolved', 'Unsolved'], ['solved', 'Solved'], ['saved', '★ Saved']];
      const seg = h('div', { class: 'seg' }, tabs.map(([k, l]) => {
        const b = h('button', { 'data-k': k, 'aria-pressed': String(k === filter), onclick: () => { filter = k; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); } }, l, h('span', { class: 'c' }));
        return b;
      }));
      draw();
      handle = UI.openModal({ title: 'Puzzle history', width: 520, cls: 'modal-hist', body: h('div', { class: 'hist-wrap' }, h('div', { class: 'hist-head' }, seg), list, h('p', { class: 'hist-foot' }, this.volume())), onClose: () => this.renderSaveBtn() });
    }

    /**
     * A hint for this puzzle: a free one the gift gave goes first, then lines. Either way it halves the pay; bought, it
     * costs half of what the puzzle pays at this try (Puzzles.hintCost), charged when it is bought.
     */
    buyHint() {
      if (!this.puzzle || this.done || !this.ps.current) return;
      const st = this.app.store;
      if (this.ps.current.hint) { this.updateHint(true); return; }
      // A puzzle already solved pays nothing, so its hint is free (never the gift's free hint): shown at once.
      if (this.ps.solved[this.puzzle.seed]) { this.ps.current.hint = true; this.updateHint(true); this.renderActions(); return; }
      const free = () => (st.state.freebies && st.state.freebies.hint) > 0;
      const now = this.payNow(), cost = this.hintCost();
      const after = now ? Puzzles.pay(this.puzzle.diff, { try: now.try, undos: this.ps.current.undos || 0, hint: true, daily: now.daily }).pay : 0;
      const body = now ? 'Pays ' + LINE + now.pay + ' now, ' + LINE + after + ' with a hint.' : 'Solved before: it pays nothing either way.';
      UI.confirm('Hint?', body, free() ? 'Show · free' : 'Show · ' + cost + ' ' + LINE, () => {
        if (!this.ps.current || this.ps.current.hint || this.done) return;
        const price = this.hintCost();
        if (!(free() ? st.useFreebie('hint') : st.spend(price))) { toast('Not enough lines', 'bad'); return; }
        this.ps.current.hint = true;
        this.keepTries();
        this.pstats[this.puzzle.diff].hints++;
        this.app.refreshWallet();
        this.updateHint(true);
        this.renderActions();
        this.renderPay();
      });
    }

    /** The known solution's next placement, if the board is still on its path. */
    computeHint() {
      const p = this.puzzle, g = this.game;
      if (!g.piece) return null;
      const k = g.s.pieces;
      if (k >= p.targets.length) return null;
      const b = Board.fromArray(p.w, p.h, p.cells, { wrap: p.wrap });
      for (let i = 0; i < k; i++) {
        const t = p.targets[i], type = Pieces.get(t.id);
        b.place(type.rots[t.r], t.x, t.y, type.color);
        b.clearRows(b.fullRows());
      }
      for (let i = 0; i < b.cells.length; i++) if (!!b.cells[i] !== !!g.board.cells[i]) return { off: true };
      const t = p.targets[k];
      const sol = p.solution[k] || {};
      if (g.piece.type.id !== t.id || (g.piece.entry.rot || 0) !== (sol.rot || 0)) return { swap: t.id };
      const type = Pieces.get(t.id);
      return { cells: type.rots[t.r].map(([x, y]) => [g.board.wx(t.x + x), t.y + y]) };
    }

    updateHint(announce) {
      this.view.hint = null;
      if (!this.ps.current || !this.ps.current.hint || this.done) return;
      const hint = this.computeHint();
      if (!hint) return;
      if (hint.cells) this.view.hint = hint.cells;
      else if (announce && hint.swap) toast('The solution plays ' + (Pieces.TYPES[hint.swap] ? Pieces.TYPES[hint.swap].name : 'another piece') + ' next. Try Hold', null, 2600);
      else if (announce && hint.off) toast('Off the solution. Undo for hints', null, 3000);
      this.view.dirty = true;
    }

    afterHold() { this.updateHint(); }

    modeAction(a) {
      if (a === 'undo') return this.undo();
      if (a === 'retry') { this.retry(); return true; }
      if (a === 'next') { this.next(); return true; }
      if (a === 'hint') { this.buyHint(); return true; }
      return false;
    }

    // Keys for retry/next/undo also work while a card is up.
    action(act, rep) {
      if (this.cardOpen && !rep) {
        if (act === 'retry') { this.retry(); return true; }
        if (act === 'next' || (act === 'drop' && this.done && !this.settling('drop'))) { this.next(); return true; }
        if (act === 'undo') return this.undo();
        return false;
      }
      return super.action(act, rep);
    }

    // ---- the tab's own parts ------------------------------------------------------------------------------------------

    renderDiff() {
      const d = this.puzzle ? this.puzzle.diff : this.ps.diff;
      this.el.diff.replaceChildren(...['E', 'M', 'H'].map((k) => h('button', { 'aria-pressed': String(k === d), 'data-tip': this.volume(k), onclick: () => this.setDiff(k) },
        h('span', { class: 'dot', style: { background: Puzzles.DIFFS[k].color } }), h('span', { class: 'full' }, Puzzles.DIFFS[k].name), h('span', { class: 'short' }, k))));
    }

    /** Daily: pressed while today's is in play, with a small tick once it is solved. */
    renderNav() {
      const diff = this.puzzle ? this.puzzle.diff : this.ps.diff, key = L.dateKey();
      const seed = Puzzles.dailySeed(diff, key, this.spin), done = !!this.ps.solved[seed];
      const on = !!(this.puzzle && this.meta.daily === key && this.puzzle.seed === seed);
      this.el.daily.replaceChildren(...[icon('daily'), h('span', { class: 'lbl' }, 'Daily'), done ? h('span', { class: 'tick', title: 'Solved today', html: L.Icons.icon('check') }) : null].filter(Boolean));
      this.el.daily.setAttribute('aria-pressed', String(on));
      this.el.daily.title = 'Daily';
      this.fitNav();
    }

    fitNav() {
      const nav = this.el.daily.parentNode;
      if (!nav.clientWidth) return;
      nav.classList.remove('icons');
      if (nav.scrollWidth > nav.clientWidth + 1) nav.classList.add('icons');
    }

    renderHead() {
      const p = this.puzzle, d = Puzzles.DIFFS[p.diff];
      const solved = this.ps.solved[p.seed];
      this.el.dot.style.background = d.color;
      this.el.title.replaceChildren(...[h('span', { class: 't' }, p.title), solved ? h('span', { class: 'done', title: 'Solved' + (solved.ms ? ' in ' + fmtClock(solved.ms) : ''), 'aria-label': 'Solved', html: L.Icons.icon('check') }) : null].filter(Boolean));
      // Where it comes from, its piece count, and what solving pays now (renderPay). Whole parts give way when the
      // line is short (fitId), never a character of a date or a number: the piece count, then the weekday, then the
      // difficulty (its tab and the dot say it), then a Daily's date (the seed's tooltip still has it).
      const where = this.meta.daily
        ? ['Daily', h('span', { class: 'date' }, h('span', { class: 'long' }, ' · ' + dayLabel(this.meta.daily)), h('span', { class: 'short' }, ' · ' + dayLabel(this.meta.daily, true))), h('span', { class: 'diff' }, ' · ' + d.name)]
        : [h('span', { class: 'diff' }, d.name + ' · '), this.meta.number ? '#' + this.meta.number : 'from a seed'];
      this.payEl = h('span', { class: 'pz-pays' });
      this.el.id.replaceChildren(h('span', { class: 'pz-where' }, ...where), h('span', { class: 'pz-count' }, ' · ' + p.pieces.length + ' pieces'), this.payEl);
      this.renderPay();
      this.el.seed.replaceChildren(h('span', { class: 'code' }, p.seed), icon('copy'));
      this.renderSaveBtn();
      // Every seed is some date's Daily (a tooltip, so a long press shows it too).
      const dd = Puzzles.dailyDateOf(p.seed);
      this.el.seed.dataset.tip = 'Copy seed' + (dd && dd.key ? ' · the Daily for ' + dayLabel(dd.key) : dd ? ' · the Daily in ' + dd.years.toLocaleString() + ' years' : '');
      this.renderGoal();
      this.renderMods();
    }

    /** Fits the info line: drops whole parts (FIT_ID, in order) until where it comes from shows in full. */
    fitId() {
      const box = this.el.id, where = box && box.querySelector('.pz-where');
      if (!where || !box.clientWidth) return;
      box.classList.remove(...FIT_ID);
      const over = () => where.scrollWidth > where.clientWidth + 1 || box.scrollWidth > box.clientWidth + 1;
      for (const c of FIT_ID) { if (!over()) break; box.classList.add(c); }
    }

    /** How far along the goal is, in words: "4 of 6 lines", "1 gem left", "12 blocks left". */
    progress() {
      const p = this.puzzle, g = this.game;
      if (!p || !g) return { text: '', frac: 0 };
      if (p.goal.type === 'lines') { const n = Math.min(this.lines, p.goal.lines); return { text: n + ' of ' + p.goal.lines + ' lines', frac: n / p.goal.lines }; }
      if (p.goal.type === 'gems') { const left = g.board.count((v) => v & CELL.GEM); return { text: left ? left + (left === 1 ? ' gem' : ' gems') + ' left' : 'all gems cleared', frac: 1 - left / (p.goal.gems || 1) }; }
      const left = g.board.count();
      if (this.startCells == null || this.startGame !== g) { this.startCells = Math.max(1, p.cells.filter(Boolean).length); this.startGame = g; } // the puzzle's own board, even for an attempt resumed part way
      return { text: left ? left + (left === 1 ? ' block' : ' blocks') + ' left' : 'board clear', frac: 1 - left / this.startCells };
    }

    renderGoal() {
      const p = this.puzzle;
      if (!p || !this.game) return;
      const prog = this.progress();
      this.el.goal.replaceChildren(
        icon(p.goal.type === 'gems' ? 'gems' : p.goal.type === 'lines' ? 'lines' : 'clear', 'goal-i ' + p.goal.type),
        h('span', { class: 'goal' }, Puzzles.goalText(p)),
        h('span', { class: 'prog' }, p.goal.type === 'lines' ? Math.min(this.lines, p.goal.lines) + ' / ' + p.goal.lines : prog.text),
        h('span', { class: 'meter' }, h('i', { style: { width: Math.round(Math.max(0, Math.min(1, prog.frac)) * 100) + '%' } })));
    }

    renderMods() {
      const p = this.puzzle;
      this.closePop();
      if (!p.mods.length) { this.el.mods.replaceChildren(h('span', { class: 'mod-none' }, 'No wildcards')); return; }
      this.el.mods.replaceChildren(...p.mods.map((m) => {
        const M = Puzzles.MODS[m];
        return h('button', { class: 'mod mod-' + m, 'data-mod': m, 'data-tip-title': M.name, 'data-tip': Puzzles.modDesc(p, m), 'data-tip-foot': modKeys(m, p.mods), 'data-tip-touch': modTouch(m, p.mods, this.settings.tapTurn) },
          icon(m), h('span', { class: 'n' }, M.name), h('span', { class: 's' }, MOD_SHORT[m] || M.name));
      }));
      this.fitMods();
    }

    /** Full names if they fit on one line, then short names, then icons alone. */
    fitMods() {
      const box = this.el.mods;
      if (!box.clientWidth) return;
      box.classList.remove('tight', 'icons');
      if (box.scrollWidth > box.clientWidth + 1) box.classList.add('tight');
      if (box.scrollWidth > box.clientWidth + 1) box.classList.add('icons');
    }

    togglePop(chip) {
      const m = chip.dataset.mod, open = this.pop && this.pop.dataset.mod === m;
      this.closePop();
      if (open || !Puzzles.MODS[m]) return;
      const M = Puzzles.MODS[m], keys = L.Touch && L.Touch.using ? modTouch(m, this.puzzle.mods, this.settings.tapTurn) : modKeys(m, this.puzzle.mods);
      const pop = h('div', { class: 'puz-pop', 'data-mod': m, role: 'note' },
        h('div', { class: 'tip-title' }, icon(m), ' ', M.name), h('div', { class: 'tip-body' }, Puzzles.modDesc(this.puzzle, m)), keys ? h('div', { class: 'tip-foot' }, keys) : null);
      this.el.view.appendChild(pop);
      // Just under the chip, kept inside the tab.
      const v = this.el.view.getBoundingClientRect(), r = chip.getBoundingClientRect(), w = pop.offsetWidth;
      pop.style.left = Math.max(8, Math.min(v.width - w - 8, r.left - v.left + r.width / 2 - w / 2)) + 'px';
      pop.style.top = (r.bottom - v.top + 6) + 'px';
      chip.setAttribute('aria-expanded', 'true');
      this.pop = pop;
    }

    /** A ring filled as far as the goal got — the not-yet card's picture. */
    ring(frac) {
      const c = 2 * Math.PI * 6, f = Math.max(0, Math.min(1, frac || 0));
      return h('span', { class: 'pz-i ring', title: Math.round(f * 100) + '% of the way', html: '<svg viewBox="0 0 16 16" fill="none" stroke-width="1.6" stroke-linecap="round">' +
        '<circle cx="8" cy="8" r="6" stroke="currentColor" opacity="0.25"/>' +
        (f > 0 ? '<circle cx="8" cy="8" r="6" stroke="var(--accent)" stroke-dasharray="' + (f * c).toFixed(2) + ' ' + c.toFixed(2) + '" transform="rotate(-90 8 8)"/>' : '') + '</svg>' });
    }

    closePop() {
      if (!this.pop) return;
      this.pop.remove();
      this.pop = null;
      this.el.mods.querySelectorAll('[aria-expanded]').forEach((b) => b.removeAttribute('aria-expanded'));
    }

    /**
     * An Undo button (the action bar's, the not-yet card's): how many Undos are held, or, with none, the price of one
     * (as Hint shows its price). Its tooltip and label say the same in words.
     */
    undoBtn(attrs, label) {
      return undoButton(this.app.store, Object.assign({ onclick: () => this.undo() }, attrs), icon('undo'), label, '⌫', this.undoNote());
    }

    /** "Pays ⦵14" at the end of the card's info line, with a tooltip saying why: nothing once the seed is solved. */
    renderPay() {
      const el = this.payEl;
      if (!el || !this.puzzle) return;
      const r = this.payNow();
      if (!r) { el.replaceChildren(); el.removeAttribute('data-tip'); el.removeAttribute('aria-label'); el.hidden = true; this.fitId(); return; }
      el.hidden = false;
      const D = Puzzles.DIFFS[this.puzzle.diff];
      el.replaceChildren(' · Pays ', h('span', { class: 'gem' }, LINE + r.pay));
      el.setAttribute('aria-label', 'Pays ' + r.pay + (r.pay === 1 ? ' line' : ' lines'));
      el.dataset.tip = [D.name + ' pays ' + D.reward + ', less each try that sets a piece (never under ' + D.min + ')',
        r.try > 1 ? 'Try ' + r.try + ': ' + r.byTries : null,
        r.clean ? 'First try, no Undo or hint: ×' + Puzzles.PAY.CLEAN : null,
        r.daily ? 'Daily: ×' + Puzzles.PAY.DAILY : this.meta.daily ? 'Daily ×' + Puzzles.PAY.DAILY + ' already paid for this date' : null,
        r.hint ? 'Hint: half' : null].filter(Boolean).join('\n');
      this.fitId();
    }

    renderActions() {
      if (!this.puzzle) return;
      // Solved (the button is off) or a replay of a solved seed: no price. Solved, it still says whether hints were on.
      const cost = this.hintCost(), unpriced = this.done || !cost;
      const hinted = this.done ? this.doneHint : this.ps.current && this.ps.current.hint;
      const freeHints = unpriced ? 0 : (this.app.store.state.freebies && this.app.store.state.freebies.hint) || 0;
      this.el.actions.replaceChildren(
        h('div', { class: 'grp' },
          this.undoBtn({ class: 'btn', id: 'puz-undo', disabled: !this.game || !this.game.history.length || this.done }, 'Undo'),
          h('button', Object.assign({ class: 'btn', id: 'puz-retry', 'aria-label': 'Retry', 'data-tip-foot': 'R', onclick: () => this.retry() }, this.retryTip()), icon('retry'), h('span', { class: 'lbl' }, 'Retry'))),
        h('div', { class: 'grp' },
          h('button', { class: 'btn' + (hinted ? ' on' : ''), id: 'puz-hint', disabled: this.done, 'aria-label': hinted ? 'Hints on' : unpriced ? 'Hint' : freeHints ? (freeHints > 1 ? 'Hint, ' + freeHints + ' free' : 'Hint, free') : 'Hint, costs ' + cost + ' lines', 'aria-pressed': String(!!hinted), 'data-tip': hinted ? 'Hints on' : !this.done && !cost ? 'Hint · free on a puzzle solved before' : freeHints ? 'Hint · ' + (freeHints > 1 ? freeHints + ' free' : 'free') : 'Hint', 'data-tip-foot': 'H', onclick: () => this.buyHint() },
            icon('hint'), h('span', { class: 'lbl' }, hinted ? 'Hints on' : 'Hint'), hinted || unpriced ? null : freeHints ? h('span', { class: 'cnt free' }, freeHints > 1 ? freeHints + ' free' : 'free') : h('span', { class: 'gem' }, LINE + cost)),
          h('button', { class: 'btn' + (this.done ? ' primary' : ''), id: 'puz-next', 'aria-label': this.done ? 'Next' : 'Skip', 'data-tip': this.done ? 'Next' : 'Skip', 'data-tip-foot': 'N', onclick: () => this.next() }, h('span', { class: 'lbl' }, this.done ? 'Next' : 'Skip'), icon(this.done ? 'next' : 'skip'))));
    }
  }

  // ---- factory ------------------------------------------------------------------------------------------------------

  const REWARD_UNLOCKS = [
    { kind: 'palette', id: 'assembly', test: (f) => f.presses >= 2 },
    { kind: 'frame', id: 'hazard', test: (f) => f.presses >= 3 },
    { kind: 'skin', id: 'steel', test: (f) => f.presses >= 4 },
    { kind: 'backdrop', id: 'belt', test: (f) => f.stats.lines >= 500 },
    { kind: 'effect', id: 'sparks', test: (f) => f.crateLevel >= 4 },
  ];

  // What the line sounds like (existing ids only; each at most every 0.4 s, and only with the window in front). Feeds
  // are silent.
  const LINE_SOUNDS = { stamp: 'stamp', mino: 'stamp', drop: 'pack', ship: 'land', full: 'bell' };
  // The four things to build, in the chain's order.
  const FAC_KINDS = ['stamp', 'store', 'press', 'crate'];
  const ORDINAL = ['First', 'Second', 'Third', 'Fourth'];

  /** A calm "how long": <1m, 12m, 1h 12m, 2d 3h (held together: a wrap never splits one). */
  function soon(sec) {
    if (!isFinite(sec)) return '—';
    const m = Math.ceil(sec / 60);
    if (m <= 1) return sec < 45 ? '<1m' : '1m';
    if (m < 60) return m + 'm';
    if (m < 48 * 60) return Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
    const d = Math.floor(m / 1440), hr = Math.floor((m % 1440) / 60);
    return d + 'd' + (hr ? ' ' + hr + 'h' : '');
  }

  // The things to build, drawn in the icon set's manner (js/icons.js: a 16-unit grid, a 1.5 stroke, round caps and
  // joins, currentColor), kept here since only the Factory uses them.
  const facSvg = (body) => '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
  const FAC_ICONS = {
    // A head on its beam, its ram, and a single mino under it.
    'fac-stamp': facSvg('<path d="M2.25 2.25h11.5M8 2.25v2.5"/><rect x="5.25" y="4.75" width="5.5" height="2" rx="0.8"/><rect x="6.25" y="9.5" width="3.5" height="3.5" rx="0.8" fill="currentColor" stroke="none"/>'),
    // A shallow tray with one row of minos.
    'fac-store': facSvg('<path d="M2.25 7.5v5.25h11.5V7.5"/><rect x="4" y="10" width="2.25" height="1.75" rx="0.5" fill="currentColor" stroke="none"/><rect x="6.9" y="10" width="2.25" height="1.75" rx="0.5" fill="currentColor" stroke="none"/><rect x="9.8" y="10" width="2.25" height="1.75" rx="0.5" fill="currentColor" stroke="none"/>'),
    // A housing, its rod, and the ram over an open mold.
    'fac-press': facSvg('<rect x="4.75" y="1.75" width="6.5" height="2.75" rx="1"/><path d="M8 4.5v2.25M5 7.75h6M2.75 10v3.25h10.5V10"/>'),
    // A crate hung from its rail, with two full rows.
    'fac-crate': facSvg('<path d="M2.25 2.25h11.5M4.25 2.25v2M11.75 2.25v2M3.25 4.75v9h9.5v-9"/><rect x="5" y="10.25" width="6" height="1.75" rx="0.6" fill="currentColor" stroke="none"/><rect x="5" y="7.5" width="6" height="1.75" rx="0.6" fill="currentColor" stroke="none"/>'),
  };
  const facIcon = (name) => h('span', { class: 'fac-ico', html: FAC_ICONS[name] });

  const easeOut3 = (k) => 1 - Math.pow(1 - k, 3);

  /**
   * The Factory: a production chain. The floor on its plate (stamp heads, the top belt, the store, the presses, the
   * belt, the lift and the crate), a bar of figures under it with Collect at the right, and the things to build at the
   * bottom, in the chain's order. The floor's parts are buttons too: a head or the store points to its entry, a press
   * opens its mold, the next head or bay builds, the crate collects. Everything it makes is minos; every four in the
   * crate are a line.
   */
  class FactoryMode {
    constructor(app) {
      this.app = app;
      this.el = document.getElementById('view-factory');
      this.canvas = document.getElementById('cv-floor');
      this.view = new L.FloorView(this.canvas);
      this.top = document.getElementById('fac-top');
      this.collectEl = document.getElementById('fac-collect');
      this.list = document.getElementById('fac-list');
      this.hots = document.getElementById('fac-hots');
      this.visible = false;
      this.form = 'rows'; // the list: a row for each thing to build, or (a short window) a grid of cards
      this.panelAt = 0; this.tipAt = 0; this.achAt = 0; this.soundAt = {}; this.etaAt = -Infinity; this.etaV = Infinity;
      this.away = null;  // time away not yet announced: { seconds, minos }
      this.count = null; // Lines in crate counting to a new value: { from, to, t0, dur }
      this.fly = null;   // collected lines on their way to the wallet
      this.hotKey = ''; this.hotEls = []; this.buildEls = {};
      this.build();
    }

    get f() { return this.app.store.state.factory; }
    get store() { return this.app.store; }
    get reduced() { return this.app.reducedMotion(); }

    // ---- time ---------------------------------------------------------------------------------------------------------

    /**
     * Time away (more than five seconds since the line last ran): replayed in one go, never banked for you. Timers run
     * slowly or not at all while Lull is hidden, so quiet catch-ups add up until the next return announces them. On the
     * Factory tab nothing is announced: the new minos fade into the store and the crate, and its figure counts up.
     */
    catchUp(announce) {
      const f = this.f, now = Date.now();
      let res = null;
      if (now - f.lastTick > 5000 || now < f.lastTick) {
        if (this.visible) this.view.flushAll();
        const crate0 = this.view.landed(f), store0 = this.view.storeLanded(f);
        res = Factory.catchUp(f, now);
        if (res) {
          if (res.minos) this.addDayMinos(res.minos);
          if (this.visible) {
            this.away = null;
            this.view.caughtUp(store0, crate0, f);
            if (f.crate.length > crate0 && !this.reduced) this.count = { from: crate0 * Factory.TUNE.PAY, to: f.crate.length * Factory.TUNE.PAY, t0: performance.now(), dur: 800 };
          } else this.away = { seconds: (this.away ? this.away.seconds : 0) + res.seconds, minos: (this.away ? this.away.minos : 0) + res.minos };
          this.afterChange();
          this.app.setBadge('factory', Factory.isFull(f));
        }
      }
      if (announce && this.away && !this.visible) {
        const a = this.away;
        this.away = null;
        if (a.seconds > 90 && a.minos >= Factory.MPL) {
          const lines = Factory.quarters(a.minos * Factory.TUNE.PAY);
          toast('While you were away: ' + lines + (lines === '1' ? ' line' : ' lines') + (Factory.isFull(f) ? ' · Crate full' : ''), 'good', 5000);
        }
      }
      return res;
    }

    /** Runs the line up to now: a catch-up after a gap, otherwise the ticks the time since the last frame holds. */
    advance() {
      const f = this.f, now = Date.now();
      // A gap found with the floor on screen (a sleep, a hide that sent no event) is caught up now.
      if (now - f.lastTick > 5000 || now < f.lastTick) { this.catchUp(this.visible && !document.hidden); return []; }
      const evs = Factory.step(f, (now - f.lastTick) / 1000);
      f.lastTick = now;
      return evs;
    }

    show() {
      this.visible = true;
      this.view.settle();
      this.catchUp(false);
      this.away = null; // the floor shows what happened
      this.relayout();
      this.build();
    }

    hide() {
      this.visible = false;
      this.view.hover = null; this.view.preview = false;
      this.view.settle(); // its clock stops while hidden: nothing half-played resumes on return
      this.count = null;
      this.flushFly();
    }

    /**
     * The room the plate may take: the view's height, less its padding and the bar (left), and what the list takes in
     * each form (listH: as it is now, or with n entries): the scene grows into whatever the list leaves, so when an
     * entry goes, the scene takes its room.
     */
    plateRoom() {
      const el = this.el, plate = this.view.plate, stage = plate && plate.parentElement;
      if (!plate || !el.clientHeight) return null;
      if (this.padW !== el.clientWidth) {
        const st = getComputedStyle(el), ls = getComputedStyle(this.list);
        this.padW = el.clientWidth; this.pad = parseFloat(st.paddingTop) + parseFloat(st.paddingBottom); this.listM = parseFloat(ls.marginTop) || 0;
      }
      const inner = el.clientHeight - this.pad, left = inner - (stage.offsetHeight - plate.offsetHeight);
      const now = FAC_KINDS.filter((k) => Factory.nextUpgrade(this.f, k)).length;
      // Rows: 48 each and the group's hairlines; cards: two to a row, 48 high with a 2 px gap (n entries: those left now,
      // unless given).
      const listH = (form, n = now) => (!n ? 0 : this.listM + (form === 'rows' ? n * 48 + 2 : Math.ceil(n / 2) * 48 + (n > 2 ? 2 : 0)));
      // A phone on its side (the stylesheet's own test for one): the plate takes the height, the rest scrolls.
      const sideways = !!(root.matchMedia && root.matchMedia('(hover: none) and (pointer: coarse) and (orientation: landscape) and (max-height: 520px)').matches);
      return { left, listH, innerH: inner, sideways };
    }

    /** Fits the floor to the view: on show, on a resize (app.onResize), after the list changes, and once more if the
     *  view was not laid out. */
    relayout() {
      const room = this.plateRoom();
      this.roomDirty = !room;
      if (!room) return;
      const lay = L.FactoryArt.fit(this.view.boxWidth(), room);
      this.view.resize(lay);
      if (lay.form !== this.form) {
        this.form = lay.form;
        this.list.classList.toggle('cards', lay.form === 'cards');
        this.build();
      }
    }

    /** Every second while the factory is not on screen: the line keeps running, quietly. */
    tick() {
      if (this.visible) return;
      this.onEvents(this.advance(), false);
      this.app.setBadge('factory', Factory.isFull(this.f));
      const now = Date.now();
      if (now - this.achAt > 10000) { this.achAt = now; this.afterChange(false); }
    }

    frame(t, dt) {
      const evs = this.advance(), reduced = this.reduced;
      // The layout is read only when the window changes (a moved window's pixel ratio included), not every frame.
      if (this.roomDirty || (root.devicePixelRatio || 1) !== this.dprSeen) { this.dprSeen = root.devicePixelRatio || 1; this.relayout(); }
      this.view.events(evs, this.f, reduced);
      this.onEvents(evs, true);
      this.view.render(dt, this.f, this.app.look());
      this.placeHots();
      this.updateCrate();
      if (this.el.classList.contains('fac-still') !== reduced) this.el.classList.toggle('fac-still', reduced);
      if (t - this.panelAt > 250) { this.panelAt = t; this.update(); }
      if (t - this.tipAt > 1000) { this.tipAt = t; this.refreshTips(); }
    }

    onEvents(evs, audible) {
      if (!evs.length) return;
      let shipped = false;
      for (const e of evs) {
        if (e.kind === 'ship') { this.addDayMinos(e.item.n); shipped = true; }
        if (audible) this.lineSound(LINE_SOUNDS[e.kind]);
      }
      if (shipped) this.afterChange();
      if (shipped || evs.some((e) => e.kind === 'full')) this.app.setBadge('factory', Factory.isFull(this.f));
    }

    lineSound(id) {
      if (!id || document.hidden || !document.hasFocus()) return;
      const now = performance.now();
      if (now - (this.soundAt[id] || 0) < 400) return;
      this.soundAt[id] = now;
      this.app.sound.play(id);
    }

    addDayMinos(n) { const d = this.store.day(); d.minos = (d.minos || 0) + n; }

    /** Rewards and achievements after anything changed on the line (and a save, unless it is only the quiet check). */
    afterChange(touch) {
      for (const u of REWARD_UNLOCKS) {
        if (!this.store.owns(u.kind, u.id) && u.test(this.f)) {
          this.store.grantCosmetic(u.kind, u.id);
          toast('Unlocked: ' + L.COSMETICS[u.kind][u.id].name, 'good', 4000);
        }
      }
      // While collected lines are still on their way to the wallet, achievements wait for them to land (an
      // achievement counts into the wallet at once, which would give the flight's total away early).
      if (this.fly) this.fly.ach = true;
      else this.app.achieve({ mode: 'factory' });
      if (touch !== false) this.store.touch();
    }

    // ---- verbs --------------------------------------------------------------------------------------------------------

    /** Banks every eight minos in the crate as a line; the 0–7 loose ones stay. Minos still on their way land first. */
    collect() {
      const f = this.f;
      this.view.flushLift();
      if (f.crate.length < Factory.MPL) { this.app.sound.play('blocked'); return false; }
      const look = this.app.look(), reduced = this.reduced, shown = this.visible ? this.displayed() : 0;
      const snap = this.visible ? this.view.snapshot(f, look) : null;
      const res = Factory.collect(f);
      if (!res) { this.app.sound.play('blocked'); return false; }
      this.store.addLines(res.collected, 'factory');
      this.app.sound.play('golden');
      if (snap) {
        this.view.collected(snap, look, reduced);
        this.count = reduced ? null : { from: shown, to: res.loose * Factory.TUNE.PAY, t0: performance.now(), dur: 450 };
        this.flyLines(res.collected, reduced);
      } else this.app.refreshWallet(true);
      const ev = { mode: 'factory', collected: res.collected, loose: res.loose };
      if (this.fly) this.fly.events.push(ev); else this.app.achieve(ev);
      this.afterChange();
      this.app.setBadge('factory', false);
      this.etaAt = -Infinity;
      this.update();
      return true;
    }

    /** Builds the next of a kind; short of lines, it says so (a soft no, and the entry's flash). */
    upgrade(kind) {
      const u = Factory.nextUpgrade(this.f, kind);
      if (!u) return false;
      if (this.store.state.lines < u.cost || !this.store.spend(u.cost)) { this.app.sound.play('blocked'); this.flashBuild(kind); return false; }
      this.flushFly();
      if (kind === 'crate') this.view.flushLift();
      Factory.upgrade(this.f, kind);
      if (kind === 'press') this.view.builtPress(this.f.presses - 1);
      if (kind === 'stamp') this.view.builtHead(this.f.stampers - 1);
      this.app.refreshWallet();
      this.app.sound.play('buy');
      this.afterChange();
      this.build();
      return true;
    }

    flashBuild(kind) {
      const b = this.buildEls[kind];
      if (!b || this.reduced) return;
      b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
      b.addEventListener('animationend', () => b.classList.remove('flash'), { once: true });
    }

    /** Keyboard focus to a kind's entry in the list (a head or the store on the floor points there). */
    focusEntry(kind) {
      const b = this.buildEls[kind];
      if (!b) { this.app.sound.play('blocked'); return; }
      b.focus({ preventScroll: true });
      if (b.scrollIntoView) b.scrollIntoView({ block: 'nearest' });
    }

    /** The mold picker: any shape each time, or one chosen shape (it never changes what a press pays). */
    openMold(k) {
      const f = this.f, m = f.molds[k];
      if (!m) return;
      const n = Factory.MOLDS[k], look = this.app.look(), list = Factory.shapes(n), seen = f.stats.seen[n];
      let modal = null;
      const current = () => (m.pin < 0 ? 'Any' : Factory.shapeName(n, m.pin));
      const cap = h('div', { class: 'mold-cap' }, current());
      const say = (s) => () => { cap.textContent = s == null ? current() : s; };
      const pick = (s) => { Factory.setPin(f, k, s); this.app.sound.play('land'); this.store.touch(); if (modal) modal.close(); this.build(); };
      const tiles = list.map((_, s) => {
        const name = Factory.shapeName(n, s);
        return h('button', { class: 'mold' + (m.pin === s ? ' on' : ''), 'data-s': s, 'aria-label': name, 'aria-pressed': String(m.pin === s), onclick: () => pick(s), onmouseenter: say(name), onmouseleave: say(null), onfocus: say(name), onblur: say(null) });
      });
      const any = h('button', { class: 'chip' + (m.pin < 0 ? ' on' : ''), 'aria-pressed': String(m.pin < 0), onclick: () => pick(-1), onmouseenter: say('Any'), onmouseleave: say(null), onfocus: say('Any'), onblur: say(null) }, 'Any');
      const grid = h('div', { class: 'catalog molds' + (n === 7 ? ' n7' : '') }, tiles);
      const body = h('div', { class: 'mold-pick' },
        h('div', { class: 'mold-top' }, any, seen ? h('span', { class: 'mold-count' }, 'Pressed ' + Factory.seenCount(f, n) + ' / ' + list.length) : null),
        grid, cap);
      modal = UI.openModal({ title: Factory.NAMES[n] + ' mold', width: 380, body });
      // The shapes fill their tiles, and the grid shows six whole rows at most (it scrolls a row at a time). The rows
      // are measured once laid out, and again once the cap brings in a scrollbar (which narrows the tiles), so the
      // sixth row always ends exactly at the grid's bottom edge.
      // (Layout sizes, not getBoundingClientRect: the modal opens with a scale, which that would include.)
      const tileSize = () => parseFloat(getComputedStyle(tiles[0]).height) || tiles[0].offsetHeight;
      const size = Math.max(18, Math.floor(tileSize() - 6));
      tiles.forEach((t, s) => t.appendChild(L.FactoryArt.shapeCanvas(look, list[s], size, look.colors[1 + (s % 7)], !seen || seen[s] === '1')));
      const fit = () => {
        if (!grid.isConnected || tiles.length <= 6) return;
        const ts = tileSize(), gs = getComputedStyle(grid), gap = parseFloat(gs.rowGap) || 0;
        const tops = new Set(tiles.map((t) => Math.round(t.offsetTop)));
        if (tops.size <= 6) { grid.style.maxHeight = ''; return; }
        const pad = (parseFloat(gs.paddingTop) || 0) + (parseFloat(gs.paddingBottom) || 0);
        grid.style.maxHeight = Math.ceil(6 * ts + 5 * gap + pad) + 'px';
      };
      fit(); fit();
      requestAnimationFrame(() => { fit(); if (m.pin >= 0) tiles[m.pin].scrollIntoView({ block: 'nearest' }); });
      if (m.pin >= 0) tiles[m.pin].scrollIntoView({ block: 'nearest' });
    }

    /** C collects, on the Factory tab (app.js skips it while a dialog or a text field has the keys). */
    key(e) {
      if (e.code !== 'KeyC' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return false;
      this.collect();
      return true;
    }

    // ---- collected lines, on their way to the wallet ----------------------------------------------------------------

    /** One label, "+11 ⦵", rises over the crate, holds, then flies into the wallet, which counts it on arrival. */
    flyLines(n, reduced) {
      const app = document.getElementById('app'), icon = document.getElementById('wallet-icon'), plate = this.view.plate;
      const wr = icon && icon.getBoundingClientRect();
      const again = !!this.fly;
      if (this.fly && this.fly.anim) this.fly.anim.cancel();
      if (!this.fly) { this.fly = { el: h('div', { class: 'fac-fly', 'aria-hidden': 'true' }), n: 0, anim: null, events: [], ach: false, key: '' }; app.appendChild(this.fly.el); }
      const fly = this.fly;
      fly.n += n;
      fly.key = this.view.layoutKey(this.f);
      fly.el.textContent = '+' + fmtInt(fly.n) + ' ' + LINE;
      const a = app.getBoundingClientRect(), p = plate.getBoundingClientRect(), crate = this.view.rect('crate', 0, this.f);
      const w = fly.el.offsetWidth, hgt = fly.el.offsetHeight;
      let x = p.left + 1 + crate.x + crate.w / 2 - w / 2 - a.left;
      x = Math.max(p.left - a.left + 8, Math.min(p.right - a.left - w - 8, x));
      const y = Math.max(p.top - a.top + 6, p.top + 1 + crate.y + 0.5 * this.view.cs - hgt - 10 - a.top);
      const at = (dx, dy, s) => 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px) scale(' + s + ')';
      const hidden = !wr || !wr.width || L.Collapse.on || document.hidden;
      const done = () => { if (this.fly === fly) this.landFly(); };
      if (reduced || hidden) {
        // In place: the label fades in and out over the crate; the wallet (and any achievement) counts at once.
        this.fly = null;
        this.app.refreshWallet(true);
        this.landAchievements(fly);
        fly.anim = fly.el.animate([{ opacity: 0, transform: at(x, y, 1) }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.6 }, { opacity: 0, transform: at(x, y, 1) }], { duration: 800, fill: 'both' });
        fly.anim.onfinish = () => fly.el.remove();
        return;
      }
      const tx = wr.left + wr.width / 2 - a.left - w / 2, ty = wr.top + wr.height / 2 - a.top - hgt / 2;
      const frames = again
        ? [{ opacity: 1, transform: at(x, y, 1), offset: 0 }, { opacity: 1, transform: at(x, y, 1), offset: 550 / 1150, easing: 'cubic-bezier(.5,0,.3,1)' }]
        : [{ opacity: 0, transform: at(x, y + 8, 1), offset: 0, easing: 'ease-out' }, { opacity: 1, transform: at(x, y, 1), offset: 300 / 1150 }, { opacity: 1, transform: at(x, y, 1), offset: 550 / 1150, easing: 'cubic-bezier(.5,0,.3,1)' }];
      frames.push({ opacity: 0.3, transform: at(tx, ty, 0.6), offset: 1 });
      fly.anim = fly.el.animate(frames, { duration: 1150, delay: again ? 0 : 150, fill: 'both' });
      fly.anim.onfinish = done;
    }

    /** The label lands at once (a tab change, a purchase, a collapsed window, a resize that moves the wallet). */
    flushFly() {
      if (this.fly) this.landFly();
    }

    /** The label is in: gone, the wallet counts it, and the achievements the collect earned are paid after it. */
    landFly() {
      const fly = this.fly;
      this.fly = null;
      if (fly.anim) { fly.anim.onfinish = null; fly.anim.cancel(); }
      fly.el.remove();
      this.app.refreshWallet(true);
      this.landAchievements(fly);
    }

    landAchievements(fly) {
      for (const ev of fly.events) this.app.achieve(ev);
      if (fly.ach || fly.events.length) this.app.achieve({ mode: 'factory' });
    }

    // ---- the page -----------------------------------------------------------------------------------------------------

    /** What building the next of a kind changes, in plain words: its title, a short one for a card, and the line under
     *  it (lines an hour, where the rate would rise). */
    describe(kind, u) {
      const f = this.f, ph = Factory.perHour(f), gain = (to) => '+' + Factory.quarters((to - ph) * Factory.TUNE.PAY) + ' lines / hour';
      if (kind === 'stamp') {
        const to = Math.min(u.to, Factory.demand(f));
        return { title: ORDINAL[f.stampers] + ' stamper', short: 'Stamper', icon: 'fac-stamp', meta: to > ph ? gain(to) : u.from + ' → ' + u.to + ' minos / hour' };
      }
      if (kind === 'store') {
        // A bigger store only matters while the presses use more than the stampers make: then it is how long it feeds
        // them from full (to the nearest half hour) while the stampers fall behind (the store only drains then: it
        // refills when the presses stop). The row keeps it short (a phone's row has room for little more); its tooltip
        // says it whole.
        const S = Factory.supply(f), D = Factory.demand(f), hrs = Math.max(0.5, Math.round((u.to / (D - S)) * 2) / 2);
        const sizes = fmtInt(u.from) + ' → ' + fmtInt(u.to) + ' minos';
        return D > S ? { title: 'Bigger store', short: 'Store', icon: 'fac-store', meta: 'Feeds the presses ' + hrs + ' h', tip: 'A full store keeps the presses going ' + hrs + ' h while the stampers fall behind\n' + sizes }
          : { title: 'Bigger store', short: 'Store', icon: 'fac-store', meta: sizes, tip: 'Stampers keep up · ' + sizes };
      }
      if (kind === 'press') {
        const to = Math.min(Factory.supply(f), u.to);
        return { title: Factory.NAMES[u.n] + ' press', short: 'Press', icon: 'fac-press', meta: to > ph ? gain(to) : 'Uses ' + (u.to - u.from) + ' minos / hour' };
      }
      return { title: 'Bigger crate', short: 'Crate', icon: 'fac-crate', meta: u.from + ' → ' + u.to + ' lines' };
    }

    /** Builds the bar, the hotspots and the list (on show, and after a purchase); update() keeps them fresh. */
    build() {
      const f = this.f, cards = this.form === 'cards';
      // Keyboard focus survives the rebuild: the same part of the floor, the same entry (or the next thing).
      const a = document.activeElement, upEl = a && a.closest ? a.closest('.fac-up') : null;
      let keep = null;
      if (a && this.el.contains(a)) {
        if (a.classList.contains('fac-hot')) keep = '.fac-hot[data-id="' + a.dataset.id + '"]';
        else if (upEl) keep = '.fac-up[data-up="' + upEl.dataset.up + '"]' + (cards ? '' : ' .btn');
        else if (a === this.cBtn) keep = '#fac-collect .btn';
      }
      // The bar: three figures, and Collect.
      const stat = (label, short) => { const b = h('b'), el = h('span', { class: 'fac-stat' }, h('i', { 'data-short': short }, label), b); return { el, b }; };
      this.sRate = stat('Lines / hour', 'Per hour'); this.sCrate = stat('Lines in crate', 'In crate'); this.sFull = stat('Full in', 'Full in');
      this.crateV = document.createTextNode(''); this.crateOf = h('span', { class: 'of' });
      this.sCrate.b.append(this.crateV, this.crateOf);
      this.crateQ = -1; this.crateCap = -1; this.fullTxt = null; this.rateTxt = null; this.rateTip = null;
      this.top.replaceChildren(this.sRate.el, this.sCrate.el, this.sFull.el);
      const preview = (on) => () => { this.view.preview = on; };
      // No tooltip: the label already says Collect, and a tip above it would sit over the rows its hover lights up
      // (the crate's own tooltip gives the key).
      this.cBtn = h('button', { class: 'btn primary', 'aria-keyshortcuts': 'C', onclick: () => this.collect(),
        onmouseenter: preview(true), onmouseleave: preview(false), onfocus: preview(true), onblur: preview(false) });
      this.cKey = null;
      this.collectEl.replaceChildren(this.cBtn);
      // The things to build, in the chain's order (an entry goes once its kind is built out): a row each, with its Build
      // button; or, in a short window, a card each, the card itself the button.
      const buy = (kind) => (e) => { if (e.currentTarget.getAttribute('aria-disabled') === 'true') { this.app.sound.play('blocked'); this.flashBuild(kind); return; } this.upgrade(kind); };
      const entries = [];
      this.buildEls = {};
      for (const kind of FAC_KINDS) {
        const u = Factory.nextUpgrade(f, kind);
        if (!u) continue;
        const d = this.describe(kind, u), price = fmtInt(u.cost) + ' ' + LINE;
        if (cards) {
          const words = 'Build ' + d.title + ', ' + (d.tip || d.meta).replace(/\n/g, ', ').replace(' → ', ' to ').replace(' / hour', ' an hour') + ', ' + fmtInt(u.cost) + ' lines';
          const el = h('button', { class: 'fac-up', 'data-up': kind, 'aria-label': words, 'data-tip': words, onclick: buy(kind) },
            facIcon(d.icon), h('span', { class: 'txt' }, h('span', { class: 't' }, d.short), h('span', { class: 'p' }, price)));
          this.buildEls[kind] = el;
          entries.push(el);
        } else {
          const btn = h('button', { class: 'btn sm', onclick: buy(kind) }, 'Build · ' + price);
          this.buildEls[kind] = btn;
          entries.push(h('div', { class: 'fac-up', 'data-up': kind }, facIcon(d.icon), h('div', { class: 'txt' }, h('div', { class: 't' }, d.title), h('div', Object.assign({ class: 'd' }, d.tip ? { 'data-tip': d.tip } : null), d.meta)), btn));
        }
      }
      this.list.classList.toggle('cards', cards);
      this.list.replaceChildren(...(entries.length ? [h('div', { class: 'fac-group' }, entries)] : []));
      this.list.classList.toggle('hidden', !entries.length);
      if (this.visible && !this.inBuild) { this.inBuild = true; try { this.relayout(); } finally { this.inBuild = false; } }
      this.buildHots();
      this.update();
      this.updateCrate();
      if (keep) {
        const to = this.el.querySelector(keep) || this.el.querySelector(cards ? '.fac-up' : '.fac-up .btn') || this.cBtn;
        if (to && to.focus) to.focus({ preventScroll: true });
      }
    }

    /** The floor's hotspots, in the chain's order: the four stamp heads (built, the next to build, or later), the store,
     *  the four bays (a press, the next to build, or later), and the crate. */
    buildHots() {
      const f = this.f, els = [];
      const hover = (kind, k) => (e) => { this.view.hover = { kind, k }; if (e.type === 'mouseenter') this.tipHot = e.currentTarget; };
      const leave = (e) => { this.view.hover = null; if (this.tipHot === e.currentTarget) this.tipHot = null; };
      const hot = (id, kind, k, attrs, onclick) => h('button', Object.assign({ class: 'fac-hot', 'data-id': id, 'data-hot': kind, 'data-k': k,
        onmouseenter: hover(kind, k), onmouseleave: leave, onfocus: hover(kind, k), onblur: leave, onclick }, attrs));
      for (let j = 0; j < 4; j++) {
        const kind = j < f.stampers ? 'head' : 'headBay';
        els.push(hot('head' + j, kind, j, { 'aria-disabled': j > f.stampers ? 'true' : null }, () => {
          if (j < this.f.stampers) this.focusEntry('stamp');
          else if (j === this.f.stampers) this.upgrade('stamp');
          else this.app.sound.play('blocked');
        }));
      }
      els.push(hot('store', 'store', 0, null, () => this.focusEntry('store')));
      for (let k = 0; k < 4; k++) {
        const kind = k < f.presses ? 'press' : 'bay';
        els.push(hot('press' + k, kind, k, { 'aria-disabled': k > f.presses ? 'true' : null }, () => {
          if (k < this.f.presses) this.openMold(k);
          else if (k === this.f.presses) this.upgrade('press');
          else this.app.sound.play('blocked');
        }));
      }
      els.push(hot('crate', 'crate', 0, { 'aria-label': 'Collect', 'data-tip': 'Collect', 'data-tip-foot': 'C' }, () => this.collect()));
      this.hotEls = els;
      this.hots.replaceChildren(...els);
      this.hotKey = '';
      this.view.hover = null;
      this.placeHots();
      this.refreshTips();
    }

    /** Hotspots follow the scene whenever its layout changes (checked every frame; moved only then). Under a finger each
     *  is at least 32 px square, never over its neighbours. */
    placeHots() {
      const key = this.view.layoutKey(this.f);
      if (key === this.hotKey) return;
      this.hotKey = key;
      // A label on its way to the wallet was aimed before the window changed: it lands now instead.
      if (this.fly && this.fly.key !== key) this.flushFly();
      const coarse = !!(root.matchMedia && root.matchMedia('(hover: none) and (pointer: coarse)').matches), MIN = 32;
      const rects = this.hotEls.map((b) => this.view.rect(b.dataset.hot, +b.dataset.k || 0, this.f));
      if (coarse) {
        const grow = (r) => {
          if (r.w < MIN) { r.x -= (MIN - r.w) / 2; r.w = MIN; }
          if (r.h < MIN) { r.y -= (MIN - r.h) / 2; r.h = MIN; }
        };
        rects.forEach(grow);
        // Side by side (the heads, the bays): each keeps to its half of the space between it and the next.
        for (const [a, b] of [[0, 1], [1, 2], [2, 3], [5, 6], [6, 7], [7, 8]]) {
          const ra = rects[a], rb = rects[b];
          if (ra.x + ra.w > rb.x) { const mid = (ra.x + ra.w + rb.x) / 2; ra.w = mid - ra.x; rb.w -= mid - rb.x; rb.x = mid; }
        }
        // One above the other: the heads over the store, and the store over the bays (split halfway between them).
        const rs = rects[4];
        for (let j = 0; j < 4; j++) { const ra = rects[j]; if (ra.y + ra.h > rs.y) ra.h = rs.y - ra.y; }
        const bayTop = Math.min(...[5, 6, 7, 8].map((k) => rects[k].y));
        if (rs.y + rs.h > bayTop) {
          const mid = (rs.y + rs.h + bayTop) / 2;
          rs.h = mid - rs.y;
          for (const k of [5, 6, 7, 8]) { const rb = rects[k]; if (rb.y < mid) { rb.h -= mid - rb.y; rb.y = mid; } }
        }
        const w = this.view.w, hgt = this.view.h;
        for (const r of rects) { if (r.x < 0) { r.w += r.x; r.x = 0; } if (r.y < 0) { r.h += r.y; r.y = 0; } r.w = Math.min(r.w, w - r.x); r.h = Math.min(r.h, hgt - r.y); }
      }
      this.hotEls.forEach((b, i) => {
        // Edges rounded, not sizes, so neighbours that meet stay met and never overlap by a pixel.
        const r = rects[i], x0 = Math.round(r.x), y0 = Math.round(r.y);
        b.style.left = x0 + 'px'; b.style.top = y0 + 'px';
        b.style.width = Math.round(r.x + r.w) - x0 + 'px'; b.style.height = Math.round(r.y + r.h) - y0 + 'px';
      });
    }

    /** The hotspots' names and tooltips (once a second: a next mino counts down). */
    refreshTips() {
      const f = this.f, w = Factory.waits(f), msLeft = (ticks) => ticks * Factory.TICK_MS - f.acc + 999;
      const set = (el, k, v) => { if (v == null) { if (k in el.dataset) delete el.dataset[k]; } else if (el.dataset[k] !== v) el.dataset[k] = v; };
      const tipOf = (b, title, tip, label) => {
        set(b, 'tipTitle', title); set(b, 'tipFoot', null);
        if (b.dataset.tip !== tip) {
          set(b, 'tip', tip);
          // The app's tooltip copies its text when it opens: an open one over this part counts down with it.
          const t = this.tipHot === b && document.querySelector('#app > .tip:not(.hidden) .tip-body');
          if (t) t.textContent = tip;
        }
        if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
      };
      for (const b of this.hotEls) {
        const kind = b.dataset.hot, k = +b.dataset.k;
        if (kind === 'crate') continue;
        if (kind === 'head') {
          const s = f.stamps[k];
          if (!s) continue;
          const name = ORDINAL[k] + ' stamper';
          const tip = s.held ? (w.storeFull || this.view.flags.storeWarm ? 'Waiting: store full' : 'Waiting for room on the belt') : 'Next mino in ' + fmtClock(msLeft(Factory.STAMP_TT - s.t));
          tipOf(b, name, tip, name + ', ' + tip.charAt(0).toLowerCase() + tip.slice(1));
        } else if (kind === 'headBay') {
          const name = ORDINAL[k] + ' stamper', cost = fmtInt(Factory.STAMP_COST[k]) + ' ' + LINE;
          if (k === f.stampers) tipOf(b, name, 'Build · ' + cost, 'Build ' + name);
          else tipOf(b, name, cost, name);
        } else if (kind === 'store') {
          const cap = Factory.storeCap(f), tip = fmtInt(f.store) + ' of ' + fmtInt(cap) + ' minos' + (f.store === 0 ? '\nEmpty' : f.store >= cap ? '\nFull' : '');
          tipOf(b, 'Store', tip, 'Store, ' + fmtInt(f.store) + ' of ' + fmtInt(cap) + ' minos');
        } else if (kind === 'press') {
          const m = f.molds[k];
          if (!m) continue;
          const n = Factory.MOLDS[k], name = Factory.NAMES[n] + ' press', mold = m.pin < 0 ? 'Any' : Factory.shapeName(n, m.pin);
          const next = m.got < n ? Factory.B(n, m.got) : Factory.CYCLE_T;
          // Two plain lines (the tooltip's foot is for keys): the mold, and the next mino's countdown or what it waits for.
          const tip = 'Mold: ' + mold + '\n' + (m.held ? 'Waiting' : w.starving.indexOf(k) >= 0 ? 'Waiting for minos' : 'Next mino in ' + fmtClock(msLeft(next - m.t)));
          tipOf(b, name, tip, name + ', mold ' + mold);
        } else {
          const name = Factory.NAMES[Factory.MOLDS[k]] + ' press', cost = fmtInt(Factory.PRESS_COST[k]) + ' ' + LINE;
          if (k === f.presses) tipOf(b, name, 'Build · ' + cost, 'Build ' + name);
          else tipOf(b, name, cost, name);
        }
      }
    }

    /** What the crate figure shows: the minos drawn in it, or a count on its way to a new value. */
    displayed() {
      const c = this.count;
      if (!c) return this.view.landed(this.f) * Factory.TUNE.PAY;
      const k = c.dur ? Math.min(1, (performance.now() - c.t0) / c.dur) : 1;
      if (k >= 1) { this.count = null; return this.view.landed(this.f) * Factory.TUNE.PAY; }
      return c.from + (c.to - c.from) * easeOut3(k);
    }

    /** Lines in crate, every frame (only written when it changes, so it follows the minos as they land). */
    updateCrate() {
      // To the quarter line below (a mino is an eighth: one alone never shows as a quarter).
      const q = Math.floor(this.displayed() * 4 + 1e-9), cap = Factory.crateLines(this.f.crateLevel);
      if (q === this.crateQ && cap === this.crateCap) return;
      this.crateQ = q; this.crateCap = cap;
      this.crateV.nodeValue = Factory.quarters(q / 4);
      this.crateOf.textContent = ' / ' + cap;
    }

    update() {
      const f = this.f, st = Factory.status(f), wallet = this.store.state.lines;
      const rate = Factory.quarters(st.perHour * Factory.TUNE.PAY);
      if (rate !== this.rateTxt) { this.rateTxt = rate; this.sRate.b.textContent = rate; }
      // The rate's tooltip: both ends of the chain, in minos, so a line short of minos says why.
      const tip = 'Stampers make ' + st.supply + ' minos an hour\nPresses use ' + st.demand + ' minos an hour';
      if (tip !== this.rateTip) { this.rateTip = tip; this.sRate.el.dataset.tip = tip; }
      const full = st.full, fullTxt = full ? 'Now' : soon(st.toFull);
      if (fullTxt !== this.fullTxt) { this.fullTxt = fullTxt; this.sFull.b.textContent = fullTxt; }
      this.sFull.el.classList.toggle('warn', full);
      this.sCrate.el.classList.toggle('warn', full);
      // Collect: what it pays now (every whole line, those still on their way too: it lands them first), or when the
      // first line will be ready.
      const lines = st.lines;
      let key;
      if (lines) key = 'c' + lines;
      else {
        if (performance.now() - this.etaAt > 2000) { this.etaAt = performance.now(); this.etaV = Factory.eta(f, Factory.MPL, 4 * 3600); }
        key = 'n' + (isFinite(this.etaV) ? soon(this.etaV) : '');
      }
      if (key !== this.cKey) {
        this.cKey = key;
        this.cBtn.disabled = !lines;
        this.cBtn.textContent = lines ? 'Collect ' + fmtInt(lines) + ' ' + LINE : isFinite(this.etaV) ? 'Collect in ' + soon(this.etaV) : 'Collect';
      }
      this.cBtn.classList.toggle('full', full && lines > 0);
      if (this.cBtn.disabled && this.view.preview) this.view.preview = this.cBtn.matches(':hover, :focus-visible');
      // Build: lit when it can be afforded, otherwise a quiet "not yet".
      for (const kind of FAC_KINDS) {
        const b = this.buildEls[kind], u = b && Factory.nextUpgrade(f, kind);
        if (!u) continue;
        const ok = wallet >= u.cost;
        b.classList.toggle('go', ok);
        if (ok) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true');
      }
      this.app.setBadge('factory', Factory.isFull(f));
    }
  }

  L.Modes = { BoardMode, playLockSound, PlayMode, PuzzleMode, FactoryMode, AIM_STICK, CLICK_GRACE_MS, SET_GRACE_MS };
  void CELL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
