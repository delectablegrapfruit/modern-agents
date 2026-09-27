// Lull — the three things to do: Free Play, Puzzles, and the Factory.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Game, Board, CELL, Pieces, Puzzles, Factory, Render, UI, ITEMS, ITEM_ORDER, ITEM_GROUPS, Chain, Combos, Luck, fmt, fmtInt, fmtClock, fmtDuration } = L;
  const { h, toast } = UI;
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

  // Items that only change the piece in play, so they can be put back.
  // Items that change the board at once (the rest change the piece in play): one that leaves it empty is a fresh start.
  const ACTS_NOW = new Set(['nuke', 'tornado', 'settle', 'purge', 'flip', 'rewind']);
  const UNDOABLE = new Set(['reroll', 'mirror', 'pebble', 'noodle', 'giant', 'sand', 'magnet', 'phase', 'anvil', 'drill', 'bomb', 'laser', 'blackhole', 'golden', 'order', 'blueprint', 'water', 'steel', 'oil', 'frost', 'torch', 'bolt', 'tnt']);

  function playLockSound(snd, r) {
    if (r.explosions || r.special === 'bomb' || r.special === 'blackhole' || r.special === 'anvil') { snd.play('boom'); if (r.explosions > 1) setTimeout(() => snd.play('boom'), 160); }
    else if (r.special === 'bolt' || r.special === 'torch' || r.burned || r.shattered) { snd.play('drill'); if (r.lines) setTimeout(() => snd.play('clear', r.lines), 150); }
    else if (r.special === 'drill' || r.special === 'laser') { snd.play('drill'); if (r.lines) setTimeout(() => snd.play('quad'), 150); }
    else if (r.special === 'tornado') { snd.play('drill'); setTimeout(() => snd.play(r.lines ? 'quad' : 'lock'), 380); }
    else if (r.perfect) snd.play('perfect');
    else if (r.tspin) snd.play('tspin');
    else if (r.lines >= 4) snd.play('quad');
    else if (r.lines) snd.play('clear', r.lines);
    else snd.play('lock');
    if (r.combo >= 2) setTimeout(() => snd.play('combo', r.combo), 120);
  }

  // ---- shared board controller ------------------------------------------------------------------------------------

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
    }

    get settings() { return this.app.store.state.settings; }
    get reduced() { return this.settings.motion === 'reduced'; }

    attachGame(game, view) {
      this.game = game;
      this.view.attach(game, view);
      this.view.setLook(this.app.look());
      this.view.resize();
      game.on('lock', (r) => { if (r.special !== 'settle' && r.special !== 'tornado') this.setAt = performance.now(); this.onLock(r); });
      game.on('blocked', () => { if (this.quiet) return; this.app.sound.play('blocked'); this.view.bump(this.reduced); });
      game.on('spawn', () => {
        // A new piece meets the pointer where it is.
        if (this.pointer && this.settings.mouse && this.lastInput === 'mouse') setTimeout(() => this.follow(), 0);
      });
      game.on('topout', () => this.onTopout && this.onTopout());
      // A hold swap refused: the held piece has no room anywhere above the stack (nothing changed).
      game.on('noroom', () => toast('No room up there for the held piece', 'bad'));
      game.on('empty', () => this.onEmpty && this.onEmpty());
      game.on('purge', (gone) => this.view.onPurge(gone, this.reduced));
      game.on('nuke', (gone) => { this.view.onNuke(gone, this.reduced); this.app.sound.play('boom'); setTimeout(() => this.app.sound.play('boom'), 180); });
      game.on('flip', (moves) => this.view.onMoves(moves, 'x', this.reduced));
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
      if (this.inverted && INVERT[a]) a = INVERT[a];
      let ok = false;
      const snd = this.app.sound;
      const prevPiece = g.piece, before = g.piece ? g.cellsOf() : null, beforeColor = g.piece ? this.view.colorOf(g.piece.type.color) : null;
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
      }
      this.view.dirty = true;
      // Keys are in charge until the mouse moves again (so arrows work with the pointer resting on the board).
      if (!this.mouseActing) { this.lastInput = 'key'; this.view.pointerCol = null; this.rawCol = null; }
      if (this.afterAction) this.afterAction(a);
      return ok;
    }

    blocked() { return false; }

    /** True while a drop or set would come too soon after the last piece was set (see SET_GRACE_MS). */
    settling(a) {
      if (!this.setAt || performance.now() - this.setAt >= this.setGrace) return false;
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
      c.addEventListener('mousemove', (e) => {
        const p = pos(e), moved = !this.pointer || Math.abs(p[0] - this.pointer[0]) + Math.abs(p[1] - this.pointer[1]) > 1;
        this.pointer = p;
        if (!enabled()) return;
        if (moved) this.lastInput = 'mouse';
        const hold = this.view.onHold(...this.pointer);
        if (hold !== this.view.holdHover) { this.view.holdHover = hold; this.view.dirty = true; }
        if (moved) this.follow();
        c.style.cursor = hold ? 'pointer' : 'default';
      });
      c.addEventListener('mouseleave', () => { this.pointer = null; this.rawCol = null; this.view.pointerCol = null; this.view.holdHover = false; this.view.dirty = true; });
      c.addEventListener('mousedown', (e) => {
        if (!enabled()) return;
        if (performance.now() - this.app.focusedAt < 300) return; // the click that brought the window forward
        const [px, py] = pos(e);
        this.pointer = [px, py];
        if (e.button === 0 && this.view.onHold(px, py)) { mouse(() => this.action('hold')); return; }
        if (e.button === 2) { mouse(() => { this.follow(); this.action('cw'); this.follow(); }); return; }
        if (e.button !== 0) return;
        mouse(() => {
          this.follow();
          // Click grace: a pointer that slipped into the next column just before the click (within CLICK_GRACE_MS)
          // does not count; the piece drops where it had settled.
          if (this.prevCol != null && performance.now() - this.colAt < CLICK_GRACE_MS) this.aimAt(this.prevCol);
          this.action('drop');
        });
      });
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      c.addEventListener('wheel', (e) => {
        if (!enabled()) return;
        e.preventDefault();
        const now = performance.now();
        if (e.deltaY <= 1 || now - this.wheelAt < 45) return;
        this.wheelAt = now;
        // The wheel only ever lowers: it never sets the piece (that is the left button's job).
        mouse(() => { this.follow(); if (this.action('lower', true)) this.app.sound.play('lower'); });
      }, { passive: false });
    }

    /** Slides the piece toward the pointer's column, at the height it floats at. */
    follow() {
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
      // Inverted Controls turn the mouse around too: the piece goes to the mirror of the pointer's column.
      const target = this.inverted ? g.w - 1 - col : col;
      if (col !== cur) { this.prevCol = this.target; this.colAt = performance.now(); this.rawCol = col; this.target = target; }
      this.aimAt(target);
      this.view.pointerCol = col;
    }

    aimAt(col) {
      const g = this.game;
      this.quiet = true;
      for (let i = 0; i < g.w; i++) if (!g.moveToward(col)) break;
      this.quiet = false;
      this.view.dirty = true;
    }

    showCard(content) {
      this.overlay.replaceChildren(h('div', { class: 'card' }, content));
      this.overlay.classList.remove('hidden');
    }
    hideCard() { this.overlay.classList.add('hidden'); this.overlay.replaceChildren(); }
    get cardOpen() { return !this.overlay.classList.contains('hidden'); }

    frame(now, dt) {
      this.view.reducedMotion = this.reduced;
      this.view.fx.update(dt);
      if (this.view.needsFrame()) {
        if (this.view.look && this.view.look.animated && this.reduced && !this.view.dirty && !this.view.fx.active && now - (this.lastAnim || 0) < 250) return;
        this.lastAnim = now;
        if (this.view.look.animated) this.view.setLook(this.app.look());
        this.view.render(now);
      }
    }
  }

  // ---- classic ----------------------------------------------------------------------------------------------------

  /**
   * Plain Tetris: pieces fall, faster every ten lines, with a half-second lock delay (renewed up to 15 times by
   * moving or turning), soft and hard drops, hold, and a game over. Lines still bank. Music optional.
   */
  class ClassicMode extends BoardMode {
    constructor(app) {
      super(app, 'cv-classic', 'classic-overlay');
      this.statusEl = document.getElementById('classic-status');
      this.controlsEl = document.getElementById('classic-controls');
      this.newGame(false);
    }

    get cs() { return this.app.store.state.stats.classic; }

    newGame(start) {
      const game = new Game({ w: 10, h: 20, previewCount: 3, maxHistory: 0, freeHold: false });
      this.attachGame(game, {});
      this.view.showBank = true;
      Object.assign(this, { tetrises: 0, level: 1, lines: 0, score: 0, ms: 0, acc: 0, lockT: 0, resets: 0, over: false, paused: false, started: !!start, counted: false, mult: 1 });
      if (start) { this.hideCard(); L.Music.rewind(); }
      else this.showStart();
      this.renderStatus();
      this.renderControls();
    }

    showStart() {
      this.showCard([
        h('h2', null, 'Classic'),
        h('p', null, 'The one you know: pieces fall, and fall faster every ten lines. Lines you clear still bank as ' + LINE + '.'),
        this.cs.best ? h('p', null, 'Best ', h('span', { class: 'big' }, fmtInt(this.cs.best))) : null,
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => this.newGame(true) }, 'Start ', h('kbd', null, 'Space'))),
      ]);
    }

    blocked() { return this.cardOpen || this.paused || this.over || !this.started; }

    /** Seconds per row at the current level (the guideline curve). */
    gravity() { const l = Math.min(this.level, 20); return Math.max(0.012, Math.pow(0.8 - (l - 1) * 0.007, l - 1)); }

    running() { return this.app.tab === 'classic' && this.started && !this.paused && !this.over && !UI.modalOpen(); }

    frame(now, dt) {
      const g = this.game, p = g.piece;
      if (this.running() && p && !g.fitsAt(p, p.rot, p.x, p.y)) { g.over = true; this.onTopout(); }
      else if (this.running() && p) {
        this.ms += dt * 1000; // the game's own clock: running time only, never paused time
        if (this.ms >= 60000) this.countGame();
        this.acc += dt;
        const iv = this.gravity();
        while (this.acc >= iv) {
          this.acc -= iv;
          if (g.fitsAt(p, p.rot, p.x, p.y - 1)) { p.y--; p.lastRot = false; this.lockT = 0; this.view.dirty = true; } else { this.acc = 0; break; }
        }
        if (g.piece === p && !g.fitsAt(p, p.rot, p.x, p.y - 1)) {
          this.lockT += dt;
          if (this.lockT >= 0.5) { this.lockT = 0; g.lock(); }
        }
      }
      this.syncMusic();
      super.frame(now, dt);
    }

    syncMusic() {
      const st = this.app.settings;
      const want = st.music && this.running() && !document.hidden;
      // Steady tempo; it only quickens as the stack nears the top (and eases back when it comes down).
      const hgt = this.game.board.stackHeight(), danger = Math.max(0, Math.min(1, (hgt - 11) / 6));
      const target = 1 + 0.3 * danger;
      L.Music.tempo += (target - L.Music.tempo) * 0.05;
      if (Math.abs(target - L.Music.tempo) < 0.002) L.Music.tempo = target;
      L.Music.setVolume(st.musicVolume);
      L.Announcer.setVolume(st.announcerVolume != null ? st.announcerVolume : 0.4);
      if (want && !L.Music.playing) L.Music.start();
      else if (!want && L.Music.playing) L.Music.stop();
    }

    /** Moving or turning a resting piece buys it more time (up to 15 times). */
    afterAction(a) {
      const g = this.game, p = g.piece;
      if (!p || !/^(moveL|moveR|rotate|rotateInv|cw|ccw|r180)$/.test(a)) return;
      if (!g.fitsAt(p, p.rot, p.x, p.y - 1) && this.resets < 15) { this.lockT = 0; this.resets++; }
    }

    softDrop(rep) {
      const g = this.game, p = g.piece;
      if (!p) return false;
      if (g.fitsAt(p, p.rot, p.x, p.y - 1)) { p.y--; p.lastRot = false; this.score += 1; this.acc = 0; this.renderStatus(); return true; }
      if (rep) return false;
      g.lock();
      return true;
    }

    modeAction(a) {
      if (a === 'retry') { this.restart(); return true; }
      return false;
    }

    action(act, rep) {
      if (!rep && act === 'drop' && !this.started && !this.over) { this.newGame(true); return true; }
      // A second Space right after the drop that ended the game does not start the next one unseen.
      if (!rep && act === 'drop' && this.over) { if (!this.settling('drop')) this.newGame(true); return true; }
      if (!rep && act === 'pause') { this.togglePause(); return true; }
      return super.action(act, rep);
    }

    togglePause(force) {
      if (!this.started || this.over) return;
      this.paused = force != null ? force : !this.paused;
      if (this.paused) this.showCard([h('h2', null, 'Paused'), h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => this.togglePause(false) }, 'Resume ', h('kbd', null, 'P')))]);
      else this.hideCard();
      this.renderControls();
    }

    restart() {
      this.newGame(true);
    }

    /** A game counts as played once it has run a minute or cleared ten lines (so a quick restart is not a game). */
    countGame() {
      if (this.counted) return;
      this.counted = true;
      this.cs.games++;
      this.app.store.touch();
    }

    onLock(r) {
      const st = this.app.store, S = this.cs;
      const before = this.level;
      this.lines += r.lines;
      if (this.lines >= 10) this.countGame();
      this.level = 1 + Math.floor(this.lines / 10);
      this.score += (r.score || 0) * before + (r.dropDist ? r.dropDist * 2 : 0);
      this.resets = 0; this.lockT = 0; this.acc = 0;
      // The lines Classic banks (never its score) are multiplied by the back-to-back streak: ×0.5 a link, ×10 at twenty.
      this.mult = Chain.mult(Chain.streak(this.game), 'classic');
      if (r.lines) {
        r.mult = this.mult; r.banked = Math.round(r.lines * this.mult);
        st.addLines(r.banked, 'play'); this.app.refreshWallet(true); S.lines += r.lines;
      }
      S.pieces++;
      st.day().pieces++;
      playLockSound(this.app.sound, r);
      this.view.onLock(r, this.reduced);
      const st2 = this.app.settings;
      if (st2.announcer !== false && st2.sound) {
        const say = L.Announcer.phrase(r, this.level > before && this.level);
        if (say) L.Announcer.say(say);
      }
      if (this.level > before) { this.app.sound.play('solve'); const b = this.view.lay.board; this.view.fx.text('LEVEL ' + this.level, b.x + b.w / 2, b.y + b.h * 0.3, '#ffe28a', 20); }
      S.bestLevel = Math.max(S.bestLevel, this.level);
      S.bestLines = Math.max(S.bestLines, this.lines);
      if (r.lines >= 4) { this.tetrises++; st.day().tetris = 1; }
      this.renderStatus();
      st.touch();
      this.app.achieve({ mode: 'classic', r, g: this.game, score: this.score, level: this.level, lines: this.lines, tetrises: this.tetrises, ms: this.ms });
    }

    onTopout() {
      if (this.over) return;
      this.over = true;
      const S = this.cs, best = this.score > S.best;
      S.best = Math.max(S.best, this.score);
      this.app.store.touch();
      this.app.sound.play('fail');
      if (this.app.settings.announcer !== false && this.app.settings.sound) L.Announcer.say(['gameover']);
      this.showCard([
        h('h2', null, best ? 'New best!' : 'Game over'),
        h('p', null, h('span', { class: 'big' }, fmtInt(this.score)), ' points'),
        h('p', null, 'Level ' + this.level + ' · ' + this.lines + ' lines'),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => this.newGame(true) }, 'Play again ', h('kbd', null, 'Space'))),
      ]);
      this.renderControls();
    }

    renderStatus() {
      this.statusEl.replaceChildren(
        h('span', null, 'Score ', h('b', null, fmtInt(this.score))),
        h('span', null, 'Level ', h('b', null, String(this.level))),
        h('span', null, 'Lines ', h('b', null, String(this.lines))),
        h('span', { class: this.mult > 1 ? 'chain opt' : 'slot-off', title: 'Back-to-back tetrises and T-spins multiply the lines you bank (not the score): ×0.5 each, up to ×10' }, 'Bank ', h('b', null, Chain.fmt(this.mult || 1))),
        h('span', null, 'Best ', h('b', null, fmtInt(Math.max(this.cs.best, this.score)))));
    }

    renderControls() {
      const st = this.app.settings;
      this.controlsEl.replaceChildren(
        h('button', { class: 'btn sm' + (st.music ? ' on' : ''), 'data-tip': 'Music for Classic (Korobeiniki, the old folk tune)', onclick: () => { st.music = !st.music; this.app.store.touch(); this.renderControls(); } }, st.music ? '♪ On' : '♪ Off'),
        h('button', { class: 'btn sm', disabled: !this.started || this.over, onclick: () => this.togglePause() }, this.paused ? '► Resume' : '‖ Pause', ' ', h('kbd', null, 'P')),
        h('button', { class: 'btn sm', onclick: () => this.restart() }, '↺ Restart ', h('kbd', null, 'R')));
    }
  }

  // ---- free play ----------------------------------------------------------------------------------------------------

  class PlayMode extends BoardMode {
    constructor(app) {
      super(app, 'cv-play', 'play-overlay');
      this.status = document.getElementById('play-status');
      this.itembar = document.getElementById('itembar');
      let game = null;
      const saved = app.store.state.free;
      if (saved) { try { game = new Game({ saved, previewCount: this.settings.preview }); } catch (e) { game = null; } }
      if (!game) game = new Game({ w: 10, h: 20, previewCount: this.settings.preview });
      game.previewCount = this.settings.preview;
      this.attachGame(game, {});
      this.view.showBank = true;
      this.snapshot();
      this.renderItems();
      this.renderStatus();
      if (game.over) this.onTopout(true);
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

    onLock(r) {
      const st = this.app.store, F = st.state.stats.free, g = this.game;
      this.syncCounters();
      if (this.armed) { this.armed = null; this.renderItems(); }
      // What the lines pay: a quad or T-spin (or 5+ lines) is worth one extra; the multiplier — the back-to-back
      // streak alone, an eighth a link, ×2.5 at most (twenty in a row) — multiplies it; gold triples that, and a
      // combo's boost adds its share. The chain (streak plus combo) is counted beside it, for the record.
      const s = g.s;
      s.chain = Chain.count(g); s.bestChain = Math.max(s.bestChain || 0, s.chain);
      s.mult = Chain.mult(Chain.streak(g)); s.bestMult = Math.max(s.bestMult || 1, s.mult);
      F.bestChain = Math.max(F.bestChain || 0, s.chain); F.bestMult = Math.max(F.bestMult || 1, s.mult);
      r.chain = s.chain;
      g.notePace(r, Date.now());
      if (r.lines) {
        const difficult = r.lines >= 4 || r.tspin || r.mini;
        let pay = (r.lines + (difficult ? 1 : 0)) * s.mult;
        if (r.golden || s.gold > 0) {
          // Gold on the board is spent one clear at a time (a piece gilded in an older version pays once).
          if (!r.golden) s.gold--;
          r.golden = true;
          pay *= Luck.GOLD_X;
          const b = this.view.lay.board;
          this.view.fx.text('GOLDEN ×' + Luck.GOLD_X + (s.gold > 0 ? ' · ' + s.gold + ' left' : ''), b.x + b.w / 2, b.y + b.h * 0.3, '#ffd35a', 18);
          this.app.sound.play('golden');
        }
        if (s.boost && s.boost.left > 0) {
          pay *= s.boost.x;
          r.boost = s.boost.x;
          if (--s.boost.left <= 0) s.boost = null;
        }
        pay = Math.round(pay);
        r.banked = pay; r.mult = s.mult;
        // Gold spent on a chain of 20 or more, built by hand (Midas): counted clear by clear, reset by any other.
        s.goldRun = r.golden && r.hand && (s.hchain || 0) >= 20 ? (s.goldRun || 0) + 1 : 0;
        s.banked = (s.banked || 0) + pay;
      }
      if (r.special !== 'settle' && r.special !== 'tornado') {
        F.pieces++;
        st.day().pieces++;
        const key = Pieces.TYPES[r.type] && Pieces.TYPES[r.type].family === 'tetromino' ? r.type : (Pieces.get(r.type) || { family: 'other' }).family;
        F.byType[key] = (F.byType[key] || 0) + 1;
      }
      if (r.lines) {
        F.lines += r.lines;
        F.clears[Math.min(5, r.lines)]++;
        st.addLines(r.banked, 'play');
        this.app.refreshWallet(true);
      }
      const found = Combos.detect(r, g);
      if (r.tspin) { F.tspins++; F.tspinLines += r.lines; }
      if (r.perfect) F.perfect++;
      if (r.lines >= 4 && (!r.special || r.special === 'golden')) st.day().quad = 1; // set by a piece (a laser or a Tornado is not a quad)
      F.maxCombo = Math.max(F.maxCombo, g.s.maxCombo);
      F.maxB2B = Math.max(F.maxB2B, g.s.maxB2B);
      F.bestScore = Math.max(F.bestScore, g.s.score);
      F.bestLines = Math.max(F.bestLines, g.s.lines);
      const snd = this.app.sound;
      playLockSound(snd, r);
      this.view.onLock(r, this.reduced);
      found.forEach((id, i) => this.combo(id, i));
      this.renderStatus();
      st.touch();
      this.app.achieve({ mode: 'play', r, g });
    }

    /**
     * A combo (js/sandbox.js): its reward — lines, a boost for the next few clears, points — shrinking each time it
     * comes round on one board; a small callout on the board; and, the first time ever, a note that it was found.
     */
    combo(id, i) {
      const st = this.app.store, g = this.game, s = g.s, c = Combos.get(id);
      s.combos = s.combos || {};
      const k = s.combos[id] || 0, rw = Combos.reward(c, k);
      s.combos[id] = k + 1;
      if (rw.lines) { st.addLines(rw.lines, 'combos'); s.banked = (s.banked || 0) + rw.lines; this.app.refreshWallet(true); }
      if (rw.boost) s.boost = { x: Math.max(rw.boost.x, s.boost ? s.boost.x : 1), left: Math.max(rw.boost.clears, s.boost ? s.boost.left : 0) };
      s.score += rw.score;
      const book = st.state.combos = st.state.combos || {}, first = !book[id];
      book[id] = book[id] || { n: 0, lines: 0, first: Date.now() };
      book[id].n++; book[id].lines += rw.lines;
      const bits = [rw.lines ? '+' + rw.lines + ' ' + LINE : null, rw.boost ? Chain.fmt(rw.boost.x) + ' for ' + rw.boost.clears + ' clears' : null, !rw.lines && !rw.boost ? '+' + fmtInt(rw.score) + ' points' : null].filter(Boolean);
      this.view.callout(c.name, bits.join(' · '), i, this.reduced);
      setTimeout(() => this.app.sound.play('combo', 3 + Math.min(4, i * 2)), 260 + i * 180);
      if (first) toast('New combo: ' + c.name, 'good', 2200);
    }

    onTopout(silent) {
      const g = this.game, F = this.app.store.state.stats.free;
      if (!silent) { F.topouts++; this.app.store.touch(); }
      this.showCard([
        h('h2', null, 'Board full'),
        h('p', null, 'No room for the next piece. Nothing is lost — the lines you cleared are banked.'),
        this.boardSummary(g.s),
        h('div', { class: 'row' },
          g.history.length && this.app.store.state.inventory.rewind ? h('button', { class: 'btn', onclick: () => { this.hideCard(); this.useItem('rewind'); } }, '↶ Rewind (have ' + this.app.store.state.inventory.rewind + ')') : null,
          h('button', { class: 'btn primary', onclick: () => this.newBoard('full') }, 'New board')),
      ]);
    }

    /** Asks before retiring a board, showing its whole life so far. */
    askRetire() {
      if (this.game.board.isEmpty() && !this.game.s.pieces) return this.newBoard('manual');
      this.showCard([
        h('h2', null, 'Retire this board?'),
        h('p', null, 'Its lines stay banked. Here is how it went:'),
        this.boardSummary(this.game.s),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => this.hideCard() }, 'Keep playing'),
          h('button', { class: 'btn primary', onclick: () => this.newBoard('manual') }, 'Retire and start fresh')),
      ]);
    }

    /** A board's lifelong numbers, as a grid of small tiles. */
    boardSummary(s) {
      const life = s.startedAt ? Date.now() - s.startedAt : 0;
      const items = Object.entries(s.items || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
      const nItems = items.reduce((a, [, n]) => a + n, 0);
      const ppm = s.playMs > 30000 ? (s.pieces / (s.playMs / 60000)).toFixed(1) : '—';
      const tile = (v, l) => h('div', { class: 'bs' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
      return h('div', { class: 'board-sum' },
        tile(life ? fmtDuration(life) : '—', 'Lifetime'), tile(s.playMs ? fmtDuration(s.playMs) : '—', 'Played'), tile(fmtInt(s.pieces), 'Pieces'),
        tile(fmtInt(s.lines), 'Lines'), tile(fmtInt(s.score), 'Score'), tile(ppm, 'Pieces / min'),
        tile(fmtInt((s.clears && s.clears[4]) || 0), 'Quads'), tile(fmtInt(s.tspins || 0), 'T-spins'), tile(fmtInt(s.perfect || 0), 'Perfect clears'),
        tile(fmtInt(Math.max(0, s.maxCombo || 0)), 'Best combo'), tile(fmtInt(Math.max(0, s.maxB2B || 0)), 'Best back-to-back'), tile(fmtInt(s.bestChain || 0) + ' · ' + fmtInt(s.bestHChain || 0), 'Best chain · by hand'),
        tile(fmtInt(s.banked || 0) + ' ' + LINE, 'Lines banked'), tile(Chain.fmt(s.bestMult || 1), 'Best multiplier'), tile(fmtInt(Object.values(s.combos || {}).reduce((a, b) => a + b, 0)), 'Combos'),
        h('div', { class: 'bs wide' }, h('div', { class: 'v' }, nItems ? fmtInt(nItems) + ' used' : 'none'), h('div', { class: 'l' }, 'Power-ups' + (items.length ? ': ' + items.slice(0, 6).map(([id, n]) => ITEMS[id].name + (n > 1 ? ' ×' + n : '')).join(', ') : ''))));
    }

    newBoard(reason) {
      this.hideCard();
      const s = this.game.s, F = this.app.store.state.stats.free;
      if (s.pieces) {
        F.boardLog = F.boardLog || [];
        F.boardLog.unshift({ at: Date.now(), reason: reason || 'manual', life: s.startedAt ? Date.now() - s.startedAt : 0, playMs: s.playMs || 0, pieces: s.pieces, lines: s.lines, score: s.score, quads: (s.clears && s.clears[4]) || 0, tspins: s.tspins || 0, perfect: s.perfect || 0, maxCombo: Math.max(0, s.maxCombo || 0), chain: s.bestChain || 0, items: Object.values(s.items || {}).reduce((a, b) => a + b, 0) });
        if (F.boardLog.length > 30) F.boardLog.length = 30;
      }
      this.game.resetBoard();
      this.app.store.state.stats.free.boards++;
      this.snapshot();
      this.view.fx.clear();
      this.view.dirty = true;
      this.renderStatus();
      this.app.store.touch();
    }

    blocked() { return this.cardOpen; }

    renderStatus() {
      const s = this.game.s;
      this.status.replaceChildren(...[
        h('span', null, 'Lines ', h('b', null, fmtInt(s.lines))),
        h('span', null, 'Score ', h('b', null, fmtInt(s.score))),
        h('span', { class: s.chain > 1 ? 'chain' : 'slot-off', title: 'Chain: back-to-back quads and T-spins plus the combo. The multiplier comes from the back-to-back streak alone: an eighth a link, up to ×2.5 at twenty. By hand (for achievements): chain ' + (s.hchain || 0) + (s.hand === false ? ', stack not built by hand since it was last empty' : ', stack built by hand') }, 'Chain ', h('b', null, String(s.chain || 0)), ' · ', h('b', null, Chain.fmt(s.mult || 1))),
        s.gold > 0 ? h('span', { class: 'opt gold', title: 'Gold: your next clears pay ×' + Luck.GOLD_X }, 'Gold ', h('b', null, String(s.gold))) :
          s.boost ? h('span', { class: 'opt boost', title: 'A combo\'s boost: your next clears pay more' }, 'Boost ', h('b', null, Chain.fmt(s.boost.x) + ' · ' + s.boost.left)) :
            h('span', { class: 'opt' }, 'Pieces ', h('b', null, fmtInt(s.pieces))),
        h('button', { class: 'btn sm', title: 'Retire this board and start fresh', onclick: () => this.askRetire() }, '↺', h('span', { class: 'lbl' }, ' New board'))].filter(Boolean));
    }

    /**
     * The item bar: one button per type. A button opens its tray above the bar; the tray holds the type's items
     * (hover one for what it does). Keys: 1–5 open a tray, then 1–9 use an item in it; Esc closes it.
     */
    renderItems() {
      const inv = this.app.store.state.inventory;
      const armedId = this.armed && this.armed.piece === this.game.piece ? this.armed.id : null;
      this.itembar.replaceChildren(...ITEM_GROUPS.map((g, gi) => {
        const ids = ITEM_ORDER.filter((id) => ITEMS[id].group === g.id);
        const have = ids.reduce((a, id) => a + (inv[id] || 0), 0);
        const open = this.tray === g.id, on = armedId && ids.includes(armedId);
        return h('button', {
          class: 'group-btn' + (open ? ' open' : '') + (on ? ' on' : ''), 'data-group': g.id,
          'data-tip-title': g.icon + '  ' + g.name, 'data-tip': g.desc, 'data-tip-foot': ids.length + ' items · you have ' + have + ' · key ' + (gi + 1),
          onclick: () => this.openTray(open ? null : g.id),
        }, h('span', { class: 'gi' }, g.icon), h('span', { class: 'gl' }, g.short || g.name), h('span', { class: 'k' }, String(gi + 1)), have ? h('span', { class: 'n' }, String(have)) : null);
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
      const inv = this.app.store.state.inventory;
      const ids = ITEM_ORDER.filter((id) => ITEMS[id].group === g.id);
      el.style.setProperty('--tray-at', ITEM_GROUPS.indexOf(g) / (ITEM_GROUPS.length - 1));
      el.replaceChildren(
        h('div', { class: 'tray-head' }, h('b', null, g.icon + ' ' + g.name), h('span', null, g.desc), h('button', { class: 'icon-btn', title: 'Close (Esc)', html: UI.ICONS.close, onclick: () => this.openTray(null) })),
        h('div', { class: 'tray-items' }, ids.map((id, i) => {
          const it = ITEMS[id], n = inv[id] || 0;
          const on = this.armed && this.armed.id === id && this.armed.piece === this.game.piece;
          return h('button', {
            class: 'item-btn' + (n || on ? '' : ' empty') + (on ? ' on' : ''), 'data-item': id,
            'data-tip-title': it.icon + '  ' + it.name, 'data-tip': it.desc,
            'data-tip-foot': on ? 'In use — press again to put it back' : (n ? 'You have ' + n + ' · ' : 'None left · buy for ' + LINE + it.price + ' · ') + 'key ' + (i + 1),
            onclick: () => this.useItem(id),
          }, h('span', { class: 'ii' }, it.icon), h('span', { class: 'il' }, it.name), h('span', { class: 'k' }, String(i + 1)), h('span', { class: 'n' }, n ? String(n) : LINE + it.price));
        })));
    }

    modeAction(a) {
      const m = /^item(\d+)$/.exec(a);
      if (m) {
        const k = Number(m[1]);
        if (!this.tray) { const g = ITEM_GROUPS[k - 1]; if (g) this.openTray(g.id); return true; }
        const ids = ITEM_ORDER.filter((id) => ITEMS[id].group === this.tray);
        if (ids[k - 1]) this.useItem(ids[k - 1]);
        return true;
      }
      return false;
    }

    /** Esc closes an open tray first (the app's own Esc handling comes after). */
    closeTray() { if (!this.tray) return false; this.openTray(null); return true; }

    useItem(id) {
      const st = this.app.store, it = ITEMS[id];
      if (this.cardOpen && id !== 'rewind') return;
      if (!this.game.piece && id !== 'rewind') { toast('No piece in play', 'bad'); return; }
      if (this.armed && this.armed.id === id && this.armed.piece === this.game.piece) { this.disarm(); return; }
      if (!st.state.inventory[id]) {
        if (st.state.lines < it.price) { toast(it.name + ' costs ' + fmtInt(it.price) + ' lines — you have ' + fmtInt(st.state.lines), 'bad'); this.app.sound.play('error'); return; }
        UI.confirm('Buy and use ' + it.name + '?', it.desc + ' Costs ' + fmtInt(it.price) + ' lines.', 'Buy & use', () => {
          if (st.buyItem(id)) { this.app.refreshWallet(); this.apply(id); }
        });
        return;
      }
      this.apply(id);
    }

    /**
     * Items that change the piece in play can be taken back: press the item again (before the piece is set) and the
     * old piece returns and the item goes back in the bag.
     */
    disarm() {
      const a = this.armed, g = this.game, st = this.app.store;
      this.armed = null;
      if (!a || g.piece !== a.piece) return;
      if (a.gold) g.s.gold = Math.max(0, (g.s.gold || 0) - a.gold);
      else if (!g.replacePiece(a.prev)) { toast('No room up there to put the old piece back', 'bad'); return; }
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
      this.view.dirty = true;
    }

    apply(id) {
      const g = this.game, st = this.app.store;
      const done = () => {
        const hand = g.handState();
        arm(hand);
        this.tray = null;
        g.s.items = g.s.items || {};
        g.s.items[id] = (g.s.items[id] || 0) + 1;
        g.s.clean = 0; g.s.cleanLines = 0; // Bare Hands starts again
        // Anything that touches the pieces or the board ends play by hand (achievements); Luck never touches either.
        if (ITEMS[id].group !== 'luck') g.noteItem(ACTS_NOW.has(id));
        st.useItem(id);
        this.app.sound.play('item');
        this.renderItems();
        this.renderStatus();
        this.view.dirty = true;
        toast(ITEMS[id].icon + ' ' + ITEMS[id].name, 'good', 1400);
      };
      const cur = g.piece;
      const prev = cur ? Object.assign({}, cur.entry, { special: cur.special || null }) : null;
      const arm = (hand) => { if (UNDOABLE.has(id) && g.piece) this.armed = { id, piece: g.piece, prev, hand, gold: id === 'golden' ? Luck.GOLD_CLEARS : 0 }; this.view.itemFx(id, g.piece, this.reduced); };
      switch (id) {
        case 'reroll': {
          const opts = Pieces.TETROMINOES.filter((t) => t !== (cur && cur.type.id));
          if (g.replacePiece({ id: opts[Math.floor(Math.random() * opts.length)] })) done(); else toast('No room up there for a new piece', 'bad');
          break;
        }
        case 'mirror': if (g.replacePiece({ id: Pieces.mirrorOf(cur.type).id, special: cur.special })) done(); else toast('No room up there for its mirror', 'bad'); break;
        case 'pebble': if (g.replacePiece({ id: 'M1' })) done(); else toast('No room up there for a pebble', 'bad'); break;
        case 'noodle': if (g.replacePiece({ id: Pieces.customType([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]).id })) done(); else toast('No room for a noodle up there', 'bad'); break;
        case 'giant': {
          const base = Pieces.TYPES[cur.type.id] && Pieces.TYPES[cur.type.id].family === 'tetromino' ? cur.type.id : null;
          if (!base) { toast('Giant works on the seven standard pieces', 'bad'); return; }
          if (g.replacePiece({ id: Pieces.bigOf(base).id, special: cur.special })) done(); else toast('Too big to fit up there', 'bad');
          break;
        }
        case 'nuke': if (g.nuke()) done(); else toast('The board is already empty', 'bad'); break;
        case 'tornado': if (g.tornado()) done(); else toast('The board is already empty', 'bad'); break;
        case 'flip': if (g.flipWorld()) done(); else toast(g.board.isEmpty() ? 'The board is empty' : 'The piece would not fit — move it first', 'bad'); break;
        case 'jackpot': g.s.items = g.s.items || {}; g.s.items.jackpot = (g.s.items.jackpot || 0) + 1; g.s.clean = 0; g.s.cleanLines = 0; st.useItem(id); this.tray = null; this.jackpot(); this.renderItems(); break;
        case 'golden':
          // Gold stays on the board for the next five clears, whatever piece makes them.
          g.s.gold = (g.s.gold || 0) + Luck.GOLD_CLEARS;
          done();
          break;
        case 'sand': case 'phase': case 'drill': case 'bomb': case 'anvil': case 'magnet': case 'laser': case 'blackhole':
        case 'water': case 'steel': case 'oil': case 'frost': case 'torch': case 'bolt': case 'tnt':
          if (g.setSpecial(id)) done(); else toast('No room for that here', 'bad');
          break;
        case 'rewind': {
          const banked0 = g.s.banked || 0;
          const res = g.undo();
          if (!res) { toast('Nothing to rewind', 'bad'); return; }
          const refund = Math.max(0, banked0 - (g.s.banked || 0));
          if (refund) st.addLines(-refund, 'rewind');
          if (res.lines) {
            st.state.stats.free.lines = Math.max(0, st.state.stats.free.lines - res.lines);
            this.app.refreshWallet();
          }
          this.hideCard();
          this.snapshot();
          done();
          break;
        }
        case 'order':
          UI.openOrderSlip(this.app, (pick) => { if (!pick) return; if (this.game.replacePiece({ id: pick })) done(); else toast('No room up there for that piece', 'bad'); });
          break;
        case 'settle': {
          const r = g.settle();
          if (r) done();
          break;
        }
        case 'purge': {
          const gone = g.purge();
          if (!gone || !gone.length) { toast('No blocks in that colour', 'bad'); return; }
          done();
          break;
        }
        case 'blueprint':
          UI.openBlueprint(this.app, (cells) => {
            if (!cells) return;
            const t = Pieces.customType(cells);
            if (this.game.replacePiece({ id: t.id })) done(); else toast('It does not fit up there', 'bad');
          });
          break;
        default: break;
      }
    }

    /**
     * Jackpot: three reels, a real gamble (the pay table and its odds are in js/sandbox.js, and on the machine). What it
     * pays — lines, or Demolition items — is decided before the reels spin and handed over when they stop (or when the
     * window is closed early).
     */
    jackpot() {
      const st = this.app.store, reels = [0, 1, 2].map(() => Luck.reel(Math.random())), pay = Luck.jackpotPay(reels);
      const demo = ITEM_ORDER.filter((id) => ITEMS[id].group === 'boom');
      const won = Array.from({ length: pay.items }, () => demo[Math.floor(Math.random() * demo.length)]);
      const icon = (id) => Luck.REELS.find((r) => r.id === id).icon;
      const boxes = reels.map(() => h('div', { class: 'reel' }, '?'));
      const note = h('p', { class: 'jp-note' }, 'Spinning…');
      const table = h('div', { class: 'jp-pays' }, Luck.PAYS.map((p) => h('div', { class: 'jp-row' }, h('span', { class: 'jp-sym' }, p.label), h('span', null, p.lines ? fmtInt(p.lines) + ' ' + LINE : p.items + ' Demolition item' + (p.items > 1 ? 's' : '')))),
        h('div', { class: 'jp-row jp-foot' }, h('span', null, 'Anything else pays nothing. Over many pulls it pays back about nine tenths.')));
      UI.openModal({ title: 'Jackpot', width: 360, cls: 'modal-jackpot', body: h('div', null, h('div', { class: 'reels' }, boxes), note, table), buttons: [{ label: 'Collect', kind: 'primary' }], onClose: () => { clearInterval(timer); finish(); } });
      const S = st.state.stats.items;
      let t = 0, stopped = 0, done = false;
      const finish = () => {
        if (done) return;
        done = true;
        boxes.forEach((b, i) => { b.textContent = icon(reels[i]); b.classList.add('stop'); });
        if (pay.lines) { st.addLines(pay.lines, 'luck'); this.app.refreshWallet(true); }
        for (const id of won) st.grantItem(id, 1);
        S.jackpot = S.jackpot || { pulls: 0, lines: 0, items: 0, best: 0 };
        S.jackpot.pulls++; S.jackpot.lines += pay.lines; S.jackpot.items += won.length; S.jackpot.best = Math.max(S.jackpot.best, pay.lines);
        note.textContent = !pay.label ? 'Nothing this time.' : pay.label + ' — ' + (pay.lines ? fmtInt(pay.lines) + ' lines' : won.map((w) => ITEMS[w].name).join(', ')) + '!';
        note.classList.toggle('won', !!pay.label);
        this.app.sound.play(pay.label ? 'golden' : 'lock');
        st.touch();
        this.renderItems();
      };
      const timer = setInterval(() => {
        t++;
        boxes.forEach((b, i) => { if (i >= stopped) b.textContent = Luck.REELS[(t * 3 + i * 2) % Luck.REELS.length].icon; });
        if (t % 6 === 0) this.app.sound.play('move');
        if (t === 14 + stopped * 8) {
          const b = boxes[stopped];
          b.textContent = icon(reels[stopped]); b.classList.add('stop');
          if (pay.label && reels[stopped] !== 'blank') b.classList.add('win');
          this.app.sound.play('combo', 3 + stopped * 2);
          stopped++;
          if (stopped === 3) { clearInterval(timer); finish(); }
        }
      }, 60);
    }

    save() { this.app.store.state.free = this.game.toJSON(); }
  }

  // ---- puzzles ------------------------------------------------------------------------------------------------------

  // Small line icons for the Puzzles tab: every wildcard gets its own (Hold and Wraparound share a glyph otherwise).
  const svg = (d, fill) => '<svg viewBox="0 0 16 16" fill="' + (fill ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  const PZ_ICONS = {
    big: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M8 2.5v11M2.5 8h11"/>'),
    odd: svg('<path d="M6 2.5h4V6h3.5v4H10v3.5H6V10H2.5V6H6z"/>'),
    wrap: svg('<path d="M2 3v10M14 3v10M4.5 8h7M9.5 6l2 2-2 2"/>'),
    rigid: svg('<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"/>'),
    heavy: svg('<path d="M8 2.5v8M4.8 7.5L8 10.7l3.2-3.2M3 13.5h10"/>'),
    invert: svg('<path d="M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.5M6 8l-2.5 2.5L6 13"/>'),
    flip: svg('<path d="M5.5 13V3M3 5.5L5.5 3 8 5.5M10.5 3v10M8 10.5l2.5 2.5 2.5-2.5"/>'),
    side: svg('<path d="M12.5 3v5a3 3 0 0 1-3 3H3.5M6.5 8l-3 3 3 3"/>'),
    fog: svg('<path d="M2.5 5c1.4-1 2.6-1 4 0s2.6 1 4 0 2.1-.8 3 0M2.5 8.5c1.4-1 2.6-1 4 0s2.6 1 4 0 2.1-.8 3 0M2.5 12c1.4-1 2.6-1 4 0s2.6 1 4 0 2.1-.8 3 0"/>'),
    vanish: svg('<rect x="3" y="3" width="10" height="10" rx="1.5" stroke-dasharray="2.2 2"/>'),
    blind: svg('<path d="M1.8 8s2.3-4 6.2-4 6.2 4 6.2 4-2.3 4-6.2 4-6.2-4-6.2-4z"/><circle cx="8" cy="8" r="1.7"/><path d="M3 13L13 3"/>'),
    hold: svg('<rect x="2.5" y="6.5" width="11" height="7" rx="1.5"/><path d="M8 1.5v6M5.6 5.4L8 7.8l2.4-2.4"/>'),
    spin: svg('<path d="M3.5 8A4.5 4.5 0 1 0 8 3.5H6.3"/><path d="M8.3 1.5l-2 2 2 2"/>'),
    mono: svg('<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor"/>'),
    clear: svg('<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2" fill="currentColor"/>'),
    lines: svg('<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>'),
    gems: svg('<path d="M8 2.2l4.8 5.8L8 13.8 3.2 8z" fill="currentColor" stroke="none"/>'),
    daily: svg('<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.8h11M5.5 2v3M10.5 2v3"/>'),
    seed: svg('<path d="M6.3 2.5L5 13.5M11.3 2.5L10 13.5M3 6h10.5M2.5 10H13"/>'),
    history: svg('<path d="M2.8 8a5.2 5.2 0 1 0 1.5-3.7"/><path d="M2.6 2.4v2.9h2.9M8 5.2V8l2 1.4"/>'),
    copy: svg('<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-.2a.9.9 0 0 0-.9-.8H3.4a.9.9 0 0 0-.9.9v6.2a.9.9 0 0 0 .9.9h.1"/>'),
    hint: svg('<path d="M6.2 12h3.6M6.7 14h2.6M8 2a4 4 0 0 0-2.4 7.2c.5.4.8.9.8 1.4v.4h3.2v-.4c0-.5.3-1 .8-1.4A4 4 0 0 0 8 2z"/>'),
    check: svg('<circle cx="8" cy="8" r="6"/><path d="M5.3 8.2l1.9 1.9 3.6-3.8"/>'),
  };
  const icon = (k, cls) => h('span', { class: 'pz-i' + (cls ? ' ' + cls : ''), html: PZ_ICONS[k] || '' });
  // Short names for when a card is narrow; the full name is always in the tooltip.
  const MOD_SHORT = { big: 'Big', odd: 'Odd', wrap: 'Wrap', invert: 'Inverted', flip: 'Flipped', blind: 'Blind', vanish: 'Vanish', spin: 'Both Ways', mono: 'Mono' };
  // The keys a wildcard is about, shown under its description.
  const MOD_KEYS = { spin: 'Z turns counter-clockwise · A turns 180°', hold: 'C or Shift holds · click HOLD', heavy: 'Space drops', invert: 'Arrows and turns are mirrored', side: 'Arrows follow the screen', flip: 'Arrows follow the screen' };
  /** The keys line for a wildcard in a puzzle: Inverted Controls swap the turns, so Z turns clockwise there. */
  const modKeys = (m, mods) => (m === 'spin' && mods.includes('invert') ? 'Z turns clockwise here (controls are inverted) · A turns 180°' : MOD_KEYS[m] || null);
  const DIFF_COST = { E: 10, M: 20, H: 35 };
  /** "2026-09-26" → "Sat, Sep 26" (with the year when it is not this one). */
  function dayLabel(key) {
    if (!/^\d{4}-\d\d-\d\d$/.test(key)) return String(key);
    const [y, m, d] = key.split('-').map(Number), dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: y === new Date().getFullYear() ? undefined : 'numeric' });
  }

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
      this.el.seed.addEventListener('click', () => { if (this.puzzle) { UI.copyText(this.puzzle.seed); toast('Seed ' + this.puzzle.seed + ' copied', 'good'); } });
      // Wildcard chips explain themselves on hover (the tooltip) and on a click or tap (a small card that stays).
      this.el.mods.addEventListener('click', (e) => { const b = e.target.closest('.mod'); if (b) this.togglePop(b); });
      document.addEventListener('mousedown', (e) => { if (this.pop && !e.target.closest('.mod, .puz-pop')) this.closePop(); }, true);
      document.addEventListener('keydown', () => this.closePop(), true);
      // Chips shorten, then drop to icons, rather than wrap: the card keeps one height whatever the puzzle.
      // The bar does the same with its Daily / Seed / History labels: words when they fit, icons alone when not.
      if (root.ResizeObserver) {
        new ResizeObserver(() => { this.closePop(); this.fitMods(); }).observe(this.el.mods);
        new ResizeObserver(() => this.fitNav()).observe(this.el.daily.closest('.puz-bar'));
      }
      this.renderDiff();
      this.renderNav();
    }

    get ps() { return this.app.store.state.puzzle; }
    get pstats() { return this.app.store.state.stats.puzzle; }
    /** Counter-clockwise puzzles (off by default): new puzzles come from the both-ways seeds. */
    get spin() { return !!this.app.settings.ccwPuzzles; }

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
        if (!v) { status.replaceChildren('E-, M- or H-, then seven letters or digits'); return; }
        if (!p) { status.replaceChildren('Seeds look like E-, M- or H- (or ES-, MS-, HS-) and seven letters or digits'); return; }
        const d = Puzzles.DIFFS[p.diff], dd = Puzzles.dailyDateOf(p.seed);
        status.replaceChildren(h('span', { class: 'dot', style: { background: d.color } }), d.name + (p.spin ? ' · both ways' : '') + (this.ps.solved[p.seed] ? ' · solved' : '') + (dd && dd.key ? ' · the Daily for ' + dayLabel(dd.key) : ''));
      };
      input.addEventListener('input', read);
      read();
      const diffName = Puzzles.DIFFS[this.ps.diff].name;
      const body = h('div', { class: 'seed-modal' },
        h('p', null, 'The same seed is the same puzzle for everyone — share one, or come back to it.'),
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
      if (this.puzzle && !this.done && this.game && (this.game.s.pieces || (this.ps.current && this.ps.current.attempts > 1)) && !this.ps.solved[this.puzzle.seed]) this.pstats.firstRun = 0;
      this.puzzle = p;
      this.meta = { number: meta.number || null, daily: meta.daily || null };
      this.ps.diff = p.diff;
      const same = resume && this.ps.current && this.ps.current.seed === seed;
      this.ps.current = { seed, number: this.meta.number, daily: this.meta.daily, attempts: same ? this.ps.current.attempts || 0 : 0, ms: same ? this.ps.current.ms || 0 : 0, hint: same ? !!this.ps.current.hint : false, undos: same ? this.ps.current.undos || 0 : 0 };
      if (!same) this.record({ seed, diff: p.diff, title: p.title, number: this.meta.number, daily: this.meta.daily, mods: p.mods.slice(), at: Date.now(), attempts: 0, solved: !!this.ps.solved[seed], ms: 0 });
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

    /** A fresh attempt, or (resume) the one a reload or relaunch interrupted, which is not counted again. */
    start(resume) {
      const p = this.puzzle;
      const has = (m) => p.mods.includes(m);
      const game = new Game({
        board: Board.fromArray(p.w, p.h, p.cells, { wrap: p.wrap }),
        queue: p.pieces,
        mods: { noRotate: has('rigid'), heavy: has('heavy'), noHold: !has('hold'), vanish: has('vanish') },
        previewCount: 8, maxHistory: 80,
      });
      this.inverted = has('invert');
      this.lines = 0;
      this.done = false;
      this.failedShown = false;
      this.startedAt = performance.now();
      // A solved puzzle has no current entry any more: Retry or Replay starts a fresh one.
      if (!this.ps.current) this.ps.current = { seed: p.seed, number: this.meta.number, daily: this.meta.daily, attempts: 0, ms: 0 };
      if (!resume || !this.ps.current.attempts) {
        this.ps.current.attempts++;
        const hEntry = this.historyEntry();
        if (hEntry) { hEntry.attempts++; hEntry.at = Date.now(); }
      }
      this.attachGame(game, { rot: has('side') ? 90 : has('flip') ? 180 : 0, fog: has('fog'), mono: has('mono'), blind: has('blind'), vanish: has('vanish'), wrap: p.wrap });
      this.hideCard();
      this.updateHint();
      this.renderGoal();
      this.renderActions();
    }

    blocked() { return this.cardOpen; }

    onLock(r) {
      this.lines += r.lines;
      this.view.onLock(r, this.reduced);
      const snd = this.app.sound, g = this.game;
      const met = Puzzles.goalMet(this.puzzle, g.board, this.lines);
      // The last piece set without meeting the goal: that is a failure, so no cheerful clear (the fail sound follows).
      const last = !met && !g.queue.length && !g.hold;
      if (last) snd.play('lock'); else playLockSound(snd, r);
      if (met) this.solved();
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
    }

    solved() {
      if (this.done) return;
      this.done = true;
      const p = this.puzzle, st = this.app.store, S = this.pstats[p.diff], cur = this.ps.current;
      const ms = Math.round(this.elapsed());
      const first = !this.ps.solved[p.seed];
      let reward = 0;
      if (first) {
        reward = Puzzles.DIFFS[p.diff].reward;
        if (cur.attempts === 1) reward = Math.round(reward * 1.5);
        if (this.meta.daily) reward *= 2;
        if (cur.hint) reward = Math.ceil(reward / 2);
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
      this.ps.current = null;
      st.touch();
      this.app.sound.play('solve');
      // A quiet card: what it took and what it paid, then the way on. The board stays visible around it.
      const tile = (v, l, cls) => h('div', { class: 'bs' + (cls ? ' ' + cls : '') }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
      this.showCard(h('div', { class: 'puz-result solved' },
        icon('check', 'ring'),
        h('h2', null, 'Solved'),
        h('p', null, p.title + ' · ' + this.label()),
        h('div', { class: 'board-sum' },
          tile(fmtClock(ms), 'time'),
          tile(cur.attempts === 1 ? 'First' : String(cur.attempts), cur.attempts === 1 ? 'try' : 'tries'),
          reward ? tile(h('span', null, '+' + reward, ' ', h('span', { class: 'gem' }, LINE)), cur.hint ? 'lines · hints halve it' : this.meta.daily ? 'lines · Daily ×2' : 'lines', 'pay')
            : tile('—', 'solved before')),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => this.retry() }, 'Replay'),
          h('button', { class: 'btn primary', onclick: () => this.next() }, 'Next puzzle ', h('kbd', null, 'N')))));
      this.renderHead();
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
      if (!this.ps.solved[this.puzzle.seed]) this.pstats.firstRun = 0;
      this.pstats[this.puzzle.diff].fails++;
      this.app.store.touch();
      this.app.sound.play('fail');
      // Not a loss, just a board that did not work out: say how close it came and offer the two ways back.
      const prog = this.progress();
      this.showCard(h('div', { class: 'puz-result failed' },
        this.ring(prog.frac),
        h('h2', null, why),
        h('p', null, Puzzles.goalText(this.puzzle) + (prog.text ? ' — ' + prog.text : ' — not yet') + '.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => this.undo() }, '↶ Undo ', h('kbd', null, '⌫')),
          h('button', { class: 'btn primary', onclick: () => this.retry() }, '↺ Retry ', h('kbd', null, 'R')))));
    }

    retry() { this.hideCard(); this.start(); this.renderHead(); }

    undo() {
      if (this.done) return false;
      const res = this.game.undo();
      if (!res) return false;
      if (this.ps.current) this.ps.current.undos = (this.ps.current.undos || 0) + 1;
      this.lines -= res.lines;
      this.failedShown = false;
      this.hideCard();
      this.updateHint();
      this.renderGoal();
      this.renderActions();
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
      if (i >= 0) { this.ps.saved.splice(i, 1); toast('Seed ' + seed + ' removed from Saved', null, 1400); }
      else {
        this.ps.saved.unshift({ seed, diff: info.diff, title: info.title, mods: info.mods || [], number: info.number || null, daily: info.daily || null, at: Date.now() });
        toast('Seed ' + seed + ' saved', 'good', 1400);
      }
      this.app.store.touch();
      this.app.sound.play('hold');
      this.renderSaveBtn();
    }

    renderSaveBtn() {
      const on = this.puzzle && this.isSaved(this.puzzle.seed);
      this.el.save.textContent = on ? '★' : '☆';
      this.el.save.classList.toggle('on', !!on);
      this.el.save.title = on ? 'Saved — click to remove' : 'Save this seed (find it under History ▸ Saved)';
    }

    openHistory(start) {
      let filter = start || 'all', handle = null;
      const list = h('div', { class: 'hist' });
      const counts = h('span', { class: 'hist-sum' });
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
            h('button', { class: 'seedchip', title: 'Copy seed', onclick: () => { UI.copyText(e.seed); toast('Seed ' + e.seed + ' copied', 'good', 1400); } }, e.seed),
            h('button', { class: 'icon-btn star' + (saved ? ' on' : ''), title: saved ? 'Unsave' : 'Save this seed', onclick: () => { this.toggleSaved(e.seed, e); draw(); } }, saved ? '★' : '☆'),
            h('button', { class: 'icon-btn play', title: current ? 'In play' : e.solved ? 'Replay' : 'Play', onclick: () => { handle.close(); if (!current) this.load(e.seed, { number: e.number, daily: e.daily }); } }, '►'));
        }) : [h('p', { class: 'empty' }, filter === 'saved' ? 'No saved seeds yet — press ☆ on a puzzle or a row to keep it here.' : filter === 'all' ? 'No puzzles yet — every one you open lands here.' : filter === 'solved' ? 'Nothing solved yet.' : 'Nothing left unsolved.')]));
        // Counts on the tabs, so an empty list is no surprise.
        seg.querySelectorAll('button').forEach((b) => { b.querySelector('.c').textContent = rowsFor(b.dataset.k).length; });
        const total = this.ps.history.length, solved = this.ps.history.filter((e) => e.solved).length;
        counts.textContent = total ? solved + ' of ' + total + ' solved' : '';
      };
      const tabs = [['all', 'All'], ['unsolved', 'Unsolved'], ['solved', 'Solved'], ['saved', '★ Saved']];
      const seg = h('div', { class: 'seg' }, tabs.map(([k, l]) => {
        const b = h('button', { 'data-k': k, 'aria-pressed': String(k === filter), onclick: () => { filter = k; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); } }, l, h('span', { class: 'c' }));
        return b;
      }));
      draw();
      handle = UI.openModal({ title: 'Puzzle history', width: 520, cls: 'modal-hist', body: h('div', { class: 'hist-wrap' }, h('div', { class: 'hist-head' }, seg, counts), list), onClose: () => this.renderSaveBtn() });
    }

    buyHint() {
      const cost = DIFF_COST[this.puzzle.diff];
      if (this.ps.current && this.ps.current.hint) { this.updateHint(true); return; }
      UI.confirm('Buy a hint?', 'Shows where the known solution puts each piece for the rest of this puzzle. Costs ' + cost + ' lines and halves the reward.', 'Show me (' + cost + ' ' + LINE + ')', () => {
        if (!this.app.store.spend(cost)) { toast('Not enough lines', 'bad'); return; }
        this.ps.current.hint = true;
        this.pstats[this.puzzle.diff].hints++;
        this.app.refreshWallet();
        this.updateHint(true);
        this.renderActions();
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
      else if (announce && hint.swap) toast('The solution plays ' + (Pieces.TYPES[hint.swap] ? Pieces.TYPES[hint.swap].name : 'another piece') + ' next — try Hold', null, 2600);
      else if (announce && hint.off) toast('You have left the known solution — undo to get hints back', null, 3000);
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

    /** "Hard #3", "Daily · Sat, Sep 26", or "Hard · from a seed". */
    label() {
      const d = Puzzles.DIFFS[this.puzzle.diff];
      return this.meta.daily ? 'Daily ' + d.name : this.meta.number ? d.name + ' #' + this.meta.number : d.name + ' · from a seed';
    }

    renderDiff() {
      const d = this.puzzle ? this.puzzle.diff : this.ps.diff;
      this.el.diff.replaceChildren(...['E', 'M', 'H'].map((k) => h('button', { 'aria-pressed': String(k === d), title: Puzzles.DIFFS[k].name + ' puzzles', onclick: () => this.setDiff(k) },
        h('span', { class: 'dot', style: { background: Puzzles.DIFFS[k].color } }), h('span', { class: 'full' }, Puzzles.DIFFS[k].name), h('span', { class: 'short' }, k))));
    }

    /** Daily: pressed while today's is in play, with a small tick once it is solved. */
    renderNav() {
      const diff = this.puzzle ? this.puzzle.diff : this.ps.diff, key = L.dateKey();
      const seed = Puzzles.dailySeed(diff, key, this.spin), done = !!this.ps.solved[seed];
      const on = !!(this.puzzle && this.meta.daily === key && this.puzzle.seed === seed);
      this.el.daily.replaceChildren(...[icon('daily'), h('span', { class: 'lbl' }, 'Daily'), done ? h('span', { class: 'tick', title: 'Solved today' }, '✓') : null].filter(Boolean));
      this.el.daily.setAttribute('aria-pressed', String(on));
      this.el.daily.title = "Today's " + Puzzles.DIFFS[diff].name + ' puzzle — pays double' + (done ? ' (solved)' : '');
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
      this.el.title.replaceChildren(...[h('span', { class: 't' }, p.title), solved ? h('span', { class: 'done', title: 'Solved' + (solved.ms ? ' in ' + fmtClock(solved.ms) : '') }, '✓ solved') : null].filter(Boolean));
      const where = this.meta.daily ? ['Daily', dayLabel(this.meta.daily), d.name] : this.meta.number ? [d.name, '#' + this.meta.number] : [d.name, 'from a seed'];
      this.el.id.replaceChildren(where.join(' · ') + ' · ' + p.pieces.length + ' pieces');
      this.el.seed.replaceChildren(h('span', { class: 'code' }, p.seed), icon('copy'));
      this.renderSaveBtn();
      // Every seed is some date's Daily.
      const dd = Puzzles.dailyDateOf(p.seed);
      this.el.seed.title = 'Copy this seed' + (dd && dd.key ? ' · the Daily for ' + dd.key : dd ? ' · the Daily in ' + dd.years.toLocaleString() + ' years' : '');
      this.renderGoal();
      this.renderMods();
    }

    /** How far along the goal is, in words: "4 of 6 lines", "1 gem left", "12 blocks left". */
    progress() {
      const p = this.puzzle, g = this.game;
      if (!p || !g) return { text: '', frac: 0 };
      if (p.goal.type === 'lines') { const n = Math.min(this.lines, p.goal.lines); return { text: n + ' of ' + p.goal.lines + ' lines', frac: n / p.goal.lines }; }
      if (p.goal.type === 'gems') { const left = g.board.count((v) => v & CELL.GEM); return { text: left ? left + (left === 1 ? ' gem' : ' gems') + ' left' : 'all gems cleared', frac: 1 - left / (p.goal.gems || 1) }; }
      const left = g.board.count();
      if (this.startCells == null || this.startGame !== g) { this.startCells = Math.max(1, left); this.startGame = g; }
      return { text: left ? left + (left === 1 ? ' block' : ' blocks') + ' left' : 'board clear', frac: 1 - left / this.startCells };
    }

    renderGoal() {
      const p = this.puzzle;
      if (!p || !this.game) return;
      const prog = this.progress();
      this.el.goal.replaceChildren(
        icon(p.goal.type === 'gems' ? 'gems' : p.goal.type === 'lines' ? 'lines' : 'clear', 'goal-i ' + p.goal.type),
        h('span', { class: 'goal' }, Puzzles.goalText(p)),
        h('span', { class: 'prog' }, prog.text),
        h('span', { class: 'meter' }, h('i', { style: { width: Math.round(Math.max(0, Math.min(1, prog.frac)) * 100) + '%' } })));
    }

    renderMods() {
      const p = this.puzzle;
      this.closePop();
      if (!p.mods.length) { this.el.mods.replaceChildren(h('span', { class: 'mod-none' }, 'No wildcards — just the rules')); return; }
      this.el.mods.replaceChildren(...p.mods.map((m) => {
        const M = Puzzles.MODS[m];
        return h('button', { class: 'mod mod-' + m, 'data-mod': m, 'data-tip-title': M.name, 'data-tip': M.desc, 'data-tip-foot': modKeys(m, p.mods) },
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
      const M = Puzzles.MODS[m], keys = modKeys(m, this.puzzle.mods);
      const pop = h('div', { class: 'puz-pop', 'data-mod': m, role: 'note' },
        h('div', { class: 'tip-title' }, icon(m), ' ', M.name), h('div', { class: 'tip-body' }, M.desc), keys ? h('div', { class: 'tip-foot' }, keys) : null);
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

    renderActions() {
      if (!this.puzzle) return;
      const cost = DIFF_COST[this.puzzle.diff];
      const hinted = this.ps.current && this.ps.current.hint;
      this.el.actions.replaceChildren(
        h('div', { class: 'grp' },
          h('button', { class: 'btn', id: 'puz-undo', disabled: !this.game || !this.game.history.length || this.done, title: 'Take back the last piece (free)', onclick: () => this.undo() }, '↶ ', h('span', { class: 'lbl' }, 'Undo'), h('kbd', null, '⌫')),
          h('button', { class: 'btn', id: 'puz-retry', title: 'Start this puzzle again', onclick: () => this.retry() }, '↺ ', h('span', { class: 'lbl' }, 'Retry'), h('kbd', null, 'R'))),
        h('div', { class: 'grp' },
          h('button', { class: 'btn' + (hinted ? ' on' : ''), id: 'puz-hint', disabled: this.done, onclick: () => this.buyHint(), title: hinted ? 'Hints are on: the solution shows where each piece goes' : 'See where the known solution puts each piece (' + cost + ' lines; halves the reward)' },
            icon('hint'), h('span', { class: 'lbl' }, hinted ? 'Hints on' : 'Hint'), hinted ? null : h('span', { class: 'gem' }, LINE + cost), h('kbd', null, 'H')),
          h('button', { class: 'btn' + (this.done ? ' primary' : ''), id: 'puz-next', title: this.done ? 'The next puzzle' : 'Skip to the next puzzle (this one stays in History)', onclick: () => this.next() }, h('span', { class: 'lbl' }, this.done ? 'Next' : 'Skip'), ' ▸', h('kbd', null, 'N'))));
    }
  }

  // ---- factory ------------------------------------------------------------------------------------------------------

  const REWARD_UNLOCKS = [
    { kind: 'palette', id: 'assembly', test: (f) => f.presses >= 2 },
    { kind: 'frame', id: 'hazard', test: (f) => f.presses >= 3 },
    { kind: 'skin', id: 'steel', test: (f) => f.presses >= 4 },
    { kind: 'backdrop', id: 'belt', test: (f) => f.stats.lines >= 500 },
    { kind: 'effect', id: 'sparks', test: (f) => f.binLevel >= 4 },
  ];

  // What the line sounds like (existing ids only; each at most every 0.4 s, and only with the window in front).
  const LINE_SOUNDS = { mino: 'stamp', drop: 'pack', enter: 'land', full: 'bell' };

  /** A calm "how long": under a minute, 12m, 1h 12m, 2d 3h (held together: a wrap never splits one). */
  function soon(sec) {
    if (!isFinite(sec)) return '—';
    const m = Math.ceil(sec / 60);
    if (m <= 1) return sec < 45 ? 'under a minute' : '1m';
    if (m < 60) return m + 'm';
    if (m < 48 * 60) return Math.floor(m / 60) + 'h\u00a0' + (m % 60) + 'm';
    return Math.floor(m / 1440) + 'd\u00a0' + Math.floor((m % 1440) / 60) + 'h';
  }

  /** The shape a press card shows for its size: a familiar one where there is one. */
  function sampleShape(n) {
    const want = { 4: 'T-tetromino', 5: 'P-pentomino' }[n];
    const i = want ? Factory.shapes(n).findIndex((c, s) => Factory.shapeName(n, s) === want) : -1;
    return i >= 0 ? i : Math.floor(Factory.shapes(n).length / 3);
  }

  /** A mold's short name for a chip: the letter name, or its number. */
  function moldLabel(n, s) { const name = Factory.shapeName(n, s); return /#/.test(name) ? '#' + (s + 1) : name; }

  /**
   * The Factory: one slow line. Tiles up top (rate, bin, status), the floor drawn like the board, a Collect button,
   * and the two things to build. Everything it makes is minos; four of them in a row of the bin are one line.
   */
  class FactoryMode {
    constructor(app) {
      this.app = app;
      this.canvas = document.getElementById('cv-floor');
      this.view = new L.FloorView(this.canvas);
      this.top = document.getElementById('fac-top');
      this.collectEl = document.getElementById('fac-collect');
      this.list = document.getElementById('fac-list');
      this.visible = false;
      this.hover = null;
      this.panelAt = 0; this.achAt = 0; this.soundAt = {}; this.etaAt = 0; this.etaV = Infinity;
      this.away = null; // time away not yet announced: { seconds, minos }
      const pos = (e) => { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      this.canvas.addEventListener('mousemove', (e) => { this.setHover(this.view.hitTest(...pos(e), this.f)); });
      this.canvas.addEventListener('mouseleave', () => this.setHover(null));
      this.canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const hit = this.view.hitTest(...pos(e), this.f);
        if (!hit) return;
        if (hit.kind === 'press') this.openMold(hit.k);
        else if (hit.kind === 'bin') this.collect();
        else if (hit.k === this.f.presses) this.upgrade('press');
        else this.app.sound.play('blocked');
      });
      this.build();
    }

    get f() { return this.app.store.state.factory; }
    get store() { return this.app.store; }
    get reduced() { return this.app.settings.motion === 'reduced'; }

    // ---- time ---------------------------------------------------------------------------------------------------------

    /**
     * Time away (more than five seconds since the line last ran): replayed in one go, never banked for you. Timers run
     * slowly or not at all while Lull is hidden, so quiet catch-ups add up until the next return announces them.
     */
    catchUp(announce) {
      const f = this.f, now = Date.now();
      const res = now - f.lastTick > 5000 || now < f.lastTick ? Factory.catchUp(f, now) : null;
      if (res) {
        if (res.minos) this.addDayMinos(res.minos);
        this.away = { seconds: (this.away ? this.away.seconds : 0) + res.seconds, minos: (this.away ? this.away.minos : 0) + res.minos };
        this.afterChange();
        this.app.setBadge('factory', Factory.isFull(f));
      }
      if (announce && this.away) {
        const a = this.away;
        this.away = null;
        if (a.seconds > 90 && a.minos >= 4) {
          toast('While you were away the factory made ' + fmtInt(a.minos) + ' minos · ' + fmtInt(Math.floor(f.bin.length / 4)) + ' ' + LINE + ' in the bin' + (Factory.isFull(f) ? ' · the bin is full' : ''), 'good', 5000);
        }
      }
      return res;
    }

    /** Runs the line up to now: a catch-up after a gap, otherwise one ordinary step. */
    advance() {
      const f = this.f, now = Date.now();
      // A gap found with the floor on screen (a sleep, a hide that sent no event) is told now, not at some later return.
      if (now - f.lastTick > 5000 || now < f.lastTick) { this.catchUp(this.visible && !document.hidden); return []; }
      const evs = Factory.step(f, (now - f.lastTick) / 1000);
      f.lastTick = now;
      return evs;
    }

    show() {
      this.visible = true;
      this.catchUp(false);
      this.away = null; // the floor shows what happened
      this.view.resize();
      this.build();
      const f = this.f;
      if (f.rebuilt) {
        f.rebuilt = false;
        this.store.touch();
        toast('The factory was rebuilt: presses now fill a bin with lines. Your old line carried over as ' + (f.presses === 1 ? 'one press.' : f.presses + ' presses.'), null, 7000);
      }
    }

    hide() { this.visible = false; this.setHover(null); }

    /** Every second while the factory is not on screen: the line keeps running, quietly. */
    tick() {
      if (this.visible) return;
      this.onEvents(this.advance(), false);
      this.app.setBadge('factory', Factory.isFull(this.f));
      const now = Date.now();
      if (now - this.achAt > 10000) { this.achAt = now; this.afterChange(false); }
    }

    frame(t, dt) {
      const evs = this.advance();
      this.view.resize();
      this.view.reduced = this.reduced;
      this.view.events(evs, this.reduced);
      this.onEvents(evs, true);
      this.view.render(dt, this.f, this.app.look(), this.hover);
      if (t - this.panelAt > 250) { this.panelAt = t; this.update(); }
    }

    onEvents(evs, audible) {
      if (!evs.length) return;
      let entered = false;
      for (const e of evs) {
        if (e.kind === 'enter') { this.addDayMinos(e.item.n); entered = true; }
        if (audible) this.lineSound(LINE_SOUNDS[e.kind]);
      }
      if (entered) this.afterChange();
      if (evs.some((e) => e.kind === 'full' || e.kind === 'enter')) this.app.setBadge('factory', Factory.isFull(this.f));
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
          toast('Unlocked: ' + L.COSMETICS[u.kind][u.id].name + ' (' + L.COSMETIC_LABELS[u.kind].toLowerCase() + ') — equip it in the Shop', 'good', 5000);
        }
      }
      this.app.achieve({ mode: 'factory' });
      if (touch !== false) this.store.touch();
    }

    // ---- verbs --------------------------------------------------------------------------------------------------------

    /** Banks every full row of the bin as a line; loose minos stay. */
    collect() {
      const f = this.f, res = Factory.collect(f);
      if (!res) { this.app.sound.play('blocked'); return false; }
      this.store.addLines(res.collected, 'contracts');
      this.app.refreshWallet(true);
      this.app.sound.play('golden');
      if (this.visible) this.view.collected(res, f, this.app.look(), this.reduced, getComputedStyle(document.documentElement).getPropertyValue('--gem').trim());
      this.app.achieve({ mode: 'factory', collected: res.collected, loose: res.loose });
      this.afterChange();
      this.app.setBadge('factory', false);
      this.etaAt = 0;
      this.update();
      return true;
    }

    upgrade(kind) {
      const u = Factory.nextUpgrade(this.f, kind);
      if (!u) return false;
      if (!this.store.spend(u.cost)) { this.app.sound.play('blocked'); return false; }
      Factory.upgrade(this.f, kind);
      if (kind === 'press') this.view.builtPress(this.f.presses - 1);
      this.app.refreshWallet();
      this.app.sound.play('buy');
      this.afterChange();
      this.build();
      return true;
    }

    /** The mold picker: any shape each time, or one chosen shape (it never changes what a press pays). */
    openMold(k) {
      const f = this.f, m = f.molds[k];
      if (!m) return;
      const n = Factory.MOLDS[k], look = this.app.look(), list = Factory.shapes(n), seen = f.stats.seen[n];
      let modal = null;
      const pick = (s) => { Factory.setPin(f, k, s); this.app.sound.play('land'); this.store.touch(); if (modal) modal.close(); this.build(); };
      const tile = (s) => h('button', { class: 'mold' + (m.pin === s ? ' on' : ''), title: Factory.shapeName(n, s) + (seen && seen[s] !== '1' ? ' · not pressed yet' : ''), 'data-s': s, onclick: () => pick(s) },
        L.FactoryArt.shapeCanvas(look, list[s], 28, look.colors[1 + (s % 7)], !seen || seen[s] === '1'));
      const body = h('div', { class: 'mold-pick' },
        h('button', { class: 'mold-any' + (m.pin < 0 ? ' on' : ''), onclick: () => pick(-1) }, h('b', null, 'Any'), ': a new shape each time'),
        h('div', { class: 'catalog molds scroll' }, list.map((_, s) => tile(s))),
        h('p', { class: 'mold-cap' }, (seen ? 'Pressed ' + Factory.seenCount(f, n) + ' / ' + list.length + ' · ' : '') + 'the next piece uses this mold'));
      modal = UI.openModal({ title: Factory.NAMES[n] + ' press · mold', width: 380, body });
    }

    /** C collects, on the Factory tab (app.js skips it while a dialog or a text field has the keys). */
    key(e) {
      if (e.code !== 'KeyC' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return false;
      this.collect();
      return true;
    }

    // ---- the page -----------------------------------------------------------------------------------------------------

    setHover(hit) {
      this.hover = hit;
      this.canvas.style.cursor = hit && (hit.kind === 'press' || (hit.kind === 'bin' && this.f.bin.length >= 4) || (hit.kind === 'bay' && hit.k === this.f.presses)) ? 'pointer' : 'default';
      this.view.caption = this.captionFor(hit);
    }

    /** One line about what the pointer is over. */
    captionFor(hit) {
      const f = this.f;
      if (!hit) return '';
      if (hit.kind === 'bin') {
        const n = Math.floor(f.bin.length / 4), loose = f.bin.length % 4;
        const full = Factory.status(f).full ? ' · full: the next piece won’t fit' : '';
        return n ? 'Bin · ' + n + (n === 1 ? ' line' : ' lines') + (loose ? ' + ' + loose + ' loose' : '') + full + ' · click to collect' : 'Bin · ' + loose + ' loose · four in a row make a line';
      }
      const n = Factory.MOLDS[hit.k], name = Factory.NAMES[n] + ' press';
      if (hit.kind === 'bay') return name + ' · ' + fmtInt(Factory.PRESS_COST[hit.k]) + ' ' + LINE + (hit.k === f.presses ? ' · click to build' : ' · after the ' + Factory.NAMES[n - 1].toLowerCase() + ' press');
      const m = f.molds[hit.k], formed = Math.floor(m.p * n + 1e-9);
      const mold = ' · mold: ' + (m.pin < 0 ? 'Any' : moldLabel(n, m.pin));
      if (m.held) return name + ' · ' + n + '/' + n + ' · holding: the belt is full here' + mold;
      return name + ' · ' + formed + '/' + n + ' · next mino ' + fmtClock(((formed + 1) / n - m.p) * Factory.CYCLE * 1000 + 999) + mold;
    }

    binIcon(look) {
      return UI.canvasFor(34, 34, (ctx) => {
        const s = 6, x = 5, b = 29;
        for (let i = 0; i < 10; i++) Render.drawCell(ctx, look.skin, look.colors[1 + (Math.floor(i / 4) * 2 + i) % 7], x + (i % 4) * s, b - (Math.floor(i / 4) + 1) * s, s);
        ctx.strokeStyle = look.theme.muted; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - 1.5, 6); ctx.lineTo(x - 1.5, b + 1.5); ctx.lineTo(x + 4 * s + 1.5, b + 1.5); ctx.lineTo(x + 4 * s + 1.5, 6); ctx.stroke();
      });
    }

    /** Builds the tiles, the Collect button and the list (on show, and after a purchase); update() keeps them fresh. */
    build() {
      const f = this.f, look = this.app.look();
      const tile = (cls) => { const v = h('div', { class: 'v' }), l = h('div', { class: 'l' }), el = h('div', { class: 'kpi ' + (cls || '') }, v, l); return { el, v, l }; };
      this.tRate = tile('rate'); this.tBin = tile('bin'); this.tStatus = tile('status');
      this.top.replaceChildren(this.tRate.el, this.tBin.el, this.tStatus.el);
      this.cBtn = h('button', { class: 'btn primary', onclick: () => this.collect() });
      this.cKey = null;
      this.collectEl.replaceChildren(this.cBtn);
      const card = (up, ico, title, desc, btn) => h('div', { class: 'row-card', 'data-up': up }, h('div', { class: 'fac-ico' }, ico), h('div', { class: 'grow' }, h('div', { class: 't' }, title), desc), btn);
      const els = [h('div', { class: 'fac-h' }, 'The line')];
      // The next press.
      const np = Factory.nextUpgrade(f, 'press');
      this.pressBtn = null;
      if (np) {
        const n = np.to, s = sampleShape(n);
        this.pressBtn = h('button', { class: 'btn sm', onclick: () => this.upgrade('press') }, 'Build · ' + fmtInt(np.cost) + ' ' + LINE);
        els.push(card('press', L.FactoryArt.shapeCanvas(look, Factory.shapes(n)[s], 34, look.colors[1 + (s % 7)], true), Factory.NAMES[n] + ' press',
          h('div', { class: 'd' }, 'Bay ' + (f.presses + 1) + ' · ' + n + ' minos every 10 min · +' + Factory.quarters((3600 / Factory.CYCLE) * n / 4) + '\u00a0' + LINE + '/h'), this.pressBtn));
      } else {
        els.push(card('press', L.FactoryArt.shapeCanvas(look, Factory.shapes(7)[sampleShape(7)], 34, look.colors[3], true), 'Four presses', h('div', { class: 'd' }, 'the line is complete · ' + Factory.perHour(f) + ' minos an hour'), null));
      }
      // A taller bin.
      const nb = Factory.nextUpgrade(f, 'bin');
      this.binBtn = null; this.binDesc = null;
      if (nb) {
        this.binBtn = h('button', { class: 'btn sm', onclick: () => this.upgrade('bin') }, 'Build · ' + fmtInt(nb.cost) + ' ' + LINE);
        this.binDesc = h('div', { class: 'd' });
        els.push(card('bin', this.binIcon(look), 'Taller bin', this.binDesc, this.binBtn));
      } else els.push(card('bin', this.binIcon(look), 'The tallest bin', h('div', { class: 'd' }, Factory.BIN_ROWS[f.binLevel] + ' lines'), null));
      // Molds: one chip per press.
      els.push(h('div', { class: 'row-card fac-molds' }, h('span', { class: 'lbl' }, 'Molds'),
        h('div', { class: 'chips' }, f.molds.map((m, k) => h('button', { class: 'chip' + (m.pin >= 0 ? ' on' : ''), 'data-k': k, title: 'Choose what this press makes', onclick: () => this.openMold(k) },
          Factory.MOLDS[k] + ' · ' + (m.pin < 0 ? 'Any' : '◇ ' + moldLabel(Factory.MOLDS[k], m.pin)))))));
      els.push(h('p', { class: 'fac-note' }, 'Each mino is a quarter of a line; four in a row make one. The line runs while Lull is closed. When the bin is full it just waits: nothing is lost.'));
      this.list.replaceChildren(...els);
      this.update();
    }

    update() {
      const f = this.f, st = Factory.status(f), cap = Factory.BIN_ROWS[f.binLevel], wallet = this.store.state.lines;
      this.tRate.v.textContent = Factory.quarters(st.perHour / 4) + '\u00a0' + LINE + '/h';
      this.tRate.l.textContent = st.perHour + ' minos an hour';
      this.tBin.v.textContent = Factory.quarters(st.len / 4) + ' / ' + cap;
      this.tBin.l.textContent = 'lines in the bin';
      this.tStatus.v.textContent = st.full ? 'Full' : soon(st.toFull);
      this.tStatus.l.textContent = st.full ? 'the line is waiting' : 'until the bin is full';
      this.tStatus.el.classList.toggle('warn', st.full);
      // Collect: what it pays now, or when the first line lands.
      let key;
      if (st.lines) key = 'c' + st.lines + ':' + st.loose;
      else {
        if (performance.now() - this.etaAt > 2000) { this.etaAt = performance.now(); this.etaV = Factory.eta(f, 4, 4 * 3600); }
        key = 'n' + soon(this.etaV);
      }
      if (key !== this.cKey) {
        this.cKey = key;
        this.cBtn.disabled = !st.lines;
        const sub = st.lines ? (st.loose ? ' · ' + st.loose + ' loose mino' + (st.loose > 1 ? 's stay' : ' stays') : '') : isFinite(this.etaV) ? ' · first line in ' + soon(this.etaV) : '';
        this.cBtn.replaceChildren(st.lines ? 'Collect ' + fmtInt(st.lines) + ' ' + LINE : 'Nothing to collect yet', h('span', { class: 'sub' }, sub));
      }
      const np = Factory.nextUpgrade(f, 'press'), nb = Factory.nextUpgrade(f, 'bin');
      if (this.pressBtn && np) { this.pressBtn.disabled = wallet < np.cost; this.pressBtn.classList.toggle('primary', wallet >= np.cost); }
      if (this.binBtn && nb) {
        this.binBtn.disabled = wallet < nb.cost; this.binBtn.classList.toggle('primary', wallet >= nb.cost);
        const fill = st.perHour ? Math.max(0, nb.to * 4 - st.len) / st.perHour * 3600 : Infinity;
        this.binDesc.textContent = 'Holds ' + nb.to + ' lines (now ' + cap + ') · full in ' + soon(fill);
      }
      if (this.hover) this.view.caption = this.captionFor(this.hover);
      this.app.setBadge('factory', Factory.isFull(f));
    }
  }

  L.Modes = { ClassicMode, BoardMode, PlayMode, PuzzleMode, FactoryMode, AIM_STICK, CLICK_GRACE_MS, SET_GRACE_MS };
  void CELL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
