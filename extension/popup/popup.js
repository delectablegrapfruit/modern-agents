const $ = (selector) => document.querySelector(selector);

let settings = await YFFStore.load();
let pausedUntil = await YFFStore.pausedUntil();

$('#presets').innerHTML = YFFUI.presets();
$('#groups').innerHTML = YFFUI.groups();
YFFUI.bind(document.body, () => settings, (partial) => YFFStore.save(partial));

// Friction: loosening waits out settings.friction.pauseDelaySec with the popup open; closing it cancels.
let countdown = 0;
const withFriction = (verb, action) => {
  const delay = settings.friction.pauseDelaySec;
  if (!delay) return action();
  clearInterval(countdown);
  let left = delay;
  const show = () => ($('#status').textContent = `${verb} in ${left} s… close this to cancel`);
  show();
  countdown = setInterval(() => {
    left -= 1;
    if (left > 0) return show();
    clearInterval(countdown);
    countdown = 0;
    action();
  }, 1000);
};

const render = () => {
  YFFUI.fill(document.body, settings);
  const locked = YFF.locked(settings);
  $('#enabled').checked = settings.enabled;
  $('#enabled').disabled = locked && settings.enabled;
  for (const button of document.querySelectorAll('[data-pause]')) button.disabled = locked || !settings.enabled;
  $('[data-preset="off"]').disabled = locked;
  $('#resume').hidden = pausedUntil <= Date.now();
  if (!countdown) $('#status').textContent = YFFUI.statusText(settings, pausedUntil);
  document.body.classList.toggle('inactive', YFF.status(settings, pausedUntil) !== 'active');
};

$('#enabled').addEventListener('change', (event) => {
  if (event.target.checked) return YFFStore.save({ enabled: true });
  event.target.checked = true; // stays on through the countdown
  withFriction('Switching off', () => YFFStore.save({ enabled: false }));
});
for (const button of document.querySelectorAll('[data-pause]')) {
  button.addEventListener('click', () =>
    withFriction('Pausing', () => YFFStore.setPausedUntil(Date.now() + Number(button.dataset.pause) * 60 * 1000)),
  );
}
$('#resume').addEventListener('click', () => YFFStore.setPausedUntil(0));
$('#search').addEventListener('input', (event) => YFFUI.search($('#groups'), event.target.value));
$('#options').addEventListener('click', () => chrome.runtime.openOptionsPage());

YFFStore.onChange(async () => {
  [settings, pausedUntil] = await Promise.all([YFFStore.load(), YFFStore.pausedUntil()]);
  render();
});
render();

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
$('#pick').addEventListener('click', async () => {
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'yff:pick' }, { frameId: 0 });
    window.close();
  } catch {
    $('#note').hidden = false;
  }
});
try {
  const stats = await chrome.tabs.sendMessage(tab.id, { type: 'yff:stats' }, { frameId: 0 });
  for (const dd of document.querySelectorAll('[data-stat]')) dd.textContent = stats[dd.dataset.stat] ?? 0;
  await renderCheck();
} catch {
  // Not a YouTube tab, or opened before the extension was installed.
  $('#note').hidden = false;
}

async function renderCheck() {
  const { findings, counts, stuck } = await chrome.runtime.sendMessage({ type: 'yff:diagnose', tabId: tab.id });
  const items = findings.map((f) => ({ ...f, text: YFFUI.finding(f) })).filter((f) => f.text);
  $('#findings').innerHTML = items.length
    ? items
        .map(
          (f) => `<li class="${f.level}"><b>${YFFUI.esc(f.text.title)}</b>${YFFUI.esc(f.text.advice)}${
            f.text.code ? `<code>${YFFUI.esc(f.text.code)}</code>` : ''
          }</li>`,
        )
        .join('')
    : `<li class="ok">${stuck ? 'Player stuck, cause not seen yet' : 'No playback problems seen on this tab'}</li>`;
  $('#check-counts').textContent = `Last minute: ${counts.media} stream requests · page: ${counts.attest} bot-check, ${counts.player} player requests`;
  $('#check').hidden = false;
}

$('#copy-report').addEventListener('click', async () => {
  const data = await chrome.runtime.sendMessage({ type: 'yff:report', tabId: tab.id });
  await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  $('#copy-report').textContent = 'Copied';
});
