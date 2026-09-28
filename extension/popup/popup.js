const form = document.getElementById('settings');

const stored = await chrome.storage.sync.get(YTHB_DEFAULTS);
for (const [key, value] of Object.entries(stored)) {
  if (form.elements[key]) form.elements[key].checked = value;
}
form.addEventListener('change', (event) => {
  chrome.storage.sync.set({ [event.target.name]: event.target.checked });
});

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
try {
  const stats = await chrome.tabs.sendMessage(tab.id, { type: 'ythb:stats' }, { frameId: 0 });
  for (const dd of document.querySelectorAll('[data-stat]')) dd.textContent = stats[dd.dataset.stat] ?? 0;
} catch {
  // No content script in this tab: not YouTube, or opened before the extension was installed.
  document.getElementById('note').hidden = false;
}
