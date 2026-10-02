/* Memaze — boot. */
(function () {
  'use strict';
  const MZ = window.MZ;

  async function boot() {
    MZ.Save.load();
    MZ.Game.init();
    MZ.UI.init();
    try { await MZ.Media.init(); } catch (e) { console.error(e); }
    MZ.Game.applySettings();
    // A chosen file vanished from its folder, or a new one arrived: re-resolve what's on screen.
    MZ.Media.on('change', () => MZ.Game.applySettings());
    // Sound may only start from a tap, click or key, and a phone counts a tap once the finger lifts (a finger coming
    // down isn't enough): every one of those tries, until sound runs, and again whenever it's been stopped since (a
    // call, the app in the background) or the music was refused.
    const tap = () => { if (!MZ.Audio.running()) MZ.Audio.unlock(); MZ.Audio.Music.ensure(); };
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, tap, true);
    window.addEventListener('hashchange', () => MZ.UI.fromHash());
    const loading = document.getElementById('loading');
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 400);
    if (!MZ.UI.fromHash()) MZ.Game.setState('menu');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
