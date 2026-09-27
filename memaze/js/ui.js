/* Memaze — menus, customisation screens, HUD and results. Screens are rebuilt each time they open, so they always
 * show the current state. */
(function () {
  'use strict';
  const MZ = window.MZ;
  const { h, $, $$, clamp } = MZ;
  const Game = () => MZ.Game;
  const S = () => MZ.Save.settings;
  const P = () => MZ.Save.progress;

  // ---------- settings controls bound to a dotted path ----------
  const getPath = (path) => path.split('.').reduce((o, k) => o[k], S());
  function setPath(path, v) {
    const keys = path.split('.'), last = keys.pop();
    keys.reduce((o, k) => o[k], S())[last] = v;
    MZ.Save.saveSettings();
    Game().applySettings();
  }
  function range(label, path, min, max, step, fmt, after) {
    const out = h('output');
    const show = (v) => (out.textContent = fmt ? fmt(v) : String(v));
    const inp = h('input', { type: 'range', min, max, step, value: getPath(path) });
    inp.addEventListener('input', () => { const v = parseFloat(inp.value); show(v); setPath(path, v); if (after) after(v); });
    show(getPath(path));
    return h('label', { class: 'ctl' }, h('span', null, label), inp, out);
  }
  function toggle(label, path, after) {
    const inp = h('input', { type: 'checkbox', checked: !!getPath(path) });
    inp.addEventListener('change', () => { setPath(path, inp.checked); if (after) after(inp.checked); });
    return h('label', { class: 'ctl toggle' }, h('span', null, label), inp, h('i', { class: 'sw' }));
  }
  function select(label, path, opts, after) {
    const sel = h('select', null, opts.map(([v, l]) => h('option', { value: v, selected: String(getPath(path)) === String(v) }, l)));
    sel.addEventListener('change', () => { const v = typeof getPath(path) === 'number' ? parseFloat(sel.value) : sel.value; setPath(path, v); if (after) after(v); });
    return h('label', { class: 'ctl' }, h('span', null, label), sel);
  }
  function segmented(label, path, opts, after) {
    const wrap = h('div', { class: 'seg' });
    const paint = () => $$('button', wrap).forEach((b) => b.classList.toggle('on', b.dataset.v === String(getPath(path))));
    for (const [v, l] of opts) wrap.appendChild(h('button', { 'data-v': v, onclick: () => { setPath(path, v); paint(); if (after) after(v); } }, l));
    paint();
    return h('div', { class: 'ctl' }, h('span', null, label), wrap);
  }
  function color(label, path) {
    const inp = h('input', { type: 'color', value: getPath(path) });
    inp.addEventListener('input', () => setPath(path, inp.value));
    return h('label', { class: 'ctl' }, h('span', null, label), inp);
  }
  const pct = (v) => Math.round(v * 100) + '%';
  const secs = (v) => v + ' s';
  const times = (v) => v.toFixed(2) + 'x';
  const section = (title, ...kids) => h('div', { class: 'section' }, title ? h('h3', null, title) : null, ...kids);
  const btn = (label, onclick, cls) => h('button', { class: 'btn ' + (cls || ''), onclick: (e) => { MZ.Audio.unlock(); MZ.Audio.play('click'); onclick(e); } }, label);
  const par = (sec) => MZ.fmtClock(sec).replace(/\.00$/, '');
  // Star rating drawn with CSS shapes.
  const starRow = (n, cls) => h('span', { class: cls, role: 'img', 'aria-label': n + (n === 1 ? ' star' : ' stars') },
    [0, 1, 2].map((i) => h('i', { class: 'star' + (i < n ? ' got' : ''), style: { animationDelay: 0.25 + i * 0.28 + 's' } })));
  const FLOORS = [['classic', 'Flat'], ['neon', 'Neon'], ['glass', 'Glass'], ['retro', 'Retro']];

  // ---------- screens ----------
  const UI = {
    stack: [],
    current: null,

    init() {
      this.host = $('#screens');
      this.hud = {
        label: $('#hud-label'), time: $('#hud-time'), goals: $('#hud-goals'), gems: $('#hud-gems'),
        lives: $('#hud-lives'), banner: $('#hud-banner'), fps: $('#fps'),
      };
      $('#btn-pause').addEventListener('click', () => { MZ.Audio.play('click'); Game().pause(); });
      const G = Game();
      G.on('state', (st) => this.onState(st));
      G.on('begin', () => this.onBegin());
      G.on('result', (r) => this.show('results', r));
      G.on('over', (r) => this.show('over', r));
      G.on('bonus', (txt) => this.banner(txt, 900));
      G.on('tick', () => { this.hud.time.classList.remove('warn'); void this.hud.time.offsetWidth; this.hud.time.classList.add('warn'); });
      G.on('unlocks', (ids) => {
        for (const id of ids || []) {
          const p = MZ.Background && MZ.Background.PATTERNS.find((x) => x.id === id);
          if (p) { MZ.toast('New background pattern: ' + p.name, 3500); MZ.Audio.play('unlock'); }
        }
      });
      G.on('frame', () => this.updateHud());
      MZ.Media.on('change', () => { if (this.current && this.current.refreshOnMedia) this.rebuild(); });
      this.bindKeys();
      this.bindDrop();
    },

    onState(st) {
      $('#hud').hidden = !['play', 'fx', 'paused'].includes(st);
      if (st === 'paused') this.show('pause');
      if (st === 'play') this.closeAll();
      if (st === 'menu') this.show('title', null, true);
    },
    onBegin() {
      this._hudCache = {};
    },

    banner(text, ms) {
      const b = this.hud.banner;
      b.textContent = text;
      b.className = 'on';
      clearTimeout(this._bannerT);
      this._bannerT = setTimeout(() => (b.className = ''), ms || 900);
    },

    updateHud() {
      const G = Game();
      if ($('#hud').hidden) return;
      const c = this._hudCache || (this._hudCache = {});
      const set = (k, el, v) => { if (c[k] !== v) { c[k] = v; el.textContent = v; } };
      set('label', this.hud.label, G.meta ? G.meta.label : '');
      const timer = S().gameplay.timer || G.mode === 'endless';
      set('time', this.hud.time, timer ? MZ.fmtTime(G.clock) : MZ.fmtTime(G.elapsed));
      this.hud.time.classList.toggle('low', timer && G.clock < 10);
      if (G.mode === 'endless') {
        set('gems', this.hud.gems, 'Gems ' + (G.run.gems || 0));
        set('goals', this.hud.goals, 'Score ' + G.endlessScore());
        this.hud.goals.classList.remove('late');
      } else if (G.maze) {
        set('gems', this.hud.gems, G.gems.length ? 'Gems ' + G.gemsTaken + '/' + G.gems.length : '');
        set('goals', this.hud.goals, 'Par ' + par(G.maze.parTime));
        this.hud.goals.classList.toggle('late', G.elapsed > G.maze.parTime);
      }
      set('lives', this.hud.lives, G.mode === 'gauntlet' || G.mode === 'endless' ? 'Lives ' + Math.max(0, G.run.lives) : '');
      set('fps', this.hud.fps, S().display.fps ? G.fps + ' fps' : '');
    },

    // Screen management.
    show(name, arg, replaceAll) {
      if (replaceAll) this.stack = [];
      const builder = this.screens[name];
      if (!builder) return;
      const el = builder.call(this, arg);
      el.classList.add('screen', 'screen-' + name);
      this.stack.push({ name, arg, el, refreshOnMedia: !!el.dataset.media });
      this.render();
    },
    rebuild() {
      const top = this.stack[this.stack.length - 1];
      if (!top) return;
      const scroll = top.el.querySelector('.panel') && top.el.querySelector('.panel').scrollTop;
      top.el = this.screens[top.name].call(this, top.arg);
      top.el.classList.add('screen', 'screen-' + top.name);
      this.render();
      const pnl = top.el.querySelector('.panel');
      if (pnl && scroll) pnl.scrollTop = scroll;
    },
    render() {
      const top = this.stack[this.stack.length - 1];
      this.current = top || null;
      this.host.textContent = '';
      if (top) this.host.appendChild(top.el);
    },
    back() {
      const top = this.stack[this.stack.length - 1];
      if (!top || ['title', 'results', 'over'].includes(top.name)) return;
      this.stack.pop();
      if (top.name === 'pause') { this.render(); Game().resume(); return; }
      if (!this.stack.length && Game().state === 'menu') this.stack.push({ name: 'title', arg: null });
      if (this.stack.length) {
        const t = this.stack[this.stack.length - 1];
        t.el = this.screens[t.name].call(this, t.arg);
        t.el.classList.add('screen', 'screen-' + t.name);
      }
      this.render();
    },
    closeAll() { this.stack = []; this.render(); },

    panel(title, kids, o) {
      o = o || {};
      const head = h('div', { class: 'head' },
        o.noBack ? null : h('button', { class: 'back', 'aria-label': 'Back', title: 'Back', onclick: () => { MZ.Audio.play('click'); this.back(); } }),
        title ? h('h2', null, title) : null, o.extra || null);
      return h('section', { class: o.cls || '' }, h('div', { class: 'panel' + (o.wide ? ' wide' : '') }, head.children.length ? head : null, h('div', { class: 'body' }, kids)));
    },

    // ---------- keyboard, gamepad ----------
    bindKeys() {
      window.addEventListener('keydown', (e) => {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.key !== 'Escape') return;
        const G = Game(), st = G.state;
        if (G.FX.playing) return; // the win/lose overlay owns the keyboard while it plays
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
          if (st === 'play') { G.pause(); e.preventDefault(); return; }
          if (e.key === 'Escape' && this.stack.length && !(this.current && this.current.name === 'title')) { this.back(); e.preventDefault(); return; }
          if (st === 'paused' && (e.key === 'p' || e.key === 'P')) { this.back(); return; }
        }
        if ((e.key === 'r' || e.key === 'R') && ['play', 'paused', 'result'].includes(st) && !['gauntlet', 'endless'].includes(G.mode)) {
          G.restartLevel(); e.preventDefault(); return;
        }
        if ((e.key === 'Enter' || e.key === ' ') && (st === 'result' || st === 'over') && this.current && (this.current.name === 'results' || this.current.name === 'over') && !this.current.el.contains(document.activeElement)) { // a focused button there keeps its own key
          const b = $('.screen-' + this.current.name + ' .primary'); if (b) { b.click(); e.preventDefault(); }
        }
        if ((e.key === 'm' || e.key === 'M') && (st === 'play' || st === 'paused')) {
          const order = ['explored', 'full', 'off'], cur = S().gameplay.minimap;
          setPath('gameplay.minimap', order[(order.indexOf(cur) + 1) % 3]);
          MZ.toast('Minimap: ' + S().gameplay.minimap, 1200);
        }
        if (e.key === 'f' || e.key === 'F') this.fullscreen();
        if (e.key === '+' || e.key === '=') G.userZoom = clamp(G.userZoom * 1.15, 0.45, 2.2);
        if (e.key === '-' || e.key === '_') G.userZoom = clamp(G.userZoom / 1.15, 0.45, 2.2);
      });
      let prev = new Set();
      const poll = () => {
        const G = Game(), now = G.input.gamepadButtons();
        const pressed = (i) => now.has(i) && !prev.has(i);
        if (pressed(9)) { if (G.state === 'play') G.pause(); else if (G.state === 'paused') this.back(); }
        if (pressed(0)) {
          if (G.state === 'result') { const b = $('.screen-results .primary'); if (b) b.click(); }
          else if (G.state === 'over') { const b = $('.screen-over .primary'); if (b) b.click(); }
          else if (G.state === 'fx') G.FX.skip();
        }
        if (pressed(1) && this.stack.length && G.state !== 'menu') this.back();
        prev = now;
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    },
    fullscreen() {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      } catch (e) { /* not allowed here */ }
    },

    // ---------- drag & drop files anywhere outside gameplay ----------
    dropSlot() {
      const top = this.current;
      if (top && top.name === 'media') return this.mediaTab || 'player';
      if (top && top.name === 'background') return 'background';
      return 'player';
    },
    bindDrop() {
      const dz = $('#dropzone');
      let depth = 0;
      const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      window.addEventListener('dragenter', (e) => {
        if (!hasFiles(e) || Game().state === 'play') return;
        depth++;
        $('#drop-slot').textContent = MZ.Media.SLOT_INFO[this.dropSlot()].label;
        dz.hidden = false;
      });
      window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) dz.hidden = true; });
      window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
      window.addEventListener('drop', async (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth = 0;
        dz.hidden = true;
        if (Game().state === 'play') return;
        const slot = this.dropSlot();
        const items = await MZ.Media.importDataTransfer(e.dataTransfer, slot);
        if (items.length) {
          MZ.toast('Added ' + items.length + ' file' + (items.length > 1 ? 's' : '') + ' to ' + MZ.Media.SLOT_INFO[items[0].slot].label);
          if (items.length === 1) this.select(items[0]);
          if (!this.current || this.current.name !== 'media' && this.current.name !== 'background') { this.mediaTab = items[0].slot; this.show('media'); }
        }
      });
    },
    // Choose an item for its slot.
    select(item) {
      const s = S();
      if (item.slot === 'background') { s.background.kind = 'media'; s.background.media = item.id; }
      else s[item.slot].media = item.id;
      MZ.Save.saveSettings();
      Game().applySettings();
      if (item.slot === 'music') MZ.Audio.Music.start();
    },

    // ---------- media tiles ----------
    mediaGrid(slot) {
      const cfg = slot === 'background' ? S().background : S()[slot];
      const sel = cfg.media;
      const grid = h('div', { class: 'tiles' });
      const items = MZ.Media.list(slot);
      const chosen = (id) => (slot === 'background' ? S().background.kind === 'media' && sel === id : sel === id);
      // Built-ins without a picture get a small CSS drawing.
      const icon = (it) => it.id === 'none' ? h('div', { class: 'ico ico-none' })
        : it.id === 'default:portal' ? h('div', { class: 'ico ico-goal' }, 'GOAL')
          : h('div', { class: 'ico ico-wave' }, h('i'), h('i'), h('i'), h('i'), h('i'));
      for (const it of items) {
        const thumb = h('div', { class: 'thumb' });
        if (it.kind === 'image') thumb.appendChild(h('img', { src: it.url, alt: '', loading: 'lazy', draggable: false, class: it.pixel ? 'pixelated' : null }));
        else if (it.kind === 'video') {
          const v = h('video', { src: it.url, muted: true, loop: true, playsInline: true, preload: 'metadata' });
          v.muted = true;
          thumb.appendChild(v);
          thumb.addEventListener('pointerenter', () => v.play().catch(() => {}));
          thumb.addEventListener('pointerleave', () => v.pause());
          v.addEventListener('loadedmetadata', () => { try { v.currentTime = Math.min(0.2, v.duration / 2); } catch (e) { /* ignore */ } });
        } else thumb.appendChild(icon(it));
        const tile = h('div', { class: 'tile' + (chosen(it.id) ? ' on' : ''), title: it.name, tabindex: 0 },
          thumb,
          h('div', { class: 'name' }, it.name),
          it.source !== 'default' ? h('button', { class: 'del', 'aria-label': 'Remove', title: 'Remove', onclick: async (e) => {
            e.stopPropagation();
            if (!(await UI.ask('Remove “' + it.name + '”' + (it.source === 'imported' ? '' : ' from the folder on disk') + '?', 'Remove'))) return;
            await MZ.Media.remove(it.id);
          } }) : null);
        const choose = () => { MZ.Audio.play('click'); this.select(it); this.rebuild(); };
        tile.addEventListener('click', choose);
        tile.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
        grid.appendChild(tile);
      }
      if (items.filter((it) => it.source !== 'default').length > 1 || slot !== 'music') {
        grid.appendChild(h('div', { class: 'tile' + (chosen('random') ? ' on' : ''), tabindex: 0, onclick: () => {
          if (slot === 'background') { S().background.kind = 'media'; S().background.media = 'random'; } else S()[slot].media = 'random';
          MZ.Save.saveSettings(); Game().applySettings(); this.rebuild();
        } }, h('div', { class: 'thumb' }, h('div', { class: 'ico ico-die' })), h('div', { class: 'name' }, 'Random')));
      }
      const accept = MZ.Media.SLOT_INFO[slot].kinds.map((k) => k + '/*').join(',');
      const file = h('input', { type: 'file', multiple: true, accept, hidden: true });
      file.addEventListener('change', async () => {
        const out = await MZ.Media.importFiles(Array.from(file.files), slot);
        if (out.length === 1) this.select(out[0]);
        if (out.length) MZ.toast('Added ' + out.length + ' file' + (out.length > 1 ? 's' : ''));
        this.rebuild();
      });
      grid.appendChild(h('div', { class: 'tile add', tabindex: 0, onclick: () => file.click() }, h('div', { class: 'thumb' }, h('div', { class: 'ico ico-plus' })), h('div', { class: 'name' }, 'Add files'), file));
      return grid;
    },
    chromaControls(base) {
      const on = getPath(base + '.on');
      return h('details', { class: 'chroma-box', open: on },
        h('summary', null, 'Chroma key'),
        toggle('Key out a colour', base + '.on', () => this.rebuild()),
        color('Key colour', base + '.color'),
        range('Tolerance', base + '.tol', 0.05, 1, 0.01, pct),
        range('Softness', base + '.soft', 0, 1, 0.01, pct));
    },
    // One line: where files for this slot come from.
    storageBar(slot) {
      const M = MZ.Media;
      if (M.server) {
        return h('div', { class: 'note ok' }, 'Folder sync on. Drop files into ', h('code', null, (M.server.dir || 'media') + '/' + (slot || 'player') + '/'),
          M.server.writable ? '' : ' (read-only)');
      }
      if (M.linked) {
        return h('div', { class: 'note ' + (M.linked.granted ? 'ok' : 'warn') },
          M.linked.granted ? 'Linked folder “' + M.linked.name + '”. ' : '“' + M.linked.name + '” needs permission again. ',
          M.linked.granted ? null : btn('Reconnect', async () => { await M.reconnectFolder(); this.rebuild(); }, 'small'),
          btn('Unlink', async () => { await M.unlinkFolder(); this.rebuild(); }, 'small ghost'));
      }
      return h('div', { class: 'note' },
        M.storage === 'browser' ? 'Files are saved in this browser. ' : 'Storage is blocked: files last until you close the game. ',
        M.fsaSupported ? btn('Link a folder', async () => {
          try { await M.linkFolder(); this.rebuild(); } catch (e) {
            if (e.name === 'SecurityError') MZ.toast('This page is embedded, so it can’t open folders here. Drop files in instead.', 4000);
            else if (e.name !== 'AbortError') MZ.toast(e.message);
          }
        }, 'small') : null);
    },
  };

  // ---------- screen builders ----------
  UI.screens = {
    title() {
      const lvl = Math.max(1, P().journey.unlocked);
      const G = Game();
      const body = [
        h('img', { class: 'logo', src: 'assets/logo.svg', alt: 'Memaze', onerror: (e) => { e.target.replaceWith(h('h1', { class: 'logo-text' }, 'MEMAZE')); } }),
        btn(lvl > 1 ? 'Continue: Level ' + lvl : 'Play', () => G.startJourney(lvl), 'primary big'),
        h('div', { class: 'grid4' },
          btn('Levels', () => this.show('levels')),
          btn('Daily', () => G.startDaily()),
          btn('Gauntlet', () => G.startGauntlet()),
          btn('Endless', () => this.show('endless')),
          btn('Seed', () => this.show('custom')),
          btn('Media', () => this.show('media')),
          btn('Background', () => this.show('background')),
          btn('Settings', () => this.show('settings'))),
        h('div', { class: 'foot' },
          h('a', { href: '#', onclick: (e) => { e.preventDefault(); this.show('help'); } }, 'How to play'),
          h('a', { href: '#', onclick: (e) => { e.preventDefault(); this.fullscreen(); } }, 'Full screen')),
      ];
      return this.panel(null, body, { noBack: true, cls: 'title' });
    },

    levels() {
      const pr = P(), top = Math.max(pr.journey.unlocked, 1);
      const page = this._lvPage != null ? this._lvPage : Math.floor((top - 1) / 40);
      const grid = h('div', { class: 'levels' });
      for (let i = page * 40 + 1; i <= page * 40 + 40; i++) {
        const rec = pr.journey.levels[i], locked = i > top && !S().extras.unlockAll;
        grid.appendChild(h('button', {
          class: 'lv' + (locked ? ' locked' : '') + (i === top ? ' next' : ''), disabled: locked, 'aria-label': 'Level ' + i + (locked ? ', locked' : ''),
          onclick: () => { MZ.Audio.play('click'); Game().startJourney(i); },
        }, h('b', null, String(i)), locked ? null : starRow(rec ? rec.stars : 0, 'lvstars')));
      }
      const stars = MZ.Save.stars();
      const nav = h('div', { class: 'row' },
        btn('Prev', () => { this._lvPage = Math.max(0, page - 1); this.rebuild(); }, 'small' + (page ? '' : ' hide')),
        h('span', { class: 'muted' }, (page * 40 + 1) + '–' + (page * 40 + 40) + ' · ' + stars + (stars === 1 ? ' star' : ' stars')),
        btn('Next', () => { this._lvPage = page + 1; this.rebuild(); }, 'small' + (S().extras.unlockAll || (page + 1) * 40 < top ? '' : ' hide')));
      return this.panel('Levels', [grid, nav], { wide: true });
    },

    custom() {
      const o = this._custom || (this._custom = { seed: randomSeed(), lattice: 'auto', mask: 'auto', size: 0.4, width: 0.5, difficulty: 0.5, hazards: { blink: true } });
      const seedIn = h('input', { type: 'text', value: o.seed, maxlength: 40, spellcheck: false, oninput: () => (o.seed = seedIn.value.trim() || 'memaze') });
      const sel = (label, key, opts) => {
        const s = h('select', { onchange: () => (o[key] = s.value) }, opts.map(([v, l]) => h('option', { value: v, selected: o[key] === v }, l)));
        return h('label', { class: 'ctl' }, h('span', null, label), s);
      };
      const rng = (label, key, fmt) => {
        const out = h('output', null, fmt(o[key]));
        const i = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: o[key], oninput: () => { o[key] = parseFloat(i.value); out.textContent = fmt(o[key]); } });
        return h('label', { class: 'ctl' }, h('span', null, label), i, out);
      };
      const hz = (label, key) => {
        const i = h('input', { type: 'checkbox', checked: !!o.hazards[key], onchange: () => (o.hazards[key] = i.checked) });
        return h('label', { class: 'ctl toggle' }, h('span', null, label), i, h('i', { class: 'sw' }));
      };
      const lats = [['auto', 'Surprise me']].concat(Object.entries(MZ.Gen.LATTICES).map(([k, v]) => [k, v.name]));
      const masks = [['auto', 'Surprise me']].concat(Object.entries(MZ.Gen.MASKS).map(([k, v]) => [k, v.name]));
      return this.panel('Seed maze', [
        h('label', { class: 'ctl' }, h('span', null, 'Seed'), h('div', { class: 'row tight' }, seedIn, btn('Random', () => { o.seed = randomSeed(); seedIn.value = o.seed; }, 'small'))),
        sel('Layout', 'lattice', lats),
        sel('Shape', 'mask', masks),
        rng('Size', 'size', (v) => Math.round(20 + v * 380) + ' junctions'),
        rng('Path width', 'width', (v) => (v < 0.34 ? 'narrow' : v < 0.67 ? 'medium' : 'wide')),
        rng('Difficulty', 'difficulty', (v) => (v < 0.34 ? 'chill' : v < 0.67 ? 'normal' : 'spicy')),
        section('Hazards', hz('Vanishing bridges', 'blink')),
        h('div', { class: 'row' },
          btn('Play', () => Game().startCustom(MZ.clone(o)), 'primary'),
          btn('Copy link', () => copy(shareLink(o), 'Link copied'), '')),
      ]);
    },

    endless() {
      const seedIn = h('input', { type: 'text', placeholder: 'random', maxlength: 40, spellcheck: false });
      const best = P().endlessBest || 0;
      return this.panel('Endless', [
        h('label', { class: 'ctl' }, h('span', null, 'Seed'), seedIn),
        best ? h('p', { class: 'muted' }, 'Best ' + best) : null,
        btn('Start', () => Game().startEndless(seedIn.value.trim() || null), 'primary'),
      ]);
    },

    media() {
      const tab = this.mediaTab || 'player';
      const tabs = h('div', { class: 'tabs' }, MZ.Media.SLOTS.map((s) => h('button', {
        class: s === tab ? 'on' : '', onclick: () => { this.mediaTab = s; MZ.Audio.play('click'); this.rebuild(); },
      }, MZ.Media.SLOT_INFO[s].label)));
      const opts = [];
      if (tab === 'player') {
        opts.push(range('Size', 'player.size', 0.5, 3, 0.05, times), this.chromaControls('player.chroma'));
      } else if (tab === 'win' || tab === 'lose') {
        opts.push(toggle('Show ' + tab + ' media', tab + '.on'),
          range('Picture time', tab + '.duration', 0.5, 8, 0.1, secs),
          range('Video limit', tab + '.maxVideo', 0, 30, 1, (v) => (v ? v + ' s' : 'Full')),
          range('Size', tab + '.size', 0.3, 1, 0.01, pct),
          segmented('Fit', tab + '.fit', [['contain', 'Whole'], ['cover', 'Fill screen']]),
          select('Entrance', tab + '.anim', [['pop', 'Pop'], ['zoom', 'Zoom'], ['shake', 'Shake'], ['slide', 'Slide'], ['spin', 'Spin'], ['none', 'None']]),
          toggle('Video sound', tab + '.sound'),
          btn('Preview', () => Game().FX.play(tab), 'small'),
          this.chromaControls(tab + '.chroma'));
      } else if (tab === 'goal') {
        opts.push(range('Size', 'goal.size', 0.5, 2.5, 0.05, times), this.chromaControls('goal.chroma'));
      } else if (tab === 'background') {
        opts.push(btn('Background settings', () => this.show('background'), 'small'));
      } else if (tab === 'music') {
        const M = MZ.Audio.Music, on = !!(M.el || M.synth); // what is actually sounding, not just the wish to play
        opts.push(range('Music volume', 'audio.music', 0, 1, 0.01, pct), S().music.media === 'none' ? null : btn(on ? 'Stop' : 'Play', () => {
          MZ.Audio.unlock();
          if (on) M.stop(); else M.start();
          this.rebuild();
        }, 'small'));
      }
      const el = this.panel('Media', [
        this.storageBar(tab),
        tabs,
        this.mediaGrid(tab),
        opts.length ? section('Options', ...opts) : null,
      ], { wide: true });
      el.dataset.media = '1';
      return el;
    },

    background() {
      const b = S().background, rgbBase = 'rgb';
      const patterns = MZ.Background ? MZ.Background.PATTERNS : [{ id: 'rgb', name: 'RGB Flow' }];
      const gallery = h('div', { class: 'tiles patterns' });
      for (const p of patterns) {
        const unlocked = MZ.Save.isUnlocked(p.id);
        const req = unlocked ? '' : MZ.Config.reqText(MZ.Config.UNLOCKS[p.id]);
        const cv = h('canvas', { width: 160, height: 100 });
        if (MZ.Background) { try { MZ.Background.thumb(p.id, cv, S().rgb, 3); } catch (e) { /* ignore */ } }
        const on = b.kind === 'pattern' && b.pattern === p.id;
        gallery.appendChild(h('div', {
          class: 'tile' + (on ? ' on' : '') + (unlocked ? '' : ' locked'), tabindex: 0, title: p.name,
          onclick: () => {
            if (!unlocked) { MZ.toast('Locked: ' + req); return; }
            S().background.kind = 'pattern'; S().background.pattern = p.id;
            MZ.Save.saveSettings(); Game().applySettings(); MZ.Audio.play('click'); this.rebuild();
          },
        }, h('div', { class: 'thumb' }, cv, unlocked ? null : h('div', { class: 'lock' }, req)), h('div', { class: 'name' }, p.name)));
      }
      const presets = h('div', { class: 'chips' }, MZ.Config.RGB_PRESETS.map((pr) => h('button', {
        class: 'chip', onclick: () => { Object.assign(S().rgb, MZ.clone(pr.rgb)); MZ.Save.saveSettings(); Game().applySettings(); this.rebuild(); },
      }, pr.name)));
      const pal = S().rgb.palette;
      const palette = h('div', { class: 'palette' },
        pal.map((c, i) => {
          const inp = h('input', { type: 'color', value: c });
          inp.addEventListener('input', () => { pal[i] = inp.value; MZ.Save.saveSettings(); Game().applySettings(); });
          return inp;
        }),
        pal.length < 6 ? btn('Add', () => { pal.push('#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')); MZ.Save.saveSettings(); Game().applySettings(); this.rebuild(); }, 'small') : null,
        pal.length > 2 ? btn('Remove', () => { pal.pop(); MZ.Save.saveSettings(); Game().applySettings(); this.rebuild(); }, 'small') : null);
      const hue = (v) => h('span', { class: 'hue', style: { background: 'hsl(' + v + ',90%,55%)' } });
      const deg = (v) => v + '°';
      const el = this.panel('Background', [
        segmented('Show', 'background.kind', [['pattern', 'Patterns'], ['media', 'Picture or video']], () => this.rebuild()),
        b.kind === 'pattern' ? [
          section('Pattern', gallery),
          section('RGB',
            presets,
            select('Style', rgbBase + '.style', [['gradient', 'Gradient'], ['cycle', 'Colour cycle'], ['radial', 'Radial'], ['aurora', 'Aurora']]),
            range('Speed', rgbBase + '.speed', 0, 60, 0.5, (v) => v + ' /min'),
            range('Saturation', rgbBase + '.sat', 0, 100, 1, (v) => v + '%'),
            range('Brightness', rgbBase + '.light', 5, 95, 1, (v) => v + '%'),
            range('Spread', rgbBase + '.spread', 0, 360, 1, deg),
            range('Angle', rgbBase + '.angle', 0, 360, 1, deg),
            toggle('Rotate the gradient', rgbBase + '.spin'),
            range('Pulse', rgbBase + '.pulse', 0, 1, 0.01, pct),
            toggle('Use my own colours', rgbBase + '.usePalette', () => this.rebuild()),
            S().rgb.usePalette ? h('div', { class: 'ctl' }, h('span', null, 'Colours'), palette) : [
              range('Hue from', rgbBase + '.hueFrom', 0, 360, 1, deg, () => this.paintHue()),
              range('Hue to', rgbBase + '.hueTo', 0, 360, 1, deg, () => this.paintHue()),
              h('div', { class: 'hue-bar' }, hue(S().rgb.hueFrom), h('i'), hue(S().rgb.hueTo)),
            ]),
        ] : [
          section('Picture or video', this.mediaGrid('background')),
          section('Options',
            segmented('Fit', 'background.fit', [['cover', 'Fill'], ['contain', 'Whole'], ['stretch', 'Stretch'], ['tile', 'Tile']]),
            range('Dim', 'background.dim', 0, 0.9, 0.01, pct),
            range('Blur', 'background.blur', 0, 20, 1, (v) => v + ' px'),
            toggle('RGB behind see-through parts', 'background.rgbUnder'),
            this.chromaControls('background.chroma')),
        ],
        section('Maze', segmented('Floor', 'display.floor', FLOORS), toggle('Parallax', 'background.parallax')),
      ], { wide: true, cls: 'see-through' });
      el.dataset.media = '1';
      return el;
    },
    settings() {
      return this.panel('Settings', [
        section('Controls',
          toggle('Invert drag', 'controls.invert'),
          range('Drag speed', 'controls.speed', 0.5, 2, 0.05, times)),
        section('Gameplay',
          segmented('Edges', 'gameplay.rule', [['casual', 'Walls'], ['normal', 'Normal'], ['strict', 'Strict']]),
          toggle('Timer', 'gameplay.timer'),
          segmented('Minimap', 'gameplay.minimap', [['explored', 'Explored'], ['full', 'Full'], ['off', 'Off']]),
          range('Zoom', 'gameplay.zoom', 0.5, 2, 0.05, times)),
        section('Audio',
          range('Master', 'audio.master', 0, 1, 0.01, pct),
          range('Effects', 'audio.sfx', 0, 1, 0.01, pct),
          range('Music', 'audio.music', 0, 1, 0.01, pct),
          range('Videos', 'audio.media', 0, 1, 0.01, pct)),
        section('Display',
          segmented('Floor', 'display.floor', FLOORS),
          segmented('Sharpness', 'display.quality', [[1, 'Fast'], [1.5, 'Balanced'], [2, 'Sharp']]),
          toggle('Reduce motion', 'display.reducedMotion'),
          toggle('Reduce flashing', 'display.reduceFlash'),
          toggle('Show FPS', 'display.fps')),
        section('Save data',
          h('div', { class: 'row wrap' },
            btn('Export save', () => MZ.download('memaze-save.json', MZ.Save.exportJSON()), 'small'),
            btn('Import save', () => {
              const f = h('input', { type: 'file', accept: '.json,application/json' });
              f.addEventListener('change', async () => {
                try { MZ.Save.importJSON(await f.files[0].text()); Game().applySettings(); MZ.toast('Save loaded'); this.rebuild(); }
                catch (e) { MZ.toast('Could not load: ' + e.message); }
              });
              f.click();
            }, 'small'),
            btn('Reset progress', async () => { if (await UI.ask('Erase all stars, best times and unlocks?', 'Erase')) { MZ.Save.reset(); Game().applySettings(); MZ.toast('Progress reset'); this.rebuild(); } }, 'small danger')),
          toggle('Unlock everything', 'extras.unlockAll')),
      ], { wide: true });
    },

    help() {
      return this.panel('How to play', [
        h('ul', { class: 'facts' },
          h('li', null, 'Drag the maze to move through it.'),
          h('li', null, 'Don’t touch the edge.'),
          h('li', null, 'Reach GOAL before the time runs out.'),
          h('li', null, 'Stars: finish, beat par, collect every gem.'),
          h('li', null, 'Vanishing bridges blink, then disappear.'),
          h('li', null, 'Endless: gems add 3 s, beacons are checkpoints and add 12 s.'),
          h('li', null, 'Keys: WASD or arrows move, Esc or P pause, R restart, M minimap, F full screen, + and - zoom, Enter next level.')),
      ]);
    },

    pause() {
      const G = Game();
      const canRestart = !['gauntlet', 'endless'].includes(G.mode);
      return this.panel('Paused', [
        btn('Resume', () => this.back(), 'primary big'),
        canRestart ? btn('Restart', () => G.restartLevel(), 'full') : null,
        h('div', { class: 'grid4' },
          btn('Media', () => this.show('media')),
          btn('Background', () => this.show('background')),
          btn('Settings', () => this.show('settings')),
          btn('Quit', () => G.quit())),
      ], { noBack: true });
    },

    results(r) {
      const G = Game();
      setTimeout(() => { for (let i = 0; i < r.stars; i++) setTimeout(() => MZ.Audio.play('star'), 250 + i * 280); }, 0);
      const next = () => {
        if (r.mode === 'journey') G.startJourney(r.level + 1);
        else if (r.mode === 'daily') G.quit();
        else if (r.mode === 'custom') { const o = G.run.opts; o.seed = randomSeed(); G.startCustom(o); }
      };
      const rows = [['Time', MZ.fmtClock(r.time)], ['Par', par(r.par)]];
      if (r.best != null) rows.push(['Best', MZ.fmtClock(r.best) + (r.newBest ? ' (new)' : '')]);
      rows.push(['Gems', r.gems + '/' + r.gemsTotal], ['Restarts', String(r.restarts)]);
      const share = r.mode === 'daily' ? 'Memaze Daily ' + G.run.day + ': ' + MZ.fmtClock(r.time) + ', ' + r.stars + '/3 stars'
        : r.mode === 'custom' ? shareLink(G.run.opts) : null;
      const auto = r.mode === 'journey' && S().gameplay.autoNext;
      if (auto) setTimeout(() => { if (this.current && this.current.name === 'results') next(); }, 2500);
      return this.panel(null, [
        h('h1', { class: 'clear' }, 'CLEAR!'),
        starRow(r.stars, 'stars'),
        h('table', { class: 'stats' }, rows.map(([k, v]) => h('tr', null, h('th', null, k), h('td', null, v)))),
        h('div', { class: 'row' },
          btn(r.mode === 'journey' ? 'Next level' : r.mode === 'daily' ? 'Done' : 'New seed', next, 'primary'),
          btn('Retry', () => G.restartLevel()),
          r.mode !== 'daily' ? btn('Menu', () => G.quit(), 'ghost') : null),
        share ? btn('Copy ' + (r.mode === 'daily' ? 'result' : 'link'), () => copy(share, 'Copied'), 'small ghost') : null,
      ], { noBack: true, cls: 'results' });
    },

    over(r) {
      const G = Game();
      const again = () => (r.mode === 'gauntlet' ? G.startGauntlet() : G.startEndless(G.run.seedText));
      const rows = r.mode === 'gauntlet' ? [['Mazes cleared', String(r.score)], ['Best', String(r.best)]]
        : [['Score', String(r.score)], ['Distance', r.dist + ' m'], ['Gems', String(r.gems)], ['Beacons', String(r.beacons)], ['Best', String(r.best)]];
      return this.panel(null, [
        h('h1', { class: 'clear over' }, r.newBest ? 'NEW BEST!' : 'GAME OVER'),
        h('table', { class: 'stats' }, rows.map(([k, v]) => h('tr', null, h('th', null, k), h('td', null, v)))),
        h('div', { class: 'row' }, btn('Again', again, 'primary'), btn('Menu', () => G.quit(), 'ghost')),
      ], { noBack: true, cls: 'results' });
    },
  };

  // In-page dialogs (native confirm/prompt are blocked in some embeds and look out of place anyway).
  UI.ask = function (msg, okLabel) {
    return new Promise((resolve) => {
      const m = $('#modal');
      const close = (v) => { m.hidden = true; m.textContent = ''; document.removeEventListener('keydown', key, true); resolve(v); };
      const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(false); } };
      m.textContent = '';
      m.appendChild(h('div', { class: 'panel dialog', role: 'dialog', 'aria-modal': 'true' },
        h('p', null, msg),
        h('div', { class: 'row' }, btn('Cancel', () => close(false), 'ghost'), btn(okLabel || 'OK', () => close(true), 'danger solid'))));
      m.hidden = false;
      document.addEventListener('keydown', key, true);
      m.querySelector('.btn.ghost').focus();
    });
  };
  UI.showText = function (label, text) {
    const m = $('#modal');
    const inp = h('input', { type: 'text', value: text, readonly: true, id: 'copy-text' });
    const key = (e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); close(); } };
    const close = () => { m.hidden = true; m.textContent = ''; document.removeEventListener('keydown', key, true); };
    document.addEventListener('keydown', key, true);
    m.textContent = '';
    m.appendChild(h('div', { class: 'panel dialog' }, h('p', null, label), inp, h('div', { class: 'row' }, btn('Done', close, 'primary'))));
    m.hidden = false;
    inp.focus();
    inp.select();
  };

  UI.paintHue = function () {
    const bar = $('.hue-bar');
    if (!bar) return;
    bar.children[0].style.background = 'hsl(' + S().rgb.hueFrom + ',90%,55%)';
    bar.children[2].style.background = 'hsl(' + S().rgb.hueTo + ',90%,55%)';
  };

  const WORDS = ['banana', 'wobble', 'neon', 'pickle', 'comet', 'mango', 'turbo', 'sprout', 'pixel', 'yeti', 'waffle', 'quasar', 'noodle', 'ember', 'otter', 'glitch'];
  function randomSeed() { return WORDS[(Math.random() * WORDS.length) | 0] + '-' + ((Math.random() * 1000) | 0); }
  function shareLink(o) {
    const q = new URLSearchParams({ seed: o.seed, lat: o.lattice, shape: o.mask, size: o.size, width: o.width, diff: o.difficulty, hz: o.hazards && o.hazards.blink ? 'blink' : '' });
    return location.href.split('#')[0] + '#' + q.toString();
  }
  function copy(text, msg) {
    const done = () => MZ.toast(msg || 'Copied');
    const manual = () => UI.showText('Copy this:', text);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, manual);
      else manual();
    } catch (e) { manual(); }
  }
  // #seed=… links open straight into that maze. 'hz=blink' turns vanishing bridges on, 'hz=' off; no hz means on.
  UI.fromHash = function () {
    const hs = location.hash.replace(/^#/, '');
    if (!hs) return false;
    const q = new URLSearchParams(hs);
    if (!q.get('seed')) return false;
    const num = (k, d) => { const v = parseFloat(q.get(k)); return isFinite(v) ? clamp(v, 0, 1) : d; };
    const rawHz = q.get('hz');
    const hz = (rawHz === null ? 'blink' : rawHz).split('.');
    const o = {
      seed: q.get('seed').slice(0, 40), lattice: MZ.Gen.LATTICES[q.get('lat')] ? q.get('lat') : 'auto', mask: MZ.Gen.MASKS[q.get('shape')] ? q.get('shape') : 'auto',
      size: num('size', 0.4), width: num('width', 0.5), difficulty: num('diff', 0.5),
      hazards: { blink: hz.includes('blink') },
    };
    UI._custom = o;
    Game().startCustom(MZ.clone(o));
    return true;
  };

  MZ.UI = UI;
})();
