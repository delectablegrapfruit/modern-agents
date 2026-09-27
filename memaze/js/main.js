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
    const first = () => {
      MZ.Audio.unlock();
      MZ.Audio.Music.ensure();
      if (MZ.Save.settings.controls.gyro) MZ.Game.input.enableGyro().catch(() => {});
      window.removeEventListener('pointerdown', first, true);
      window.removeEventListener('keydown', first, true);
    };
    window.addEventListener('pointerdown', first, true);
    window.addEventListener('keydown', first, true);
    window.addEventListener('hashchange', () => MZ.UI.fromHash());
    const loading = document.getElementById('loading');
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 400);
    if (!MZ.UI.fromHash()) MZ.Game.setState('menu');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
