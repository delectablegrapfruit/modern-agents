// Lull — the three things to do: Free Play, Puzzles, and the Factory.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Game, Board, CELL, Pieces, Puzzles, Factory, Render, UI, ITEMS, ITEM_ORDER, ITEM_GROUPS, fmt, fmtInt, fmtClock, fmtDuration } = L;
  const { h, toast } = UI;

  const ARROWS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const LOGICAL = { moveL: [-1, 0], moveR: [1, 0], lower: [0, -1], rotate: [0, 1] };
  const INVERT = { moveL: 'moveR', moveR: 'moveL', cw: 'ccw', ccw: 'cw', rotate: 'rotateInv' };

  // Items that only change the piece in play, so they can be put back.
  const UNDOABLE = new Set(['reroll', 'mirror', 'pebble', 'noodle', 'giant', 'sand', 'magnet', 'phase', 'anvil', 'drill', 'bomb', 'laser', 'blackhole', 'golden', 'order', 'blueprint']);

  function playLockSound(snd, r) {
    if (r.special === 'bomb' || r.special === 'blackhole' || r.special === 'anvil') snd.play('boom');
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
      this.bindMouse();
    }

    get settings() { return this.app.store.state.settings; }
    get reduced() { return this.settings.motion === 'reduced'; }

    attachGame(game, view) {
      this.game = game;
      this.view.attach(game, view);
      this.view.setLook(this.app.look());
      this.view.resize();
      game.on('lock', (r) => this.onLock(r));
      game.on('blocked', () => { if (this.quiet) return; this.app.sound.play('blocked'); this.view.bump(this.reduced); });
      game.on('spawn', () => {
        // A new piece meets the pointer where it is.
        if (this.pointer && this.settings.mouse && this.lastInput === 'mouse') setTimeout(() => this.follow(), 0);
      });
      game.on('topout', () => this.onTopout && this.onTopout());
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
      if (!this.mouseActing) { this.lastInput = 'key'; this.view.pointerCol = null; }
      if (this.afterAction) this.afterAction(a);
      return ok;
    }

    blocked() { return false; }

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
      c.addEventListener('mouseleave', () => { this.pointer = null; this.view.pointerCol = null; this.view.holdHover = false; this.view.dirty = true; });
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
          // Click grace: a pointer that slipped into the next column just before the click (under ~0.1 s) does not
          // count; the piece drops where it had settled.
          if (this.prevCol != null && performance.now() - this.colAt < 110) this.aimAt(this.prevCol);
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
      const [px, py] = this.pointer, cur = this.view.pointerCol;
      const cell = this.view.cellClamped(px, py);
      if (!cell) return;
      let col = cell.x;
      // Sticky aim: stay in the current column until the pointer is well past its edge (a third of a cell).
      if (cur != null && col !== cur && this.view.lay) {
        const d = this.view.lay.s * 0.33;
        for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) { const c = this.view.cellClamped(px + dx, py + dy); if (c && c.x === cur) { col = cur; break; } }
      }
      if (col !== cur) { this.prevCol = cur; this.colAt = performance.now(); this.view.pointerCol = col; }
      this.aimAt(col);
    }

    aimAt(col) {
      const g = this.game;
      this.quiet = true;
      for (let i = 0; i < g.w; i++) if (!g.moveToward(col)) break;
      this.quiet = false;
      this.view.pointerCol = col;
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
   * moving or turning), soft and hard drops, hold, and a game over. Lines still bank as ◆. Music optional.
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
      Object.assign(this, { tetrises: 0, level: 1, lines: 0, score: 0, acc: 0, lockT: 0, resets: 0, over: false, paused: false, started: !!start });
      if (start) { this.hideCard(); this.cs.games++; this.app.store.touch(); L.Music.rewind(); }
      else this.showStart();
      this.renderStatus();
      this.renderControls();
    }

    showStart() {
      this.showCard([
        h('h2', null, 'Classic'),
        h('p', null, 'The one you know: pieces fall, and fall faster every ten lines. Lines you clear still bank as ◆.'),
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
      if (!rep && act === 'drop' && this.over) { this.newGame(true); return true; }
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

    onLock(r) {
      const st = this.app.store, S = this.cs;
      const before = this.level;
      this.lines += r.lines;
      this.level = 1 + Math.floor(this.lines / 10);
      this.score += (r.score || 0) * before + (r.dropDist ? r.dropDist * 2 : 0);
      this.resets = 0; this.lockT = 0; this.acc = 0;
      if (r.lines) { st.addLines(r.lines, 'play'); this.app.refreshWallet(true); S.lines += r.lines; }
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
      if (r.lines >= 4) this.tetrises++;
      this.renderStatus();
      st.touch();
      this.app.achieve({ mode: 'classic', r, score: this.score, level: this.level, tetrises: this.tetrises });
    }

    onTopout() {
      if (this.over) return;
      this.over = true;
      const S = this.cs, best = this.score > S.best;
      S.best = Math.max(S.best, this.score);
      this.app.store.touch();
      this.app.sound.play('fail');
      if (this.app.settings.announcer !== false && this.app.settings.sound) L.Announcer.say('game over');
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
        h('span', null, 'Best ', h('b', null, fmtInt(Math.max(this.cs.best, this.score)))));
    }

    renderControls() {
      const st = this.app.settings;
      this.controlsEl.replaceChildren(
        h('button', { class: 'btn sm' + (st.music ? ' on' : ''), 'data-tip': 'Music for Classic (Korobeiniki, the old folk tune)', onclick: () => { st.music = !st.music; this.app.store.touch(); this.renderControls(); } }, st.music ? '♪ On' : '♪ Off'),
        h('button', { class: 'btn sm', disabled: !this.started || this.over, onclick: () => this.togglePause() }, this.paused ? '▶ Resume' : '⏸ Pause', ' ', h('kbd', null, 'P')),
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
      if (r.golden && r.lines) {
        // Golden piece: its lines pay triple.
        st.addLines(r.lines * 2, 'play');
        const b = this.view.lay.board;
        this.view.fx.text('×3 ◆ +' + r.lines * 3, b.x + b.w / 2, b.y + b.h * 0.3, '#ffd35a', 20);
        this.app.sound.play('golden');
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
        st.addLines(r.lines, 'play');
        this.app.refreshWallet(true);
      }
      if (r.tspin) { F.tspins++; F.tspinLines += r.lines; }
      if (r.perfect) F.perfect++;
      F.maxCombo = Math.max(F.maxCombo, g.s.maxCombo);
      F.maxB2B = Math.max(F.maxB2B, g.s.maxB2B);
      F.bestScore = Math.max(F.bestScore, g.s.score);
      F.bestLines = Math.max(F.bestLines, g.s.lines);
      const snd = this.app.sound;
      playLockSound(snd, r);
      this.view.onLock(r, this.reduced);
      this.renderStatus();
      st.touch();
      this.app.achieve({ mode: 'play', r, g });
    }

    onTopout(silent) {
      const g = this.game, F = this.app.store.state.stats.free;
      if (!silent) { F.topouts++; this.app.store.touch(); }
      this.showCard([
        h('h2', null, 'Board full'),
        h('p', null, 'No room for the next piece. Nothing is lost — the lines you cleared are banked.'),
        h('p', null, h('span', { class: 'big' }, fmtInt(g.s.lines)), ' lines · ', fmtInt(g.s.score), ' points'),
        h('div', { class: 'row' },
          g.history.length && this.app.store.state.inventory.rewind ? h('button', { class: 'btn', onclick: () => { this.hideCard(); this.useItem('rewind'); } }, '↶ Rewind (have ' + this.app.store.state.inventory.rewind + ')') : null,
          h('button', { class: 'btn primary', onclick: () => this.newBoard() }, 'New board')),
      ]);
    }

    newBoard() {
      this.hideCard();
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
        h('span', { class: s.combo > 0 ? '' : 'slot-off' }, 'Combo ', h('b', null, String(Math.max(0, s.combo)))),
        h('span', { class: 'opt' }, 'Pieces ', h('b', null, fmtInt(s.pieces))),
        h('button', { class: 'btn sm', title: 'Start a fresh board', onclick: () => {
          if (this.game.board.isEmpty()) return this.newBoard();
          UI.confirm('New board?', 'Clear this board and start fresh. Lines you cleared stay banked.', 'New board', () => this.newBoard());
        } }, '↺', h('span', { class: 'lbl' }, ' New board'))].filter(Boolean));
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
        }, h('span', { class: 'gi' }, g.icon), h('span', { class: 'gl' }, g.name), h('span', { class: 'k' }, String(gi + 1)), have ? h('span', { class: 'n' }, String(have)) : null);
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
            'data-tip-foot': on ? 'In use — press again to put it back' : (n ? 'You have ' + n + ' · ' : 'None left · buy for ◆' + it.price + ' · ') + 'key ' + (i + 1),
            onclick: () => this.useItem(id),
          }, h('span', { class: 'ii' }, it.icon), h('span', { class: 'il' }, it.name), h('span', { class: 'k' }, String(i + 1)), h('span', { class: 'n' }, n ? String(n) : '◆' + it.price));
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
      if (!g.replacePiece(a.prev)) return;
      st.state.inventory[a.id] = (st.state.inventory[a.id] || 0) + 1;
      const used = st.state.stats.items.used;
      used[a.id] = Math.max(0, (used[a.id] || 0) - 1);
      st.touch();
      this.app.sound.play('hold');
      this.view.itemFx('undo', g.piece, this.reduced);
      this.renderItems();
      this.view.dirty = true;
    }

    apply(id) {
      const g = this.game, st = this.app.store;
      const done = () => {
        arm();
        this.tray = null;
        st.useItem(id);
        this.app.sound.play('item');
        this.renderItems();
        this.renderStatus();
        this.view.dirty = true;
        toast(ITEMS[id].icon + ' ' + ITEMS[id].name, 'good', 1400);
      };
      const cur = g.piece;
      const prev = cur ? Object.assign({}, cur.entry, { special: cur.special || null }) : null;
      const arm = () => { if (UNDOABLE.has(id) && g.piece) this.armed = { id, piece: g.piece, prev }; this.view.itemFx(id, g.piece, this.reduced); };
      switch (id) {
        case 'reroll': {
          const opts = Pieces.TETROMINOES.filter((t) => t !== (cur && cur.type.id));
          if (g.replacePiece({ id: opts[Math.floor(Math.random() * opts.length)] })) done();
          break;
        }
        case 'mirror': if (g.replacePiece({ id: Pieces.mirrorOf(cur.type).id, special: cur.special })) done(); break;
        case 'pebble': if (g.replacePiece({ id: 'M1' })) done(); break;
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
        case 'jackpot': st.useItem(id); this.tray = null; this.jackpot(); this.renderItems(); break;
        case 'sand': case 'phase': case 'drill': case 'bomb': case 'anvil': case 'magnet': case 'laser': case 'blackhole': case 'golden':
          if (g.setSpecial(id)) done(); else toast('No room for that here', 'bad');
          break;
        case 'rewind': {
          const res = g.undo();
          if (!res) { toast('Nothing to rewind', 'bad'); return; }
          if (res.lines) {
            st.addLines(-res.lines, 'rewind');
            st.state.stats.free.lines = Math.max(0, st.state.stats.free.lines - res.lines);
            this.app.refreshWallet();
          }
          this.hideCard();
          this.snapshot();
          done();
          break;
        }
        case 'order':
          UI.openOrderSlip(this.app, (pick) => { if (pick && this.game.replacePiece({ id: pick })) done(); });
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

    /** Jackpot: three reels spin and stop on three items, which are yours. */
    jackpot() {
      const st = this.app.store, pool = ITEM_ORDER.filter((id) => id !== 'jackpot');
      const wins = [0, 1, 2].map(() => pool[Math.floor(Math.random() * pool.length)]);
      const reels = wins.map(() => h('div', { class: 'reel' }, '?'));
      const note = h('p', { class: 'jp-note' }, 'Spinning…');
      let handle = null;
      handle = UI.openModal({ title: '🎰 Jackpot', width: 340, cls: 'modal-jackpot', body: h('div', null, h('div', { class: 'reels' }, reels), note), buttons: [{ label: 'Collect', kind: 'primary' }], onClose: () => { clearInterval(timer); finish(); } });
      let t = 0, stopped = 0, done = false;
      const finish = () => {
        if (done) return;
        done = true;
        for (const id of wins) st.grantItem(id, 1);
        this.renderItems();
      };
      const timer = setInterval(() => {
        t++;
        reels.forEach((r, i) => {
          if (i < stopped) return;
          r.textContent = ITEMS[pool[(t * 7 + i * 5) % pool.length]].icon;
        });
        if (t % 6 === 0) this.app.sound.play('move');
        if (t === 14 + stopped * 8) {
          const r = reels[stopped];
          r.textContent = ITEMS[wins[stopped]].icon; r.classList.add('win'); r.title = ITEMS[wins[stopped]].name;
          this.app.sound.play('combo', 3 + stopped * 2);
          stopped++;
          if (stopped === 3) {
            clearInterval(timer);
            note.textContent = 'You won ' + wins.map((w) => ITEMS[w].name).join(', ') + '!';
            this.app.sound.play('golden');
            finish();
          }
        }
      }, 60);
      void handle;
    }

    save() { this.app.store.state.free = this.game.toJSON(); }
  }

  // ---- puzzles ------------------------------------------------------------------------------------------------------

  class PuzzleMode extends BoardMode {
    constructor(app) {
      super(app, 'cv-puzzle', 'puz-overlay');
      this.puzzle = null;
      this.el = {
        diff: document.getElementById('puz-diff'), id: document.getElementById('puz-id'), seed: document.getElementById('puz-seed'), save: document.getElementById('puz-save'),
        goal: document.getElementById('puz-goal'), actions: document.getElementById('puz-actions'),
      };
      document.getElementById('puz-seedbtn').addEventListener('click', () => this.askSeed());
      document.getElementById('puz-daily').addEventListener('click', () => this.loadDaily());
      document.getElementById('puz-history').addEventListener('click', () => this.openHistory());
      this.el.save.addEventListener('click', () => { const p = this.puzzle; if (p) this.toggleSaved(p.seed, { diff: p.diff, title: p.title, mods: p.mods, number: this.meta.number, daily: this.meta.daily }); });
      this.el.seed.addEventListener('click', () => { if (this.puzzle) { UI.copyText(this.puzzle.seed); toast('Seed ' + this.puzzle.seed + ' copied', 'good'); } });
      this.renderDiff();
    }

    get ps() { return this.app.store.state.puzzle; }
    get pstats() { return this.app.store.state.stats.puzzle; }

    show() { if (!this.puzzle) this.loadCurrent(); }

    loadCurrent() {
      const cur = this.ps.current;
      if (cur && cur.seed && Puzzles.parseSeed(cur.seed)) this.load(cur.seed, cur, true);
      else this.loadNumbered(this.ps.diff);
    }

    loadNumbered(diff, n) {
      n = n || this.ps.next[diff] || 1;
      this.load(Puzzles.numberedSeed(diff, n), { number: n });
    }

    loadDaily() {
      const key = L.dateKey();
      this.load(Puzzles.dailySeed(this.ps.diff, key), { daily: key });
    }

    askSeed() {
      const input = h('input', { type: 'text', placeholder: 'M-3K7Q2XA', value: '' });
      const note = h('p', null, 'Every puzzle has a seed. The same seed is the same puzzle for everyone — share it, or come back to one.');
      UI.openModal({
        title: 'Play a seed', body: h('div', null, note, input),
        buttons: [{ label: 'Random', onClick: () => { this.load(Puzzles.randomSeed(this.ps.diff), {}); } },
          { label: 'Play', kind: 'primary', onClick: () => {
            const p = Puzzles.parseSeed(input.value);
            if (!p) { toast('Seeds look like E-, M- or H- and seven letters or digits', 'bad'); return false; }
            this.load(p.seed, {});
          } }],
      });
    }

    load(seed, meta, resume) {
      const p = Puzzles.generate(seed);
      if (!p) { toast('Could not build that puzzle', 'bad'); return; }
      this.puzzle = p;
      this.meta = { number: meta.number || null, daily: meta.daily || null };
      this.ps.diff = p.diff;
      const same = resume && this.ps.current && this.ps.current.seed === seed;
      this.ps.current = { seed, number: this.meta.number, daily: this.meta.daily, attempts: same ? this.ps.current.attempts || 0 : 0, ms: same ? this.ps.current.ms || 0 : 0, hint: same ? !!this.ps.current.hint : false };
      if (!same) this.record({ seed, diff: p.diff, title: p.title, number: this.meta.number, daily: this.meta.daily, mods: p.mods.slice(), at: Date.now(), attempts: 0, solved: !!this.ps.solved[seed], ms: 0 });
      if (!same) {
        this.pstats[p.diff].played++;
        for (const m of p.mods) { const r = this.pstats.mods[m] || (this.pstats.mods[m] = { seen: 0, solved: 0 }); r.seen++; }
      }
      this.app.store.touch();
      this.start();
      this.renderDiff();
      this.renderHead();
    }

    start() {
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
      this.ps.current.attempts++;
      const hEntry = this.historyEntry();
      if (hEntry) { hEntry.attempts++; hEntry.at = Date.now(); }
      this.attachGame(game, { rot: has('side') ? 90 : has('flip') ? 180 : 0, fog: has('fog'), mono: has('mono'), blind: has('blind'), vanish: has('vanish'), wrap: p.wrap });
      this.hideCard();
      this.updateHint();
      this.renderActions();
    }

    blocked() { return this.cardOpen; }

    onLock(r) {
      this.lines += r.lines;
      this.view.onLock(r, this.reduced);
      const snd = this.app.sound;
      playLockSound(snd, r);
      if (Puzzles.goalMet(this.puzzle, this.game.board, this.lines)) this.solved();
      this.updateHint();
      this.renderActions();
    }

    onEmpty() { if (!this.done) this.failed('Out of pieces'); }
    onTopout() { if (!this.done) this.failed('No room for the next piece'); }

    elapsed() { return (this.ps.current.ms || 0) + (performance.now() - this.startedAt); }

    solved() {
      if (this.done) return;
      this.done = true;
      const p = this.puzzle, st = this.app.store, S = this.pstats[p.diff], cur = this.ps.current;
      const ms = performance.now() - this.startedAt;
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
        for (const m of p.mods) { const r = this.pstats.mods[m] || (this.pstats.mods[m] = { seen: 1, solved: 0 }); r.solved++; }
        if (this.meta.daily) { this.pstats.daily++; this.pstats.lastDaily = this.meta.daily; }
        st.day().puzzles++;
        if (reward) { st.addLines(reward, 'puzzles'); this.app.refreshWallet(true); }
        this.app.achieve({ mode: 'puzzle', diff: p.diff, firstTry: cur.attempts === 1, hinted: !!cur.hint, mods: p.mods });
      }
      if (this.meta.number && this.ps.next[p.diff] <= this.meta.number) this.ps.next[p.diff] = this.meta.number + 1;
      this.ps.current = null;
      st.touch();
      this.app.sound.play('solve');
      this.showCard([
        h('h2', null, 'Solved'),
        h('p', null, fmtClock(ms), ' · ', cur.attempts === 1 ? 'first try' : cur.attempts + ' tries', cur.hint ? ' · with hints' : ''),
        reward ? h('p', null, h('span', { class: 'big' }, '+' + reward), ' ', h('span', { style: { color: 'var(--gem)' } }, '◆ lines')) : h('p', null, 'Solved before — no reward this time.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => { this.ps.current = { seed: p.seed, number: this.meta.number, daily: this.meta.daily, attempts: 0, ms: 0 }; this.start(); } }, 'Replay'),
          h('button', { class: 'btn primary', onclick: () => this.next() }, 'Next puzzle ', h('kbd', null, 'N'))),
      ]);
      this.renderActions();
    }

    failed(why) {
      if (this.failedShown) return;
      this.failedShown = true;
      this.pstats[this.puzzle.diff].fails++;
      this.app.store.touch();
      this.app.sound.play('fail');
      this.showCard([
        h('h2', null, why),
        h('p', null, Puzzles.goalText(this.puzzle) + ' — not yet.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => this.undo() }, '↶ Undo ', h('kbd', null, '⌫')),
          h('button', { class: 'btn primary', onclick: () => this.retry() }, 'Retry ', h('kbd', null, 'R'))),
      ]);
    }

    retry() { this.hideCard(); this.start(); this.renderHead(); }

    undo() {
      if (this.done) return false;
      const res = this.game.undo();
      if (!res) return false;
      this.lines -= res.lines;
      this.failedShown = false;
      this.hideCard();
      this.updateHint();
      this.renderActions();
      this.view.dirty = true;
      return true;
    }

    next() {
      const p = this.puzzle;
      if (!this.done) { this.pstats[p.diff].streak = 0; }
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
      const draw = () => {
        const hist = this.ps.history, byseed = new Map(hist.map((e) => [e.seed, e]));
        const rows = filter === 'saved'
          ? this.ps.saved.map((s) => Object.assign({ saved: true, attempts: 0 }, s, byseed.get(s.seed) ? { solved: byseed.get(s.seed).solved, ms: byseed.get(s.seed).ms, attempts: byseed.get(s.seed).attempts } : {}))
          : hist.filter((e) => filter === 'all' || (filter === 'solved' ? e.solved : !e.solved));
        list.replaceChildren(...(rows.length ? rows.map((e) => {
          const d = Puzzles.DIFFS[e.diff];
          const label = e.daily ? 'Daily ' + e.daily : e.number ? d.name + ' #' + e.number : d.name;
          const when = new Date(e.at);
          const saved = this.isSaved(e.seed);
          const status = e.solved ? '✓ ' + (e.ms ? fmtClock(e.ms) : 'solved') : e.attempts ? '✗ unsolved' : 'not played';
          const tries = e.attempts ? e.attempts + (e.attempts === 1 ? ' try' : ' tries') : null;
          const date = when.toLocaleDateString([], { month: 'short', day: 'numeric' });
          return h('div', { class: 'hist-row' + (e.solved ? ' solved' : '') },
            h('span', { class: 'dot', style: { background: d.color }, title: d.name }),
            h('div', { class: 'grow' },
              h('div', { class: 't', title: label + ' · ' + e.title }, label, h('span', { class: 'sub' }, ' · ' + e.title)),
              h('div', { class: 'd' }, [status, tries, date].filter(Boolean).join(' · '),
                e.mods && e.mods.length ? h('span', { class: 'mods' }, ' ' + e.mods.map((m) => (Puzzles.MODS[m] || { icon: '' }).icon).join(' ')) : null)),
            h('button', { class: 'seedchip', title: 'Copy seed', onclick: () => { UI.copyText(e.seed); toast('Seed ' + e.seed + ' copied', 'good', 1400); } }, e.seed),
            h('button', { class: 'icon-btn star' + (saved ? ' on' : ''), title: saved ? 'Unsave' : 'Save this seed', onclick: () => { this.toggleSaved(e.seed, e); draw(); } }, saved ? '★' : '☆'),
            h('button', { class: 'icon-btn play', title: e.solved ? 'Replay' : 'Play', onclick: () => { handle.close(); this.load(e.seed, { number: e.number, daily: e.daily }); } }, '▶'));
        }) : [h('p', { class: 'empty' }, filter === 'saved' ? 'No saved seeds yet — press ☆ on a puzzle or a row to keep it here.' : filter === 'all' ? 'No puzzles yet — every one you open lands here.' : 'Nothing here yet.')]));
      };
      const tabs = [['all', 'All'], ['unsolved', 'Unsolved'], ['solved', 'Solved'], ['saved', '★ Saved']];
      const seg = h('div', { class: 'seg' }, tabs.map(([k, l]) => {
        const b = h('button', { 'aria-pressed': String(k === filter), onclick: () => { filter = k; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); } }, l);
        return b;
      }));
      const total = this.ps.history.length, solved = this.ps.history.filter((e) => e.solved).length;
      draw();
      handle = UI.openModal({ title: 'Puzzle history', width: 520, cls: 'modal-hist', body: h('div', { class: 'hist-wrap' }, h('div', { class: 'hist-head' }, seg, h('span', null, solved + '/' + total + ' solved')), list), onClose: () => this.renderSaveBtn() });
    }

    buyHint() {
      const cost = { E: 10, M: 20, H: 35 }[this.puzzle.diff];
      if (this.ps.current && this.ps.current.hint) { this.updateHint(true); return; }
      UI.confirm('Buy a hint?', 'Shows where the known solution puts each piece for the rest of this puzzle. Costs ' + cost + ' lines and halves the reward.', 'Show me (' + cost + ' ◆)', () => {
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
        if (act === 'next' || (act === 'drop' && this.done)) { this.next(); return true; }
        if (act === 'undo') return this.undo();
        return false;
      }
      return super.action(act, rep);
    }

    renderDiff() {
      const d = this.puzzle ? this.puzzle.diff : this.ps.diff;
      this.el.diff.replaceChildren(...['E', 'M', 'H'].map((k) => h('button', { 'aria-pressed': String(k === d), onclick: () => this.setDiff(k) },
        h('span', { class: 'dot', style: { background: Puzzles.DIFFS[k].color } }), Puzzles.DIFFS[k].name)));
    }

    renderHead() {
      const p = this.puzzle;
      const label = this.meta.daily ? 'Daily ' + Puzzles.DIFFS[p.diff].name : this.meta.number ? Puzzles.DIFFS[p.diff].name + ' #' + this.meta.number : Puzzles.DIFFS[p.diff].name + ' · seed';
      const solved = this.ps.solved[p.seed];
      this.el.id.replaceChildren(label, ' ', h('span', { class: 'sub' }, '· ' + p.title + (solved ? ' ✓' : '')));
      this.el.seed.textContent = p.seed;
      this.renderSaveBtn();
      // Every seed is some date's Daily.
      const dd = Puzzles.dailyDateOf(p.seed);
      this.el.seed.title = 'Copy this seed' + (dd && dd.key ? ' · the Daily for ' + dd.key : dd ? ' · the Daily in ' + dd.years.toLocaleString() + ' years' : '');
      this.el.goal.replaceChildren(
        h('span', { class: 'goal' }, Puzzles.goalText(p)),
        h('span', { style: { color: 'var(--muted)' } }, p.pieces.length + ' pieces'),
        ...p.mods.map((m) => h('span', { class: 'mod', 'data-tip-title': Puzzles.MODS[m].icon + '  ' + Puzzles.MODS[m].name, 'data-tip': Puzzles.MODS[m].desc }, h('span', { class: 'i' }, Puzzles.MODS[m].icon), Puzzles.MODS[m].name)));
    }

    renderActions() {
      if (!this.puzzle) return;
      const cost = { E: 10, M: 20, H: 35 }[this.puzzle.diff];
      const hinted = this.ps.current && this.ps.current.hint;
      this.el.actions.replaceChildren(
        h('button', { class: 'btn sm', disabled: !this.game || !this.game.history.length || this.done, onclick: () => this.undo() }, '↶ Undo ', h('kbd', null, '⌫')),
        h('button', { class: 'btn sm', onclick: () => this.retry() }, '↺ Retry ', h('kbd', null, 'R')),
        h('button', { class: 'btn sm', disabled: this.done, onclick: () => this.buyHint(), title: 'See where the known solution puts each piece' }, hinted ? '💡 Hints on' : '💡 Hint ', hinted ? null : h('span', { class: 'gem' }, '◆' + cost)),
        h('button', { class: 'btn sm', onclick: () => this.next() }, this.done ? 'Next ▸ ' : 'Skip ▸ ', h('kbd', null, 'N')));
    }
  }

  // ---- factory ------------------------------------------------------------------------------------------------------

  const REWARD_UNLOCKS = [
    { kind: 'palette', id: 'assembly', test: (f) => (f.owned[4] || 0) > 0 },
    { kind: 'frame', id: 'hazard', test: (f) => (f.owned[6] || 0) > 0 },
    { kind: 'skin', id: 'steel', test: (f) => Object.values(f.owned).reduce((a, b) => a + b, 0) >= 100 },
    { kind: 'backdrop', id: 'belt', test: (f) => f.stats.caught >= 150 },
    { kind: 'effect', id: 'sparks', test: (f) => f.crates >= 25 },
  ];

  /**
   * The Factory: a small idler in the app's own parts — tiles up top (credits, income, the crate), the belt drawn
   * like the board, and a list of presses to buy.
   */
  class FactoryMode {
    constructor(app) {
      this.app = app;
      this.f = app.store.state.factory = Factory.migrate(app.store.state.factory);
      this.canvas = document.getElementById('cv-belt');
      this.view = new L.BeltView(this.canvas);
      this.top = document.getElementById('fac-top');
      this.list = document.getElementById('fac-list');
      this.rng = new L.RNG((Date.now() ^ 0x5eed) >>> 0);
      this.belt = new Factory.Belt(this.f, this.rng);
      this.visible = false;
      this.panelAt = 0;
      const pos = (e) => { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      this.canvas.addEventListener('mousemove', (e) => { const it = this.view.itemAt(...pos(e)); this.view.hover = it; this.canvas.style.cursor = it ? 'pointer' : 'default'; });
      this.canvas.addEventListener('mouseleave', () => { this.view.hover = null; });
      this.canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const it = this.view.itemAt(...pos(e));
        if (!it) return;
        const at = this.view.itemCenter(it);
        const ev = this.belt.remove(it, 'manual');
        if (ev) this.onBelt([ev].concat(this.belt.drain().filter((x) => x !== ev)), at);
      });
      this.build();
    }

    get store() { return this.app.store; }

    catchUp(announce) {
      const res = Factory.catchUp(this.f, Date.now());
      if (res && announce && res.seconds > 90 && res.credits >= 1) toast('While you were away the factory earned +' + fmt(res.credits) + '¢', 'good', 5000);
      if (res) this.afterEvents();
      return res;
    }

    show() { this.catchUp(false); this.visible = true; this.view.resize(); this.build(); }
    hide() { this.visible = false; this.f.lastTick = Date.now(); }

    /** Background tick (every second) while the factory is not on screen. */
    tick() {
      if (this.visible) return;
      const now = Date.now(), dt = (now - this.f.lastTick) / 1000;
      if (dt <= 0) return;
      if (dt > 30) this.catchUp(false);
      else { Factory.runExpected(this.f, dt); this.f.lastTick = now; this.afterEvents(); }
    }

    frame(now, dt) {
      const nowMs = Date.now();
      if ((nowMs - this.f.lastTick) / 1000 > 5) this.catchUp(false);
      this.f.lastTick = nowMs;
      this.belt.step(dt);
      this.onBelt(this.belt.drain());
      this.view.resize();
      this.view.render(dt, this.belt, this.app.look());
      if (now - this.panelAt > 250) { this.panelAt = now; this.update(); }
    }

    onBelt(events, at) {
      if (!events.length) return;
      const snd = this.app.sound, v = this.view;
      for (const e of events) {
        const c = at || v.itemCenter(e.item);
        if (e.kind === 'caught') {
          if (e.how === 'manual') {
            snd.play('catch', Math.min(e.streak, 12));
            if (c) { v.fx.burst('sparkle', [{ x: c[0] - 6, y: c[1] - 6, color: '#ffffff' }], 12, this.app.settings.motion === 'reduced'); v.fx.text(e.streak > 1 ? '×' + e.streak : '✓', c[0], c[1] - 14, '#9be39b', 13); }
          } else if (c) v.fx.text('QC', c[0], c[1] - 14, '#8fe3ff', 11);
        } else if (e.kind === 'wasted') { snd.play('error'); if (c) v.fx.text('that one was fine', c[0], c[1] - 14, '#ffb3a7', 11); }
        else if (e.kind === 'escaped') { snd.play('blocked'); v.fx.text('refund', v.w - 30, v.h / 2 - 12, '#ff8a80', 11); }
      }
      this.afterEvents();
    }

    afterEvents() {
      for (const u of REWARD_UNLOCKS) {
        if (!this.store.owns(u.kind, u.id) && u.test(this.f)) {
          this.store.grantCosmetic(u.kind, u.id);
          toast('Unlocked: ' + L.COSMETICS[u.kind][u.id].name + ' (' + L.COSMETIC_LABELS[u.kind].toLowerCase() + ') — equip it in the Shop', 'good', 5000);
        }
      }
      this.app.achieve({ mode: 'factory' });
      this.store.touch();
    }

    openCrate() {
      const lines = Factory.openCrate(this.f);
      if (!lines) return;
      this.store.addLines(lines, 'contracts');
      this.app.refreshWallet(true);
      this.app.sound.play('golden');
      toast('Crate opened: +' + lines + ' ◆', 'good', 1800);
      this.afterEvents();
      this.update();
    }

    buy(t, qty) {
      if (!Factory.buy(this.f, t, qty)) return;
      this.app.sound.play('buy');
      this.afterEvents();
      const before = this.rows.length;
      this.build();
      if (this.rows.length > before) this.app.sound.play('solve');
    }

    /** Builds the tiles and rows (on show, and when a new line opens); update() keeps their numbers fresh. */
    build() {
      const f = this.f;
      this.top.replaceChildren();
      const tile = (label, cls) => { const v = h('div', { class: 'v' }), l = h('div', { class: 'l' }, label); this.top.appendChild(h('div', { class: 'kpi ' + (cls || '') }, v, l)); return { v, l }; };
      this.tCredits = tile('Credits', 'credits');
      this.tRate = tile('Per second');
      this.crateBar = h('i');
      this.crateTxt = h('span');
      this.crateBtn = h('button', { class: 'btn sm', onclick: () => this.openCrate() }, 'Open');
      this.top.appendChild(h('div', { class: 'kpi crate' }, h('div', { class: 'crate-row' }, h('span', { class: 'v' }, '📦'), this.crateTxt, this.crateBtn), h('div', { class: 'bar' }, this.crateBar)));
      const look = this.app.look();
      this.rows = [];
      const els = [h('div', { class: 'fac-h' }, 'Presses')];
      for (let t = 1; t <= Factory.MAX_TIER; t++) {
        const T = Factory.TIERS[t];
        if (!Factory.unlocked(f, t)) {
          els.push(h('div', { class: 'row-card locked' }, h('div', { class: 'fac-ico' }, '🔒'), h('div', { class: 'grow' }, h('div', { class: 't' }, T.name + ' press'), h('div', { class: 'd' }, 'Opens when you own a ' + Factory.TIERS[t - 1].name.toLowerCase() + ' press.'))));
          break;
        }
        const shape = Factory.shapes(t)[Math.min(Factory.shapes(t).length - 1, t === 4 ? 5 : Math.floor(Factory.shapes(t).length / 2))];
        const ico = UI.canvasFor(34, 34, (ctx) => {
          let w = 0, hh = 0; for (const [x, y] of shape) { w = Math.max(w, x + 1); hh = Math.max(hh, y + 1); }
          const cs = Math.floor(Math.min(30 / w, 30 / hh, 10));
          for (const [x, y] of shape) Render.drawCell(ctx, look.skin, look.colors[1 + ((t - 1) % 7)], (34 - w * cs) / 2 + x * cs, (34 - hh * cs) / 2 + (hh - 1 - y) * cs, cs);
        });
        const r = { t, lvl: h('span', { class: 'lvl' }), d: h('div', { class: 'd' }), bar: h('i'), b1: h('button', { class: 'btn sm primary', onclick: () => this.buy(t, 1) }), bm: h('button', { class: 'btn sm', onclick: () => this.buy(t, Math.max(1, Factory.affordable(f, t))) }) };
        els.push(h('div', { class: 'row-card', 'data-tier': t }, h('div', { class: 'fac-ico' }, ico),
          h('div', { class: 'grow' }, h('div', { class: 't' }, T.name + ' press', r.lvl), r.d, h('div', { class: 'bar' }, r.bar)),
          h('div', { class: 'fac-buy' }, r.b1, r.bm)));
        this.rows.push(r);
      }
      els.push(h('div', { class: 'fac-h' }, 'Quality control'));
      this.qc = { lvl: h('span', { class: 'lvl' }), d: h('div', { class: 'd' }), b: h('button', { class: 'btn sm primary', onclick: () => { if (Factory.buyInspector(f)) { this.app.sound.play('buy'); this.afterEvents(); this.update(); } } }) };
      els.push(h('div', { class: 'row-card' }, h('div', { class: 'fac-ico big' }, '🔍'), h('div', { class: 'grow' }, h('div', { class: 't' }, 'Inspector', this.qc.lvl), this.qc.d), h('div', { class: 'fac-buy' }, this.qc.b)));
      els.push(h('p', { class: 'fac-note' }, 'About one mino in ten comes off the line cracked. Click it off the belt before it ships — a shipped defect is refunded at a loss; a caught one pays, more on a streak. Presses double their output at ' + Factory.MILESTONES.slice(0, 4).join(', ') + ' … owned. The factory runs while Lull is closed, for up to ' + Factory.OFFLINE_HOURS + ' hours.'));
      this.list.replaceChildren(...els);
      this.update();
    }

    update() {
      const f = this.f, r = Factory.rates(f);
      this.tCredits.v.textContent = fmt(Math.floor(f.credits)) + '¢';
      this.tRate.v.textContent = '+' + fmt(r.perSec) + '¢';
      this.tRate.l.textContent = 'Per second' + (f.streak > 1 ? ' · streak ' + f.streak : '');
      const size = Factory.crateSize(f), full = f.crate >= size;
      this.crateBar.style.width = (100 * Math.min(1, f.crate / size)).toFixed(1) + '%';
      this.crateTxt.textContent = full ? 'Crate full: ' + Factory.crateLines(f) + ' ◆' : fmt(Math.floor(f.crate)) + ' / ' + fmt(size) + '¢ → ' + Factory.crateLines(f) + ' ◆';
      this.crateBtn.disabled = !full;
      this.crateBtn.classList.toggle('primary', full);
      for (const row of this.rows) {
        const t = row.t, T = Factory.TIERS[t], n = f.owned[t] || 0, next = Factory.nextMilestone(f, t), prev = Factory.MILESTONES.filter((m) => m <= n).pop() || 0;
        row.lvl.textContent = '×' + n;
        row.d.replaceChildren('+' + fmt(T.rate * Factory.multiplier(f, t)) + '¢/s each', h('span', { class: 'opt' }, ' · ' + fmt(Factory.tierRate(f, t)) + '¢/s in all'), next ? ' · ×2 at ' + next : '');
        row.bar.style.width = next ? (100 * (n - prev) / (next - prev)).toFixed(1) + '%' : '100%';
        const c1 = Factory.cost(f, t, 1), k = Factory.affordable(f, t);
        row.b1.textContent = 'Buy · ' + fmt(c1) + '¢';
        row.b1.disabled = f.credits < c1;
        row.bm.textContent = 'Max' + (k > 1 ? ' (' + k + ')' : '');
        row.bm.disabled = k < 1;
      }
      const qc = Factory.inspectCost(f);
      this.qc.lvl.textContent = 'lvl ' + f.inspect;
      this.qc.d.textContent = 'Catches ' + Math.round(r.C * 100) + '% of the defects you miss.';
      this.qc.b.textContent = isFinite(qc) ? 'Upgrade · ' + fmt(qc) + '¢' : 'Maxed';
      this.qc.b.disabled = !(f.credits >= qc);
    }
  }

  L.Modes = { ClassicMode, BoardMode, PlayMode, PuzzleMode, FactoryMode };
  void CELL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
