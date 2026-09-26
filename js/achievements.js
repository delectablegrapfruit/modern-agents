// The twelve Xbox Live Arcade achievements, polled once per step of a real game and kept in localStorage.
'use strict';
(function () {
  const GW = window.GW;

  const THRESHOLDS = [[100000, '100k', '100,000'], [250000, '250k', '250,000'], [500000, '500k', '500,000'], [1000000, '1m', '1,000,000']];

  const LIST = [
    { id: 'pacifism', name: 'Pacifism', desc: 'Survive the first 60 seconds of the game without firing.' },
    { id: 'madcat', name: 'Mad Cat Skillz', desc: 'Get nine lives.' },
    { id: 'multitastic', name: 'Multitastic', desc: 'Earn x10 multiplier.' },
    { id: 'quartermaster', name: 'Quartermaster', desc: 'Collect nine bombs.' },
    ...THRESHOLDS.map(([, key, text]) => ({ id: 'score' + key, name: 'Score ' + text, desc: `Score ${text} points in one game.` })),
    ...THRESHOLDS.map(([, key, text]) => ({ id: 'surv' + key, name: 'Survived ' + text, desc: `Earn ${text} points without dying.` })),
  ];
  const KNOWN = new Set(LIST.map((a) => a.id));

  class Achievements {
    constructor(onUnlock) {
      this.onUnlock = onUnlock;
      // Drop ids from older versions of the list so the count stays honest.
      const saved = GW.store.get('achievements', {}) || {};
      this.got = {};
      for (const id in saved) if (KNOWN.has(id)) this.got[id] = saved[id];
    }

    unlock(id) {
      if (this.got[id]) return;
      this.got[id] = Date.now();
      GW.store.set('achievements', this.got);
      this.onUnlock(LIST.find((a) => a.id === id));
    }

    reset() {
      this.got = {};
      GW.store.set('achievements', this.got);
    }

    // Once per simulation step of a real (non-demo) game. `lives` counts reserve ships.
    check(g) {
      const s = g.stats;
      if (g.time >= 3600 && s.shots === 0 && s.bombs === 0 && s.deaths === 0) this.unlock('pacifism');
      if (g.lives >= 9) this.unlock('madcat');
      if (g.mult >= 10) this.unlock('multitastic');
      if (g.bombs >= 9) this.unlock('quartermaster');
      for (const [n, key] of THRESHOLDS) {
        if (g.score < n) break;
        this.unlock('score' + key);
        if (s.deaths === 0) this.unlock('surv' + key);
      }
    }
  }

  GW.Achievements = Achievements;
  GW.ACHIEVEMENTS = LIST;
})();
