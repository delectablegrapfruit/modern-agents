// Service worker: context menu, keyboard shortcuts, and the toolbar badge (feed items filtered on each tab).
importScripts('src/schema.js', 'src/store.js');

const MENU_ID = 'yff-hide-element';

chrome.action.setBadgeBackgroundColor({ color: '#606060' });

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Hide this element…',
    contexts: ['all'],
    documentUrlPatterns: ['*://*.youtube.com/*'],
  });
});

const pick = (tabId, frameId = 0, fromContext = false) =>
  chrome.tabs.sendMessage(tabId, { type: 'yff:pick', fromContext }, { frameId }).catch(() => {});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id >= 0) pick(tab.id, info.frameId ?? 0, true);
});

// Shortcuts skip the popup's friction, so with a pause delay set, or while locked, they can't switch hiding off.
chrome.commands.onCommand.addListener(async (command, tab) => {
  const settings = await YFFStore.load();
  const mayLoosen = !YFF.locked(settings) && !settings.friction.pauseDelaySec;
  if (command === 'pick-element') {
    tab ??= (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (tab?.id >= 0) pick(tab.id);
  } else if (command === 'toggle-hiding') {
    if (!settings.enabled || mayLoosen) YFFStore.save({ enabled: !settings.enabled });
  } else if (command === 'pause-15' && mayLoosen) {
    YFFStore.setPausedUntil(Date.now() + 15 * 60 * 1000);
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'yff:count' && sender.tab?.id >= 0) {
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: message.count ? String(message.count) : '' });
  }
});
