/* Scroll to Scrub — service worker.
 *
 * Seeds settings on install, flips the master switch from the keyboard
 * shortcut, and mirrors the on / off state on the toolbar badge.
 */
importScripts('shared/defaults.js');

const { DEFAULTS, normalizeSettings } = globalThis.ScrollToScrub;

function readSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULTS, (stored) => {
      resolve(normalizeSettings(chrome.runtime.lastError ? {} : stored));
    });
  });
}

function showBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({ color: '#64748b' });
  chrome.action.setTitle({ title: enabled ? 'Scroll to Scrub' : 'Scroll to Scrub (off)' });
}

async function refreshBadge() {
  const settings = await readSettings();
  showBadge(settings.enabled);
}

chrome.runtime.onInstalled.addListener(async () => {
  // Write back a complete, validated settings object so every context
  // reads the same shape, and stale keys from older versions are dropped.
  const settings = await readSettings();
  chrome.storage.sync.set(settings, () => void chrome.runtime.lastError);
  showBadge(settings.enabled);
});

chrome.runtime.onStartup.addListener(refreshBadge);

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-enabled') return;
  const settings = await readSettings();
  chrome.storage.sync.set({ enabled: !settings.enabled }, () => void chrome.runtime.lastError);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabled) showBadge(Boolean(changes.enabled.newValue));
});

refreshBadge();
