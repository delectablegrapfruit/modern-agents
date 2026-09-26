// Lull — the three things to do: Free Play, Puzzles, and the Factory.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Game, Board, CELL, Pieces, Puzzles, Factory, Render, UI, ITEMS, ITEM_ORDER, fmt, fmtInt, fmtClock, fmtDuration } = L;
  const { h, toast } = UI;

  const ARROWS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const LOGICAL = { moveL: [-1, 0], moveR: [1, 0], lower: [0, -1], rotate: [0, 1] };
  const INVERT = { moveL: 'moveR', moveR: 'moveL', cw: 'ccw', ccw: 'cw', rotate: 'rotateInv' };

  // Items that only change the piece in play, so they can be put back.
  const UNDOABLE = new Set(['reroll', 'mirror', 'pebble', 'sand', 'phase', 'drill', 'bomb', 'order', 'blueprint']);

  function playLockSound(snd, r) {
    if (r.special === 'bomb') snd.play('boom');
    else if (r.special === 'drill') snd.play('drill');
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
        mouse(() => { this.follow(); this.action('drop'); });
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
      const cell = this.view.cellClamped(this.pointer[0], this.pointer[1]);
      if (!cell) return;
      if (cell.x !== this.view.pointerCol) this.view.pointerCol = cell.x;
      this.quiet = true;
      for (let i = 0; i < g.w; i++) if (!g.moveToward(cell.x)) break;
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
      Object.assign(this, { level: 1, lines: 0, score: 0, acc: 0, lockT: 0, resets: 0, over: false, paused: false, started: !!start });
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
      this.renderStatus();
      st.touch();
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
      if (r.special !== 'settle') {
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
        s.combo > 0 ? h('span', null, 'Combo ', h('b', null, s.combo)) : null,
        h('span', null, 'Pieces ', h('b', null, fmtInt(s.pieces))),
        h('button', { class: 'btn sm', title: 'Start a fresh board', onclick: () => {
          if (this.game.board.isEmpty()) return this.newBoard();
          UI.confirm('New board?', 'Clear this board and start fresh. Lines you cleared stay banked.', 'New board', () => this.newBoard());
        } }, '↺ New board')].filter(Boolean));
    }

    renderItems() {
      const inv = this.app.store.state.inventory;
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '−', '='];
      this.itembar.replaceChildren(...ITEM_ORDER.map((id, i) => {
        const it = ITEMS[id], n = inv[id] || 0;
        const on = this.armed && this.armed.id === id && this.armed.piece === this.game.piece;
        return h('button', {
          class: 'item-btn' + (n || on ? '' : ' empty') + (on ? ' on' : ''),
          'data-tip-title': it.icon + '  ' + it.name,
          'data-tip': it.desc,
          'data-tip-foot': on ? 'In use — press again to put it back' : (n ? 'You have ' + n + ' · ' : 'None left · buy for ◆' + it.price + ' · ') + 'key ' + keys[i],
          onclick: () => this.useItem(id),
        }, it.icon, h('span', { class: 'k' }, keys[i]), h('span', { class: 'n' }, n ? String(n) : ''));
      }));
    }

    modeAction(a) {
      const m = /^item(\d+)$/.exec(a);
      if (m) { const id = ITEM_ORDER[Number(m[1]) - 1]; if (id) this.useItem(id); return true; }
      return false;
    }

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
        case 'sand': case 'phase': case 'drill': case 'bomb':
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

    save() { this.app.store.state.free = this.game.toJSON(); }
  }

  // ---- puzzles ------------------------------------------------------------------------------------------------------

  class PuzzleMode extends BoardMode {
    constructor(app) {
      super(app, 'cv-puzzle', 'puz-overlay');
      this.puzzle = null;
      this.el = {
        diff: document.getElementById('puz-diff'), id: document.getElementById('puz-id'), seed: document.getElementById('puz-seed'),
        goal: document.getElementById('puz-goal'), actions: document.getElementById('puz-actions'),
      };
      document.getElementById('puz-seedbtn').addEventListener('click', () => this.askSeed());
      document.getElementById('puz-daily').addEventListener('click', () => this.loadDaily());
      document.getElementById('puz-history').addEventListener('click', () => this.openHistory());
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

    openHistory() {
      let filter = 'all', handle = null;
      const list = h('div', { class: 'hist' });
      const draw = () => {
        const rows = this.ps.history.filter((e) => filter === 'all' || (filter === 'solved' ? e.solved : !e.solved));
        list.replaceChildren(...(rows.length ? rows.map((e) => {
          const d = Puzzles.DIFFS[e.diff];
          const label = e.daily ? 'Daily ' + d.name + ' · ' + e.daily : e.number ? d.name + ' #' + e.number : d.name + ' · seed';
          const when = new Date(e.at);
          return h('div', { class: 'hist-row' + (e.solved ? ' solved' : '') },
            h('span', { class: 'dot', style: { background: d.color } }),
            h('div', { class: 'grow' },
              h('div', { class: 't' }, label, h('span', { class: 'sub' }, ' · ' + e.title)),
              h('div', { class: 'd' }, (e.solved ? '✓ solved' + (e.ms ? ' in ' + fmtClock(e.ms) : '') : '✗ unsolved') + ' · ' + e.attempts + (e.attempts === 1 ? ' try' : ' tries') + ' · ' + when.toLocaleDateString() + ' ' + when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                e.mods.length ? ' · ' + e.mods.map((m) => Puzzles.MODS[m].icon).join(' ') : '')),
            h('button', { class: 'chip', title: 'Copy seed', onclick: () => { UI.copyText(e.seed); toast('Seed ' + e.seed + ' copied', 'good', 1400); } }, e.seed),
            h('button', { class: 'btn sm' + (e.solved ? '' : ' primary'), onclick: () => { handle.close(); this.load(e.seed, { number: e.number, daily: e.daily }); } }, e.solved ? 'Replay' : 'Try again'));
        }) : [h('p', null, filter === 'all' ? 'No puzzles yet — every one you open lands here.' : 'Nothing here yet.')]));
      };
      const seg = h('div', { class: 'seg' }, [['all', 'All'], ['unsolved', 'Unsolved'], ['solved', 'Solved']].map(([k, l]) => {
        const b = h('button', { 'aria-pressed': String(k === filter), onclick: () => { filter = k; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); } }, l);
        return b;
      }));
      const total = this.ps.history.length, solved = this.ps.history.filter((e) => e.solved).length;
      draw();
      handle = UI.openModal({ title: 'Puzzle history', width: 520, body: h('div', null, h('div', { class: 'hist-head' }, seg, h('span', null, solved + ' of ' + total + ' solved')), list) });
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
    { kind: 'palette', id: 'assembly', test: (f) => f.rank >= 3 },
    { kind: 'frame', id: 'hazard', test: (f) => f.rank >= 6 },
    { kind: 'skin', id: 'steel', test: (f) => f.stats.perfect >= 10 },
    { kind: 'backdrop', id: 'belt', test: (f) => f.stats.caught >= 150 },
    { kind: 'effect', id: 'sparks', test: (f) => f.stats.orders >= 25 },
  ];

  const STATIONS = [
    { id: 'orders', icon: '✉', label: 'Orders' },
    { id: 'mold', icon: '▦', label: 'Mold' },
    { id: 'kiln', icon: '♨', label: 'Kiln' },
    { id: 'paint', icon: '🎨', label: 'Paint' },
    { id: 'line', icon: '⚙', label: 'Line' },
  ];

  /**
   * The Mino Works. Online orders arrive in the inbox; accepting one prints a ticket that hangs on the rail and
   * rides the stations: pour the shape in the Mold, fire it in the Kiln (take it out in the green), spray it (and
   * sticker it) in the Paint booth, ship it — and after the delivery the customer's review comes back.
   * The Line is the idle part: stock minos, now and then a defect to flick into the bin.
   */
  class FactoryMode {
    constructor(app) {
      this.app = app;
      this.f = app.store.state.factory = Factory.migrate(app.store.state.factory);
      this.canvas = document.getElementById('cv-station');
      this.view = new L.WorksView(this.canvas);
      this.head = document.getElementById('fac-head');
      this.bar = document.getElementById('fac-stations');
      this.station = 'orders';
      this.active = this.work.tickets[0] || null;
      this.printing = null;
      this.judge = null;
      this.paintTool = 0;
      this.spraying = false;
      this.rng = new L.RNG((Date.now() ^ 0x5eed) >>> 0);
      this.line = new Factory.Line(this.f);
      this.nextOrder = this.work.inbox.length ? 20 : 1.2;
      this.visible = false;
      this.t = 0;
      this.panelAt = 0;
      const pos = (e) => { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      this.canvas.addEventListener('mousemove', (e) => {
        const [px, py] = pos(e);
        this.view.pointer = this.view.toDesign(px, py);
        const hit = this.view.hitAt(px, py);
        this.view.hover = hit;
        this.canvas.style.cursor = this.station === 'paint' && typeof this.paintTool === 'number' && hit && hit.id === 'canvas' ? 'none' : hit ? 'pointer' : 'default';
        if (this.spraying) this.spray();
      });
      this.canvas.addEventListener('mouseleave', () => { this.view.hover = null; this.view.pointer = null; this.spraying = false; });
      this.canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const [px, py] = pos(e);
        this.view.pointer = this.view.toDesign(px, py);
        const hit = this.view.hitAt(px, py);
        if (hit) this.onHit(hit);
      });
      root.addEventListener('mouseup', () => { this.spraying = false; });
      this.renderBar();
    }

    get store() { return this.app.store; }
    get work() { return this.f.work; }

    /** Time that passed with nobody watching (or the app closed): the line kept running. */
    catchUp(announce) {
      const res = Factory.catchUp(this.f, Date.now());
      if (res && announce && res.seconds > 90 && res.credits >= 1) toast('While you were away the line earned +' + fmt(res.credits) + '¢', 'good', 5000);
      if (res) this.afterEvents();
      return res;
    }

    show() {
      this.catchUp(false);
      this.visible = true;
      this.setStation(this.station);
      this.renderHead();
    }
    hide() { this.visible = false; this.spraying = false; this.f.lastTick = Date.now(); }

    /** Background tick (every second) while the factory is not on screen. */
    tick() {
      if (this.visible) return;
      const now = Date.now(), dt = (now - this.f.lastTick) / 1000;
      if (dt <= 0) return;
      if (dt > 30) this.catchUp(false);
      else { Factory.runExpected(this.f, dt); this.f.lastTick = now; }
    }

    setStation(id) {
      if (!STATIONS.some((s) => s.id === id)) id = 'orders';
      this.station = id;
      // The ticket in hand follows you to the station that needs it.
      if (id === 'mold' || id === 'paint') {
        if (!this.active || this.active.stage !== id) this.active = this.work.tickets.find((j) => j.stage === id) || this.active;
      }
      this.spraying = false;
      this.view.hover = null;
      this.view.fx = this.view.fx.filter((f) => f.kind === 'text');
      this.view.resize();
      this.renderBar();
    }

    counts() {
      const T = this.work.tickets, kilnReady = T.filter((j) => j.stage === 'kiln' && j.heat >= Factory.FIRING[j.order.fire].at - Factory.FIRE_BAND).length;
      return { orders: this.work.inbox.length, mold: T.filter((j) => j.stage === 'mold').length, kiln: kilnReady, paint: T.filter((j) => j.stage === 'paint').length, line: 0 };
    }

    renderBar() {
      const badge = this.counts();
      this.bar.replaceChildren(...STATIONS.map((st) => h('button', {
        class: 'station' + (st.id === this.station ? ' on' : ''), 'aria-pressed': String(st.id === this.station), 'data-station': st.id,
        onclick: () => { this.setStation(st.id); this.app.sound.play('move'); },
      }, h('span', { class: 'si' }, st.icon), h('span', { class: 'sl' }, st.label), badge[st.id] ? h('span', { class: 'sb' + (st.id === 'kiln' ? ' hot' : '') }, String(badge[st.id])) : null)));
      this.barSig = JSON.stringify(badge) + this.station;
    }

    kilnSlots() {
      const slots = [null, null, null];
      for (const j of this.work.tickets) if (j.stage === 'kiln' && j.slot != null) slots[j.slot] = j;
      return slots;
    }

    freeSlot() {
      const slots = this.kilnSlots(), n = Factory.kilnSlots(this.f);
      for (let i = 0; i < n; i++) if (!slots[i]) return i;
      return null;
    }

    frame(now, dt) {
      const nowMs = Date.now();
      if ((nowMs - this.f.lastTick) / 1000 > 5) this.catchUp(false); // the window slept
      this.f.lastTick = nowMs;
      this.t += dt;
      const snd = this.app.sound;
      // Orders come in while you are here (none pile up while you are away: nobody waits on you).
      this.nextOrder -= dt;
      if (this.nextOrder <= 0) {
        if (this.work.inbox.length < 3 && this.work.inbox.length + this.work.tickets.length < 6) {
          this.work.inbox.push(Factory.newOrder(this.f, this.rng));
          snd.play('bell');
          this.store.touch();
        }
        this.nextOrder = 16 + this.rng.next() * 18;
      }
      // Printing a ticket, then hanging it on the rail.
      if (this.printing) {
        this.printing.t += dt;
        if (this.printing.t >= this.printing.dur) {
          const job = { order: this.printing.order, stage: 'mold', built: [], grid: Math.max(5, Math.min(7, Math.max(...Object.values(Factory.bounds(this.printing.order.cells))) + 2)), heat: null, slot: null, coat: [], stickers: [], fly: 0 };
          this.work.tickets.push(job);
          this.active = job;
          this.printing = null;
          snd.play('pack');
          this.store.touch();
        }
      }
      for (const j of this.work.tickets) {
        if (j.fly != null && j.fly < 1) { j.fly = Math.min(1, j.fly + dt * 2.4); if (j.fly >= 1) { j.hung = this.t; snd.play('stamp'); } }
        if (j.stage === 'kiln') {
          const was = j.heat;
          j.heat = Math.min(1, j.heat + dt / Factory.KILN_SECONDS);
          const at = Factory.FIRING[j.order.fire].at;
          if (was < at - Factory.FIRE_BAND && j.heat >= at - Factory.FIRE_BAND) snd.play('bell');
        }
      }
      if (this.spraying) this.spray(dt);
      // The line: played for real on its station, in expectation elsewhere.
      if (this.station === 'line') { this.line.step(dt); this.onLineEvents(this.line.drain()); }
      else Factory.runExpected(this.f, dt);
      if (this.judge) this.stepJudge(dt);
      this.view.resize();
      this.view.render({
        station: this.station, f: this.f, work: this.work, active: this.active, printing: this.printing, judge: this.judge,
        kiln: this.kilnSlots(), kilnSlots: Factory.kilnSlots(this.f), freeSlot: this.freeSlot(), paintTool: this.paintTool,
        line: this.line, lastStamp: this.lastStamp, lastArm: this.lastArm, t: this.t, dt,
      });
      if (now - this.panelAt > 300) {
        this.panelAt = now;
        this.renderHead();
        const sig = JSON.stringify(this.counts()) + this.station;
        if (sig !== this.barSig) this.renderBar();
      }
    }

    /** Paint lands on every cell near the nozzle. */
    spray(dt) {
      const job = this.active, g = this.view.paintG, p = this.view.pointer;
      if (!job || job.stage !== 'paint' || !g || !p || typeof this.paintTool !== 'number' || this.judge) return;
      dt = dt || 0;
      const rate = Factory.sprayRate(this.f), R = g.s * 0.75;
      const color = Factory.PAINTS[this.paintTool].c;
      let any = false;
      job.built.forEach((k, i) => {
        const c = this.view.cellRect(g, i), cx = c.x + c.s / 2, cy = c.y + c.s / 2;
        const d = Math.hypot(cx - p[0], cy - p[1]);
        if (d > R + c.s * 0.35) return;
        const w = 1 - Math.max(0, d - c.s * 0.25) / (R + c.s * 0.1);
        if (w <= 0) return;
        const coat = job.coat[i] = job.coat[i] || [];
        const total = coat.reduce((a, v) => a + (v || 0), 0);
        if (total >= 1.6) return;
        coat[this.paintTool] = (coat[this.paintTool] || 0) + rate * dt * w;
        any = true;
      });
      if (dt && Math.random() < 0.9) this.view.mist(p[0], p[1], color);
      if (any) this.store.touch();
      if (any && (this.hissAt || 0) < this.t - 0.12) { this.hissAt = this.t; this.app.sound.play('stamp'); }
    }

    onHit(hit) {
      const snd = this.app.sound, job = this.active;
      switch (hit.id) {
        case 'ticket': {
          const pick = this.work.tickets[hit.data];
          if (!pick) return;
          this.active = pick;
          snd.play('move');
          this.setStation(pick.stage);
          break;
        }
        case 'rank': this.openUpgrades(); break;
        case 'accept': {
          if (this.printing || !this.work.inbox.length || this.work.tickets.length >= 3) return;
          this.printing = { order: this.work.inbox.shift(), t: 0, dur: 0.9 };
          snd.play('rotate');
          break;
        }
        case 'goto': this.setStation(hit.data); snd.play('move'); break;
        case 'cell': {
          if (!job || job.stage !== 'mold') return;
          const i = job.built.indexOf(hit.data);
          if (i >= 0) { job.built.splice(i, 1); snd.play('lower'); }
          else { job.built.push(hit.data); snd.play('move'); this.view.puff(hit.x + hit.w / 2, hit.y + hit.h / 2, '#ffb347', 4); }
          this.store.touch();
          break;
        }
        case 'clear': if (job) { job.built = []; snd.play('blocked'); this.store.touch(); } break;
        case 'toKiln': {
          const slot = this.freeSlot();
          if (!job || job.stage !== 'mold' || !job.built.length || slot == null) return;
          Object.assign(job, { stage: 'kiln', slot, heat: 0 });
          snd.play('hold');
          this.setStation('kiln');
          this.store.touch();
          break;
        }
        case 'pull': {
          const k = this.kilnSlots()[hit.data];
          if (!k) return;
          Object.assign(k, { stage: 'paint', slot: null });
          this.active = k;
          const d = this.view.kilnDoor(hit.data);
          this.view.puff(d.x + d.w / 2, d.y + d.h / 2, '#bbbbbb', 10);
          snd.play('pack');
          this.store.touch();
          if (!this.kilnSlots().some(Boolean)) this.setStation('paint');
          break;
        }
        case 'can': this.paintTool = hit.data; snd.play('rotate'); break;
        case 'sticker': this.paintTool = 'sticker'; snd.play('rotate'); break;
        case 'rag': if (job && job.stage === 'paint') { job.coat = []; job.stickers = []; snd.play('lower'); this.store.touch(); } break;
        case 'canvas': {
          if (!job || job.stage !== 'paint') return;
          if (this.paintTool === 'sticker') {
            const g = this.view.paintG, p = this.view.pointer;
            const i = job.built.findIndex((k, idx) => { const c = this.view.cellRect(g, idx); return p[0] >= c.x && p[0] < c.x + c.s && p[1] >= c.y && p[1] < c.y + c.s; });
            if (i < 0) return;
            const at = job.stickers.indexOf(i);
            if (at >= 0) job.stickers.splice(at, 1); else job.stickers.push(i);
            snd.play('pack');
            this.store.touch();
          } else { this.spraying = true; this.spray(); }
          break;
        }
        case 'ship': {
          if (!job || job.stage !== 'paint') return;
          const built = job.built.map((k) => k.split(',').map(Number));
          const rev = Factory.review(this.f, job.order, { built, heat: job.heat, coat: job.coat, stickers: new Set(job.stickers) }, this.rng);
          this.work.tickets = this.work.tickets.filter((x) => x !== job);
          this.active = this.work.tickets[0] || null;
          this.judge = { review: rev, t: 0, booked: false };
          this.spraying = false;
          snd.play('pack');
          this.store.touch();
          break;
        }
        case 'continue': this.judge = null; snd.play('move'); this.setStation('orders'); break;
        case 'item': {
          const it = hit.data;
          const [x0, y0] = [this.view.beltX(it.x), 330];
          const e = this.line.remove(it, 'manual');
          if (e) { this.view.fling(it, x0, y0, 241, 425, 16); this.onLineEvents(this.line.drain()); }
          break;
        }
        default: break;
      }
      this.renderBar();
    }

    /** The review: packing, the drive, the customer's pause — then the verdict (and the pay) arrives. */
    stepJudge(dt) {
      const J = this.judge;
      J.t += dt;
      if (!J.booked && J.t >= 4.2) {
        J.booked = true;
        const rev = J.review;
        J.ranks = Factory.settle(this.f, rev);
        this.store.addLines(rev.lines, 'contracts');
        this.app.refreshWallet(true);
        const snd = this.app.sound;
        snd.play(rev.stars >= 4 ? 'solve' : rev.stars >= 3 ? 'buy' : 'fail');
        if (J.ranks.length) setTimeout(() => snd.play('perfect'), 500);
        this.afterEvents();
      }
    }

    onLineEvents(events) {
      if (!events.length) return;
      const snd = this.app.sound, v = this.view;
      for (const e of events) {
        if (e.kind === 'stamp') { this.lastStamp = this.t; snd.play('stamp'); }
        else if (e.kind === 'caught') {
          if (e.how === 'auto') { this.lastArm = this.t; v.fling(e.item, v.beltX(e.item.x), 330, 241, 420, 16); }
          else snd.play('catch', Math.min(e.streak, 20));
          v.float('+' + fmt(e.value) + '¢', 241, 390, '#9be39b', 13);
        } else if (e.kind === 'wasted') { snd.play('error'); v.float('good one!', 241, 390, '#ffb3a7', 13); }
        else if (e.kind === 'escaped') { snd.play('blocked'); v.float('refund ' + fmt(e.value) + '¢', 440, 300, '#ff8a80', 13); }
        else if (e.kind === 'shipped') v.float('+' + fmt(e.value) + '¢', 440, 300, '#ffffff', 12);
        else if (e.kind === 'golden') { snd.play('golden'); v.float('+' + fmt(e.value) + '¢ ★', 440, 296, '#ffd35a', 15); }
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
      this.store.touch();
    }

    renderHead() {
      const f = this.f;
      const affordable = Object.keys(Factory.UPGRADES).some((k) => f.credits >= Factory.cost(f, k));
      const sig = Math.floor(f.credits) + '|' + affordable;
      if (sig === this.headSig) return;
      this.headSig = sig;
      this.head.replaceChildren(
        h('div', { class: 'credits', 'data-tip': 'Credits: from orders and the assembly line. Spend them on upgrades.' }, h('span', { class: 'v' }, fmt(Math.floor(f.credits)) + '¢')),
        h('button', { class: 'btn sm' + (affordable ? ' primary' : ''), onclick: () => this.openUpgrades() }, 'Upgrades'));
    }

    openUpgrades() {
      const f = this.f;
      const body = h('div');
      const draw = () => {
        const need = Factory.rankNeed(f.rank);
        body.replaceChildren(
          h('div', { class: 'row-card' },
            h('div', { class: 'grow' }, h('div', { class: 't' }, 'Rank ' + f.rank), h('div', { class: 'd' }, f.rp + ' / ' + need + ' ★ to rank ' + (f.rank + 1) + ': ' + Factory.rankNews(f.rank + 1).join(', ')))),
          h('div', { class: 'up-row' }, Object.entries(Factory.UPGRADES).map(([key, u]) => {
            const c = Factory.cost(f, key), maxed = !isFinite(c), lvl = f.up[key] || 0;
            return h('div', { class: 'up-card' },
              h('div', { class: 'up-top' }, h('span', { class: 'up-icon' }, u.icon), h('span', { class: 'up-name' }, u.name), h('span', { class: 'up-lvl' }, lvl + '/' + u.max)),
              h('div', { class: 'up-eff' }, u.desc),
              maxed ? h('div', { class: 'up-eff' }, 'Maxed') : h('button', { class: 'btn sm primary', disabled: f.credits < c, onclick: () => { if (Factory.buy(f, key)) { this.app.sound.play('buy'); this.store.touch(); draw(); this.headSig = null; this.renderHead(); } } }, fmt(c) + '¢'));
          })));
      };
      draw();
      UI.openModal({ title: 'Workshop', width: 560, body });
    }
  }

  L.Modes = { ClassicMode, BoardMode, PlayMode, PuzzleMode, FactoryMode };
  void CELL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
