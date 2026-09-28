// panel.js: the app's Panel.swift, HotKey.swift and App.swift, for a page: the panel (its size, the pill it folds
// into, hiding and showing it), pausing when the pointer leaves it, the mouse, keys and touch, and the menu (the app's
// menu bar menu) as a sheet beside it.

const Shortcuts = [
  { title: '⌃⌥R', ctrl: true, alt: true, meta: false, shift: false },
  { title: '⌃⌥⌘R', ctrl: true, alt: true, meta: true, shift: false },
  { title: '⌃⇧R', ctrl: true, alt: false, meta: false, shift: true },
];

class Panel {
  constructor(session, els) {
    this.session = session;
    this.els = els;
    this.canvas = els.canvas;
    this.hovering = false;
    this.touching = false;
    this.menuOpen = false;
    this.running = null;
    this.awayFor = 0;
    this.visible = Prefs.visible;
    this.compact = Prefs.compact;
    const size = this.contentSize();
    this.scene = new DuelScene(session, size.w, size.h);
    this.scene.onChange = () => this.refreshMenu();
    if (this.compact) this.scene.setCompact(true);
    R.canvas = this.canvas;
    R.ctx = this.canvas.getContext('2d');
    this.fit();
    this.bind();
    this.updatePauseState();
    this.frames = { n: 0, total: 0, worst: 0, samples: [] };
  }

  /** The panel unfolded at a size: three and a third times as wide as the lane is tall, and the header. */
  contentSize() {
    if (this.compact) return { w: PILL.w, h: PILL.h };
    const w = Prefs.sizes[Prefs.size].width;
    return { w, h: Math.round(w * 0.3) + HEADER };
  }

  /** Sizes the canvas to the page: the panel's points scaled to fit the width (crisp at the device's pixels). */
  fit() {
    const size = this.contentSize();
    const wrap = this.els.wrap;
    const avail = Math.max(120, (wrap.clientWidth || window.innerWidth - 32));
    const unfolded = Prefs.sizes[Prefs.size].width;
    // Folded, the pill keeps the scale the panel had.
    const scale = Math.min(avail / unfolded, 2.2);
    const cssW = size.w * scale, cssH = size.h * scale;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.style.borderRadius = `${(this.compact ? PILL.h / 2 : 12) * scale}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.cssScale = scale;
    R.W = size.w;
    R.H = size.h;
    R.px = this.canvas.width / size.w;
    if (this.scene.size.w !== size.w || this.scene.size.h !== size.h) this.scene.resize(size.w, size.h);
    else this.scene.layout();
  }

  /** Whether the fight runs: shown, unfolded, and the pointer over it (or Pause When Pointer Leaves off, until a
   *  card comes up), with no menu open. */
  get isRunning() {
    return this.visible && !this.compact && !this.menuOpen && !document.hidden &&
      (this.hovering || this.touching || (!Prefs.pauseWhenAway && !this.scene.isShowingBanner));
  }

  updatePauseState() {
    const running = this.isRunning;
    this.running = running;
    this.scene.setAway(!running, !Prefs.pauseWhenAway || this.touching);
    const dim = Prefs.dimWhenAway && !this.hovering && !this.touching && !this.compact && !this.menuOpen;
    this.canvas.style.opacity = dim ? '0.6' : '1';
    this.els.hidden.hidden = this.visible;
    this.els.wrap.hidden = !this.visible;
  }

  refreshRunning() { if (this.isRunning !== this.running) this.updatePauseState(); }

  setHovering(inside) {
    this.hovering = inside;
    this.updatePauseState();
  }

  setCompact(on) {
    if (on === this.compact) return;
    this.compact = on;
    Prefs.compact = on;
    if (on) this.scene.setCompact(true);
    this.fit();
    if (!on) this.scene.setCompact(false);
    this.fit();
    this.updatePauseState();
    if (on) this.session.save();
  }

  setSize(k) {
    Prefs.size = k;
    this.fit();
    this.refreshMenu();
  }

  show() { this.visible = true; Prefs.visible = true; this.updatePauseState(); this.fit(); }
  hide() { this.visible = false; Prefs.visible = false; this.hovering = false; this.updatePauseState(); this.session.save(); }
  toggle() { if (this.visible) this.hide(); else this.show(); }

  setFloorHints(on) {
    Prefs.floorHints = on;
    if (on) Prefs.hintShown = false;
    this.scene.refreshHints();
  }

  // MARK: Input

  scenePoint(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * R.W;
    const y = (1 - (e.clientY - r.top) / r.height) * R.H;
    return { x, y };
  }

  bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') { this.scene.pointerMoved(this.scenePoint(e)); this.setHovering(true); }
    });
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') this.setHovering(false);
    });
    c.addEventListener('pointermove', (e) => this.scene.pointerMoved(this.scenePoint(e)));
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      Sound.wake();
      const p = this.scenePoint(e);
      if (e.pointerType === 'touch') {
        if (!this.touching) { this.touching = true; this.updatePauseState(); }
      } else if (!this.hovering) {
        this.hovering = true;
        this.updatePauseState();
      }
      if (this.compact) { this.setCompact(false); return; }
      const hit = this.scene.headerHit(p);
      if (hit === 'compact') { this.setCompact(true); return; }
      if (hit === 'close') { this.hide(); return; }
      if (hit === 'drag') return;
      let side;
      if (e.pointerType === 'touch') side = p.x < R.W / 2 ? 'left' : 'right';
      else side = e.button === 2 || (e.button === 0 && e.ctrlKey) ? 'right' : 'left';
      this.scene.press(side);
      this.refreshRunning();
    });
    c.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    c.addEventListener('dblclick', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.key(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.session.save();
      this.updatePauseState();
    });
    window.addEventListener('blur', () => { this.touching = false; this.updatePauseState(); });
    window.addEventListener('pagehide', () => this.session.save());
    window.addEventListener('resize', () => this.fit());
    try { window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => this.refreshMenu()); } catch { /* old browsers */ }
  }

  key(e) {
    const s = Shortcuts[Prefs.shortcut];
    if (e.key && e.key.toLowerCase() === 'r' && e.ctrlKey === s.ctrl && e.altKey === s.alt && e.metaKey === s.meta && e.shiftKey === s.shift) {
      e.preventDefault();
      this.toggle();
      return;
    }
    if (this.menuOpen) {
      if (e.key === 'Escape') { e.preventDefault(); this.closeMenu(); }
      return;
    }
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'w') return; // (the browser's own)
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!this.visible) return;
    if (e.key === 'Escape') { e.preventDefault(); this.hide(); return; }
    const key = e.key.toLowerCase();
    if (key === 'c') { e.preventDefault(); this.setCompact(!this.compact); return; }
    let side = null;
    if (e.key === 'ArrowLeft' || key === 'a' || key === 'f') side = 'left';
    else if (e.key === 'ArrowRight' || key === 'd' || key === 'j') side = 'right';
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      Sound.wake();
      // A key takes the panel as a click does: the fight runs until the pointer leaves it.
      if (!this.hovering && !this.touching) { this.touching = true; this.updatePauseState(); }
      this.scene.goOn();
      this.refreshRunning();
      return;
    } else return;
    e.preventDefault();
    Sound.wake();
    if (e.repeat) return;
    if (this.compact) return;
    if (!this.hovering && !this.touching) { this.touching = true; this.updatePauseState(); }
    this.scene.press(side);
    this.refreshRunning();
  }

  // MARK: The loop

  frame(dt) {
    const t0 = performance.now();
    const running = this.isRunning;
    this.awayFor = running || this.scene.isEngaging || this.session.fight.outcome ? 0 : this.awayFor + dt;
    // A moment after the fight stops, the panel stops drawing, so a paused game costs nothing.
    if (!this.visible || this.awayFor > 1.2) return;
    this.scene.update(dt);
    const frozen = this.scene.frozenWorld && !this.scene.isEngaging;
    if (frozen) {
      // Everything holds but what plays over the lane.
      this.scene.overlay.tick(0);
      this.scene.header.tick(dt);
      this.scene.pill.tick(dt);
    } else {
      this.scene.root.tick(dt);
    }
    R.render(this.scene.root, Palette.background.css());
    const spent = performance.now() - t0;
    const f = this.frames;
    f.n++; f.total += spent; f.worst = Math.max(f.worst, spent);
  }

  // MARK: The menu (App.menuNeedsUpdate)

  openMenu() {
    this.menuOpen = true;
    this.refreshMenu();
    this.els.menu.hidden = false;
    this.els.menuButton.setAttribute('aria-expanded', 'true');
    this.updatePauseState();
  }
  closeMenu() {
    this.menuOpen = false;
    this.els.menu.hidden = true;
    this.els.menuButton.setAttribute('aria-expanded', 'false');
    this.updatePauseState();
  }
  toggleMenu() { if (this.menuOpen) this.closeMenu(); else this.openMenu(); }

  refreshMenu() {
    if (!this.menuOpen) return;
    const m = this.els.menu;
    m.textContent = '';
    const session = this.session;
    const career = session.career;
    const fight = session.fight;
    const mode = career.mode || fight.mode;
    const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const note = (text, into = m) => into.appendChild(el('div', 'note', text));
    const item = (title, action, { on = null, enabled = true, into = m, hint = null } = {}) => {
      const b = el('button', 'item' + (on === null ? '' : on ? ' on' : ' off'));
      b.type = 'button';
      b.setAttribute('role', on === null ? 'menuitem' : 'menuitemcheckbox');
      if (on !== null) b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.appendChild(el('span', 'tick', on ? '✓' : ''));
      b.appendChild(el('span', 'label', title));
      if (hint) b.appendChild(el('span', 'key', hint));
      b.disabled = !enabled;
      b.addEventListener('click', (e) => { e.preventDefault(); action(); });
      into.appendChild(b);
      return b;
    };
    const sep = (into = m) => into.appendChild(el('hr'));
    const sub = (title, open = false) => {
      const d = el('details', 'sub');
      d.open = open || !!this.openSubs?.has(title);
      d.appendChild(el('summary', null, title));
      d.addEventListener('toggle', () => { this.openSubs = this.openSubs || new Set(); if (d.open) this.openSubs.add(title); else this.openSubs.delete(title); });
      const body = el('div', 'subbody');
      d.appendChild(body);
      m.appendChild(d);
      return body;
    };

    // Where you are, and the career.
    const kills = career.kills || 0;
    if (career.endless) note(`${career.modeTitle} · endless on stage ${career.endless.stage} · ${career.endless.cleared} in a row`);
    else note(`${career.modeTitle} · stage ${fight.stage} · ${SettingNames[fight.setting]}`);
    let record = `${career.rank} · ${count(kills, 'kill')}`;
    if ((career.streak || 0) > 1) record += ` · ${career.streak} in a row`;
    note(record);
    if (career.nextRank) note(`${count(career.nextRank.killsNeeded, 'more kill')} to ${career.nextRank.title}`);
    if ((career.bestCombo || 0) > 0) note(`Best combo ${career.bestCombo} · ${career.flawless || 0} flawless · ${count(career.falls || 0, 'fall')}`);
    if (career.endless) {
      const best = career.bestEndlessRun;
      if (best) note(`Best on stage ${career.endless.start}: ${best.cleared} in a row · ${grouped(best.score)}`);
    } else if (career.bestCampaignRun) {
      note(`Best run ${count(career.bestCampaignRun.cleared, 'stage')} · ${grouped(career.bestCampaignRun.score)}`);
    }
    if ((career.score || 0) > 0) note(`${grouped(career.score)} points in all · best stage ${grouped(career.bestScore || 0)}`);
    sep();

    item(this.visible ? 'Hide Ronin' : 'Show Ronin', () => { this.toggle(); this.refreshMenu(); }, { hint: Shortcuts[Prefs.shortcut].title });
    item('Compact', () => { if (!this.visible) this.show(); this.setCompact(!this.compact); this.refreshMenu(); }, { on: this.compact });

    // Each mode's campaign: its stage, and the hearts it carries of the most it can hold.
    const modes = sub('Difficulty');
    for (const m of career.modes || []) {
      item(`${m.title} — ${m.gist} · ♥ ${m.hearts}/${m.maxHearts} · stage ${m.stage}`, () => {
        if (m.mode !== mode) { session.choose(m.mode); this.scene.loadFight(true); }
        this.closeMenu();
      }, { on: !!m.selected, into: modes });
    }

    // Endless: any stage reached, played over and over; each keeps its own best run.
    const endless = sub('Endless');
    const bestCampaign = career.bestCampaignRun;
    item(`Campaign · stage ${career.stage}` + (bestCampaign ? ` · best ${count(bestCampaign.cleared, 'stage')}` : ''), () => {
      if (career.endless) { session.leaveEndless(); this.scene.loadFight(true); }
      this.closeMenu();
    }, { on: !career.endless, into: endless });
    endless.appendChild(el('hr'));
    let stages = career.endlessStages || [];
    const last = stages.length ? stages[stages.length - 1].stage : 1;
    if (stages.length > 30) stages = stages.filter((s) => s.stage === 1 || s.stage % 5 === 0 || s.stage === last);
    for (const s of stages) {
      let title = `Stage ${s.stage}` + (s.warlord ? ' · warlord' : '');
      if (s.best) title += ` · best ${s.best.cleared ?? s.best} in a row`;
      item(title, () => { session.startEndless(s.stage); this.scene.loadFight(true); this.closeMenu(); }, { on: !!s.selected, into: endless });
    }
    if ((career.bestEndless || 0) > 0) { endless.appendChild(el('hr')); note(`Most clears in a row: ${career.bestEndless}`, endless); }

    const sizes = sub('Size');
    Prefs.sizes.forEach((sz, k) => item(sz.title, () => this.setSize(k), { on: k === Prefs.size, into: sizes }));
    item('Pause When Pointer Leaves', () => { Prefs.pauseWhenAway = !Prefs.pauseWhenAway; this.updatePauseState(); this.refreshMenu(); }, { on: Prefs.pauseWhenAway });
    item('Dim When Pointer Leaves', () => { Prefs.dimWhenAway = !Prefs.dimWhenAway; this.updatePauseState(); this.refreshMenu(); }, { on: Prefs.dimWhenAway });
    item('Floor Hints', () => { this.setFloorHints(!Prefs.floorHints); this.refreshMenu(); }, { on: Prefs.floorHints });
    item('Reduce Motion', () => { Prefs.reduceMotion = !Prefs.reduceMotion; this.refreshMenu(); }, { on: Prefs.reduceMotion });
    item('Gore', () => { Prefs.gore = !Prefs.gore; this.refreshMenu(); }, { on: Prefs.gore });
    item('Autopilot', () => { session.setAutopilot(!session.autopilot); this.refreshMenu(); }, { on: session.autopilot });

    const shortcuts = sub('Shortcut');
    Shortcuts.forEach((s, k) => item(s.title, () => { Prefs.shortcut = k; this.refreshMenu(); }, { on: k === Prefs.shortcut, into: shortcuts }));

    const controls = sub('Controls');
    for (const line of [
      'Cut left: left button, ←, A or F',
      'Cut right: right button (or ⌃-click), →, D or J',
      'On a touch screen: tap the left or right half of the lane',
      'Go on, or resume: a click, Space or Return',
      'Leave the panel to pause; come back to resume',
      'Fold into the pill: C or – · Hide: Esc or ×',
      'Show or hide: ' + Shortcuts[Prefs.shortcut].title,
    ]) note(line, controls);

    const crowd = session.rules;
    const game = session.standard;
    const standard = Prefs.crowdRules.every((k) => !!crowd[k] === !!game[k]);
    const passes = crowd.passThrough || crowd.slipPast || crowd.runnersPassAll || crowd.passBusy || crowd.shove;
    const dev = sub(standard ? 'Development' : 'Development (rules changed)');
    const set = (change) => { const r = { ...session.rules }; change(r); session.setRules(r); this.scene.refreshHUD(); this.refreshMenu(); };
    note('Crowd (the game: Slip Past, Runners Pass Everyone, Pass the Busy, Shove Through)', dev);
    item('Queue — each waits behind the man in front', () => set((r) => {
      const queued = !passes;
      r.passThrough = false;
      r.slipPast = queued && game.slipPast; r.runnersPassAll = queued && game.runnersPassAll;
      r.passBusy = queued && game.passBusy; r.shove = queued && game.shove;
    }), { on: !passes, into: dev });
    item('Full Pass-Through — everyone walks through everyone', () => set((r) => { r.passThrough = !r.passThrough; }), { on: !!crowd.passThrough, into: dev });
    item('Slip Past — runners, dancers and the gourd-bearer past brutes and archers', () => set((r) => { r.slipPast = !r.slipPast; }), { on: !!crowd.slipPast, enabled: !crowd.passThrough, into: dev });
    item('Runners Pass Everyone — past anyone but the warlord', () => set((r) => { r.runnersPassAll = !r.runnersPassAll; }), { on: !!crowd.runnersPassAll, enabled: !crowd.passThrough, into: dev });
    item('Pass the Busy — past a man winding up or recovering', () => set((r) => { r.passBusy = !r.passBusy; }), { on: !!crowd.passBusy, enabled: !crowd.passThrough, into: dev });
    item('Shove Through — the brute through lighter men', () => set((r) => { r.shove = !r.shove; }), { on: !!crowd.shove, enabled: !crowd.passThrough, into: dev });
    dev.appendChild(el('hr'));
    note('The brute (the game: No Knockback)', dev);
    item('No Brute Knockback — a cut neither moves him nor breaks his blow; cut as his club glares to turn it', () => set((r) => { r.noBruteKnockback = !r.noBruteKnockback; }), { on: !!crowd.noBruteKnockback, into: dev });
    dev.appendChild(el('hr'));
    item("Restore the Game's Rules", () => set((r) => Object.assign(r, game)), { on: false, enabled: !standard, into: dev });
    sep();

    // Walking away from a fight keeps the hearts it cost; past a stage's card, this goes on as the card does.
    const restartTitle = career.restartTitle || (!fight.outcome ? `Restart Stage · ♥ ${fight.hp}` : fight.outcome === 'victory' ? 'Next Stage' : `Start Over · Stage ${career.current}`);
    item(restartTitle, () => {
      session.restart();
      this.scene.loadFight(true);
      this.closeMenu();
    });
    const reset = item('Reset Career…', () => {
      if (this.confirmReset) {
        this.confirmReset = false;
        session.reset();
        this.scene.loadFight(true);
        this.closeMenu();
      } else {
        this.confirmReset = true;
        this.refreshMenu();
      }
    });
    if (this.confirmReset) {
      reset.querySelector('.label').textContent = 'Reset your career? Click again — your rank, kills, stages and best runs go back to the start.';
      reset.classList.add('danger');
      item('Cancel', () => { this.confirmReset = false; this.refreshMenu(); });
    }
  }
}
