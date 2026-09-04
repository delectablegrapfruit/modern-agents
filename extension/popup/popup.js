/* Scroll to Scrub — toolbar popup. */
(() => {
  'use strict';

  const { DEFAULTS, LIMITS, normalizeSettings, normalizeHost, hostMatches } = globalThis.ScrollToScrub;

  const $ = (id) => document.getElementById(id);
  const enabledEl = $('enabled');
  const siteRow = $('siteRow');
  const siteName = $('siteName');
  const siteEnabledEl = $('siteEnabled');
  const speedEl = $('speed');
  const speedValue = $('speedValue');

  let settings = normalizeSettings(DEFAULTS);
  let host = '';
  let tabId = null;

  /* Logarithmic slider: 0..1000 <-> LIMITS.secondsPer100px.min..max. */
  const LOG_MIN = Math.log(LIMITS.secondsPer100px.min);
  const LOG_MAX = Math.log(LIMITS.secondsPer100px.max);
  const toSlider = (v) => Math.round(((Math.log(v) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 1000);
  const fromSlider = (s) => Math.exp(LOG_MIN + (s / 1000) * (LOG_MAX - LOG_MIN));

  function formatSpeed(v) {
    const digits = v >= 10 ? 0 : v >= 1 ? 1 : 2;
    return v.toFixed(digits) + ' s';
  }

  function render() {
    document.body.classList.toggle('off', !settings.enabled);
    enabledEl.checked = settings.enabled;
    speedEl.value = String(toSlider(settings.secondsPer100px));
    speedValue.textContent = formatSpeed(settings.secondsPer100px);
    $('fineKey').textContent =
      { alt: 'Alt', ctrl: 'Ctrl', shift: 'Shift', meta: navigator.platform.startsWith('Mac') ? '⌘' : 'Win' }[
        settings.fineModifier
      ] || 'Alt';
    $('fineKey').parentElement.style.visibility = settings.fineModifier === 'none' ? 'hidden' : '';
    if (host) {
      siteRow.hidden = false;
      siteName.textContent = host;
      siteEnabledEl.checked = !settings.disabledSites.some((p) => hostMatches(host, p));
    } else {
      siteRow.hidden = true;
    }
  }

  function save(patch) {
    settings = normalizeSettings({ ...settings, ...patch });
    chrome.storage.sync.set(patch, () => void chrome.runtime.lastError);
    render();
  }

  enabledEl.addEventListener('change', () => save({ enabled: enabledEl.checked }));

  speedEl.addEventListener('input', () => {
    const v = fromSlider(Number(speedEl.value));
    const rounded = v >= 10 ? Math.round(v) : v >= 1 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
    settings.secondsPer100px = rounded;
    speedValue.textContent = formatSpeed(rounded);
  });
  speedEl.addEventListener('change', () => save({ secondsPer100px: settings.secondsPer100px }));

  siteEnabledEl.addEventListener('change', () => {
    if (!host) return;
    const list = settings.disabledSites.filter((p) => !hostMatches(host, p));
    if (!siteEnabledEl.checked) list.push(host);
    save({ disabledSites: list });
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

  function formatClock(seconds) {
    const t = Math.max(0, seconds);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sec = String(Math.floor(t % 60)).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  /* Ask the tab's frames whether one of them can undo a scrub. */
  function refreshUndo() {
    if (tabId === null) return;
    chrome.tabs.sendMessage(tabId, { type: 'undo-info' }, (info) => {
      if (chrome.runtime.lastError || !info) return; // no content script, or nothing to undo
      $('undoRow').hidden = false;
      $('undoInfo').textContent = 'back to ' + formatClock(info.time) + (info.wasPlaying ? ', playing' : '');
    });
  }

  $('undo').addEventListener('click', () => {
    if (tabId === null) return;
    chrome.tabs.sendMessage(tabId, { type: 'undo' }, () => void chrome.runtime.lastError);
    window.close();
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
    refreshUndo();
  });
})();
