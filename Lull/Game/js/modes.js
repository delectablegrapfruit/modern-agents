// Lull — the three things to do: Free Play, Puzzles, and the Factory.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Game, Board, CELL, Pieces, Puzzles, Factory, Render, UI, ITEMS, ITEM_ORDER, fmt, fmtInt, fmtClock, fmtDuration } = L;
  const { h, toast } = UI;

  const ARROWS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const LOGICAL = { moveL: [-1, 0], moveR: [1, 0], lower: [0, -1], rotate: [0, 1] };
  const INVERT = { moveL: 'moveR', moveR: 'moveL', cw: 'ccw', ccw: 'cw', rotate: 'rotateInv' };

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
      game.on('blocked', () => this.app.sound.play('blocked'));
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
      switch (a) {
        case 'moveL': ok = g.move(-1); if (ok) snd.play('move'); break;
        case 'moveR': ok = g.move(1); if (ok) snd.play('move'); break;
        case 'lower': {
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
      this.view.dirty = true;
      if (this.afterAction) this.afterAction(a);
      return ok;
    }

    blocked() { return false; }

    bindMouse() {
      const c = this.canvas;
      const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      c.addEventListener('mousemove', (e) => {
        if (!this.settings.mouse || !this.game || !this.game.piece || this.blocked()) return;
        const col = this.view.columnAt(...pos(e));
        if (col == null) return;
        for (let i = 0; i < this.game.w; i++) if (!this.game.moveToward(col)) break;
        this.view.dirty = true;
      });
      c.addEventListener('mousedown', (e) => {
        if (!this.settings.mouse || !this.game || this.blocked()) return;
        if (performance.now() - this.app.focusedAt < 300) return; // the click that brought the window forward
        const inside = this.view.columnAt(...pos(e)) != null;
        if (!inside) return;
        if (e.button === 0) this.action('drop');
        else if (e.button === 2) this.action('hold');
      });
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      c.addEventListener('wheel', (e) => {
        if (!this.settings.mouse || !this.game || this.blocked()) return;
        e.preventDefault();
        const now = performance.now();
        if (now - this.wheelAt < 90 || Math.abs(e.deltaY) < 2) return;
        this.wheelAt = now;
        this.action(e.deltaY > 0 ? 'cw' : 'ccw');
      }, { passive: false });
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
      if (r.special === 'bomb') snd.play('boom');
      else if (r.perfect) snd.play('perfect');
      else if (r.lines) snd.play('clear', r.lines);
      else snd.play('lock');
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
          title: it.name + ' — ' + it.desc + (n ? '' : ' (' + it.price + ' lines)'),
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
      if (r.perfect) snd.play('perfect'); else if (r.lines) snd.play('clear', r.lines); else snd.play('lock');
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
        ...p.mods.map((m) => h('span', { class: 'mod', title: Puzzles.MODS[m].desc }, h('span', { class: 'i' }, Puzzles.MODS[m].icon), Puzzles.MODS[m].name)));
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
    { kind: 'effect', id: 'sparks', test: (f) => f.stats.contractsDone >= 25 },
  ];

  class FactoryMode {
    constructor(app) {
      this.app = app;
      this.f = app.store.state.factory;
      Factory.fillContracts(this.f);
      this.belt = new Factory.Belt(this.f);
      this.canvas = document.getElementById('cv-belt');
      this.view = new L.BeltView(this.canvas, this.belt);
      this.head = document.getElementById('fac-head');
      this.panel = document.getElementById('fac-panel');
      this.tabs = document.getElementById('fac-tabs');
      this.sub = 'upgrades';
      this.visible = false;
      this.panelAt = 0;
      this.doneIds = new Set(this.f.contracts.filter((c) => c.done).map((c) => c.id));
      const pos = (e) => { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      this.canvas.addEventListener('mousemove', (e) => { this.view.hover = this.view.itemAt(...pos(e)); this.canvas.style.cursor = this.view.hover ? 'pointer' : 'default'; });
      this.canvas.addEventListener('mouseleave', () => { this.view.hover = null; });
      this.canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const it = this.view.itemAt(...pos(e));
        if (!it) return;
        const how = this.belt.remove(it, 'manual');
        this.app.sound.play(how === 'wasted' ? 'error' : 'catch');
        this.afterEvents();
      });
    }

    get store() { return this.app.store; }

    /** Time that passed with nobody watching (or the app closed). */
    catchUp(announce) {
      const res = Factory.catchUp(this.f, Date.now());
      if (res && announce && res.seconds > 90) {
        toast('While you were away (' + fmtDuration(res.seconds * 1000) + '): +' + fmt(res.credits) + '¢, ' + fmt(res.shipped) + ' minos shipped' + (res.cappedSeconds < res.seconds ? ' — the warehouse filled up' : ''), 'good', 6000);
      }
      if (res) this.afterEvents();
      return res;
    }

    show() {
      this.catchUp(false);
      if (!this.belt.items.length) this.belt.prefill();
      this.visible = true;
      this.view.resize();
      this.renderTabs();
      this.renderPanel();
      this.renderHead();
    }
    hide() { this.visible = false; this.f.lastTick = Date.now(); }

    /** Background tick (every second) while the belt is not on screen. */
    tick() {
      if (this.visible) return;
      const now = Date.now();
      const dt = (now - this.f.lastTick) / 1000;
      if (dt <= 0) return;
      if (dt > 30) this.catchUp(false);
      else { Factory.runExpected(this.f, dt); this.f.lastTick = now; this.afterEvents(); }
    }

    frame(now, dt) {
      const nowMs = Date.now();
      const gap = (nowMs - this.f.lastTick) / 1000;
      if (gap > 5) this.catchUp(false); // the window slept
      this.f.lastTick = nowMs;
      this.belt.step(dt);
      const events = this.belt.drain();
      if (events.length) {
        this.view.handleEvents(events, (v) => fmt(v) + '¢');
        for (const e of events) if (e.kind === 'escaped') this.app.sound.play('blocked');
        this.afterEvents();
      }
      this.view.render(dt, this.app.look(), this.app.theme);
      if (now - this.panelAt > 400) { this.panelAt = now; this.renderHead(); this.refreshPanel(); }
    }

    afterEvents() {
      // Contracts that just finished, rewards unlocked.
      const fresh = this.f.contracts.filter((c) => c.done && !this.doneIds.has(c.id));
      for (const c of fresh) this.doneIds.add(c.id);
      if (fresh.length === 1) toast('Contract done: ' + fresh[0].client + ' — claim it in the Factory', 'good', 3500);
      else if (fresh.length > 1) toast(fresh.length + ' contracts done — claim them in the Factory', 'good', 3500);
      if (fresh.length) { this.app.setBadge('factory', true); if (this.visible && this.sub === 'contracts') this.renderPanel(); }
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
      this.head.replaceChildren(
        h('div', { class: 'plant' }, Factory.plantName(f.plantSeed) + (f.retools ? ' · Plant ' + (f.retools + 1) : ''),
          h('span', { class: 'sub' }, Factory.TIERS[f.tier].name + ' line · ' + fmt(r.P) + ' minos/s · defects ' + (r.D * 100).toFixed(1) + '%' + (f.patents ? ' · ' + f.patents + ' patents' : ''))),
        h('div', { class: 'credits' }, h('div', { class: 'v' }, fmt(f.credits) + '¢'), h('div', { class: 'r' }, '+' + fmt(r.perSec) + '¢/s · flawless run ' + fmt(Math.floor(f.flawless)))));
    }

    renderTabs() {
      const done = this.f.contracts.filter((c) => c.done).length;
      this.tabs.replaceChildren(...[['upgrades', 'Upgrades'], ['contracts', 'Contracts' + (done ? ' (' + done + ')' : '')], ['plant', 'Plant & catalog']].map(([k, l]) =>
        h('button', { 'aria-selected': String(k === this.sub), onclick: () => { this.sub = k; this.renderTabs(); this.renderPanel(); } }, l)));
    }

    refreshPanel() {
      // Cheap refresh: enable/disable buttons and progress without rebuilding while the mouse is over them.
      if (this.sub === 'upgrades') {
        for (const b of this.panel.querySelectorAll('button[data-cost]')) b.disabled = !(this.f.credits >= Number(b.dataset.cost));
      } else if (this.sub === 'contracts') {
        const sig = this.f.contracts.map((c) => c.id + ':' + Math.floor(c.progress / Math.max(1, c.target) * 50) + (c.done ? 'd' : '')).join('|');
        if (sig !== this.sig) this.renderPanel();
      } else if (this.sub === 'plant') {
        const b = this.panel.querySelector('button[data-retool]');
        if (b) b.disabled = !Factory.retoolGain(this.f);
      }
    }

    renderPanel() {
      const f = this.f;
      const els = [];
      if (this.sub === 'upgrades') {
        const nt = Factory.nextTier(f);
        if (nt) {
          const cur = Factory.TIERS[f.tier];
          els.push(h('div', { class: 'row-card highlight' },
            h('div', { class: 'grow' }, h('div', { class: 't' }, 'New product line: ' + nt.name + 's'),
              h('div', { class: 'd' }, nt.n + '-cell pieces · worth ×' + Math.round(nt.value / cur.value) + ' · more ways to go wrong')),
            h('button', { class: 'btn primary', 'data-cost': nt.unlock, disabled: f.credits < nt.unlock, onclick: () => {
              if (Factory.unlockTier(f)) { this.app.sound.play('buy'); toast(nt.name + ' line running', 'good'); this.belt.items = this.belt.items.filter((it) => it.gone); this.afterEvents(); this.renderPanel(); }
            } }, fmt(nt.unlock) + '¢')));
        } else els.push(h('div', { class: 'row-card' }, h('div', { class: 'grow' }, h('div', { class: 't' }, 'Every product line is running'), h('div', { class: 'd' }, 'Decominoes: the finest ten-cell pieces money can buy.'))));
        const r0 = Factory.rates(f);
        for (const [key, u] of Object.entries(Factory.UPGRADES)) {
          const lvl = f.up[key];
          const c = Factory.cost(f, key);
          const maxed = !isFinite(c);
          const nf = JSON.parse(JSON.stringify(f)); nf.up[key]++;
          const r1 = Factory.rates(nf);
          let effect = '';
          if (key === 'press' || key === 'tempo') effect = fmt(r0.P) + ' → ' + fmt(r1.P) + ' minos/s';
          else if (key === 'mold') effect = fmt(r0.V) + ' → ' + fmt(r1.V) + '¢ each';
          else if (key === 'calib') effect = 'defects ' + (r0.D * 100).toFixed(1) + '% → ' + (r1.D * 100).toFixed(1) + '%';
          else if (key === 'inspect') effect = 'catches ' + Math.round(r0.C * 100) + '% → ' + Math.round(r1.C * 100) + '%';
          else if (key === 'warehouse') effect = r0.offlineHours + ' h → ' + r1.offlineHours + ' h away';
          else effect = lvl ? 'installed' : 'defects glow on the belt';
          const buyOne = () => { if (Factory.buy(f, key)) { this.app.sound.play('buy'); this.renderPanel(); this.renderHead(); } };
          const buyMax = () => { let n = 0; while (n < 500 && Factory.buy(f, key)) n++; if (n) { this.app.sound.play('buy'); toast('+' + n + ' presses', 'good', 1400); this.renderPanel(); this.renderHead(); } };
          els.push(h('div', { class: 'row-card' },
            h('div', { class: 'grow' }, h('div', { class: 't' }, u.name, h('span', { class: 'lvl' }, key === 'press' ? '×' + (lvl + 1) : key === 'lens' ? '' : 'lvl ' + lvl)),
              h('div', { class: 'd' }, u.desc + (maxed ? '' : ' · ' + effect))),
            key === 'press' && !maxed ? h('button', { class: 'btn sm', 'data-cost': c, disabled: f.credits < c, onclick: buyMax, title: 'Buy as many as you can afford' }, 'Max') : null,
            maxed ? h('span', { class: 'owned' }, 'Maxed') : h('button', { class: 'btn', 'data-cost': c, disabled: f.credits < c, onclick: buyOne }, fmt(c) + '¢')));
        }
      } else if (this.sub === 'contracts') {
        this.sig = f.contracts.map((c) => c.id + ':' + Math.floor(c.progress / Math.max(1, c.target) * 50) + (c.done ? 'd' : '')).join('|');
        els.push(h('div', { class: 'd', style: { color: 'var(--muted)', fontSize: '12px', padding: '0 2px 2px' } }, 'Orders from clients. They never expire; some pay in lines and items for the rest of the game.'));
        for (const c of f.contracts) {
          const what = c.kind === 'ship' ? 'Ship ' + fmt(c.target) + ' minos' : c.kind === 'catch' ? 'Pull ' + c.target + ' defects off the belt by hand' : c.kind === 'earn' ? 'Earn ' + fmt(c.target) + '¢' : 'Ship ' + fmt(c.target) + ' minos in a row without a defect getting out';
          const rw = [];
          if (c.reward.credits) rw.push(h('span', null, h('b', null, fmt(c.reward.credits) + '¢')));
          if (c.reward.lines) rw.push(h('span', null, h('b', { style: { color: 'var(--gem)' } }, '◆ ' + c.reward.lines + ' lines')));
          if (c.reward.item) rw.push(h('span', null, h('b', null, ITEMS[c.reward.item].icon + ' ' + ITEMS[c.reward.item].name)));
          els.push(h('div', { class: 'row-card' + (c.done ? ' highlight' : '') },
            h('div', { class: 'grow' }, h('div', { class: 't' }, c.client), h('div', { class: 'd' }, what),
              h('div', { class: 'bar' + (c.done ? ' good' : '') }, h('i', { style: { width: Math.min(100, 100 * c.progress / c.target).toFixed(1) + '%' } })),
              h('div', { class: 'reward' }, fmt(Math.floor(c.progress)) + ' / ' + fmt(c.target), ' · reward ', rw)),
            c.done ? h('button', { class: 'btn primary', onclick: () => this.claim(c.id) }, 'Claim') : null));
        }
      } else {
        const gain = Factory.retoolGain(f);
        els.push(h('div', { class: 'row-card highlight' },
          h('div', { class: 'grow' }, h('div', { class: 't' }, 'Retool the plant'),
            h('div', { class: 'd' }, gain ? 'Start a new plant with +' + gain + ' patent' + (gain > 1 ? 's' : '') + ' (each: +25% value, for good). Presses, upgrades and product lines reset; patents, warehouse and lens stay.'
              : 'Patents come from the best line a plant reaches: Pentominoes 1, Hexominoes 3, Heptominoes 8, Octominoes 20 …')),
          h('button', { class: 'btn', 'data-retool': '1', disabled: !gain, onclick: () => UI.confirm('Retool?', 'Close ' + Factory.plantName(f.plantSeed) + ' and open a new plant with ' + (f.patents + gain) + ' patents.', 'Retool', () => {
            Factory.retool(f); Factory.fillContracts(f); this.belt.items = []; this.doneIds.clear(); this.app.sound.play('solve'); toast('New plant: ' + Factory.plantName(f.plantSeed), 'good'); this.afterEvents(); this.renderPanel(); this.renderHead();
          }) }, 'Retool')));
        const cat = Factory.catalog(f.tier);
        const look = this.app.look();
        const shown = cat.slice(0, 120);
        els.push(h('div', { class: 't', style: { fontWeight: 700, margin: '6px 2px 0' } }, 'Spec sheet: every legal ' + Factory.TIERS[f.tier].name.toLowerCase() + ' (' + cat.length + ')'),
          h('div', { class: 'd', style: { color: 'var(--muted)', fontSize: '11.5px', margin: '0 2px 4px' } }, 'Exactly ' + f.tier + ' cell' + (f.tier > 1 ? 's' : '') + ', joined edge to edge. Anything else on the belt is a defect: too many or too few cells, a piece broken off or hanging by a corner, a crack, a scorch mark.'));
        els.push(h('div', { class: 'catalog' }, shown.map((cells) => UI.canvasFor(44, 44, (ctx) => {
          const b = Pieces.boundsOf(cells), s = Math.floor(Math.min(36 / b.w, 36 / b.h, 10));
          for (const [x, y] of cells) Render.drawCell(ctx, look.skin, Render.hsl(200 + f.tier * 20, 55, 64), (44 - b.w * s) / 2 + (x - b.minX) * s, (44 - b.h * s) / 2 + (b.maxY - y) * s, s);
        }))));
        if (cat.length > shown.length) els.push(h('div', { class: 'd', style: { color: 'var(--muted)', fontSize: '11.5px' } }, '… and ' + (cat.length - shown.length) + ' more.'));
      }
      this.panel.replaceChildren(...els);
    }

    claim(id) {
      const reward = Factory.claim(this.f, id);
      if (!reward) return;
      const parts = [];
      if (reward.credits) parts.push(fmt(reward.credits) + '¢');
      if (reward.lines) { this.store.addLines(reward.lines, 'contracts'); parts.push('◆ ' + reward.lines + ' lines'); this.app.refreshWallet(true); }
      if (reward.item) { this.store.grantItem(reward.item); parts.push(ITEMS[reward.item].icon + ' ' + ITEMS[reward.item].name); this.app.modes.play.renderItems(); }
      this.app.sound.play('buy');
      toast('Claimed: ' + parts.join(' · '), 'good');
      if (!this.f.contracts.some((c) => c.done)) this.app.setBadge('factory', false);
      this.store.touch();
      this.renderTabs();
      this.renderPanel();
    }
  }

  L.Modes = { BoardMode, PlayMode, PuzzleMode, FactoryMode };
  void CELL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
