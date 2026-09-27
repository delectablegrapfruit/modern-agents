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
    controls: { scheme: 'tilt', sensitivity: 1, invert: false, tilt3d: true, joystick: true, gyro: false },
    gameplay: { rule: 'normal', timer: true, minimap: 'explored', zoom: 1, autoNext: false, hints: true },
    player: { media: 'default:ball', size: 1.15, spin: 'roll', mirror: false, chroma: { on: false, color: '#00ff00', tol: 0.35, soft: 0.25 } },
    win: fxDefaults('default:burst', 2.4, 'pop'),
    lose: fxDefaults('default:splat', 1.7, 'shake'),
    goal: { media: 'default:portal', size: 1, chroma: { on: false, color: '#00ff00', tol: 0.35, soft: 0.25 } },
    background: {
      kind: 'pattern', pattern: 'rgb', media: null, fit: 'cover', dim: 0, blur: 0, rgbUnder: true, parallax: true,
      chroma: { on: false, color: '#00ff00', tol: 0.35, soft: 0.25 },
    },
    rgb: RGB,
    music: { media: 'none' },
    audio: { master: 0.8, sfx: 0.8, music: 0.5, media: 0.8, roll: true },
    display: { floor: 'classic', quality: 2, reducedMotion: false, reduceFlash: false, fps: false },
    extras: { unlockAll: false },
  };

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
    kaleido: { gauntlet: 6 }, matrix: { endless: 1500 }, hypno: { daily: 1 },
  };
  function reqText(req) {
    if (!req) return 'Unlocked';
    if (req.stars) return req.stars + ' ★ in Journey';
    if (req.gauntlet) return 'Clear ' + req.gauntlet + ' mazes in one Gauntlet';
    if (req.endless) return 'Score ' + req.endless + ' in Endless';
    if (req.daily) return 'Finish a Daily maze';
    return '';
  }

  const PROGRESS = {
    journey: { unlocked: 1, levels: {} }, // levels[n] = {stars, best, gems}
    stats: { wins: 0, falls: 0, gems: 0, playTime: 0, runs: 0 },
    gauntletBest: 0, endlessBest: 0, daily: {}, dailyDone: 0,
    seenPatterns: ['rgb'], hintsSeen: {},
  };

  const HINTS = {
    1: 'Drag anywhere to tilt the world — roll into the GOAL. Keys, gamepads and phone tilt work too.',
    2: "Don't fall off! Gems ◆ in dead ends count toward ★★★.",
    3: 'Beat the par time for the second star. Pinch or scroll to zoom.',
    4: 'Pale blue floor is ICE — slippery, and hard to steer.',
    6: 'Orange pads BOOST you forward. Hold on!',
    8: 'Flickering bridges vanish for a moment. Wait for them.',
    10: 'Striped brown floor is MUD — it slows you down.',
  };

  const Save = {
    settings: null, progress: null,
    load() {
      this.settings = MZ.merge(DEFAULTS, MZ.store.load('settings', null));
      this.progress = MZ.merge(PROGRESS, MZ.store.load('progress', null));
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
      if (req.gauntlet) return p.gauntletBest >= req.gauntlet;
      if (req.endless) return p.endlessBest >= req.endless;
      if (req.daily) return p.dailyDone >= req.daily;
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
      this.settings = MZ.merge(DEFAULTS, j.settings);
      this.progress = MZ.merge(PROGRESS, j.progress);
      this.saveSettings();
      this.saveProgress();
    },
  };

  MZ.Config = { DEFAULTS, RGB_PRESETS, UNLOCKS, reqText, HINTS };
  MZ.Save = Save;
})();
