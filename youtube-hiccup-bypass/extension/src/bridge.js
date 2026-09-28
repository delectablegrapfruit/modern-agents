// Isolated-world half: holds the chrome.* access page.js lacks. Settings flow down to the page as JSON on a DOM
// event; stat names flow up and are only counted, so a page script faking events can't reach chrome.storage.
const EVENTS = { config: 'ythb:config', ready: 'ythb:ready', stat: 'ythb:stat' };

const stats = { timersBoosted: 0, adsFastForwarded: 0, stallsRecovered: 0, dialogsDismissed: 0 };
let settings = null;

const pushSettings = () => {
  if (settings) document.dispatchEvent(new CustomEvent(EVENTS.config, { detail: JSON.stringify(settings) }));
};

chrome.storage.sync.get(YTHB_DEFAULTS).then((stored) => {
  settings = stored;
  pushSettings();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !settings) return;
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key in YTHB_DEFAULTS) settings[key] = newValue ?? YTHB_DEFAULTS[key];
  }
  pushSettings();
});

// page.js may start listening after the first push.
document.addEventListener(EVENTS.ready, pushSettings);

document.addEventListener(EVENTS.stat, (event) => {
  if (Object.hasOwn(stats, event.detail)) stats[event.detail] += 1;
});

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type === 'ythb:stats') reply(stats);
});
