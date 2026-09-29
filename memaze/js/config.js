/* Memaze — default configuration, unlockables and saved progress. */
(function () {
  'use strict';
  const MZ = window.MZ;

  const RGB = {
    style: 'gradient', speed: 6, sat: 85, light: 55, hueFrom: 0, hueTo: 360, spread: 140, angle: 135, spin: true, pulse: 0.15,
    usePalette: false, palette: ['#ff0080', '#7928ca', '#00d4ff'],
  };
  const fxDefaults = (media, duration, anim) => ({
    media, on: true, duration, maxVideo: 8, size: 0.85, fit: 'contain', anim, sound: true,
    chroma: { on: false, color: '#00ff00', tol: 0.35, soft: 0.25 },
  });
  const DEFAULTS = {
    controls: { invert: false, speed: 1, mouse: 'glide', touch: 'joystick' }, // mouse: 'glide' (steer with the pointer), 'lock' (captured) or 'drag'; touch: 'joystick' or 'drag'
    gameplay: { rule: 'normal', timer: true, minimap: 'explored', zoom: 1, autoNext: false, boxes: true },
    player: { media: 'default:sticker', size: 1, shape: 'circle', chroma: { on: false, color: '#00ff00', tol: 0.35, soft: 0.25 } }, // shape: your own pictures are cut to it
    win: fxDefaults('default:burst', 2.4, 'pop'),
    lose: fxDefaults('default:oops', 1.7, 'none'),
    goal: { media: 'default:portal', size: 1, chroma: { on: false, color: '#00ff00', tol: 0.35, soft: 0.25 } },
    background: {
      kind: 'pattern', pattern: 'rgb', media: null, fit: 'cover', dim: 0, blur: 0, rgbUnder: true, parallax: true,
      chroma: { on: false, color: '#00ff00', tol: 0.35, soft: 0.25 },
    },
    rgb: RGB,
    music: { media: 'default:synth' }, // the built-in chill loop
    audio: { master: 0.8, sfx: 0.8, music: 0.5, media: 0.8 },
    display: { floor: 'classic', quality: 2, reducedMotion: false, reduceFlash: false, fps: false },
    extras: { unlockAll: false },
    v: 2,
  };
  // Built-in media that no longer exist: saved choices move to their replacements. Settings that no longer exist are dropped.
  const RENAMED = { 'default:ball': 'default:sticker', 'default:splat': 'default:oops' };
  const GONE = { controls: ['scheme', 'sensitivity', 'tilt3d', 'joystick', 'gyro'], player: ['spin', 'mirror'], gameplay: ['hints', 'ghost'], audio: ['roll'] };

  const RGB_PRESETS = [
    { name: 'Rainbow', rgb: { style: 'gradient', hueFrom: 0, hueTo: 360, sat: 85, light: 55, spread: 140, usePalette: false } },
    { name: 'Vaporwave', rgb: { style: 'gradient', usePalette: true, palette: ['#ff71ce', '#01cdfe', '#b967ff', '#fffb96'], spread: 160 } },
    { name: 'Inferno', rgb: { style: 'radial', hueFrom: 340, hueTo: 50, sat: 95, light: 50, spread: 60, usePalette: false } },
    { name: 'Ocean', rgb: { style: 'aurora', hueFrom: 170, hueTo: 240, sat: 80, light: 45, spread: 50, usePalette: false } },
    { name: 'Toxic', rgb: { style: 'gradient', hueFrom: 70, hueTo: 150, sat: 95, light: 50, spread: 50, usePalette: false } },
    { name: 'Midnight', rgb: { style: 'aurora', usePalette: true, palette: ['#0b0033', '#370617', '#1b3a4b', '#3c096c'], spread: 120, light: 30 } },
    { name: 'Pulse', rgb: { style: 'cycle', hueFrom: 0, hueTo: 360, sat: 90, light: 50, speed: 10, pulse: 0.5, usePalette: false } },
    { name: 'Mono', rgb: { style: 'radial', usePalette: true, palette: ['#111111', '#444444', '#888888'], spread: 90 } },
  ];

  // Background patterns unlock with journey stars, or special feats.
  const UNLOCKS = {
    rgb: null,
    stripes: { stars: 3 }, checker: { stars: 8 }, dots: { stars: 14 }, waves: { stars: 20 }, stars: { stars: 28 },
    tunnel: { stars: 36 }, synth: { stars: 45 }, plasma: { stars: 55 },
    kaleido: { gauntlet: 6 }, matrix: { endless: 1500 }, hypno: { chapter: 2 },
  };
  function reqText(req) {
    if (!req) return 'Unlocked';
    if (req.stars) return req.stars + (req.stars === 1 ? ' star' : ' stars') + ' in Levels';
    if (req.gauntlet) return 'Reach depth ' + req.gauntlet + ' in Gauntlet';
    if (req.endless) return 'Score ' + req.endless + ' in Endless';
    if (req.chapter) return 'Beat the Chapter ' + req.chapter + ' boss';
    return '';
  }

  const PROGRESS = {
    journey: { unlocked: 1, levels: {} }, // levels[n] = {stars, best, gems}
    stats: { wins: 0, falls: 0, gems: 0, playTime: 0, runs: 0 },
    gauntlet: {}, endlessBest: 0, trials: {}, // gauntlet['progressive/normal'] = deepest maze cleared; trials[level] = best time
    gauntletGems: 0, // gems taken in the Gauntlet (kept apart from stats.gems, the main levels' gems)
    seenPatterns: ['rgb'],
  };

  function migrate(st, raw) {
    // Version 2 brought the new built-in music: it plays unless it's been turned off since.
    if (raw && !(raw.v >= 2) && st.music.media === 'none') st.music.media = 'default:synth';
    st.v = 2;
    for (const slot of ['player', 'lose']) if (RENAMED[st[slot].media]) st[slot].media = RENAMED[st[slot].media];
    for (const g in GONE) for (const k of GONE[g]) delete st[g][k];
    // The hitbox is now the picture itself, sized against the maze (0.6-1.25); Strict is what every rule does now.
    if (!(st.player.size >= 0.6 && st.player.size <= 1.25)) st.player.size = 1;
    if (st.gameplay.rule !== 'casual') st.gameplay.rule = 'normal';
    if (st.gameplay.minimap !== 'off') st.gameplay.minimap = 'explored'; // the map is always fogged now
    if (!(st.gameplay.zoom >= 1 && st.gameplay.zoom <= 3)) st.gameplay.zoom = 1; // the default view is the widest now
    return st;
  }

  // Tutorial tips and the Daily maze are gone; the one Gauntlet best becomes the Progressive/Normal one.
  const oldProgress = (p) => {
    delete p.hintsSeen; delete p.daily; delete p.dailyDone;
    if (!(p.ch1 >= 2)) { // chapter 1 was rebuilt by hand: old best times there no longer compare (stars and progress stay)
      for (let L = 1; L <= 10; L++) { if (p.journey.levels[L]) delete p.journey.levels[L].best; delete p.trials[L]; }
      p.ch1 = 2;
    }
    if (!(p.ch2 >= 2)) { // ...and chapter 2 (levels 11-20)
      for (let L = 11; L <= 20; L++) { if (p.journey.levels[L]) delete p.journey.levels[L].best; delete p.trials[L]; }
      p.ch2 = 2;
    }
    if (p.gauntletBest) p.gauntlet['progressive/normal'] = Math.max(p.gauntlet['progressive/normal'] || 0, p.gauntletBest);
    delete p.gauntletBest;
    return p;
  };

  const Save = {
    settings: null, progress: null,
    load() {
      const raw = MZ.store.load('settings', null);
      this.settings = migrate(MZ.merge(DEFAULTS, raw), raw);
      this.progress = oldProgress(MZ.merge(PROGRESS, MZ.store.load('progress', null)));
    },
    saveSettings() { MZ.store.save('settings', this.settings); },
    saveProgress() { MZ.store.save('progress', this.progress); },
    stars() {
      let n = 0;
      for (const k in this.progress.journey.levels) n += this.progress.journey.levels[k].stars || 0;
      return n;
    },
    isUnlocked(pattern, earnedOnly) {
      if (this.settings.extras.unlockAll && !earnedOnly) return true;
      const req = UNLOCKS[pattern];
      if (!req) return true;
      const p = this.progress;
      if (req.stars) return this.stars() >= req.stars;
      if (req.gauntlet) return Object.values(p.gauntlet).some((d) => d >= req.gauntlet);
      if (req.endless) return p.endlessBest >= req.endless;
      if (req.chapter) return p.journey.unlocked > req.chapter * 10;
      return false;
    },
    // Patterns unlocked since last asked (for the "new!" toast).
    newlyUnlocked() {
      const out = [];
      for (const id in UNLOCKS) {
        if (this.isUnlocked(id, true) && !this.progress.seenPatterns.includes(id)) { out.push(id); this.progress.seenPatterns.push(id); }
      }
      if (out.length) this.saveProgress();
      return out;
    },
    reset() { this.progress = MZ.clone(PROGRESS); this.saveProgress(); },
    exportJSON() { return JSON.stringify({ app: 'memaze', version: 1, settings: this.settings, progress: this.progress }, null, 2); },
    importJSON(text) {
      const j = JSON.parse(text);
      if (!j || j.app !== 'memaze') throw new Error('Not a Memaze save file');
      this.settings = migrate(MZ.merge(DEFAULTS, j.settings), j.settings);
      this.progress = oldProgress(MZ.merge(PROGRESS, j.progress));
      this.saveSettings();
      this.saveProgress();
    },
  };

  MZ.Config = { DEFAULTS, RGB_PRESETS, UNLOCKS, reqText };
  MZ.Save = Save;
})();
