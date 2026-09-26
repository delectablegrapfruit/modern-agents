// Lull — the three things to do: Free Play, Puzzles, and the Factory.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Game, Board, CELL, Pieces, Puzzles, Factory, Render, UI, ITEMS, ITEM_ORDER, fmt, fmtInt, fmtClock, fmtDuration } = L;
  const { h, toast } = UI;

  const ARROWS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const LOGICAL = { moveL: [-1, 0], moveR: [1, 0], lower: [0, -1], rotate: [0, 1] };
  const INVERT = { moveL: 'moveR', moveR: 'moveL', cw: 'ccw', ccw: 'cw', rotate: 'rotateInv' };

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
        if (this.pointer && this.settings.mouse) setTimeout(() => this.follow(), 0);
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
      if (this.pointer && ok) this.follow();
      if (this.afterAction) this.afterAction(a);
      return ok;
    }

    blocked() { return false; }

    /**
     * Mouse-only play (left and right buttons, wheel, pointer):
     *  - point: the piece follows the pointer's column, and its ghost goes to the resting spot nearest the pointer
     *    that the piece can actually get to — under a ledge too, if there is a way in
     *  - click (anywhere on the board's canvas, on the grid or off it): the piece goes where the ghost is
     *  - wheel: turn (down clockwise, up counter-clockwise)
     *  - right-click, or a click on the HOLD box: hold / swap back
     */
    bindMouse() {
      const c = this.canvas;
      const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      this.pointer = null;
      const enabled = () => this.settings.mouse && this.game && !this.blocked();
      c.addEventListener('mousemove', (e) => {
        this.pointer = pos(e);
        if (!enabled()) return;
        const hold = this.view.onHold(...this.pointer);
        if (hold !== this.view.holdHover) { this.view.holdHover = hold; this.view.dirty = true; }
        this.follow();
        c.style.cursor = hold ? 'pointer' : 'default';
      });
      c.addEventListener('mouseleave', () => { this.pointer = null; this.view.pointerCol = null; this.view.mouseGhost = null; this.view.holdHover = false; this.view.dirty = true; });
      c.addEventListener('mousedown', (e) => {
        if (!enabled()) return;
        if (performance.now() - this.app.focusedAt < 300) return; // the click that brought the window forward
        const [px, py] = pos(e);
        if (e.button === 2 || this.view.onHold(px, py)) { if (e.button === 0 || e.button === 2) this.action('hold'); return; }
        if (e.button !== 0) return;
        this.pointer = [px, py];
        this.follow();
        const t = this.mouseTarget;
        const g = this.game;
        if (t && g.piece && t.piece === g.piece) {
          g.piece.x = t.x; g.piece.y = t.y; g.piece.lastRot = false;
          g.s.drops++;
          g.lock();
          this.view.dirty = true;
        } else this.action('drop');
      });
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      c.addEventListener('wheel', (e) => {
        if (!enabled()) return;
        e.preventDefault();
        const now = performance.now();
        if (now - this.wheelAt < 110 || Math.abs(e.deltaY) < 2) return;
        this.wheelAt = now;
        this.action(e.deltaY > 0 ? 'cw' : 'ccw');
        this.follow();
      }, { passive: false });
    }

    /** Moves the piece to the pointer's column and works out where a click would put it. */
    follow() {
      const g = this.game;
      this.mouseTarget = null;
      this.view.mouseGhost = null;
      if (!this.pointer || !g || !g.piece || g.over || !this.settings.mouse) return;
      const cell = this.view.cellClamped(this.pointer[0], this.pointer[1]);
      if (!cell) return;
      if (cell.x !== this.view.pointerCol) this.view.pointerCol = cell.x;
      this.quiet = true;
      for (let i = 0; i < g.w; i++) if (!g.moveToward(cell.x)) break;
      this.quiet = false;
      const p = g.piece;
      this.view.dirty = true;
      if (p.special === 'phase' || p.special === 'drill' || g.mods.heavy) return; // those use the plain drop
      // Every spot the piece can reach from here by sliding and lowering; the resting ones are candidates.
      const b = p.type.rotBounds[p.rot], cells = p.type.rots[p.rot], board = g.board;
      const want = cell.x - (b.minX + Math.floor((b.w - 1) / 2));
      const seen = new Set([p.x + ',' + p.y]);
      const q = [[p.x, p.y]];
      let best = null, bestScore = Infinity;
      for (let head = 0; head < q.length && head < 4000; head++) {
        const [x, y] = q[head];
        if (!board.fits(cells, x, y - 1)) {
          let dx = board.wrap ? Math.abs(((x - want) % g.w + g.w) % g.w) : Math.abs(x - want);
          if (board.wrap) dx = Math.min(dx, g.w - dx);
          const score = dx * 100 + Math.abs(y + b.minY + (b.h - 1) / 2 - cell.y);
          if (score < bestScore) { bestScore = score; best = [x, y]; }
        }
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1]]) {
          const wx = board.wx(nx), k = wx + ',' + ny;
          if (seen.has(k) || !board.fits(cells, wx, ny)) continue;
          seen.add(k); q.push([wx, ny]);
        }
      }
      if (!best) return;
      this.mouseTarget = { piece: p, x: best[0], y: best[1] };
      this.view.mouseGhost = g.cellsOf(p, p.rot, best[0], best[1]);
    }

    showCard(content) {
      this.overlay.replaceChildren(h('div', { class: 'card' }, content));
      this.overlay.classList.remove('hidden');
    }
    hideCard() { this.overlay.classList.add('hidden'); this.overlay.replaceChildren(); }
    get cardOpen() { return !this.overlay.classList.contains('hidden'); }

    frame(now, dt) {
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
      const game = new Game({ w: 10, h: 20, previewCount: 3, maxHistory: 0 });
      this.attachGame(game, {});
      this.view.showBank = true;
      Object.assign(this, { level: 1, lines: 0, score: 0, acc: 0, lockT: 0, resets: 0, over: false, paused: false, started: !!start });
      if (start) { this.hideCard(); this.cs.games++; this.app.store.touch(); }
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
          if (g.fitsAt(p, p.rot, p.x, p.y - 1)) { p.y--; this.lockT = 0; this.view.dirty = true; } else { this.acc = 0; break; }
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
      L.Music.tempo = 1 + (Math.min(this.level, 15) - 1) * 0.035;
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
      if (g.fitsAt(p, p.rot, p.x, p.y - 1)) { p.y--; this.score += 1; this.acc = 0; this.renderStatus(); return true; }
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
        h('button', { class: 'btn sm' + (st.music ? ' on' : ''), 'data-tip': 'Music for Classic (Korobeiniki, the old folk tune)', onclick: () => { st.music = !st.music; this.app.store.touch(); this.renderControls(); } }, st.music ? '♪ Music on' : '♪ Music off'),
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

    afterHold() { this.syncCounters(); }

    onLock(r) {
      const st = this.app.store, F = st.state.stats.free, g = this.game;
      this.syncCounters();
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
        return h('button', {
          class: 'item-btn' + (n ? '' : ' empty'),
          'data-tip-title': it.icon + '  ' + it.name,
          'data-tip': it.desc,
          'data-tip-foot': (n ? 'You have ' + n + ' · ' : 'None left · buy for ◆' + it.price + ' · ') + 'key ' + keys[i],
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
      if (!st.state.inventory[id]) {
        if (st.state.lines < it.price) { toast(it.name + ' costs ' + fmtInt(it.price) + ' lines — you have ' + fmtInt(st.state.lines), 'bad'); this.app.sound.play('error'); return; }
        UI.confirm('Buy and use ' + it.name + '?', it.desc + ' Costs ' + fmtInt(it.price) + ' lines.', 'Buy & use', () => {
          if (st.buyItem(id)) { this.app.refreshWallet(); this.apply(id); }
        });
        return;
      }
      this.apply(id);
    }

    apply(id) {
      const g = this.game, st = this.app.store;
      const done = () => {
        st.useItem(id);
        this.app.sound.play('item');
        this.renderItems();
        this.renderStatus();
        this.view.dirty = true;
        toast(ITEMS[id].icon + ' ' + ITEMS[id].name, 'good', 1400);
      };
      const cur = g.piece;
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
        mods: { noRotate: has('rigid'), heavy: has('heavy'), noHold: has('nohold'), vanish: has('vanish') },
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
      if (g.piece.type.id !== t.id) return { swap: t.id };
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
    { kind: 'palette', id: 'assembly', test: (f) => f.tier >= 4 || (f.bestTier || 0) >= 4 },
    { kind: 'frame', id: 'hazard', test: (f) => f.tier >= 6 || (f.bestTier || 0) >= 6 },
    { kind: 'skin', id: 'steel', test: (f) => f.retools >= 1 },
    { kind: 'backdrop', id: 'belt', test: (f) => f.stats.caughtManual >= 250 },
    { kind: 'effect', id: 'sparks', test: (f) => (f.stats.orders || 0) >= 25 },
  ];

  const STATIONS = [
    { id: 'order', icon: '🛎', label: 'Counter' },
    { id: 'build', icon: '▦', label: 'Mold' },
    { id: 'press', icon: '⤓', label: 'Press' },
    { id: 'line', icon: '⚙', label: 'Line' },
  ];

  /**
   * The factory: a counter where customers order minos (build them in the mold, press them, get graded), and the
   * assembly line that runs by itself — you pull defects off it when you look in.
   */
  class FactoryMode {
    constructor(app) {
      this.app = app;
      this.f = Factory.migrate(app.store.state.factory);
      this.belt = new Factory.Belt(this.f);
      this.beltCanvas = document.getElementById('cv-belt');
      this.stationCanvas = document.getElementById('cv-station');
      this.view = new L.BeltView(this.beltCanvas, this.belt);
      this.scene = new L.StationView(this.stationCanvas);
      this.head = document.getElementById('fac-head');
      this.bar = document.getElementById('fac-stations');
      this.station = 'order';
      this.queue = [];
      this.tickets = [];
      this.active = null;
      this.rating = null;
      this.rng = new L.RNG((Date.now() ^ 0x5eed) >>> 0);
      this.nextCustomer = 2.5;
      this.visible = false;
      this.panelAt = 0;
      const pos = (c, e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      this.beltCanvas.addEventListener('mousemove', (e) => { this.view.hover = this.view.itemAt(...pos(this.beltCanvas, e)); this.beltCanvas.style.cursor = this.view.hover ? 'pointer' : 'default'; });
      this.beltCanvas.addEventListener('mouseleave', () => { this.view.hover = null; });
      this.beltCanvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const it = this.view.itemAt(...pos(this.beltCanvas, e));
        if (!it) return;
        this.belt.remove(it, 'manual');
        this.onBeltEvents(this.belt.drain());
      });
      this.stationCanvas.addEventListener('mousemove', (e) => {
        const hit = this.scene.hitAt(...pos(this.stationCanvas, e));
        this.scene.hover = hit;
        this.stationCanvas.style.cursor = hit ? 'pointer' : 'default';
      });
      this.stationCanvas.addEventListener('mouseleave', () => { this.scene.hover = null; });
      this.stationCanvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const hit = this.scene.hitAt(...pos(this.stationCanvas, e));
        if (hit) this.onHit(hit);
      });
    }

    get store() { return this.app.store; }

    /** Time that passed with nobody watching (or the app closed): the line kept running. */
    catchUp(announce) {
      const res = Factory.catchUp(this.f, Date.now());
      if (res && announce && res.seconds > 90) {
        toast('While you were away the line shipped ' + fmt(res.shipped) + ' minos: +' + fmt(res.credits) + '¢', 'good', 5000);
      }
      if (res) this.afterEvents();
      return res;
    }

    show() {
      this.catchUp(false);
      if (!this.belt.items.length) this.belt.prefill();
      this.visible = true;
      this.setStation(this.station);
      this.renderHead();
    }
    hide() { this.visible = false; this.f.lastTick = Date.now(); }

    /** Background tick (every second) while the factory is not on screen. */
    tick() {
      if (this.visible) return;
      const now = Date.now();
      const dt = (now - this.f.lastTick) / 1000;
      if (dt <= 0) return;
      if (dt > 30) this.catchUp(false);
      else { Factory.runExpected(this.f, dt); this.f.lastTick = now; this.afterEvents(); }
    }

    setStation(id) {
      if (id === 'build' && (!this.active || this.active.stage !== 'build')) this.active = this.tickets.find((t) => t.stage === 'build') || this.active;
      if (id === 'press' && (!this.active || this.active.stage !== 'press')) this.active = this.tickets.find((t) => t.stage === 'press') || this.active;
      this.station = id;
      const line = id === 'line';
      this.beltCanvas.classList.toggle('hidden', !line);
      this.stationCanvas.classList.toggle('hidden', line);
      this.view.resize(); this.scene.resize();
      this.renderBar();
    }

    renderBar() {
      const badge = {
        order: this.queue.length,
        build: this.tickets.filter((t) => t.stage === 'build').length,
        press: this.tickets.filter((t) => t.stage === 'press').length,
        line: 0,
      };
      this.bar.replaceChildren(...STATIONS.map((st) => h('button', {
        class: 'station' + (st.id === this.station ? ' on' : ''), 'aria-pressed': String(st.id === this.station),
        onclick: () => { this.setStation(st.id); this.app.sound.play('move'); },
      }, h('span', { class: 'si' }, st.icon), h('span', { class: 'sl' }, st.label), badge[st.id] ? h('span', { class: 'sb' }, String(badge[st.id])) : null)));
      this.barSig = JSON.stringify(badge) + this.station;
    }

    frame(now, dt) {
      const nowMs = Date.now();
      const gap = (nowMs - this.f.lastTick) / 1000;
      if (gap > 5) this.catchUp(false); // the window slept
      this.f.lastTick = nowMs;
      this.belt.step(dt);
      this.onBeltEvents(this.belt.drain());
      // Customers wander in while you are here (never while you are away: nobody waits on you).
      this.nextCustomer -= dt;
      if (this.nextCustomer <= 0) {
        if (this.queue.length < 3 && this.queue.length + this.tickets.length < 6) {
          this.queue.push({ order: Factory.newOrder(this.f, this.rng), arrived: this.scene.t });
          this.app.sound.play('bell');
        }
        this.nextCustomer = 14 + this.rng.next() * 22;
      }
      this.needle = (Math.sin(this.scene.t * (1.8 + this.f.tier * 0.12)) + 1) / 2;
      const tk = this.active;
      if (tk && tk.stage === 'press' && tk.pressAt != null && this.scene.t - tk.pressAt > 0.95) this.serve(tk);
      if (this.station === 'line') { this.view.resize(); this.view.render(dt, this.app.look(), this.app.theme); this.scene.t += dt; }
      else { this.scene.resize(); this.scene.render(dt, { station: this.station, queue: this.queue, tickets: this.tickets, active: this.active, rating: this.rating, look: this.app.look(), theme: this.app.theme, f: this.f, needle: this.needle }); }
      if (now - this.panelAt > 400) {
        this.panelAt = now;
        this.renderHead();
        const sig = JSON.stringify({ order: this.queue.length, build: this.tickets.filter((t) => t.stage === 'build').length, press: this.tickets.filter((t) => t.stage === 'press').length, line: 0 }) + this.station;
        if (sig !== this.barSig) this.renderBar();
      }
    }

    onHit(hit) {
      const snd = this.app.sound, t = this.scene.t;
      const tk = this.active;
      switch (hit.id) {
        case 'take': case 'takeBtn': {
          if (this.tickets.length >= 3 || !this.queue.length) return;
          const c = this.queue.shift();
          const n = c.order.cells.length;
          const ticket = { order: c.order, grid: Math.max(4, Math.min(7, n + 1)), cells: new Set(), paint: 0, stage: 'build' };
          this.tickets.push(ticket);
          this.active = ticket;
          snd.play('pack');
          this.setStation('build');
          break;
        }
        case 'ticket': {
          const pick = this.tickets[hit.data];
          if (!pick) return;
          this.active = pick;
          this.setStation(pick.stage === 'press' ? 'press' : 'build');
          break;
        }
        case 'cell':
          if (!tk || tk.stage !== 'build') return;
          if (tk.cells.has(hit.data)) { tk.cells.delete(hit.data); snd.play('lower'); }
          else { tk.cells.add(hit.data); snd.play('move'); }
          break;
        case 'paint': if (tk) { tk.paint = hit.data; snd.play('rotate'); } break;
        case 'clear': if (tk) { tk.cells.clear(); snd.play('blocked'); } break;
        case 'toPress':
          if (!tk || !tk.cells.size) return;
          tk.stage = 'press';
          snd.play('hold');
          this.setStation('press');
          break;
        case 'press': {
          if (!tk || tk.stage !== 'press' || tk.pressAt != null) return;
          tk.pressAt = t; tk.slamAt = t; tk.pressValue = this.needle;
          const off = Math.abs(this.needle - 0.5) * 2;
          tk.pressOff = off;
          [tk.verdict, tk.verdictColor] = off < 0.08 ? ['Perfect!', '#6cc486'] : off < 0.16 ? ['Great!', '#6cc486'] : off < 0.4 ? ['Good', '#f6c177'] : ['Okay', '#eb6f92'];
          snd.play('boom');
          break;
        }
        case 'next':
          this.rating = null;
          snd.play('move');
          break;
        case 'goto': this.setStation(hit.data); break;
        default: break;
      }
      this.renderBar();
    }

    serve(tk) {
      const cells = Array.from(tk.cells).map((k) => k.split(',').map(Number));
      const grade = Factory.gradeOrder(this.f, tk.order, { cells, paint: tk.paint, press: tk.pressOff });
      Factory.serveOrder(this.f, grade);
      if (grade.lines) { this.store.addLines(grade.lines, 'contracts'); this.app.refreshWallet(true); }
      this.tickets = this.tickets.filter((x) => x !== tk);
      this.active = this.tickets[0] || null;
      this.rating = { order: tk.order, grade, at: this.scene.t };
      this.app.sound.play(grade.total >= 80 ? 'solve' : grade.total >= 55 ? 'buy' : 'fail');
      this.setStation('order');
      this.afterEvents();
    }

    onBeltEvents(events) {
      if (!events.length) return;
      this.view.handleEvents(events, (v) => fmt(v) + '¢');
      const snd = this.app.sound, looking = this.station === 'line' && this.visible;
      for (const e of events) {
        if (e.kind === 'caught') snd.play('catch', Math.min(e.streak, 20));
        else if (e.kind === 'wasted') snd.play('error');
        else if (e.kind === 'escaped' && looking) snd.play('blocked');
        else if (e.kind === 'golden') { snd.play('golden'); this.store.addLines(e.lines, 'contracts'); this.app.refreshWallet(true); }
        else if (e.kind === 'stamp' && looking) snd.play('stamp');
      }
      this.afterEvents();
    }

    afterEvents() {
      this.f.bestTier = Math.max(this.f.bestTier || 1, this.f.tier);
      for (const u of REWARD_UNLOCKS) {
        if (!this.store.owns(u.kind, u.id) && u.test(this.f)) {
          this.store.grantCosmetic(u.kind, u.id);
          toast('Unlocked: ' + L.COSMETICS[u.kind][u.id].name + ' (' + L.COSMETIC_LABELS[u.kind].toLowerCase() + ') — equip it in the Shop', 'good', 5000);
        }
      }
      this.store.day();
      this.store.touch();
    }

    renderHead() {
      const f = this.f, r = Factory.rates(f);
      const affordable = Object.keys(Factory.UPGRADES).some((k) => f.credits >= Factory.cost(f, k)) || (Factory.nextTier(f) && f.credits >= Factory.nextTier(f).unlock);
      this.head.replaceChildren(
        h('div', { class: 'plant' }, Factory.plantName(f.plantSeed), h('span', { class: 'sub' }, Factory.TIERS[f.tier].name + 's')),
        h('div', { class: 'credits' }, h('div', { class: 'v' }, fmt(f.credits) + '¢'), h('div', { class: 'r' }, '+' + fmt(r.perSec) + '/s')),
        h('button', { class: 'btn' + (affordable ? ' primary' : ''), onclick: () => this.openUpgrades() }, 'Upgrades'));
    }

    openUpgrades() {
      const f = this.f;
      let handle = null;
      const body = h('div');
      const draw = () => {
        const r0 = Factory.rates(f);
        const cards = Object.entries(Factory.UPGRADES).map(([key, u]) => {
          const c = Factory.cost(f, key), maxed = !isFinite(c);
          const nf = JSON.parse(JSON.stringify(f)); nf.up[key]++;
          const r1 = Factory.rates(nf);
          const effect = key === 'press' ? fmt(r0.P) + ' → ' + fmt(r1.P) + ' minos/s' : key === 'quality' ? '×' + (r1.V / r0.V).toFixed(2) + ' value' : Math.round(r0.C * 100) + '% → ' + Math.round(r1.C * 100) + '% caught';
          return h('div', { class: 'up-card' },
            h('div', { class: 'up-top' }, h('span', { class: 'up-icon' }, u.icon), h('span', { class: 'up-name' }, u.name), h('span', { class: 'up-lvl' }, String(f.up[key]))),
            h('div', { class: 'up-eff' }, u.desc),
            h('div', { class: 'up-eff' }, maxed ? 'Maxed' : effect),
            maxed ? null : h('button', { class: 'btn sm primary', disabled: f.credits < c, onclick: () => { if (Factory.buy(f, key)) { this.app.sound.play('buy'); draw(); this.renderHead(); } } }, fmt(c) + '¢'));
        });
        const nt = Factory.nextTier(f), gain = Factory.retoolGain(f);
        body.replaceChildren(
          h('div', { class: 'up-row' }, cards),
          h('div', { class: 'row-card', style: { marginTop: '8px' } },
            h('div', { class: 'grow' }, h('div', { class: 't' }, nt ? 'Next line: ' + nt.name + 's' : 'Every line is running'),
              h('div', { class: 'd' }, nt ? 'Bigger orders, bigger pay (×' + Math.round(nt.value / Factory.TIERS[f.tier].value) + ')' : 'Decominoes: nothing bigger exists.')),
            nt ? h('button', { class: 'btn primary', disabled: f.credits < nt.unlock, onclick: () => {
              if (Factory.unlockTier(f)) { this.app.sound.play('solve'); this.belt.items = []; this.belt.prefill(); this.afterEvents(); draw(); this.renderHead(); }
            } }, fmt(nt.unlock) + '¢') : null),
          h('div', { class: 'row-card' },
            h('div', { class: 'grow' }, h('div', { class: 't' }, 'Retool'), h('div', { class: 'd' }, gain ? 'Start a new plant with +' + gain + ' patents (+25% value each, for good).' : 'Reach Pentominoes to earn patents.')),
            h('button', { class: 'btn', disabled: !gain, onclick: () => UI.confirm('Retool?', 'Presses, upgrades and product lines start over; patents stay.', 'Retool', () => {
              Factory.retool(f); this.belt.items = []; this.app.sound.play('solve'); this.afterEvents(); draw(); this.renderHead();
            }) }, 'Retool')),
          h('div', { class: 'fac-foot' }, h('button', { class: 'btn sm', onclick: () => this.openSpecSheet() }, 'Spec sheet: every legal shape')));
      };
      draw();
      handle = UI.openModal({ title: Factory.plantName(f.plantSeed), width: 520, body });
      void handle;
    }

    openSpecSheet() {
      const f = this.f, cat = Factory.catalog(f.tier), look = this.app.look();
      const shown = cat.slice(0, 160);
      UI.openModal({
        title: Factory.TIERS[f.tier].name + 's (' + cat.length + ')', width: 520,
        body: h('div', null,
          h('p', null, 'Exactly ' + f.tier + ' cell' + (f.tier > 1 ? 's' : '') + ', joined edge to edge. Anything else on the line is a defect.'),
          h('div', { class: 'catalog' }, shown.map((cells) => UI.canvasFor(44, 44, (ctx) => {
            const b = Pieces.boundsOf(cells), s = Math.floor(Math.min(36 / b.w, 36 / b.h, 10));
            for (const [x, y] of cells) Render.drawCell(ctx, look.skin, Render.hsl(200 + f.tier * 20, 55, 64), (44 - b.w * s) / 2 + (x - b.minX) * s, (44 - b.h * s) / 2 + (b.maxY - y) * s, s);
          }))),
          cat.length > shown.length ? h('p', null, '… and ' + (cat.length - shown.length) + ' more.') : null),
      });
    }
  }

  L.Modes = { ClassicMode, BoardMode, PlayMode, PuzzleMode, FactoryMode };
  void CELL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
