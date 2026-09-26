// Twelve achievements, kept in localStorage.
'use strict';
(function () {
  const GW = window.GW;

  const LIST = [
    { id: 'pacifism', name: 'Pacifism', desc: 'Survive the first 60 seconds of a game without firing a shot.' },
    { id: 'retro', name: 'Retro', desc: 'Score 100,000 points in one game.' },
    { id: 'evolved', name: 'Evolved', desc: 'Score 1,000,000 points in one game.' },
    { id: 'master', name: 'Geometry Master', desc: 'Score 5,000,000 points in one game.' },
    { id: 'survivor', name: 'Survivor', desc: 'Stay alive for 3 minutes on a single life.' },
    { id: 'nobomb', name: 'Hold Your Fire', desc: 'Score 250,000 points without using a bomb.' },
    { id: 'multiplier', name: 'Top Multiplier', desc: 'Reach the x10 multiplier.' },
    { id: 'horizon', name: 'Event Horizon', desc: 'Destroy a Gravity Well that has swallowed 10 or more enemies.' },
    { id: 'snakes', name: 'Snake Charmer', desc: 'Destroy 10 Snakes in one game.' },
    { id: 'mayflies', name: 'Swatter', desc: 'Destroy 200 Mayflies in one game.' },
    { id: 'carpet', name: 'Carpet Bomber', desc: 'Take out 100 enemies with a single bomb.' },
    { id: 'gunner', name: 'Gunner', desc: 'Destroy 2,500 enemies in one game.' },
  ];

  class Achievements {
    constructor(onUnlock) {
      this.onUnlock = onUnlock;
      this.got = GW.store.get('achievements', {});
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

    // Once per simulation step of a real (non-demo) game.
    check(g) {
      const s = g.stats;
      if (s.shots === 0 && s.deaths === 0 && g.time >= 3600) this.unlock('pacifism');
      if (g.score >= 100000) this.unlock('retro');
      if (g.score >= 1000000) this.unlock('evolved');
      if (g.score >= 5000000) this.unlock('master');
      if (g.player.alive && g.lifeFrames >= 60 * 180) this.unlock('survivor');
      if (g.score >= 250000 && s.bombs === 0) this.unlock('nobomb');
      if (g.mult >= 10) this.unlock('multiplier');
      if ((s.byType.snake || 0) >= 10) this.unlock('snakes');
      if ((s.byType.mayfly || 0) >= 200) this.unlock('mayflies');
      if (s.kills >= 2500) this.unlock('gunner');
    }

    event(name, data) {
      if (name === 'holekill' && data.absorbed >= 10) this.unlock('horizon');
      if (name === 'bombdone' && data >= 100) this.unlock('carpet');
    }
  }

  GW.Achievements = Achievements;
  GW.ACHIEVEMENTS = LIST;
})();
