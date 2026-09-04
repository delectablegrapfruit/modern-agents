/* Scroll to Scrub — options page. */
(() => {
  'use strict';

  const { DEFAULTS, LIMITS, MODIFIERS, normalizeSettings, normalizeSites } = globalThis.ScrollToScrub;

  const $ = (id) => document.getElementById(id);
  const isMac = navigator.platform.startsWith('Mac');
  const MODIFIER_LABELS = {
    none: 'Nothing',
    alt: isMac ? 'Option' : 'Alt',
    ctrl: 'Ctrl',
    shift: 'Shift',
    meta: isMac ? 'Command' : 'Windows key',
  };

  const LOG_MIN = Math.log(LIMITS.secondsPer100px.min);
  const LOG_MAX = Math.log(LIMITS.secondsPer100px.max);
  const toSlider = (v) => Math.round(((Math.log(v) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 1000);
  const fromSlider = (n) => Math.exp(LOG_MIN + (n / 1000) * (LOG_MAX - LOG_MIN));
  const roundSpeed = (v) => (v >= 10 ? Math.round(v) : v >= 1 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100);

  let settings = normalizeSettings(DEFAULTS);
  let statusTimer = 0;

  for (const m of MODIFIERS) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = MODIFIER_LABELS[m];
    $('requireModifier').appendChild(opt);
  }

  function render() {
    $('enabled').checked = settings.enabled;
    $('speed').value = String(toSlider(settings.secondsPer100px));
    $('speedNumber').value = String(settings.secondsPer100px);
    $('invert').checked = settings.invert;
    $('resumeAfter').checked = settings.resumeAfter;
    $('showTimeline').checked = settings.showTimeline;
    $('trackball').checked = settings.trackball;
    $('requireModifier').value = settings.requireModifier;
    if (document.activeElement !== $('disabledSites')) $('disabledSites').value = settings.disabledSites.join('\n');
  }

  function flash(text) {
    $('status').textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => ($('status').textContent = ''), 1500);
  }

  function save(patch) {
    settings = normalizeSettings({ ...settings, ...patch });
    const clean = {};
    for (const key of Object.keys(patch)) clean[key] = settings[key];
    chrome.storage.sync.set(clean, () => {
      flash(chrome.runtime.lastError ? 'Could not save: ' + chrome.runtime.lastError.message : 'Saved');
    });
    render();
  }

  $('enabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));
  $('speed').addEventListener('input', (e) => {
    $('speedNumber').value = String(roundSpeed(fromSlider(Number(e.target.value))));
  });
  $('speed').addEventListener('change', (e) => save({ secondsPer100px: roundSpeed(fromSlider(Number(e.target.value))) }));
  $('speedNumber').addEventListener('change', (e) => save({ secondsPer100px: parseFloat(e.target.value) }));
  for (const id of ['invert', 'resumeAfter', 'showTimeline', 'trackball']) {
    $(id).addEventListener('change', (e) => save({ [id]: e.target.checked }));
  }
  $('requireModifier').addEventListener('change', (e) => save({ requireModifier: e.target.value }));
  $('disabledSites').addEventListener('change', (e) => save({ disabledSites: normalizeSites(e.target.value) }));
  $('shortcuts').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
  $('reset').addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm('Reset all settings to their defaults?')) save({ ...DEFAULTS });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const next = { ...settings };
    for (const key of Object.keys(changes)) next[key] = changes[key].newValue;
    settings = normalizeSettings(next);
    render();
  });

  chrome.storage.sync.get(DEFAULTS, (stored) => {
    settings = normalizeSettings(chrome.runtime.lastError ? {} : stored);
    render();
  });
})();
