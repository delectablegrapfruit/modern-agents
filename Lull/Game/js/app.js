// Lull — start-up, tabs, the frame loop, autosave, and the conversation with the native floating panel.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Store, Keys, Sound, UI, Modes, Render, native, fmtInt } = L;
  const { h, toast } = UI;

  L.VERSION = '1.0';

  const TABS = [
    { id: 'play', label: 'Play', icon: 'play' },
    { id: 'puzzle', label: 'Puzzles', icon: 'puzzle' },
    { id: 'factory', label: 'Factory', icon: 'factory' },
    { id: 'shop', label: 'Shop', icon: 'shop' },
    { id: 'stats', label: 'Stats', icon: 'stats' },
  ];

  const app = {
    store: null, keys: null, sound: Sound, modes: {}, tab: null, theme: null,
    shopSub: 'palette', statsSub: 'overview', focusedAt: 0, lastTime: 0, lastSave: 0, activeMs: 0,

    get state() { return this.store.state; },
    get settings() { return this.store.state.settings; },

    init() {
      document.body.classList.toggle('browser', !native.available);
      document.body.classList.toggle('native', native.available);
      this.store = new Store();
      this.store.load();
      this.applySettings(true);
      this.buildChrome();
      UI.initTooltips();
      this.keys = new Keys(() => this.settings);
      this.modes.play = new Modes.PlayMode(this);
      this.modes.classic = new Modes.ClassicMode(this);
      this.modes.puzzle = new Modes.PuzzleMode(this);
      this.modes.factory = new Modes.FactoryMode(this);
      this.modes.factory.catchUp(true);
      this.setTab(this.state.tab || 'play');
      this.refreshWallet();
      this.bindGlobal();
      this.lastTime = performance.now();
      requestAnimationFrame((t) => this.frame(t));
      setInterval(() => this.second(), 1000);
      if (this.store.loadedFrom === 'new') setTimeout(() => this.welcome(), 250);
      if (this.store.loadedFrom === 'corrupt') toast('The save could not be read, so Lull started fresh', 'bad', 6000);
      native.post('ready', { version: L.VERSION });
      this.postDragRegions();
      if (native.info && native.info.selftest) setTimeout(() => this.runSelfTest(), 800);
    },

    // ---- look and settings --------------------------------------------------------------------------------------------

    applySettings(first) {
      const s = this.settings;
      const rootEl = document.documentElement;
      const theme = s.theme === 'auto' ? (root.matchMedia && root.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : s.theme;
      rootEl.dataset.theme = theme;
      rootEl.style.setProperty('--accent', s.accent);
      rootEl.style.setProperty('--tint', String(s.tint));
      const appEl = document.getElementById('app');
      appEl.className = 'bg-' + s.bg;
      this.sound.enabled = !!s.sound;
      this.sound.volume = s.volume;
      this.sound.pack = this.state.equipped.sound || 'soft';
      const css = getComputedStyle(rootEl);
      const v = (k) => css.getPropertyValue(k).trim();
      this.theme = { name: theme, well: v('--well'), grid: v('--grid'), line: v('--line-2'), muted: v('--muted'), fg: v('--fg'), accent: s.accent, fog: v('--fog'), mono: v('--mono') };
      native.post('window', { bg: s.bg, onTop: !!s.onTop, theme, radius: 14 });
      const pin = document.getElementById('btn-pin');
      if (pin) pin.classList.toggle('on', !!s.onTop);
      if (!first) {
        this.applyLook();
        if (this.modes.play) this.modes.play.game.previewCount = s.preview;
      }
    },

    look() { return Render.makeLook(this.state.equipped, this.theme, performance.now()); },

    applyLook() {
      this.sound.pack = this.state.equipped.sound || 'soft';
      for (const k of ['play', 'classic', 'puzzle']) if (this.modes[k]) { this.modes[k].view.setLook(this.look()); this.modes[k].view.dirty = true; }
      if (this.tab === 'shop') UI.renderShop(this, this.shopSub);
    },

    // ---- chrome -------------------------------------------------------------------------------------------------------

    buildChrome() {
      const tabs = document.getElementById('tabs');
      tabs.replaceChildren(...TABS.map((t, i) => h('button', { role: 'tab', 'data-tab': t.id, title: t.label + ' (⌘' + (i + 1) + ')', onclick: () => this.setTab(t.id) },
        h('span', { html: UI.ICONS[t.icon], style: { display: 'contents' } }), h('span', { class: 'lbl' }, t.label))));
      document.getElementById('btn-settings').innerHTML = UI.ICONS.settings;
      document.getElementById('btn-pin').innerHTML = UI.ICONS.pin;
      document.getElementById('btn-hide').innerHTML = UI.ICONS.hide;
      document.getElementById('btn-close').innerHTML = UI.ICONS.close;
      document.getElementById('btn-settings').addEventListener('click', () => UI.openSettings(this));
      document.getElementById('btn-pin').addEventListener('click', () => { this.settings.onTop = !this.settings.onTop; this.store.touch(); this.applySettings(); toast(this.settings.onTop ? 'Floating above other windows' : 'Behaves like a normal window', null, 1600); });
      document.getElementById('btn-hide').addEventListener('click', () => { this.saveNow(); native.post('hide'); });
      document.getElementById('btn-close').addEventListener('click', () => { this.saveNow(); native.post('quit'); });
      document.getElementById('wallet').addEventListener('click', () => this.setTab('shop'));
      document.getElementById('to-classic').addEventListener('click', () => { this.sound.play('move'); this.setTab('classic'); });
      document.getElementById('to-free').addEventListener('click', () => { this.sound.play('move'); this.setTab('play'); });
    },

    setBadge(tab, on) {
      const b = document.querySelector('.tabs button[data-tab="' + tab + '"]');
      if (!b) return;
      const cur = b.querySelector('.badge');
      if (on && !cur) b.appendChild(h('span', { class: 'badge' }));
      if (!on && cur) cur.remove();
    },

    setTab(id) {
      if (!TABS.some((t) => t.id === id) && id !== 'classic') id = 'play';
      const prev = this.tab;
      if (prev === 'factory' && id !== 'factory') this.modes.factory.hide();
      if (prev === 'classic' && id !== 'classic') { this.modes.classic.togglePause(true); L.Music.stop(); }
      this.tab = id;
      this.state.tab = id;
      // Classic lives inside Play: its tab stays lit.
      const lit = id === 'classic' ? 'play' : id;
      for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === lit));
      for (const v of document.querySelectorAll('.view')) v.classList.toggle('active', v.dataset.tab === id);
      this.keys && this.keys.setTarget(id === 'play' ? this.modes.play : id === 'classic' ? this.modes.classic : id === 'puzzle' ? this.modes.puzzle : null);
      if (id === 'puzzle') this.modes.puzzle.show();
      if (id === 'factory') { this.modes.factory.show(); }
      if (id === 'shop') UI.renderShop(this, this.shopSub);
      if (id === 'stats') UI.renderStats(this, this.statsSub);
      if (id === 'play' || id === 'puzzle' || id === 'classic') { const m = this.modes[id]; m.view.resize(); m.view.dirty = true; }
      this.store.touch();
      this.postDragRegions();
    },

    refreshWallet(bump) {
      document.getElementById('wallet-n').textContent = fmtInt(this.state.lines);
      if (bump) {
        const w = document.getElementById('wallet');
        w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump');
      }
    },

    // ---- events -------------------------------------------------------------------------------------------------------

    bindGlobal() {
      root.addEventListener('keydown', (e) => {
        const t = e.target;
        const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
        if (UI.modalOpen()) {
          if (e.key === 'Escape') { UI.closeTopModal(); e.preventDefault(); }
          else if (e.key === 'Enter' && !(t && t.tagName === 'TEXTAREA')) { if (UI.submitTopModal()) e.preventDefault(); }
          return;
        }
        if (typing) return;
        if ((e.metaKey || e.ctrlKey) && /^Digit[1-5]$/.test(e.code)) { this.setTab(TABS[Number(e.code.slice(5)) - 1].id); e.preventDefault(); return; }
        if ((e.metaKey || e.ctrlKey) && e.code === 'Comma') { UI.openSettings(this); e.preventDefault(); return; }
        if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ' && this.tab === 'puzzle') { this.modes.puzzle.undo(); e.preventDefault(); return; }
        if (e.key === 'Escape' && this.tab === 'play' && this.modes.play.closeTray()) { e.preventDefault(); return; }
        if (e.key === 'Escape' && native.available) { this.saveNow(); native.post('hide'); return; }
        if (this.keys.down(e)) this.activity();
      });
      root.addEventListener('keyup', (e) => this.keys.up(e));
      root.addEventListener('blur', () => { this.keys.releaseAll(); if (this.modes.classic && this.modes.classic.running()) this.modes.classic.togglePause(true); });
      root.addEventListener('focus', () => { this.focusedAt = performance.now(); });
      root.addEventListener('mousedown', () => this.activity(), true);
      // Clicked buttons let go of focus, so Space and Enter keep playing instead of pressing them again.
      document.addEventListener('mouseup', (e) => {
        const b = e.target && e.target.closest && e.target.closest('button');
        if (b && !b.closest('.modal')) setTimeout(() => b.blur(), 0);
      });
      document.addEventListener('visibilitychange', () => { if (document.hidden) { this.saveNow(); L.Music.stop(); } else this.modes.factory.catchUp(true); });
      root.addEventListener('pagehide', () => this.saveNow());
      root.addEventListener('beforeunload', () => this.saveNow());
      root.addEventListener('resize', () => { this.onResize(); });
      if (root.ResizeObserver) {
        const ro = new ResizeObserver(() => this.onResize());
        for (const id of ['cv-play', 'cv-classic', 'cv-puzzle', 'cv-station']) ro.observe(document.getElementById(id).parentElement);
      }
      if (root.matchMedia) {
        const mq = root.matchMedia('(prefers-color-scheme: light)');
        const fn = () => { if (this.settings.theme === 'auto') this.applySettings(); };
        if (mq.addEventListener) mq.addEventListener('change', fn);
      }
      // Messages from the native panel.
      L.fromNative = (msg) => {
        if (!msg) return;
        if (msg.type === 'flush') { this.saveNow(); native.post('flushed'); }
        else if (msg.type === 'shown') { this.focusedAt = performance.now(); this.modes.factory.catchUp(true); }
        else if (msg.type === 'toggleTop') { this.settings.onTop = !this.settings.onTop; this.applySettings(); }
        else if (msg.type === 'tab') this.setTab(msg.tab);
        else if (msg.type === 'settings') UI.openSettings(this);
      };
    },

    activity() { this.lastActivity = performance.now(); },

    onResize() {
      for (const k of ['play', 'classic', 'puzzle']) { const v = this.modes[k] && this.modes[k].view; if (v) { v.resize(); v.dirty = true; } }
      if (this.modes.factory) this.modes.factory.view.resize();
      clearTimeout(this.dragTimer);
      this.dragTimer = setTimeout(() => this.postDragRegions(), 120);
    },

    /** Where the native panel may be dragged: the title bar, minus its buttons. */
    postDragRegions() {
      if (!native.available) return;
      const rect = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((n) => Math.round(n * 10) / 10); };
      const drag = UI.modalOpen() ? [] : Array.from(document.querySelectorAll('[data-drag]')).map(rect);
      const noDrag = Array.from(document.querySelectorAll('#titlebar button, #titlebar input')).map(rect);
      native.post('dragRegions', { drag, noDrag });
    },

    // ---- loop ---------------------------------------------------------------------------------------------------------

    frame(t) {
      const dt = Math.min(0.1, Math.max(0, (t - this.lastTime) / 1000));
      this.lastTime = t;
      this.keys.update(t);
      if (this.tab === 'play') this.modes.play.frame(t, dt);
      else if (this.tab === 'classic') this.modes.classic.frame(t, dt);
      else if (this.tab === 'puzzle') this.modes.puzzle.frame(t, dt);
      else if (this.tab === 'factory') {
        // Full speed in front; 12 fps behind other windows.
        this.beltAcc = (this.beltAcc || 0) + dt;
        const gap = document.hasFocus() ? 0 : 1 / 12;
        if (this.beltAcc >= gap) { this.modes.factory.frame(t, this.beltAcc); this.beltAcc = 0; }
      }
      requestAnimationFrame((tt) => this.frame(tt));
    },

    second() {
      this.modes.factory.tick();
      // Time with Lull: counted while the window is in front and was used in the last two minutes.
      const focused = !document.hidden && document.hasFocus();
      if (focused && performance.now() - (this.lastActivity || 0) < 120000) {
        const S = this.state.stats.timeMs;
        S.total += 1000;
        if (this.tab === 'play') S.play += 1000;
        else if (this.tab === 'classic') S.classic = (S.classic || 0) + 1000;
        else if (this.tab === 'puzzle') S.puzzle += 1000;
        else if (this.tab === 'factory') S.factory += 1000;
        this.store.day().ms += 1000;
        this.store.dirty = true;
      }
      this.secondCount = (this.secondCount || 0) + 1;
      if (this.store.dirty && performance.now() - this.lastSave > 5000) this.saveNow();
    },

    saveNow() {
      if (!this.store) return;
      this.modes.play && this.modes.play.save();
      if (this.modes.puzzle && this.modes.puzzle.puzzle && this.state.puzzle.current && !this.modes.puzzle.done) {
        this.state.puzzle.current.ms = Math.round(this.modes.puzzle.elapsed());
      }
      this.state.factory.lastTick = this.tab === 'factory' ? Date.now() : this.state.factory.lastTick;
      this.store.save();
      this.lastSave = performance.now();
    },

    welcome() {
      UI.openModal({
        title: 'Welcome to Lull',
        width: 440,
        body: h('div', null,
          h('p', null, 'Blocks here never fall on their own. Line them up, lower them, drop them when you are ready — or leave and come back. Nothing is timed and nothing is lost.'),
          h('p', null, h('b', null, 'Play'), ' — endless and relaxed. Every cleared line is banked as ◆ lines to spend in the ', h('b', null, 'Shop'), ' on one-shot items (bombs, drills, a piece you draw yourself) and cosmetics.'),
          h('p', null, h('b', null, 'Puzzles'), ' — short, seeded, infinite, with wildcards like Big Minos, Wraparound and Upside Down. Every seed has a solution.'),
          h('p', null, h('b', null, 'Factory'), ' — a little workshop: take online orders, pour, fire and paint each mino, ship it and wait for the review. An assembly line earns on the side.'),
          h('div', { class: 'keys', style: { marginTop: '10px' } }, L.KEY_HELP.slice(0, 7).map(([k, d]) => [h('span', { class: 'k' }, h('kbd', null, k)), h('span', null, d)]))),
        buttons: [{ label: 'Start', kind: 'primary' }],
      });
    },

    // ---- self-test (CI launches the app with LULL_SELFTEST=1) ---------------------------------------------------------

    runSelfTest() {
      const report = { ok: true, checks: [] };
      const check = (name, fn) => {
        try { const r = fn(); report.checks.push({ name, ok: r !== false }); if (r === false) report.ok = false; }
        catch (e) { report.ok = false; report.checks.push({ name, ok: false, error: String(e && e.message || e) }); }
      };
      check('puzzles generate and verify', () => ['E', 'M', 'H'].every((d) => { const p = L.Puzzles.generate(L.Puzzles.numberedSeed(d, 1)); return p && L.Puzzles.verify(p); }));
      check('free play moves and drops', () => { const g = this.modes.play.game; const before = g.s.pieces; this.setTab('play'); this.modes.play.action('left'); this.modes.play.action('drop'); return g.s.pieces === before + 1 || g.over; });
      check('board canvas painted', () => { this.modes.play.view.render(performance.now()); const c = document.getElementById('cv-play'); return c.width > 0 && c.height > 0; });
      check('puzzle tab loads', () => { this.setTab('puzzle'); return !!this.modes.puzzle.puzzle; });
      check('factory runs', () => { this.setTab('factory'); const f = this.state.factory; const before = f.stats.shipped; L.Factory.runExpected(f, 60); return f.stats.shipped > before; });
      check('shop and stats render', () => { this.setTab('shop'); this.setTab('stats'); return document.getElementById('stats-body').children.length > 0; });
      check('save serialises', () => JSON.parse(this.store.serialize()).v === L.SAVE_VERSION);
      this.setTab('play');
      native.post('selftest', { ok: report.ok, report: JSON.stringify(report) });
      return report;
    },
  };

  L.app = app;
  L.selfTest = () => app.runSelfTest();
  if (root.document) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => app.init());
    else app.init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
