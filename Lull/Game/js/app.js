// Lull — start-up, tabs, the frame loop, autosave, and the conversation with the native floating panel.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Store, Keys, Sound, UI, Modes, Render, native, fmtInt } = L;
  const { h, toast } = UI;
  const { LINE } = L;

  L.VERSION = '1.0';

  // The title bar's tabs, left to right: the places to play in one track, then the places to look by the wallet. The
  // Shop has no tab of its own: it is the wallet. ⌘1–⌘7 run in that order (the wallet last). A tab's tooltip is its
  // name and key, nothing more: what each place is, you find by going there.
  const TABS = [
    { id: 'play', label: 'Play', icon: 'play', group: 'modes' },
    { id: 'puzzle', label: 'Puzzles', icon: 'puzzle', group: 'modes' },
    { id: 'factory', label: 'Factory', icon: 'factory', group: 'modes' },
    { id: 'classic', label: 'Classic', icon: 'classic', group: 'modes' },
    { id: 'stats', label: 'Stats', icon: 'stats', group: 'meta' },
    { id: 'achievements', label: 'Achievements', icon: 'trophy', group: 'meta' },
  ];
  // Every view, in shortcut order: the tabs, then the Shop (the wallet).
  const VIEWS = TABS.map((t) => t.id).concat('shop');

  const app = {
    store: null, keys: null, sound: Sound, modes: {}, tab: null, theme: null,
    shopSub: null, statsSub: 'overview', focusedAt: 0, lastTime: 0, lastSave: 0, activeMs: 0,

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
      L.Collapse.init(this);
      this.lastTime = performance.now();
      // The line glyph's font is only fetched once text needs it; the canvases draw it too, so fetch it now and redraw.
      if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('12px "Lull Line"', LINE), document.fonts.load('600 12px "Lull Sans"', 'HOLD')]).then(() => this.onResize(), () => {});
      requestAnimationFrame((t) => this.frame(t));
      setInterval(() => this.second(), 1000);
      if (this.store.loadedFrom === 'new') setTimeout(() => this.welcome(), 250);
      if (this.store.loadedFrom === 'corrupt') toast('Save unreadable. Started fresh', 'bad', 6000);
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
      // Touch alone (a phone, a tablet), the page is the whole screen with nothing behind it to see through: solid,
      // whatever the save says (an Export back to the Mac keeps its choice).
      appEl.className = 'bg-' + (L.Touch && L.Touch.only ? 'solid' : s.bg);
      this.sound.enabled = !!s.sound;
      this.sound.volume = s.volume;
      if (this.sound.master) this.sound.master.gain.value = s.volume;
      this.sound.pack = this.state.equipped.sound || 'soft';
      this.applyMute();
      const css = getComputedStyle(rootEl);
      const v = (k) => css.getPropertyValue(k).trim();
      this.theme = {
        name: theme, well: v('--well'), grid: v('--grid'), line: v('--line-2'), muted: v('--muted'), fg: v('--fg'), accent: s.accent, fog: v('--fog'), mono: v('--mono'), faint: v('--faint'), hair: v('--line'), gem: v('--gem'), gold: v('--gold'),
        // The board's materials (css/lull.css, "board"): the well's wash, its rim and shadows, the plate under it.
        wellTop: v('--well-top'), wellBottom: v('--well-bottom'), rim: v('--rim'), rimHi: v('--rim-hi'), innerShade: v('--inner-shade'), drop: v('--well-drop'),
        plate: v('--plate'), plate2: v('--plate-2'), plateBase: v('--plate-base'), plateLine: v('--plate-line'), plateHi: v('--plate-hi'), plateShadow: v('--plate-shadow'),
      };
      native.post('window', { bg: s.bg, onTop: !!s.onTop, fade: s.fadeAway !== false, theme, radius: 14 });
      if (s.fadeAway === false) document.body.classList.remove('away');
      const pin = document.getElementById('btn-pin');
      if (pin) { pin.classList.toggle('on', !!s.onTop); pin.setAttribute('aria-pressed', String(!!s.onTop)); }
      if (!first) {
        this.applyLook();
        if (this.modes.play) this.modes.play.game.previewCount = s.preview;
      }
    },

    /** Mute on or off: the audio, the top-bar button and any open Settings switch, all from settings.muted. */
    applyMute() {
      const on = !!this.settings.muted;
      this.sound.setMuted(on);
      const b = document.getElementById('btn-mute');
      if (b) {
        b.innerHTML = UI.ICONS[on ? 'muted' : 'sound'];
        b.classList.toggle('muted', on);
        b.setAttribute('aria-pressed', String(on));
        b.setAttribute('aria-label', on ? 'Unmute' : 'Mute');
        b.dataset.tip = on ? 'Unmute' : 'Mute';
      }
      for (const sw of document.querySelectorAll('.switch[data-setting="muted"]')) sw.setAttribute('aria-checked', String(on));
    },

    toggleMute() {
      this.settings.muted = !this.settings.muted;
      this.store.touch();
      this.applyMute();
    },

    /** Reduced motion: Settings ▸ Look ▸ Effects, or the system's own setting. */
    reducedMotion() { return this.settings.motion === 'reduced' || !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); },

    /** The look, still (no moving palette, frame or backdrop) under reduced motion. */
    look() { return Render.makeLook(this.state.equipped, this.theme, performance.now(), this.reducedMotion()); },

    applyLook() {
      this.sound.pack = this.state.equipped.sound || 'soft';
      for (const k of ['play', 'classic', 'puzzle']) if (this.modes[k]) { this.modes[k].view.setLook(this.look()); this.modes[k].view.dirty = true; }
      if (this.tab === 'shop') UI.renderShop(this, this.shopSub);
    },

    // ---- chrome -------------------------------------------------------------------------------------------------------

    buildChrome() {
      const tab = (t, i) => h('button', { role: 'tab', 'data-tab': t.id, 'aria-label': t.label, 'data-tip': t.label, 'data-tip-foot': '⌘' + (i + 1), onclick: () => this.setTab(t.id) },
        h('span', { html: UI.ICONS[t.icon], style: { display: 'contents' } }), h('span', { class: 'lbl' }, t.label));
      document.getElementById('tabs').replaceChildren(...TABS.map((t, i) => t.group === 'modes' && tab(t, i)).filter(Boolean));
      document.getElementById('tabs-meta').replaceChildren(...TABS.map((t, i) => t.group === 'meta' && tab(t, i)).filter(Boolean));
      document.getElementById('wallet-icon').innerHTML = UI.ICONS.line;
      document.getElementById('btn-settings').innerHTML = UI.ICONS.settings;
      document.getElementById('btn-pin').innerHTML = UI.ICONS.pin;
      document.getElementById('btn-hide').innerHTML = UI.ICONS.hide;
      document.getElementById('btn-close').innerHTML = UI.ICONS.close;
      document.getElementById('btn-settings').addEventListener('click', () => UI.openSettings(this));
      document.getElementById('btn-mute').addEventListener('click', () => this.toggleMute());
      document.getElementById('btn-pin').addEventListener('click', () => { this.settings.onTop = !this.settings.onTop; this.store.touch(); this.applySettings(); });
      document.getElementById('btn-hide').addEventListener('click', () => { this.saveNow(); native.post('hide'); });
      document.getElementById('btn-close').addEventListener('click', () => { this.saveNow(); native.post('quit'); });
      const wallet = document.getElementById('wallet');
      wallet.dataset.tipFoot = '⌘' + VIEWS.length;
      wallet.addEventListener('click', () => this.setTab('shop'));
    },

    setBadge(tab, on) {
      const b = document.querySelector('.tabs button[data-tab="' + tab + '"]');
      if (!b) return;
      const cur = b.querySelector('.badge');
      if (on && !cur) b.appendChild(h('span', { class: 'badge' }));
      if (!on && cur) cur.remove();
    },

    setTab(id) {
      if (!VIEWS.includes(id)) id = 'play';
      if (L.Collapse.on) L.Collapse.set(false);
      const prev = this.tab;
      if (prev === 'factory' && id !== 'factory') this.modes.factory.hide();
      if (prev === 'classic' && id !== 'classic') { this.modes.classic.togglePause(true); L.Music.stop(); }
      if (prev === 'achievements' && id !== 'achievements') this.achMenu = false;
      this.tab = id;
      this.state.tab = id;
      for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === id));
      // The wallet is the Shop's way in: lit (and announced as the current page) while the Shop is open.
      const wallet = document.getElementById('wallet');
      wallet.classList.toggle('active', id === 'shop');
      if (id === 'shop') wallet.setAttribute('aria-current', 'page'); else wallet.removeAttribute('aria-current');
      for (const v of document.querySelectorAll('.view')) v.classList.toggle('active', v.dataset.tab === id);
      this.keys && this.keys.setTarget(id === 'play' ? this.modes.play : id === 'classic' ? this.modes.classic : id === 'puzzle' ? this.modes.puzzle : null);
      if (id === 'puzzle') this.modes.puzzle.show();
      if (id === 'factory') { this.modes.factory.show(); }
      if (id === 'shop') UI.renderShop(this, this.shopSub);
      if (id === 'stats') UI.renderStats(this, this.statsSub);
      if (id === 'achievements') UI.renderAchievements(this);
      if (id === 'play' || id === 'puzzle' || id === 'classic') { const m = this.modes[id]; m.view.resize(); m.view.dirty = true; }
      this.store.touch();
      this.postDragRegions();
    },

    refreshWallet(bump) {
      const n = fmtInt(this.state.lines);
      document.getElementById('wallet-n').textContent = n;
      document.getElementById('wallet').setAttribute('aria-label', 'Shop — ' + n + ' lines');
      if (this.tab === 'shop') UI.refreshShopPrices(this);
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
        // M mutes on every tab and over any open window (a plain M only: ⌘M and friends belong to the system).
        if (!typing && e.code === 'KeyM' && !e.metaKey && !e.ctrlKey && !e.altKey) { if (!e.repeat) this.toggleMute(); e.preventDefault(); return; }
        if (UI.modalOpen()) {
          if (e.key === 'Escape') { UI.closeTopModal(); e.preventDefault(); }
          else if (e.key === 'Enter' && !(t && t.tagName === 'TEXTAREA')) { if (UI.submitTopModal()) e.preventDefault(); }
          return;
        }
        if (typing) return;
        if ((e.metaKey || e.ctrlKey) && e.code === 'KeyJ') { if (!e.repeat) L.Collapse.toggle(); e.preventDefault(); return; }
        // Rolled up: no game keys; a tab's or Settings' shortcut rolls the window back down first.
        if (L.Collapse.on && !((e.metaKey || e.ctrlKey) && (/^Digit[1-9]$/.test(e.code) || e.code === 'Comma')) && !(e.key === 'Escape' && native.available)) return;
        if ((e.metaKey || e.ctrlKey) && /^Digit[1-9]$/.test(e.code) && VIEWS[Number(e.code.slice(5)) - 1]) { this.setTab(VIEWS[Number(e.code.slice(5)) - 1]); e.preventDefault(); return; }
        if ((e.metaKey || e.ctrlKey) && e.code === 'Comma') { this.openSettings(); e.preventDefault(); return; }
        // ⌘Z undoes like ⌫: once per press (each undo costs an Undo, so a held key never repeats it).
        if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ' && this.tab === 'puzzle') { if (!e.repeat) this.modes.puzzle.undo(); e.preventDefault(); return; }
        if (e.key === 'Escape' && this.tab === 'play' && this.modes.play.closeTray()) { e.preventDefault(); return; }
        if (e.key === 'Escape' && native.available) { this.saveNow(); native.post('hide'); return; }
        if (this.tab === 'factory' && !e.metaKey && !e.ctrlKey && this.modes.factory.key(e)) { e.preventDefault(); return; }
        if (this.keys.down(e)) this.activity();
      });
      root.addEventListener('keyup', (e) => this.keys.up(e));
      root.addEventListener('blur', () => { this.keys.releaseAll(); if (this.modes.classic && this.modes.classic.running()) this.modes.classic.togglePause(true); });
      root.addEventListener('focus', () => { this.focusedAt = performance.now(); setTimeout(() => this.announceUnheard(), 400); });
      root.addEventListener('mousedown', () => this.activity(), true);
      root.addEventListener('pointerdown', () => this.activity(), true);
      // Clicked buttons let go of focus, so Space and Enter keep playing instead of pressing them again.
      document.addEventListener('mouseup', (e) => {
        const b = e.target && e.target.closest && e.target.closest('button');
        if (b && !b.closest('.modal')) setTimeout(() => b.blur(), 0);
      });
      document.addEventListener('visibilitychange', () => { if (document.hidden) { this.saveNow(); L.Music.stop(); } else { this.modes.factory.catchUp(true); setTimeout(() => this.announceUnheard(), 400); } });
      root.addEventListener('pagehide', () => this.saveNow());
      root.addEventListener('beforeunload', () => this.saveNow());
      root.addEventListener('resize', () => { this.onResize(); });
      if (root.ResizeObserver) {
        const ro = new ResizeObserver(() => this.onResize());
        for (const id of ['cv-play', 'cv-classic', 'cv-puzzle', 'cv-floor']) ro.observe(document.getElementById(id).parentElement);
      }
      // A trackpad or a keyboard attached or taken away: the background follows (Settings follows on its own).
      L.bus.on('input', () => this.applySettings());
      if (root.matchMedia) {
        const mq = root.matchMedia('(prefers-color-scheme: light)');
        const fn = () => { if (this.settings.theme === 'auto') this.applySettings(); };
        if (mq.addEventListener) mq.addEventListener('change', fn);
      }
      // Messages from the native panel.
      // The pointer away from Lull: it dims (and, in a browser, fades; the panel fades itself natively).
      // Classic pauses too (Settings ▸ Controls ▸ Pause Classic when the pointer leaves); P or Resume carries on.
      document.documentElement.addEventListener('mouseleave', () => this.pointerLeft());
      if (!native.available) {
        document.documentElement.addEventListener('mouseleave', () => { if (this.settings.fadeAway !== false && !this.touchNow()) document.body.classList.add('away'); });
        document.documentElement.addEventListener('mouseenter', () => document.body.classList.remove('away'));
      }
      L.fromNative = (msg) => {
        if (!msg) return;
        if (msg.type === 'flush') { this.saveNow(); native.post('flushed'); }
        else if (msg.type === 'shown') { this.focusedAt = performance.now(); this.modes.factory.catchUp(true); setTimeout(() => this.announceUnheard(), 400); }
        else if (msg.type === 'toggleTop') { this.settings.onTop = !this.settings.onTop; this.applySettings(); }
        else if (msg.type === 'pointer') { document.body.classList.toggle('away', !msg.inside); if (!msg.inside) this.pointerLeft(); }
        else if (msg.type === 'settings') this.openSettings();
        else if (msg.type === 'toggleCollapse') L.Collapse.toggle();
      };
    },

    activity() { this.lastActivity = performance.now(); },

    /** The pointer has left Lull's window: a running Classic game pauses, as P would. */
    pointerLeft() {
      if (this.touchNow()) return; // a finger lifting is not a pointer leaving (Classic pauses when the page is hidden)
      const c = this.modes.classic;
      if (this.settings.pauseAway !== false && c && c.running()) c.togglePause(true);
    },

    /** Touch in use (a finger was down a moment ago, or the device has no mouse or trackpad at all). */
    touchNow() { return !!(L.Touch && (L.Touch.recent() || L.Touch.only)); },

    openSettings() { L.Collapse.set(false); UI.openSettings(this); },

    /** Checks achievements after something happened; a new one pays lines and says so, once, quietly. */
    achieve(event) {
      const got = L.Achievements.check(this.state, event);
      if (!got.length) return;
      for (const a of got) this.store.addLines(a.pay, 'achievements');
      // Earned in the background (the factory, the minute check) or rolled up (toasts have nowhere to show): no chime
      // from a hidden window; said on return.
      if (document.hidden || !document.hasFocus() || L.Collapse.on) this.unheard = (this.unheard || []).concat(got);
      else this.announce(got);
      if (this.tab === 'achievements') UI.renderAchievements(this);
      this.refreshWallet(true);
      this.store.touch();
    },

    /**
     * One toast per achievement (a click or Enter on it goes to it in the tab), with its place's icon and colour (a
     * legendary one also edged and named in gold); many at once from away: one, to Recent, in the neutral colour.
     */
    announce(got, away) {
      const legend = got.some((a) => a.tier === 'legend');
      if (away && got.length > 3) {
        toast(got.length + ' achievements while you were away · +' + fmtInt(got.reduce((n, a) => n + a.pay, 0)) + ' ' + LINE, 'ach-toast', 6000, 'trophy',
          { onClick: () => UI.showAchievement(this, null), label: got.length + ' achievements while you were away. Show recent', area: 'lull' });
      } else for (const a of got) {
        const leg = a.tier === 'legend';
        toast([leg ? h('span', { class: 'leg' }, 'Legendary: ') : null, a.name + ' · +' + fmtInt(a.pay) + ' ' + LINE], 'ach-toast legend-' + leg, leg ? 6000 : 3200, L.Achievements.groupOf(a).icon,
          { onClick: () => UI.showAchievement(this, a.id), label: (leg ? 'Legendary: ' : '') + a.name + '. Show in Achievements', area: a.group });
      }
      this.sound.play(legend ? 'perfect' : 'solve');
    },

    /** Back in front (or rolled back down): the achievements earned meanwhile, once. */
    announceUnheard() {
      if (!this.unheard || !this.unheard.length || document.hidden || !document.hasFocus() || L.Collapse.on) return;
      const got = this.unheard;
      this.unheard = null;
      this.announce(got, true);
    },

    onResize() {
      for (const k of ['play', 'classic', 'puzzle']) { const v = this.modes[k] && this.modes[k].view; if (v) { v.resize(); v.dirty = true; } }
      if (this.modes.factory) this.modes.factory.relayout();
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
      if (L.Collapse.on) { /* rolled up: the boards and the floor rest (the factory runs on in second()) */ }
      else if (this.tab === 'play') this.modes.play.frame(t, dt);
      else if (this.tab === 'classic') this.modes.classic.frame(t, dt);
      else if (this.tab === 'puzzle') this.modes.puzzle.frame(t, dt);
      else if (this.tab === 'factory') {
        // Every frame in front (a smooth belt); 12 fps behind other windows.
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
      if (focused && !L.Collapse.on && performance.now() - (this.lastActivity || 0) < 120000) {
        const S = this.state.stats.timeMs;
        S.total += 1000;
        if (this.tab === 'play') { S.play += 1000; const bs = this.modes.play.game.s; bs.playMs = (bs.playMs || 0) + 1000; }
        else if (this.tab === 'classic') S.classic = (S.classic || 0) + 1000;
        else if (this.tab === 'puzzle') S.puzzle += 1000;
        else if (this.tab === 'factory') S.factory += 1000;
        this.store.day().ms += 1000;
        this.store.played();
        this.store.dirty = true;
      }
      this.secondCount = (this.secondCount || 0) + 1;
      // Lifetime achievements (time, days, lines from anywhere) are looked at once a minute too.
      if (this.secondCount % 60 === 0) this.achieve({ mode: 'tick' });
      if (this.store.dirty && performance.now() - this.lastSave > 5000) this.saveNow();
    },

    saveNow() {
      if (!this.store) return;
      this.modes.play && this.modes.play.save();
      if (this.modes.puzzle) this.modes.puzzle.bankTime();
      this.store.save();
      this.lastSave = performance.now();
    },

    welcome() {
      UI.openModal({
        title: 'Welcome to Lull',
        width: 440,
        body: h('div', null,
          h('p', null, 'Pieces fall only when you drop them.'),
          // A phone or a tablet with no keyboard or mouse: the gestures instead of the keys.
          L.Touch && L.Touch.keyless
            ? h('div', { class: 'keys gestures', style: { marginTop: '10px' } }, L.Touch.help(this.settings).slice(0, 7).map(([k, d]) => [h('span', { class: 'k' }, h('span', { class: 'gest' }, k)), h('span', null, d)]))
            : h('div', { class: 'keys', style: { marginTop: '10px' } }, L.KEY_HELP.slice(0, 7).map(([k, d]) => [h('span', { class: 'k' }, h('kbd', null, k)), h('span', null, d)]))),
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
      check('factory runs', () => { this.setTab('factory'); const f = L.Factory.create(); L.Factory.step(f, 700); return f.stats.minos >= 4; });
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
