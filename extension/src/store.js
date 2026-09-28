// chrome.storage access shared by content.js, the popup, the options page and background.js. Settings live in
// storage.sync, one key per top-level section (sync caps each key at 8 KB); the pause is per device, in local.
const YFFStore = {
  async load() {
    return YFF.merge(await chrome.storage.sync.get(null));
  },
  save(partial) {
    return chrome.storage.sync.set(partial);
  },
  async pausedUntil() {
    return (await chrome.storage.local.get({ pausedUntil: 0 })).pausedUntil;
  },
  setPausedUntil(time) {
    return chrome.storage.local.set({ pausedUntil: time });
  },
  onChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' || (area === 'local' && 'pausedUntil' in changes)) callback(changes, area);
    });
  },
};
