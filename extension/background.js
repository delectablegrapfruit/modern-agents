/* Scroll to Scrub — service worker.
 *
 * Seeds settings, mirrors on/off on the badge, handles the two keyboard
 * shortcuts, and keeps the undo point each tab's content script reports so
 * the popup can show it and the undo shortcut can reach the right frame.
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
  chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
  chrome.action.setTitle({ title: enabled ? 'Scroll to Scrub' : 'Scroll to Scrub (off)' });
}

async function refreshBadge() {
  showBadge((await readSettings()).enabled);
}

/* ---- Undo points, per tab ------------------------------------------- */

const undoKey = (tabId) => 'undo:' + tabId;

function setUndo(tabId, frameId, info) {
  const key = undoKey(tabId);
  if (!info) return chrome.storage.session.remove(key, () => void chrome.runtime.lastError);
  chrome.storage.session.set({ [key]: { ...info, frameId } }, () => void chrome.runtime.lastError);
}

function getUndo(tabId) {
  return new Promise((resolve) => {
    chrome.storage.session.get(undoKey(tabId), (r) => resolve(chrome.runtime.lastError ? null : r[undoKey(tabId)] || null));
  });
}

async function undoInTab(tabId) {
  const u = await getUndo(tabId);
  if (!u) return false;
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'undo' }, { frameId: u.frameId }, (r) => {
      resolve(!chrome.runtime.lastError && !!(r && r.ok));
    });
  });
}

function activeTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(!chrome.runtime.lastError && tabs && tabs[0] ? tabs[0].id : null);
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'undo-state' && sender.tab) {
    setUndo(sender.tab.id, sender.frameId, msg.info);
  } else if (msg.type === 'get-undo') {
    getUndo(msg.tabId).then((u) => sendResponse(u));
    return true;
  } else if (msg.type === 'undo-tab') {
    undoInTab(msg.tabId).then((ok) => sendResponse({ ok }));
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => setUndo(tabId, 0, null));
chrome.tabs.onUpdated.addListener((tabId, change) => {
  // A new document reports its own (empty) state on load; navigations to a
  // different URL are cleared here as well in case no content script runs.
  if (change.url) setUndo(tabId, 0, null);
});

/* ---- Lifecycle -------------------------------------------------------- */

chrome.runtime.onInstalled.addListener(async () => {
  // Write back a complete, validated settings object so every context reads
  // the same shape and keys from earlier versions are dropped.
  const settings = await readSettings();
  chrome.storage.sync.set(settings, () => void chrome.runtime.lastError);
  showBadge(settings.enabled);
});

chrome.runtime.onStartup.addListener(refreshBadge);

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-enabled') {
    const settings = await readSettings();
    chrome.storage.sync.set({ enabled: !settings.enabled }, () => void chrome.runtime.lastError);
  } else if (command === 'undo-scrub') {
    const tabId = await activeTabId();
    if (tabId !== null) undoInTab(tabId);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabled) showBadge(Boolean(changes.enabled.newValue));
});

refreshBadge();
