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

  // ---------- HUD icons (inline SVG, 32 x 32) ----------
  const HEART = 'M16 28C16 28 3 20 3 11.5C3 7.4 6.2 4.5 9.8 4.5C12.6 4.5 14.8 6.2 16 8.4C17.2 6.2 19.4 4.5 22.2 4.5C25.8 4.5 29 7.4 29 11.5C29 20 16 28 16 28Z';
  const ICONS = {
    star: '<path d="M16 2.5l4 8.6 9.4 1.1-6.9 6.4 1.9 9.3L16 23.2l-8.4 4.7 1.9-9.3-6.9-6.4 9.4-1.1z" fill="#ffd84a" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>',
    heart: '<path d="' + HEART + '" fill="#ffc53d" stroke="#fff" stroke-width="2"/><path d="M16 11v10M11 16h10" stroke="#5a3a00" stroke-width="3.2" stroke-linecap="round"/>',
    bullet: '<path d="M4 16h3M3 11h5M3 21h5" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/><path d="M10 9h9a7 7 0 0 1 0 14h-9z" fill="#1c1b26" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v14" stroke="#ff3d5a" stroke-width="3"/><circle cx="21" cy="14" r="1.8" fill="#fff"/>',
    launch: '<path d="M16 3l8 10h-5v8h-6v-8H8z" fill="#7cf0ff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><ellipse cx="16" cy="27" rx="8" ry="2.6" fill="rgba(0,0,0,.45)" stroke="#fff" stroke-width="1.5"/>',
    carpet: '<path d="M5 10c4-2 8 2 11 0s7-2 11 0v12c-4-2-8 2-11 0s-7-2-11 0z" fill="#8e1b4d" stroke="#ffc53d" stroke-width="2" stroke-linejoin="round"/><path d="M5 12l-3 1M5 16l-3 0M5 20l-3-1M27 12l3 1M27 16l3 0M27 20l3-1" stroke="#ffc53d" stroke-width="1.6" stroke-linecap="round"/><path d="M16 12.5l3 3.5-3 3.5-3-3.5z" fill="none" stroke="#ffc53d" stroke-width="1.6"/>',
    shrink: '<rect x="11" y="11" width="10" height="10" rx="2.5" fill="#b8ff6a" stroke="#fff" stroke-width="2"/><path d="M3 3l6 6M29 3l-6 6M3 29l6-6M29 29l-6-6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M9 5v4H5M23 5v4h4M9 27v-4H5M23 27v-4h4" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  const ROLL_ORDER = ['star', 'bullet', 'carpet', 'heart', 'launch', 'shrink'];
  // Menu icons (drawn in the text colour).
  const MENU_ICONS = {
    chapters: '<g W><path d="M6 6h8v20H6zM14 6h6v20h-6zM20 8l5 1-3 18-5-1z"/><path d="M9 11h2M17 11h0"/></g>',
    gauntlet: '<g W><path d="M4 8h7v6h6v6h6v6h5"/><path d="M24 4v8M20 8l4 4 4-4"/></g>',
    endless: '<g W><path d="M16 16c-3-4-5-6-8-6a6 6 0 0 0 0 12c3 0 5-2 8-6s5-6 8-6a6 6 0 0 1 0 12c-3 0-5-2-8-6z"/></g>',
    trial: '<g W><circle cx="16" cy="18" r="10"/><path d="M16 18v-5M13 4h6M16 4v4M24 9l2-2"/></g>',
    media: '<g W><rect x="4" y="7" width="24" height="18" rx="3"/><circle cx="11" cy="13" r="2.4"/><path d="M5 23l8-7 5 5 3-3 6 5"/></g>',
    background: '<g W><circle cx="16" cy="16" r="11"/><path d="M16 5a11 11 0 0 1 0 22z" fill="currentColor"/></g>',
    settings: '<g W><circle cx="16" cy="16" r="4"/><path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M6.8 25.2l2.8-2.8M22.4 9.6l2.8-2.8"/></g>',
    help: '<g W><circle cx="16" cy="16" r="12"/><path d="M12.5 12.5a3.5 3.5 0 1 1 5 3.2c-1 .5-1.5 1.3-1.5 2.3v.5"/><path d="M16 22.5v.5"/></g>',
    full: '<g W><path d="M5 11V5h6M21 5h6v6M27 21v6h-6M11 27H5v-6"/></g>',
  };
  const LINE = 'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  for (const k in MENU_ICONS) MENU_ICONS[k] = MENU_ICONS[k].replace('<g W>', '<g ' + LINE + '>');
  const svg = (inner) => '<svg viewBox="0 0 32 32" aria-hidden="true">' + inner + '</svg>';
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
        item: $('#hud-item'), effects: $('#hud-effects'), keys: $('#hud-keys'),
      };
      $('#btn-pause').addEventListener('click', () => { MZ.Audio.play('click'); Game().pause(); });
      this.hud.item.addEventListener('click', () => { MZ.Audio.unlock(); Game().useItem(); });
      const G = Game();
      G.on('state', (st) => this.onState(st));
      G.on('begin', () => this.onBegin());
      G.on('result', (r) => this.show('results', r));
      G.on('over', (r) => this.show('over', r));
      G.on('bonus', (txt) => this.banner(txt, 900));
      // A new level says what's special about it: a boss, a mechanic seen for the first time, remix modifiers.
      G.on('level', (m) => {
        const L = MZ.Levels, intro = G.mode !== 'gauntlet' && m.level ? L.introOf(m.level) : null;
        const txt = m.boss ? 'Boss' : intro ? 'New: ' + intro.name : m.mods && m.mods.length ? 'Remix: ' + m.mods.map((x) => L.MODS[x]).join(' · ') : '';
        if (txt) setTimeout(() => this.banner(txt, 1800), 150);
      });
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
      const timer = G.timed();
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
      set('lives', this.hud.lives, (G.mode === 'gauntlet' || G.mode === 'endless') && isFinite(G.run.lives) ? 'Lives ' + Math.max(0, G.run.lives) : '');
      set('fps', this.hud.fps, S().display.fps ? G.fps + ' fps' : '');
      this.updatePower(c);
    },
    // The item slot and the running effects, redrawn only when what they show changes.
    updatePower(c) {
      const G = Game(), fx = G.fx, hud = this.hud;
      const on = G.boxesOn(), rolling = G.roll ? ROLL_ORDER[Math.floor(G.roll.t / 0.07) % ROLL_ORDER.length] : null;
      const ik = on ? (rolling ? 'r:' + rolling : G.item || '') : 'off';
      if (c.item !== ik) {
        c.item = ik;
        hud.item.hidden = !on;
        hud.item.innerHTML = rolling ? svg(ICONS[rolling]) : G.item ? svg(ICONS[G.item]) : '';
        hud.item.className = rolling ? 'rolling' : G.item ? 'ready' : '';
        hud.item.setAttribute('aria-label', G.item ? 'Use ' + G.ITEMS[G.item].name : 'No item');
        hud.item.title = G.item ? G.ITEMS[G.item].name : '';
      }
      const held = G.keysHeld ? [...G.keysHeld].flatMap(([col, n]) => Array(n).fill(col)) : [], kk = held.join(); // keys you're carrying
      if (c.keys !== kk) {
        c.keys = kk;
        hud.keys.innerHTML = held.map((col) => MZ.Renderer.keySVG(col)).join(''); // the same key and token as in the maze
      }
      const act = [];
      for (const k of ['star', 'carpet', 'shrink']) if (fx[k] > 0) act.push([k, fx[k] / G.ITEMS[k].dur]);
      if (fx.bullet) act.push(['bullet', 1 - fx.bullet.s / fx.bullet.len]);
      if (fx.launch) act.push(['launch', 1 - fx.launch.t / fx.launch.T]);
      const ek = act.map((a) => a[0] + Math.round(a[1] * 40)).join();
      if (c.effects !== ek) {
        c.effects = ek;
        hud.effects.innerHTML = act.map(([k, f]) => '<div class="fx-chip' + (f < 0.2 ? ' low' : '') + '" style="--f:' + f.toFixed(3) + '">' + svg(ICONS[k]) + '</div>').join('');
      }
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
          setPath('gameplay.minimap', S().gameplay.minimap === 'off' ? 'explored' : 'off');
          MZ.toast(S().gameplay.minimap === 'off' ? 'Map off' : 'Map on', 1200);
        }
        if ((e.key === ' ' || e.code === 'KeyE') && st === 'play' && !e.repeat) { G.useItem(); e.preventDefault(); }
        if (e.key === 'f' || e.key === 'F') this.fullscreen();
        if (e.key === '+' || e.key === '=') G.zoomBy(1.15);
        if (e.key === '-' || e.key === '_') G.zoomBy(1 / 1.15);
      });
      let prev = new Set();
      const poll = () => {
        const G = Game(), now = G.input.gamepadButtons();
        const pressed = (i) => now.has(i) && !prev.has(i);
        if (pressed(9)) { if (G.state === 'play') G.pause(); else if (G.state === 'paused') this.back(); }
        if ((pressed(0) || pressed(2)) && G.state === 'play') G.useItem();
        else if (pressed(0)) {
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

  // Chapters of ten, each ending in a boss; the chapter after the one you're on shows, locked.
  function chapterList(tile, o) {
    const pr = P(), L = MZ.Levels, top = Math.max(1, pr.journey.unlocked), all = S().extras.unlockAll;
    const last = Math.max(L.chapterOf(top) + 1, all ? 8 : 2);
    const out = [];
    for (let c = 1; c <= last; c++) {
      const first = (c - 1) * L.CHAPTER + 1, locked = first > top && !all;
      let stars = 0;
      for (let i = first; i < first + L.CHAPTER; i++) stars += (pr.journey.levels[i] || {}).stars || 0;
      out.push(h('div', { class: 'chapter' + (locked ? ' locked' : '') },
        h('div', { class: 'ch-head' }, h('b', null, 'Chapter ' + c), h('span', null, L.chapterName(c)), o && o.stars ? h('span', { class: 'ch-stars' }, stars + ' / ' + L.CHAPTER * 3) : null),
        h('div', { class: 'levels' }, Array.from({ length: L.CHAPTER }, (_, k) => tile(first + k, first + k > top && !all, first + k === top)))));
    }
    return out;
  }
  function levelTile(i, locked, next, kids, onclick) {
    const L = MZ.Levels, intro = L.introOf(i), boss = L.isBoss(i);
    return h('button', {
      class: 'lv' + (locked ? ' locked' : '') + (next ? ' next' : '') + (boss ? ' boss' : '') + (i >= L.REMIX_FROM ? ' remix' : '') + (intro ? ' intro' : ''),
      disabled: locked, 'aria-label': (boss ? 'Boss, level ' : 'Level ') + i + (locked ? ', locked' : ''), title: intro ? intro.name : boss ? 'Boss' : '',
      onclick: () => { MZ.Audio.play('click'); onclick(i); },
    }, h('b', null, boss ? 'Boss' : String(i)), locked ? null : kids);
  }

  // ---------- screen builders ----------
  UI.screens = {
    title() {
      const G = Game(), L = MZ.Levels, top = Math.max(1, P().journey.unlocked), ch = L.chapterOf(top), inCh = (top - 1) % L.CHAPTER;
      const go = (fn) => () => { MZ.Audio.unlock(); MZ.Audio.play('click'); fn(); };
      const mode = (label, icon, fn) => h('button', { class: 'mode', onclick: go(fn) }, h('span', { class: 'mode-ico', html: svg(MENU_ICONS[icon]) }), h('b', null, label));
      const small = (label, icon, fn) => h('button', { class: 'mini', 'aria-label': label, title: label, onclick: go(fn) }, h('span', { html: svg(MENU_ICONS[icon]) }), h('small', null, label));
      return this.panel(null, [
        h('img', { class: 'logo', src: 'assets/logo.svg', alt: 'Memaze', onerror: (e) => { e.target.replaceWith(h('h1', { class: 'logo-text' }, 'MEMAZE')); } }),
        h('button', { class: 'continue', onclick: go(() => G.startJourney(top)) },
          h('span', { class: 'cont-top' }, 'Chapter ' + ch + ' · ' + L.chapterName(ch)),
          h('span', { class: 'cont-main' }, top > 1 ? 'Continue' : 'Play'),
          h('span', { class: 'cont-sub' }, L.label(top)),
          h('span', { class: 'cont-bar' }, Array.from({ length: L.CHAPTER }, (_, i) => h('i', { class: (i < inCh ? 'done' : i === inCh ? 'now' : '') + (i === L.CHAPTER - 1 ? ' boss' : '') })))),
        h('div', { class: 'modes' },
          mode('Chapters', 'chapters', () => this.show('chapters')),
          mode('Gauntlet', 'gauntlet', () => this.show('gauntlet')),
          mode('Endless', 'endless', () => G.startEndless()),
          mode('Time Trial', 'trial', () => this.show('trials'))),
        h('div', { class: 'menu-bar' },
          small('Media', 'media', () => this.show('media')),
          small('Background', 'background', () => this.show('background')),
          small('Settings', 'settings', () => this.show('settings')),
          small('Help', 'help', () => this.show('help')),
          small('Fullscreen', 'full', () => this.fullscreen())),
      ], { noBack: true, cls: 'title' });
    },

    chapters() {
      const pr = P();
      const el = this.panel('Chapters', chapterList((i, locked, next) => levelTile(i, locked, next, starRow((pr.journey.levels[i] || {}).stars || 0, 'lvstars'), (n) => Game().startJourney(n)), { stars: true }), { wide: true });
      setTimeout(() => { const n = el.querySelector('.lv.next'); if (n && n.scrollIntoView) n.scrollIntoView({ block: 'center' }); }, 0);
      return el;
    },
    // Time Trial: every level reached so far, with its best time.
    trials() {
      const pr = P();
      return this.panel('Time Trial', chapterList((i, locked, next) => levelTile(i, locked, false,
        h('span', { class: 'lvtime' }, pr.trials[i] != null ? MZ.fmtClock(pr.trials[i]) : '–'), (n) => Game().startTrial(n))), { wide: true });
    },
    // Gauntlet: an endless run of mazes, Progressive (deeper and harder) or Random, at a difficulty, from a seed.
    gauntlet() {
      const o = this._gnt || (this._gnt = { style: 'progressive', diff: 'normal', seedText: '' });
      const G = Game(), L = MZ.Levels;
      const pick = (label, key, opts) => {
        const wrap = h('div', { class: 'seg' }, opts.map(([v, l]) => h('button', { class: o[key] === v ? 'on' : '', onclick: () => { MZ.Audio.play('click'); o[key] = v; this.rebuild(); } }, l)));
        return h('div', { class: 'ctl' }, h('span', null, label), wrap);
      };
      const seedIn = h('input', { type: 'text', value: o.seedText, placeholder: 'Random', maxlength: 40, spellcheck: false, oninput: () => (o.seedText = seedIn.value.trim()) });
      const best = P().gauntlet[o.style + '/' + o.diff] || 0, D = L.GAUNTLET[o.diff];
      return this.panel('Gauntlet', [
        pick('Mazes', 'style', [['progressive', 'Progressive'], ['random', 'Random']]),
        pick('Difficulty', 'diff', Object.keys(L.GAUNTLET).map((k) => [k, L.GAUNTLET[k].name])),
        h('label', { class: 'ctl' }, h('span', null, 'Seed'), h('div', { class: 'row tight' }, seedIn, btn('Random', () => { o.seedText = MZ.randomSeed(); seedIn.value = o.seedText; }, 'small'))),
        h('table', { class: 'stats' },
          h('tr', null, h('th', null, 'Lives'), h('td', null, isFinite(D.lives) ? String(D.lives) : 'Unlimited')),
          h('tr', null, h('th', null, 'Best depth'), h('td', null, best ? String(best) : '–'))),
        h('div', { class: 'row' },
          btn('Start', () => G.startGauntlet(Object.assign({}, o, { seedText: o.seedText || null })), 'primary big'),
          o.seedText ? btn('Copy link', () => copy(gauntletLink(o), 'Link copied'), 'small ghost') : null),
      ]);
    },

    media() {
      const tab = this.mediaTab || 'player';
      const tabs = h('div', { class: 'tabs' }, MZ.Media.SLOTS.map((s) => h('button', {
        class: s === tab ? 'on' : '', onclick: () => { this.mediaTab = s; MZ.Audio.play('click'); this.rebuild(); },
      }, MZ.Media.SLOT_INFO[s].label)));
      const opts = [];
      if (tab === 'player') {
        opts.push(range('Size', 'player.size', 0.6, 1.25, 0.05, times), this.chromaControls('player.chroma'));
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
          segmented('Edges', 'gameplay.rule', [['casual', 'Walls'], ['normal', 'Hurt']]),
          toggle('Timer', 'gameplay.timer'),
          toggle('Mystery boxes', 'gameplay.boxes'),
          segmented('Map', 'gameplay.minimap', [['explored', 'On'], ['off', 'Off']]),
          range('Zoom', 'gameplay.zoom', 1, 3, 0.05, times)),
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
          h('li', null, 'Touching the edge breaks your shield: your picture turns grey and faded. Touch it again before the shield recharges (5 s once you’re off the edge) and you’re out. Holding against the edge never counts twice. Your picture is the hitbox: transparent parts don’t count.'),
          h('li', null, 'Touch a mystery box to shatter it. With an empty slot you get an item; use it with a right click, Space, E or the button in the corner.'),
          h('ul', { class: 'items' },
            h('li', null, h('b', null, 'Invincible'), ': no damage for 8 s; the edges hold like walls.'),
            h('li', null, h('b', null, 'Extra hit'), ': a gold ring around you that takes the next hit (up to two).'),
            h('li', null, h('b', null, 'Bullet'), ': carries you along the corridors toward GOAL.'),
            h('li', null, h('b', null, 'Launch'), ' (rare): a short hop above the maze. Steer while you’re up, as far as the ring of clouds; you come down right where you are, so aim for the board: landing in the void is a fall. The map keeps all you saw.'),
            h('li', null, h('b', null, 'Magic carpet'), ' (rare): float over the gaps for 3.5 s. Be over floor when it runs out.'),
            h('li', null, h('b', null, 'Shrink'), ': half size for 10 s, for the tight spots.')),
          h('li', null, 'Levels come in chapters of ten; the tenth is a boss. New things appear along the way:'),
          h('ul', { class: 'items' },
            h('li', null, h('b', null, 'Keys and doors'), ': pick up a key, then bump into the door of its colour to open it.'),
            h('li', null, h('b', null, 'Vanishing bridges'), ': they blink, then disappear for a moment.'),
            h('li', null, h('b', null, 'One-way gates'), ': pass them only the way the arrows point.'),
            h('li', null, h('b', null, 'Switches'), ': step on one to flip the bridges of its colour: some appear, some go.'),
            h('li', null, h('b', null, 'Moving platforms'), ': ride them across the gaps.'),
            h('li', null, h('b', null, 'Portals'), ': step in, come out of its twin.'),
            h('li', null, h('b', null, 'Ice'), ': you drift, and keep sliding when you stop.'),
            h('li', null, h('b', null, 'Darkness'), ': you only see what’s near you.'),
            h('li', null, h('b', null, 'Remix'), ': past level 35, levels get a twist: narrow, rushed, mirrored, no map, and more.')),
          h('li', null, 'Falling off the board costs a hit; a bubble floats you back to solid ground.'),
          h('li', null, 'Gauntlet: an endless run of mazes, getting harder (Progressive) or at random, at the difficulty you choose. The item in your slot comes along to the next maze. Share a seed to play the same run.'),
          h('li', null, 'The map fills in as you go: only what has been on screen shows up.'),
          h('li', null, 'Reach GOAL before the time runs out.'),
          h('li', null, 'Long mazes have flags. Touch one and a loss sends you back to it, not the start. Restart or running out of time starts over.'),
          h('li', null, 'Stars: finish, beat par, collect every gem.'),
          h('li', null, 'Vanishing bridges blink, then disappear.'),
          h('li', null, 'Time Trial: any level you’ve reached, with no mystery boxes and no time limit. Your fastest run comes back as a ghost to race.'),
          h('li', null, 'Endless: gems add 3 s, beacons are checkpoints and add 12 s.'),
          h('li', null, 'Keys: WASD or arrows move, right click, Space or E item, Esc or P pause, R restart, M map, F full screen, + and - zoom, Enter next level.')),
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
      const G = Game(), L = MZ.Levels;
      if (r.mode === 'trial') return this.screens.trialResults.call(this, r);
      setTimeout(() => { for (let i = 0; i < r.stars; i++) setTimeout(() => MZ.Audio.play('star'), 250 + i * 280); }, 0);
      const next = () => G.startJourney(r.level + 1);
      const rows = [['Time', MZ.fmtClock(r.time)], ['Par', par(r.par)]];
      if (r.best != null) rows.push(['Best', MZ.fmtClock(r.best) + (r.newBest ? ' (new)' : '')]);
      rows.push(['Gems', r.gems + '/' + r.gemsTotal], ['Restarts', String(r.restarts)]);
      const auto = S().gameplay.autoNext;
      if (auto) setTimeout(() => { if (this.current && this.current.name === 'results') next(); }, 2500);
      const boss = L.isBoss(r.level);
      return this.panel(null, [
        h('h1', { class: 'clear' }, boss ? 'CHAPTER ' + L.chapterOf(r.level) + ' CLEAR!' : 'CLEAR!'),
        starRow(r.stars, 'stars'),
        h('table', { class: 'stats' }, rows.map(([k, v]) => h('tr', null, h('th', null, k), h('td', null, v)))),
        h('div', { class: 'row' },
          btn(boss ? 'Next chapter' : 'Next level', next, 'primary'),
          btn('Retry', () => G.restartLevel()),
          btn('Menu', () => G.quit(), 'ghost')),
      ], { noBack: true, cls: 'results' });
    },

    // Time Trial clear: the time against your best; Retry is the main button.
    trialResults(r) {
      const G = Game(), top = Math.max(P().journey.unlocked, 1), L = r.level;
      const rows = [['Time', MZ.fmtClock(r.time)], ['Best', MZ.fmtClock(r.best)]];
      if (r.prev != null) rows.push(['Ghost', MZ.fmtClock(r.prev) + ' (' + (r.time <= r.prev ? '-' : '+') + Math.abs(r.time - r.prev).toFixed(2) + ' s)']);
      rows.push(['Restarts', String(r.restarts)]);
      const canNext = L + 1 <= top || S().extras.unlockAll;
      return this.panel(null, [
        h('h1', { class: 'clear' }, r.newBest ? 'NEW RECORD!' : 'CLEAR!'),
        h('table', { class: 'stats' }, rows.map(([k, v]) => h('tr', null, h('th', null, k), h('td', null, v)))),
        h('div', { class: 'row' },
          btn('Retry', () => G.restartLevel(), 'primary'),
          canNext ? btn('Next level', () => G.startTrial(L + 1)) : null,
          btn('Menu', () => G.quit(), 'ghost')),
      ], { noBack: true, cls: 'results' });
    },

    over(r) {
      const G = Game(), L = MZ.Levels, run = G.run;
      const again = () => (r.mode === 'gauntlet' ? G.startGauntlet({ style: run.style, diff: run.diff, seedText: run.userSeed ? run.seedText : null }) : G.startEndless());
      const rows = r.mode === 'gauntlet'
        ? [['Mazes', (r.style === 'random' ? 'Random' : 'Progressive') + ' · ' + L.GAUNTLET[r.diff].name], ['Depth', String(r.score)], ['Best', String(r.best)], ['Seed', run.seedText]]
        : [['Score', String(r.score)], ['Distance', r.dist + ' m'], ['Gems', String(r.gems)], ['Beacons', String(r.beacons)], ['Best', String(r.best)]];
      return this.panel(null, [
        h('h1', { class: 'clear over' }, r.newBest ? 'NEW BEST!' : 'GAME OVER'),
        h('table', { class: 'stats' }, rows.map(([k, v]) => h('tr', null, h('th', null, k), h('td', null, v)))),
        h('div', { class: 'row' }, btn('Again', again, 'primary'), btn('Menu', () => G.quit(), 'ghost')),
        r.mode === 'gauntlet' ? btn('Copy link', () => copy(gauntletLink({ seedText: run.seedText, style: run.style, diff: run.diff }), 'Link copied'), 'small ghost') : null,
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

  // Gauntlet links: #gauntlet=<seed>&style=random&diff=hard opens straight into that run.
  function gauntletLink(o) {
    const q = new URLSearchParams({ gauntlet: o.seedText, style: o.style, diff: o.diff });
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
  // (Old #seed=… links open a Gauntlet run from that seed.)
  UI.fromHash = function () {
    const q = new URLSearchParams(location.hash.replace(/^#/, ''));
    const seed = q.get('gauntlet') || q.get('seed');
    if (!seed) return false;
    const L = MZ.Levels, o = { seedText: seed.slice(0, 40), style: q.get('style') === 'random' ? 'random' : 'progressive', diff: L.GAUNTLET[q.get('diff')] ? q.get('diff') : 'normal' };
    UI._gnt = Object.assign({}, o);
    Game().startGauntlet(o);
    return true;
  };

  MZ.UI = UI;
})();
