// Lull — keys with auto-repeat (DAS/ARR) that ignores the system's own key repeat, plus the key map.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  const KEYMAP = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'up',
    Space: 'drop', KeyX: 'cw', KeyZ: 'ccw', KeyA: 'r180',
    KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold', KeyP: 'pause',
    Backspace: 'undo', KeyU: 'undo', KeyR: 'retry', KeyN: 'next', KeyH: 'hint',
    Digit1: 'item1', Digit2: 'item2', Digit3: 'item3', Digit4: 'item4', Digit5: 'item5', Digit6: 'item6',
    Digit7: 'item7', Digit8: 'item8', Digit9: 'item9', Digit0: 'item10', Minus: 'item11', Equal: 'item12',
  };
  const REPEATS = new Set(['left', 'right', 'down', 'up']);

  const KEY_HELP = [
    ['← →', 'Move'],
    ['↓', 'Lower one row · on the stack: set it'],
    ['Space', 'Hard drop'],
    ['↑ / X', 'Turn clockwise'],
    ['Z', 'Turn counter-clockwise'],
    ['A', 'Turn 180°'],
    ['C / Shift', 'Hold (again: swap back)'],
    ['1 – 5', 'Open an item tray (Free Play); then 1 – 9 uses an item, Esc closes'],
    ['Backspace / U', 'Undo (Puzzles)'],
    ['R', 'Retry puzzle · restart Classic'],
    ['P', 'Pause Classic'],
    ['N', 'Next puzzle'],
    ['⌘1 – ⌘6', 'Switch tabs'],
    ['Mouse: point', 'Slide the piece left and right'],
    ['Left click', 'Drop it straight down (anywhere on the board side)'],
    ['Right click', 'Turn clockwise'],
    ['Wheel', 'Lower one row (never sets the piece)'],
    ['Click HOLD', 'Hold, or swap back'],
  ];

  class Keys {
    constructor(getSettings) {
      this.getSettings = getSettings;
      this.target = null;
      this.held = new Map();
    }

    setTarget(t) { this.target = t; this.held.clear(); }

    down(e) {
      const act = KEYMAP[e.code];
      if (!act || !this.target) return false;
      if (e.metaKey || e.ctrlKey || e.altKey) return false;
      e.preventDefault();
      if (e.repeat) return true; // our own repeat below
      const now = performance.now();
      if (REPEATS.has(act)) {
        if (act === 'left') this.held.delete('right');
        if (act === 'right') this.held.delete('left');
        this.held.set(act, { next: now + this.getSettings().das });
      }
      this.target.action(act, false);
      return true;
    }

    up(e) {
      const act = KEYMAP[e.code];
      if (act) this.held.delete(act);
    }

    releaseAll() { this.held.clear(); }

    update(now) {
      if (!this.target || !this.held.size) return;
      const st = this.getSettings();
      for (const [act, h] of this.held) {
        if (now < h.next) continue;
        const rate = act === 'down' ? st.lowerRepeat : st.arr;
        if (rate <= 0) {
          for (let i = 0; i < 40; i++) if (!this.target.action(act, true)) break;
          h.next = now + 1e9;
        } else {
          let guard = 0;
          while (now >= h.next && guard++ < 20) {
            if (!this.target.action(act, true)) { h.next = now + rate; break; }
            h.next += rate;
          }
          if (now >= h.next) h.next = now + rate;
        }
      }
    }
  }

  L.Keys = Keys;
  L.KEYMAP = KEYMAP;
  L.KEY_HELP = KEY_HELP;
})(typeof globalThis !== 'undefined' ? globalThis : this);
