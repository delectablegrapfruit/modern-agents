/* Scroll to Scrub — toolbar popup. */
(() => {
  'use strict';

  const { DEFAULTS, LIMITS, normalizeSettings, normalizeHost, hostMatches } = globalThis.ScrollToScrub;

  const $ = (id) => document.getElementById(id);
  let settings = normalizeSettings(DEFAULTS);
  let host = '';
  let tabId = null;

  /* Logarithmic slider: 0..1000 <-> LIMITS.secondsPer100px.min..max. */
  const LOG_MIN = Math.log(LIMITS.secondsPer100px.min);
  const LOG_MAX = Math.log(LIMITS.secondsPer100px.max);
  const toSlider = (v) => Math.round(((Math.log(v) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 1000);
  const fromSlider = (n) => Math.exp(LOG_MIN + (n / 1000) * (LOG_MAX - LOG_MIN));
  const roundSpeed = (v) => (v >= 10 ? Math.round(v) : v >= 1 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100);
  const formatSpeed = (v) => `${v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)} s / 100 px`;

  function formatClock(seconds) {
    const t = Math.max(0, seconds);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sec = String(Math.floor(t % 60)).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  function render() {
    $('enabled').checked = settings.enabled;
    $('speed').value = String(toSlider(settings.secondsPer100px));
    $('speedValue').value = formatSpeed(settings.secondsPer100px);
    $('siteRow').hidden = !host;
    if (host) {
      $('siteName').textContent = host;
      $('siteEnabled').checked = !settings.disabledSites.some((p) => hostMatches(host, p));
    }
  }

  function renderUndo(info) {
    const has = !!(info && Number.isFinite(info.time));
    $('undo').disabled = !has;
    $('undoInfo').textContent = has
      ? `Back to ${formatClock(info.time)}${info.wasPlaying ? ', playing' : ''}`
      : 'Nothing to undo';
  }

  function save(patch) {
    settings = normalizeSettings({ ...settings, ...patch });
    const clean = {};
    for (const key of Object.keys(patch)) clean[key] = settings[key];
    chrome.storage.sync.set(clean, () => void chrome.runtime.lastError);
    render();
  }

  $('enabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));
  $('speed').addEventListener('input', (e) => {
    $('speedValue').value = formatSpeed(roundSpeed(fromSlider(Number(e.target.value))));
  });
  $('speed').addEventListener('change', (e) => save({ secondsPer100px: roundSpeed(fromSlider(Number(e.target.value))) }));
  $('siteEnabled').addEventListener('change', (e) => {
    if (!host) return;
    const list = settings.disabledSites.filter((p) => !hostMatches(host, p));
    if (!e.target.checked) list.push(host);
    save({ disabledSites: list });
  });
  $('undo').addEventListener('click', () => {
    if (tabId === null) return;
    chrome.runtime.sendMessage({ type: 'undo-tab', tabId }, () => {
      void chrome.runtime.lastError;
      window.close();
    });
  });
  $('options').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close();
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

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError || !tabs || !tabs[0]) return;
    tabId = tabs[0].id;
    try {
      const url = new URL(tabs[0].url || '');
      if (url.protocol === 'http:' || url.protocol === 'https:') host = normalizeHost(url.hostname);
    } catch {
      host = '';
    }
    render();
    chrome.runtime.sendMessage({ type: 'get-undo', tabId }, (info) => {
      renderUndo(chrome.runtime.lastError ? null : info);
    });
  });
})();
