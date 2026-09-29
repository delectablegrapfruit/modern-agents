// Lull — control hints: one small key cap and a word or two near the board, only when a control seems to be missing
// (a signal from real input crosses its threshold), never more than one at a time, and retired for good: each hint
// once its control has been used well a few times, and all of them after 300 pieces or two hours on the boards.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  // All hints stop for good at whichever comes first. 300 pieces is about an hour of relaxed play (the achievements'
  // pace test sets one every three seconds, a new player more like one every ten): by then every basic control has
  // come up dozens of times, and a hint that has not been needed yet would only be noise. Two hours on the boards
  // (active time, the same clock as Stats) catches the player who mostly thinks rather than places — puzzles.
  const RETIRE_PIECES = 300;
  const RETIRE_MS = 2 * 3600e3;
  const MAX_SHOWN = 2; // each hint at most twice, ever
  const GAP_MS = 45e3; // at least this long between any two hints
  const SAME_GAP_MS = 240e3; // and between two showings of the same one
  const PENDING_MS = 15e3; // a hint waiting for a calm moment gives up after this
  const SHOW_MS = 4200; // on screen, then it fades

  /**
   * Each hint: how many good uses of its control retire it for good, and what counts as struggling (see Detector).
   *  turnArrow  on an Upside Down or Sideways board, Up pressed where another arrow turns (and nothing turned)
   *  otherWay   three quick turns the same way on one piece — the long way round — twice
   *  drop       Relaxed: a piece moved, then left floating 7 s with the window in front (pieces never fall)
   *  lower      three fresh presses into a block the piece could pass lower down; or a mouse player's 15 clicked
   *             pieces never lowered once; or a misplaced click undone after right-click is known
   *  hold       a Hold puzzle failed or retried without holding once
   *  invert     Inverted Controls: three fresh presses into a wall the piece could leave the other way
   *  keys       four keys that do nothing within 8 s on a board
   *  mouseTurn  eight clicked (or touch-dropped) pieces in a row never turned; or two such pieces undone within 5 s
   * A touch player gets the touch words for the same hints (variant 'touch': Swipe ↓ drops, Tap turns …); taps and
   * swipes retire them as clicks and keys do.
   */
  const SKILL = { turnArrow: 4, otherWay: 3, drop: 3, lower: 4, hold: 3, invert: 8, keys: 12, mouseTurn: 3 };
  const IDS = Object.keys(SKILL);

  const T = {
    upWrong180: 3, upWrong90: 5, // weight 1 a press, 2 when that press set the piece
    tripleGapMs: 1500, triples: 2,
    idleMs: 7000,
    failStreak: 3, failGapMs: 3000,
    unknownKeys: 4, unknownWindowMs: 8000,
    clickNoTurn: 8, clickNoLower: 15,
    misdropMs: 5000, misdrops: 2,
  };

  function fresh() { return { pieces: 0, ms: 0, over: false, shown: {}, skill: {}, retired: {} }; }

  /** The rules, free of the page: fed facts about inputs, it says which hint (if any) is due. */
  class Detector {
    constructor(hs) {
      this.hs = hs || fresh();
      for (const k of ['shown', 'skill', 'retired']) if (!this.hs[k] || typeof this.hs[k] !== 'object') this.hs[k] = {};
      this.pending = null;
      this.lastAt = -Infinity;
      this.lastBy = {};
      this.t = { piece: null };
      this.c = { triples: 0, upWrong: 0, unknown: [], clickNoTurn: 0, clickNoLower: 0, misdrops: 0, lastPlace: null };
      this.checkOver();
    }

    get over() { return !!this.hs.over; }
    retired(id) { return this.over || !!this.hs.retired[id]; }
    eligible(id) { return !this.retired(id) && (this.hs.shown[id] || 0) < MAX_SHOWN; }

    checkOver() {
      const hs = this.hs;
      if (!hs.over && (hs.pieces >= RETIRE_PIECES || hs.ms >= RETIRE_MS || IDS.every((id) => hs.retired[id] || (hs.shown[id] || 0) >= MAX_SHOWN))) hs.over = true;
      if (hs.over) this.pending = null;
      return hs.over;
    }

    /** A good use of a control; enough of them retire its hint for good. */
    skill(id, n) {
      const hs = this.hs;
      if (hs.retired[id]) return;
      hs.skill[id] = (hs.skill[id] || 0) + (n || 1);
      if (hs.skill[id] >= SKILL[id]) { hs.retired[id] = true; if (this.pending && this.pending.id === id) this.pending = null; this.checkOver(); }
    }

    raise(id, variant, now) {
      if (!this.eligible(id)) return false;
      if (this.pending && this.pending.id !== id) return false; // one at a time: the first in waits its turn
      this.pending = { id, variant: variant || null, at: now };
      return true;
    }

    /** The piece in play: a new one starts its own counts. */
    pieceOf(piece) {
      if (this.t.piece !== piece) this.t = { piece, ups: 0, turned: false, lowered: false, run: 0, runAt: 0, fail: 0, failDir: 0, failAt: 0, engaged: false, inputAt: 0, idled: false };
      return this.t;
    }

    /**
     * An input on a board. e: { act (the key's action: up, left, cw …), a (what it did on this board: rotate, moveL,
     * lower …, before Inverted Controls), ok, rep, mouse, touch (a gesture: its moves name screen arrows), set (it set the piece), piece, rot (the view's turn),
     * inverted, noRotate (Rigid, or a shape that never turns), wall ('wall' | 'block' when a move was stopped),
   * lowerThenSlide, otherSideFree }.
     */
    action(e, now) {
      if (this.over) return;
      const t = this.pieceOf(e.piece), c = this.c, a = e.a;
      t.engaged = true; t.inputAt = now; t.idled = false;
      const turn = /^(rotate|rotateInv|cw|ccw|r180)$/.test(a), move = a === 'moveL' || a === 'moveR';
      const arrowKey = !e.mouse && !e.touch && /^(up|down|left|right)$/.test(e.act);
      const via = e.touch ? 'touch' : null;
      if (turn && e.ok) {
        t.turned = true; c.upWrong = 0;
        if (e.rot) this.skill('turnArrow');
        if (a === 'ccw' || a === 'r180') this.skill('otherWay');
        if (e.mouse || e.touch) this.skill('mouseTurn');
      }
      if (e.ok && arrowKey && (turn || move)) this.skill('keys');
      // The long way round: three quick clockwise turns on one piece are one turn the other way.
      if (turn && !e.mouse && !e.rep && (a === 'rotate' || a === 'cw') && e.ok) {
        t.run = t.run && now - t.runAt < T.tripleGapMs ? t.run + 1 : 1;
        t.runAt = now;
        if (t.run >= 3) { t.run = 0; if (++c.triples >= T.triples) { c.triples = 0; this.raise('otherWay', via, now); } }
      } else if (!e.rep) t.run = 0;
      // Up on a turned board, where another arrow turns: weighed more when it set the piece before it ever turned.
      if (e.rot && !e.noRotate && e.act === 'up' && !e.mouse && !e.touch && !e.rep && a !== 'rotate' && !t.turned) {
        c.upWrong += e.set ? 2 : 1;
        if (c.upWrong >= (e.rot === 180 ? T.upWrong180 : T.upWrong90)) { c.upWrong = 0; this.raise('turnArrow', null, now); }
      }
      if (move && !e.mouse) {
        if (e.ok) { t.fail = 0; if (e.inverted) this.skill('invert'); }
        else if (!e.rep) {
          const dir = a === 'moveL' ? -1 : 1;
          t.fail = t.fail && t.failDir === dir && now - t.failAt < T.failGapMs ? t.fail + 1 : 1;
          t.failDir = dir; t.failAt = now;
          if (t.fail >= T.failStreak) {
            t.fail = 0;
            if (e.inverted && e.otherSideFree) this.raise('invert', via, now);
            else if (e.wall === 'block' && e.lowerThenSlide) this.raise('lower', via, now);
          }
        }
      }
      if (a === 'lower' && e.ok && !e.set && !t.lowered && e.act !== 'up') { t.lowered = true; this.skill('lower'); }
      if (a === 'hold' && e.ok) this.skill('hold');
      if (e.set) this.placed(e, t, now);
    }

    /** The player set a piece (a drop, a click, the ↓ that sets). */
    placed(e, t, now) {
      const c = this.c;
      this.skill('drop');
      c.lastPlace = { mouse: !!e.mouse, touch: !!e.touch, at: now };
      if (!e.mouse && !e.touch) { c.clickNoTurn = 0; c.clickNoLower = 0; return; }
      const via = e.touch ? 'touch' : 'mouse';
      if (c.via !== via) { c.via = via; c.clickNoTurn = 0; c.clickNoLower = 0; } // a run is one device's
      c.clickNoTurn = t.turned ? 0 : c.clickNoTurn + 1;
      c.clickNoLower = t.lowered || this.hs.skill.lower ? 0 : c.clickNoLower + 1;
      if (c.clickNoTurn >= T.clickNoTurn) { c.clickNoTurn = 0; this.raise('mouseTurn', via, now); }
      else if (c.clickNoLower >= T.clickNoLower) { c.clickNoLower = 0; this.raise('lower', via, now); }
    }

    /** Any piece set, by anyone (gravity and items too): the count that retires every hint. */
    piece() { this.hs.pieces++; this.checkOver(); }

    /** Time on a board, while it is being played. */
    time(ms) { this.hs.ms += ms; this.checkOver(); }

    /** Every frame on a Relaxed board: a piece left floating after being moved is waiting for something. */
    idle(e, now) {
      if (this.over || !e.relaxed || !e.floating || !e.piece) return;
      const t = this.pieceOf(e.piece);
      if (t.engaged && !t.idled && now - t.inputAt >= T.idleMs) { t.idled = true; this.raise('drop', e.mouse ? 'mouse' : e.touch ? 'touch' : null, now); }
    }

    /** A key that does nothing, pressed on a board. */
    unknownKey(now) {
      if (this.over) return;
      const u = this.c.unknown;
      u.push(now);
      while (u.length && now - u[0] > T.unknownWindowMs) u.shift();
      if (u.length >= T.unknownKeys) { u.length = 0; this.raise('keys', null, now); }
    }

    /** A puzzle attempt that ended (failed, or retried part way): a Hold puzzle never held. */
    attemptEnded(e, now) {
      if (!this.over && e.holdMod && !e.holds) this.raise('hold', e.mouse ? 'mouse' : e.touch ? 'touch' : null, now);
    }

    /** An undo (or Rewind): a clicked piece taken back at once was probably not meant to go there. */
    undo(now) {
      const c = this.c, p = c.lastPlace;
      c.lastPlace = null;
      if (this.over || !p || !(p.mouse || p.touch) || now - p.at > T.misdropMs) return;
      if (++c.misdrops < T.misdrops) return;
      c.misdrops = 0;
      const via = p.touch ? 'touch' : 'mouse';
      if (this.eligible('mouseTurn')) this.raise('mouseTurn', via, now);
      else this.raise('lower', via, now);
    }

    /** The hint to show now, if one is due and the moment allows (calm: the caller decides). */
    take(now, calm) {
      const p = this.pending;
      if (!p) return null;
      if (!this.eligible(p.id) || now - p.at > PENDING_MS) { this.pending = null; return null; }
      if (!calm || now - this.lastAt < GAP_MS || now - (this.lastBy[p.id] == null ? -Infinity : this.lastBy[p.id]) < SAME_GAP_MS) return null;
      this.pending = null;
      this.lastAt = now; this.lastBy[p.id] = now;
      this.hs.shown[p.id] = (this.hs.shown[p.id] || 0) + 1;
      this.checkOver();
      return p;
    }
  }

  // ---- on the page --------------------------------------------------------------------------------------------------

  const ARROW = { '0,-1': '↑', '0,1': '↓', '-1,0': '←', '1,0': '→' };
  const arrowFor = (view, dx, dy) => ARROW[view.screenDir(dx, dy).join(',')] || '↑';

  /**
   * What a hint says: key caps and as few words as will do. A touch player gets the gesture in words (the arrows
   * name the screen direction; plain arrows, never emoji). extra: { bothWays (a Both Ways puzzle), tapTurn }.
   */
  function content(id, variant, view, extra) {
    const mouse = variant === 'mouse';
    if (variant === 'touch') {
      const down = arrowFor(view, 0, -1), up = arrowFor(view, 0, 1);
      switch (id) {
        case 'drop': return ['Swipe ' + down + ' drops'];
        case 'lower': return ['Drag ' + down + ' lowers, then slide'];
        case 'hold': return ['Swipe ' + up + ' holds'];
        case 'otherWay': return [extra && (extra.bothWays || extra.tapTurn === 'cw') ? 'Two fingers: 180°' : 'Tap left: other way'];
        case 'invert': return ['Drag is mirrored'];
        case 'mouseTurn': return ['Tap turns'];
      }
    }
    switch (id) {
      case 'turnArrow': return [[arrowFor(view, 0, 1)], 'turns'];
      case 'otherWay': return [['Z'], 'turns the other way'];
      case 'drop': return mouse ? [[], 'Click to drop'] : [['Space'], 'drops', [arrowFor(view, 0, -1)], 'lowers'];
      case 'lower': return mouse ? [[], 'Wheel lowers'] : [[arrowFor(view, 0, -1)], 'lowers, then slide'];
      case 'hold': return mouse ? [[], 'Click HOLD to swap'] : [['C'], 'holds'];
      case 'invert': return [[arrowFor(view, -1, 0), arrowFor(view, 1, 0)], 'swapped'];
      case 'keys': return [[arrowFor(view, -1, 0), arrowFor(view, 1, 0)], 'move', [arrowFor(view, 0, 1)], 'turns'];
      case 'mouseTurn': return [[], 'Right-click turns'];
    }
    return [[], ''];
  }

  const IGNORED_KEYS = /^(Shift|Control|Alt|Meta|OS|CapsLock|Tab|Escape|Fn|F\d+$|KeyM$|Audio|Volume|Media|Print|ScrollLock|Pause|ContextMenu|NumLock)/;

  class Coach {
    constructor(app) {
      this.app = app;
      this.d = new Detector(this.state());
      this.el = null;
      this.visibleUntil = 0;
      this.shownFor = null;
      if (root.addEventListener) root.addEventListener('keydown', (e) => this.onKey(e));
    }

    /** The save's part (the store fills it in); a reset or an import brings a new object. */
    state() {
      const st = this.app.store.state;
      if (!st.hints || typeof st.hints !== 'object') st.hints = fresh();
      return st.hints;
    }

    sync() { const hs = this.state(); if (this.d.hs !== hs) this.d = new Detector(hs); return this.d; }

    get on() { return this.app.store.state.settings.hints !== false && !this.sync().over; }

    now() { return performance.now(); }

    /** From BoardMode.action, after every input on a board. */
    action(mode, info) {
      if (!this.on) return;
      const g = mode.game, p = info.piece, v = mode.view;
      const e = Object.assign({ rot: v.view ? v.view.rot || 0 : 0, inverted: !!mode.inverted, noRotate: !!(g.mods.noRotate || (p && p.type.kicks === 'none')) }, info);
      if ((info.a === 'moveL' || info.a === 'moveR') && !info.ok && p && g.piece === p) {
        const dx = info.a === 'moveL' ? -1 : 1, rdx = e.inverted ? -dx : dx, cells = p.type.rots[p.rot];
        e.wall = g.board.inBounds(cells, p.x + rdx, p.y) ? 'block' : 'wall';
        e.otherSideFree = g.fitsAt(p, p.rot, p.x - rdx, p.y);
        e.lowerThenSlide = false;
        if (!g.mods.heavy) for (let y = p.y - 1; y >= p.y - 6 && g.fitsAt(p, p.rot, p.x, y); y--) if (g.fitsAt(p, p.rot, p.x + rdx, y)) { e.lowerThenSlide = true; break; }
      }
      this.d.action(e, this.now());
      this.app.store.dirty = true;
    }

    lock() { if (!this.on) return; this.d.piece(); }

    attemptEnded(mode) {
      if (!this.on || !mode.puzzle) return;
      this.d.attemptEnded({ holdMod: mode.puzzle.mods.includes('hold'), holds: mode.game.s.holds || 0, mouse: mode.lastInput === 'mouse', touch: mode.lastInput === 'touch' }, this.now());
    }

    undo() { if (this.on) this.d.undo(this.now()); }

    onKey(e) {
      if (!this.on || e.repeat || e.metaKey || e.ctrlKey || e.altKey || L.KEYMAP[e.code] || IGNORED_KEYS.test(e.code)) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') || L.UI.modalOpen()) return;
      if (!this.boardMode()) return;
      this.d.unknownKey(this.now());
    }

    boardMode() { const app = this.app, tab = app.tab; return tab === 'play' || tab === 'classic' || tab === 'puzzle' ? app.modes[tab] : null; }

    /** No hint over a card, a window or a busy Classic stack: only when paused, before it starts, or low and slow. */
    calm(mode) {
      if (L.UI.modalOpen() || document.hidden) return false;
      if (mode === this.app.modes.classic) {
        if (mode.over) return false;
        if (mode.paused || !mode.started) return true;
        return mode.level <= 4 && mode.game.board.stackHeight() <= 5;
      }
      return !mode.cardOpen;
    }

    /** From BoardMode.frame, on the board in front. */
    frame(mode, now, dt) {
      if (this.el && this.shownFor && (this.shownFor !== mode || now > this.visibleUntil)) this.hide();
      if (!this.on) return;
      const app = this.app, g = mode.game;
      // Board time, while played (the same two minutes of grace as Stats' time with Lull).
      if (!document.hidden && now - (app.lastActivity || 0) < 120000) this.d.time(dt * 1000);
      const relaxed = mode !== app.modes.classic;
      if (relaxed && g && g.piece && !g.over && !mode.cardOpen && !L.UI.modalOpen() && !document.hidden && document.hasFocus()) {
        const p = g.piece;
        this.d.idle({ relaxed, piece: p, floating: g.fitsAt(p, p.rot, p.x, p.y - 1), mouse: mode.lastInput === 'mouse', touch: mode.lastInput === 'touch' }, now);
      }
      if (this.shownFor) return;
      const due = this.d.take(now, this.calm(mode));
      if (due) this.show(mode, due, now);
    }

    show(mode, due, now) {
      const wrap = mode.canvas.parentElement;
      if (!this.el) this.el = L.UI.h('div', { class: 'lhint', role: 'status', 'aria-live': 'polite' });
      if (this.el.parentElement !== wrap) wrap.appendChild(this.el);
      const variant = mode.lastInput === 'touch' ? 'touch' : due.variant || (mode.lastInput === 'mouse' ? 'mouse' : null);
      const parts = content(due.id, variant, mode.view, { bothWays: !!(mode.puzzle && mode.puzzle.mods && mode.puzzle.mods.includes('spin')), tapTurn: this.app.settings.tapTurn });
      const kids = [];
      for (const part of parts) {
        if (Array.isArray(part)) for (const k of part) kids.push(L.UI.h('kbd', null, k));
        else if (part) kids.push(L.UI.h('span', null, part));
      }
      this.el.replaceChildren(...kids);
      this.el.classList.toggle('plain', !parts.some((p) => Array.isArray(p) && p.length));
      this.el.dataset.hint = due.id;
      const lay = mode.view.lay;
      if (lay && !this.place(lay, wrap)) { this.el.remove(); return; }
      clearTimeout(this.gone);
      this.el.classList.remove('show');
      void this.el.offsetWidth;
      this.el.classList.add('show');
      this.shownFor = mode;
      this.visibleUntil = now + SHOW_MS;
      this.app.store.dirty = true;
    }

    /**
     * Where the pill goes: centred low in the well (under the piece on an upright board, clear of the stack on an Upside
     * Down one). A well narrower than the pill (a board 4 wide) keeps it off its walls: under the plate or over it, or
     * beside it (on more lines) when the board fills the height. False when there is nowhere it fits.
     */
    place(lay, wrap) {
      const el = this.el, B = lay.board, P = lay.plate, W = wrap.clientWidth, H = wrap.clientHeight, gap = 6;
      el.classList.remove('side');
      el.style.maxWidth = '';
      let pw = el.offsetWidth, x = B.x + B.w / 2, y = B.y + B.h - 12;
      const ph = el.offsetHeight;
      if (pw > B.w - 8) {
        if (H - (P.y + P.h) >= ph + gap * 2) y = P.y + P.h + gap + ph;
        else if (P.y >= ph + gap * 2) y = P.y - gap;
        else {
          const lw = P.x - gap * 2, rw = W - P.x - P.w - gap * 2, room = Math.max(lw, rw);
          if (room < 56) return false;
          el.classList.add('side');
          el.style.maxWidth = room + 'px';
          pw = el.offsetWidth;
          x = lw >= rw ? P.x - gap - pw / 2 : P.x + P.w + gap + pw / 2;
          y = P.y + P.h;
        }
        x = Math.min(Math.max(x, pw / 2 + gap), W - pw / 2 - gap);
      }
      el.style.left = Math.round(x) + 'px';
      el.style.top = Math.round(y) + 'px';
      return true;
    }

    /** Fades it out, then takes it off the page (so a pill placed for an old layout never widens a view). */
    hide() {
      const el = this.el;
      this.shownFor = null;
      if (!el) return;
      el.classList.remove('show');
      clearTimeout(this.gone);
      this.gone = setTimeout(() => { if (!this.shownFor) el.remove(); }, 700);
    }
  }

  L.Hints = { Detector, Coach, fresh, content, SKILL, IDS, T, RETIRE_PIECES, RETIRE_MS, MAX_SHOWN, GAP_MS, SAME_GAP_MS, PENDING_MS, SHOW_MS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
