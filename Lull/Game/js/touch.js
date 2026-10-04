// Lull — touch. TouchGestures reads one finger (or a quick two-finger tap) on a board and says what it means: move a
// cell, lower a row, hard drop, hold, turn. It knows nothing of the page (the board mode binds it: BoardMode.bindTouch),
// so Node can test it with made-up times. The rest are the page's few touch helpers: haptics, the first touch that
// wakes the audio, and whether a board is being touched (toasts step aside meanwhile).
//
// The scheme: drag anywhere on the board to move the piece a cell per step of finger travel (relative, not to where
// the finger is); drag toward the floor to lower it; a quick swipe toward the floor is a hard drop, away from it a
// hold; a tap turns (right half clockwise, left half the other way); a two-finger tap turns 180°. Directions are the
// screen's, so on a turned board a swipe toward its floor drops, as the arrows do.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  const T = {
    SLOP: 10, // px of travel: under it a touch is a tap
    TAP_MS: 280, // down to up, for a tap
    G: [1.6, 1.4, 1.25, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5], // finger travel per cell, in cells, for sensitivity 1–10
    STEP_MIN: 12, STEP_MAX: 64,
    REVERSE_HYST: 0.25, // of a step, extra, before the first step back the other way
    SWITCH_MS: 100, SWITCH_MIN: 0.6, SWITCH_RATIO: 1.5, // changing axis mid-drag (down under a ledge, then slide)
    FLICK_V: [0.8, 1.1, 1.5], // px/ms toward the floor: Light, Medium, Firm
    FLICK_WINDOW: 70, FLICK_SPAN: 16, // the speed is averaged over this long (at least this span)
    FLICK_MIN: 28, FLICK_MIN_CELLS: 0.8, // the stroke's travel, at least
    FLICK_AGE: 220, // the stroke, at most this old
    FLICK_SLOPE: 0.58, // |across| <= this × |along| (within 30° of the fall axis)
    FLICK_GRACE: 60, // slide steps this close before a hard drop are the swipe's own wobble: taken back
    STROKE_GAP: 50, // a pause this long between samples starts a new stroke
    TAP2_MS: 120, TAP2_UP_MS: 300, // two-finger tap
    SOFT_HOLD_MS: 150, SOFT_STILL: 4, // Classic: a finger resting down the board keeps lowering
    HOLD_HIT: 44, LONG_PRESS: 500, TOAST_GUARD: 500, MOUSE_GUARD: 800,
  };

  /** Finger travel per cell (CSS px) for a cell size and a sensitivity (1–10). */
  function stepFor(s, sens) {
    const g = T.G[Math.max(0, Math.min(9, Math.round(sens || 5) - 1))];
    return Math.max(T.STEP_MIN, Math.min(T.STEP_MAX, Math.round(s * g)));
  }

  const OPP = { left: 'right', right: 'left', up: 'down', down: 'up' };

  /**
   * One board's touches. emit(intent) carries out an intent and says whether it worked (a move into a wall did not).
   * Intents: { type: 'move', dir: 'left'|'right'|'up'|'down', fresh, undo } (a screen direction along the slide axis),
   * { type: 'lower' }, { type: 'drop' }, { type: 'hold', tap }, { type: 'tap', side: 'left'|'right' }, { type: 'r180' }.
   *
   * down() takes the gesture's frame: { step (px per cell), flickV (px/ms), flickMin (px), slide: 'x'|'y' (the screen
   * axis that moves the piece), floor: [fx, fy] (unit screen vector toward the floor), centerX (the well's middle, for
   * taps), onHold (the touch began on the Hold box), softMs (Classic: lower repeat while resting down the board; 0: none),
   * tapOnly (only a tap counts: Classic before it starts) }.
   */
  class TouchGestures {
    constructor(emit) {
      this.emit = emit;
      this.g = null; // the gesture in progress (its first finger)
      this.fingers = new Set(); // every finger down on this board
      this.lockout = false; // cancelled (three fingers, a system gesture) until every finger is up
    }

    get active() { return !!this.g; }

    down(id, x, y, t, o) {
      this.fingers.add(id);
      if (this.fingers.size > 2) { this.g = null; this.lockout = true; return; }
      if (this.lockout) return;
      const g = this.g;
      if (g) {
        // A second finger soon after a still first one: maybe a two-finger tap. Later (during a drag): ignored.
        if (!g.second && !g.dead && !g.fired && g.max < T.SLOP && t - g.t0 <= T.TAP2_MS) g.second = { id, x0: x, y0: y, max: 0, up: false };
        return;
      }
      if (!o) return;
      const f = x * o.floor[0] + y * o.floor[1], s = o.slide === 'x' ? x : y;
      this.g = {
        id, o, t0: t, x0: x, y0: y, max: 0, samples: [{ x, y, t, f, s }],
        axis: null, as: s, af: f, f0: f, s0: s, lastDir: 0, steps: [], fired: false, dead: false, fallDead: false,
        second: null, still: { f, s, t }, softNext: 0,
      };
    }

    move(id, x, y, t) {
      const g = this.g;
      if (!g || this.lockout) return;
      if (g.second && id === g.second.id) {
        g.second.max = Math.max(g.second.max, Math.hypot(x - g.second.x0, y - g.second.y0));
        if (g.second.max >= T.SLOP) g.dead = true; // a two-finger drag: nothing
        return;
      }
      if (id !== g.id) return;
      this.sample(g, x, y, t);
      if (g.second) { if (g.max >= T.SLOP) g.dead = true; return; }
      if (g.dead || g.o.tapOnly) return;
      if (this.flick(g)) return;
      if (!g.axis) {
        if (g.max < T.SLOP) return;
        const last = g.samples[g.samples.length - 1];
        g.axis = Math.abs(last.s - g.s0) >= Math.abs(last.f - g.f0) ? 'slide' : 'fall';
        g.ref = { s: g.s0, f: g.f0 };
      } else this.maybeSwitch(g);
      if (g.axis === 'slide') this.slide(g); else this.fall(g);
    }

    up(id, x, y, t) {
      this.fingers.delete(id);
      const g = this.g;
      if (!this.fingers.size) this.lockout = false;
      if (!g) return;
      if (g.second) {
        if (id === g.id) { this.sample(g, x, y, t); g.firstUp = true; } else if (id === g.second.id) g.second.up = true;
        else return;
        if (!g.firstUp || !g.second.up) return;
        this.g = null;
        if (!g.dead && g.max < T.SLOP && g.second.max < T.SLOP && t - g.t0 <= T.TAP2_UP_MS) this.emit({ type: 'r180' });
        return;
      }
      if (id !== g.id) return;
      this.sample(g, x, y, t);
      this.g = null;
      if (g.dead) return;
      if (!g.o.tapOnly && this.flick(g)) return;
      if (!g.fired && g.max < T.SLOP && t - g.t0 <= T.TAP_MS) {
        if (g.o.onHold && !g.o.tapOnly) this.emit({ type: 'hold', tap: true });
        else this.emit({ type: 'tap', side: g.x0 < g.o.centerX ? 'left' : 'right' });
      }
      // A piece is never set on lift.
    }

    /** The system took the touch (pointercancel): no more actions from it. */
    cancel(id) {
      this.fingers.delete(id);
      if (this.g && (this.g.id === id || (this.g.second && this.g.second.id === id))) { this.g = null; if (this.fingers.size) this.lockout = true; }
      if (!this.fingers.size) this.lockout = false;
    }

    /** Something else took over (a card, a window): the rest of this touch does nothing. */
    consume() { if (this.g) this.g.dead = true; }

    /** The piece changed under the finger (gravity set it, an item swapped it): no lowering, drop or hold until lift. */
    newPiece() {
      const g = this.g;
      if (!g) return;
      g.fallDead = true;
      const last = g.samples[g.samples.length - 1];
      g.as = last.s; g.af = last.f; g.softNext = 0; g.ref = { s: last.s, f: last.f };
    }

    /** Time passing with the finger down (Classic's resting soft drop). */
    tick(t) {
      const g = this.g;
      if (!g || g.dead || g.fallDead || g.second || !g.o.softMs || g.axis !== 'fall') return;
      const last = g.samples[g.samples.length - 1];
      if (last.f - g.f0 < g.o.step || t - g.still.t < T.SOFT_HOLD_MS) { g.softNext = 0; return; }
      if (!g.softNext) g.softNext = g.still.t + T.SOFT_HOLD_MS;
      let n = 0;
      while (t >= g.softNext && n++ < 20) { this.emit({ type: 'lower' }); g.fired = true; g.softNext += g.o.softMs; }
      if (t >= g.softNext) g.softNext = t + g.o.softMs;
    }

    // ---- inside ---------------------------------------------------------------------------------------------------

    sample(g, x, y, t) {
      const o = g.o, f = x * o.floor[0] + y * o.floor[1], s = o.slide === 'x' ? x : y;
      const prev = g.samples[g.samples.length - 1];
      if (t < prev.t) t = prev.t;
      g.samples.push({ x, y, t, f, s });
      while (g.samples.length > 48 || (g.samples.length > 8 && t - g.samples[1].t > 400)) g.samples.shift();
      g.max = Math.max(g.max, Math.hypot(x - g.x0, y - g.y0));
      if (Math.abs(f - g.still.f) >= T.SOFT_STILL || Math.abs(s - g.still.s) >= T.SOFT_STILL) { g.still = { f, s, t }; g.softNext = 0; }
    }

    /**
     * The current stroke along the fall axis: its fast part. Back from now while the finger keeps going one way at
     * least half the swipe speed, so a slide or a slow lowering that flows straight into a swipe does not age the
     * swipe. It starts where the finger turned back or slowed, or (after a rest) where it set off.
     */
    stroke(g) {
      const S = g.samples, n = S.length - 1;
      if (n < 1) return null;
      // Its direction: the latest real movement along the fall axis.
      let dir = 0;
      for (let i = n; i > 0 && !dir; i--) { const d = S[i].f - S[i - 1].f; if (Math.abs(d) > 0.5) dir = Math.sign(d); }
      if (!dir) return null;
      const fast = 0.5 * g.o.flickV;
      let k = n, startT = null, moved = false;
      for (; k > 0; k--) {
        const a = S[k - 1], b = S[k], dt = b.t - a.t, d = dir * (b.f - a.f);
        if (dt > T.STROKE_GAP) { if (d > 0) { startT = b.t - T.FLICK_SPAN; k--; } break; } // a rest: it starts as the finger set off
        if (!moved && Math.abs(d) <= 0.5) continue; // the finger resting at the end of it
        moved = true;
        if (d < -1 || (dt > 0 && d / dt < fast)) break; // turned back, or slow: the stroke starts here
      }
      return { dir, start: S[k], startT: startT == null ? S[k].t : startT };
    }

    flick(g) {
      if (g.fallDead) return false;
      const st = this.stroke(g);
      if (!st) return false;
      const S = g.samples, now = S[S.length - 1], o = g.o;
      const along = (now.f - st.start.f) * st.dir, across = Math.abs(now.s - st.start.s);
      if (along < o.flickMin || now.t - st.startT > T.FLICK_AGE || across > T.FLICK_SLOPE * along) return false;
      // Speed toward the floor (or away), averaged over the last FLICK_WINDOW ms of the stroke (at least FLICK_SPAN).
      // (Real samples only: a stroke that set off from a rest is timed from the rest, so a slow first move never reads as fast.)
      const k0 = S.indexOf(st.start), tAt = (k) => S[k].t;
      let k = S.length - 2;
      while (k > k0 && now.t - tAt(k - 1) <= T.FLICK_WINDOW) k--;
      while (k > k0 && now.t - tAt(k) < T.FLICK_SPAN) k--;
      const span = now.t - tAt(k);
      if (k < 0 || span < T.FLICK_SPAN || ((now.f - S[k].f) * st.dir) / span < o.flickV) return false;
      if (st.dir > 0) {
        // Toward the floor: a hard drop. Slide steps made by the swipe itself in its last FLICK_GRACE ms were its
        // wobble: taken back. (A slide that ran into the swipe stays where it went.)
        for (let j = g.steps.length - 1; j >= 0 && now.t - g.steps[j].t <= T.FLICK_GRACE && g.steps[j].t > st.start.t; j--) this.emit({ type: 'move', dir: OPP[g.steps[j].dir], undo: true });
        g.steps.length = 0;
        this.emit({ type: 'drop' });
      } else this.emit({ type: 'hold' });
      g.fired = true;
      g.dead = true; // one drop or one hold a touch; the rest of it does nothing
      return true;
    }

    /**
     * The other axis takes over when the finger has clearly turned onto it: over the last SWITCH_MS, or (however slow
     * the finger) since the locked axis last stepped, it went at least SWITCH_MIN of a step (a whole step, for the
     * slow way) that way and SWITCH_RATIO times as far as along the locked axis. The travel that turned it counts.
     */
    maybeSwitch(g) {
      const S = g.samples, now = S[S.length - 1], step = g.o.step;
      let k = S.length - 1;
      while (k > 0 && now.t - S[k - 1].t <= T.SWITCH_MS) k--;
      const w = S[k], r = g.ref || w;
      const turned = (other, locked, from) => {
        const dO = Math.abs(now[other] - w[other]), dL = Math.abs(now[locked] - w[locked]);
        if (dO >= T.SWITCH_MIN * step && dO >= T.SWITCH_RATIO * dL) return w[other];
        const rO = Math.abs(now[other] - from[other]), rL = Math.abs(now[locked] - from[locked]);
        if (rO >= step && rO >= T.SWITCH_RATIO * rL) return from[other];
        return null;
      };
      if (g.axis === 'slide') {
        const f = turned('f', 's', r);
        if (f != null) { g.axis = 'fall'; g.af = Math.min(f, now.f); g.as = now.s; g.ref = { s: now.s, f: g.af }; }
      } else {
        const s0 = turned('s', 'f', r);
        if (s0 != null) { g.axis = 'slide'; g.as = s0; g.af = now.f; g.lastDir = 0; g.ref = { s: s0, f: now.f }; }
      }
    }

    slide(g) {
      const now = g.samples[g.samples.length - 1], pos = g.o.slide === 'x' ? 'right' : 'down', neg = g.o.slide === 'x' ? 'left' : 'up';
      for (let guard = 0; guard < 40; guard++) {
        const d = now.s - g.as, dir = Math.sign(d);
        if (!dir) break;
        const need = g.o.step + (g.lastDir && dir !== g.lastDir ? T.REVERSE_HYST * g.o.step : 0);
        if (Math.abs(d) < need) break;
        const name = dir > 0 ? pos : neg;
        const ok = this.emit({ type: 'move', dir: name, fresh: dir !== g.lastDir });
        g.fired = true;
        g.ref = { s: now.s, f: now.f };
        if (!ok) { g.as = now.s; g.lastDir = dir; break; } // into a wall: no overshoot to unwind
        g.as += dir * g.o.step; g.lastDir = dir; // the margin is only to start back: the anchor still moves a step
        g.steps.push({ t: now.t, dir: name });
        if (g.steps.length > 16) g.steps.shift();
      }
    }

    fall(g) {
      const now = g.samples[g.samples.length - 1];
      if (g.fallDead) { g.af = now.f; return; }
      if (now.f < g.af) { g.af = now.f; g.ref = { s: now.s, f: now.f }; return; } // away from the floor: nothing (a way back down starts there)
      for (let guard = 0; guard < 40 && now.f - g.af >= g.o.step; guard++) {
        const ok = this.emit({ type: 'lower' });
        g.fired = true;
        g.ref = { s: now.s, f: now.f };
        if (!ok) { g.af = now.f; break; }
        g.af += g.o.step;
      }
    }
  }

  // ---- the page -----------------------------------------------------------------------------------------------------

  const now = () => (root.performance ? root.performance.now() : Date.now());
  const mq = (q) => !!(root.matchMedia && root.matchMedia(q).matches);

  const Touch = {
    T, stepFor,
    lastAt: -Infinity, // the last touch (or pen) anywhere on the page
    lastType: null, // the last pointer's kind: 'mouse', 'touch', 'pen'
    boards: new Set(), // fingers down on a board
    boardEnd: -Infinity,

    /** A touch device at all (the Touch settings show). */
    available() { return !!(root.navigator && root.navigator.maxTouchPoints > 0); },
    /**
     * Touch alone: fingers, and no mouse, trackpad or pen that hovers — a phone, or a tablet with nothing attached.
     * Never the macOS app. What only a pointer or the Mac's window can do goes (body.touch-only): the Mouse card, the
     * pointer leaving, the window background, rolling the window up. Asked of every pointer the device has, not only
     * its main one, so an iPad with a trackpad keeps them.
     */
    touchOnly() {
      if (L.native && L.native.available) return false;
      return mq('(any-pointer: coarse)') && !mq('(any-pointer: fine)') && !mq('(any-hover: hover)');
    },
    only: false, // touchOnly(), kept up to date
    keysSeen: false, // a hardware key was pressed (an iPad keyboard with no trackpad)
    keyless: false, // touch alone and no key pressed yet: no keyboard settings, key caps or key names
    /**
     * Reads the device again (at start, and whenever a pointer or a keyboard comes or goes): the body's classes, and
     * 'input' on L.bus when either changed, so Settings, the look and the title bar follow at once.
     */
    sync(byKey) {
      const only = this.touchOnly(), keyless = only && !this.keysSeen;
      const body = root.document && root.document.body;
      if (body) { body.classList.toggle('touch-only', only); body.classList.toggle('keyless', keyless); }
      if (only === this.only && keyless === this.keyless) return false;
      this.only = only;
      this.keyless = keyless;
      if (L.bus) L.bus.emit('input', { only, keyless, byKey: !!byKey });
      return true;
    },
    /** What each gesture does, as the settings have it (Tap to turn: Clockwise makes every tap clockwise). */
    help(settings) {
      if (!settings || settings.tapTurn !== 'cw') return TOUCH_HELP;
      return TOUCH_HELP.filter(([k]) => k !== 'Tap left').map(([k, d]) => (k === 'Tap right' ? ['Tap', d] : [k, d]));
    },
    /** A touch within the last ms (default: long enough that a tap's emulated mouse events are past). */
    recent(ms) { return now() - this.lastAt < (ms == null ? T.MOUSE_GUARD : ms); },
    /** The player is using touch now (the last pointer was a finger or a pen). */
    get using() { return this.lastType === 'touch' || this.lastType === 'pen'; },

    boardDown(id) { this.boards.add(id); this.syncToasts(); },
    boardUp(id) {
      if (!this.boards.delete(id)) return;
      if (!this.boards.size) { this.boardEnd = now(); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.syncToasts(), T.TOAST_GUARD + 10); }
      this.syncToasts();
    },
    /** A board is being touched, or was a moment ago: toasts let touches through meanwhile. */
    boardBusy() { return this.boards.size > 0 || now() - this.boardEnd < T.TOAST_GUARD; },
    syncToasts() { if (L.UI && L.UI.syncToasts) L.UI.syncToasts(); },

    /** A tiny buzz where the device has one (not iPhone: Safari has no Vibration API). Never on a refused move. */
    haptic(ms) {
      const app = L.app;
      if (!app || app.settings.haptics === false || !root.navigator || typeof root.navigator.vibrate !== 'function') return;
      try { root.navigator.vibrate(ms); } catch (e) { /* not allowed yet */ }
    },

    /** The first touch wakes the audio (iOS only lets it start from a touch). */
    unlockAudio() {
      const S = L.Sound;
      if (this.audioOk || !S || !S.ensure) return;
      const ctx = S.ensure();
      if (!ctx) return;
      try {
        if (ctx.state !== 'running' && ctx.resume) ctx.resume();
        const b = ctx.createBuffer(1, 1, ctx.sampleRate || 44100), src = ctx.createBufferSource();
        src.buffer = b; src.connect(ctx.destination); src.start(0);
      } catch (e) { /* try again on the next touch */ }
      if (ctx.state === 'running') this.audioOk = true;
    },

    init() {
      if (!root.document || this.inited) return;
      this.inited = true;
      const doc = root.document;
      doc.addEventListener('pointerdown', (e) => {
        this.lastType = e.pointerType || 'mouse';
        if (e.pointerType !== 'mouse') this.lastAt = now();
        doc.documentElement.classList.toggle('touching', this.using);
      }, true);
      const wake = (e) => { if (!e.pointerType || e.pointerType !== 'mouse') this.unlockAudio(); };
      for (const ev of ['touchend', 'pointerup', 'click']) doc.addEventListener(ev, wake, true);
      // No pinch zoom of the page (WebKit's own gesture events); double-tap zoom is off by touch-action in the CSS.
      for (const ev of ['gesturestart', 'gesturechange']) doc.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
      // A long press is a tooltip here, never the system's menu (text fields keep theirs).
      doc.addEventListener('contextmenu', (e) => {
        const t = e.target;
        if (this.recent() && !(t && t.closest && t.closest('input, textarea'))) e.preventDefault();
      });
      // A pointer or a keyboard coming or going (an iPad's trackpad attached, a phone's mouse): read again, live.
      if (root.matchMedia) {
        for (const q of ['(any-pointer: fine)', '(any-pointer: coarse)', '(any-hover: hover)']) {
          const m = root.matchMedia(q);
          if (m && m.addEventListener) m.addEventListener('change', () => this.sync());
          else if (m && m.addListener) m.addListener(() => this.sync());
        }
      }
      // A key pressed outside a text field is a hardware keyboard (the on-screen one types only into fields): its
      // settings, key caps and key names come back, for this visit.
      doc.addEventListener('keydown', (e) => {
        if (this.keysSeen || !e.isTrusted || !e.key || e.key === 'Unidentified' || e.isComposing) return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        this.keysSeen = true;
        this.sync(true); // (the key has yet to do its work: a listener that redraws waits for it, see byKey)
      }, true);
      this.sync();
    },
  };

  /** What each gesture does, for Settings ▸ Gestures (or Keys) and the welcome (Touch.help fits it to the settings). */
  const TOUCH_HELP = [
    ['Drag ← →', 'Move'],
    ['Drag ↓', 'Lower'],
    ['Swipe ↓', 'Drop'],
    ['Swipe ↑', 'Hold'],
    ['Tap right', 'Turn clockwise'],
    ['Tap left', 'Turn counter-clockwise'],
    ['Two-finger tap', 'Turn 180°'],
    ['Tap HOLD', 'Hold, or swap back'],
  ];

  L.TouchGestures = TouchGestures;
  L.Touch = Touch;
  L.TOUCH_HELP = TOUCH_HELP;
  Touch.init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
