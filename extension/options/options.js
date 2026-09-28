const $ = (selector) => document.querySelector(selector);
const { esc } = YFFUI;

let settings = await YFFStore.load();
let pausedUntil = await YFFStore.pausedUntil();

const note = (el, message) => ($(el).textContent = message);
const save = (partial) => YFFStore.save(partial).catch((error) => note('#status', `Couldn’t save: ${error.message}`));

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PAGE_OPTIONS = Object.entries(YFF.PAGE_LABELS)
  .map(([id, label]) => `<option value="${id}">${esc(label)}</option>`)
  .join('');

$('#days').innerHTML = [1, 2, 3, 4, 5, 6, 0]
  .map((d) => `<label><input type="checkbox" data-day="${d}" /> ${DAYS[d]}</label>`)
  .join('');
$('#presets').innerHTML = YFFUI.presets();
$('#groups').innerHTML = YFFUI.groups({ open: true, only: YFF.GROUPS.map((g) => g.id).filter((id) => id !== 'fix') });
$('#fixes').innerHTML = YFFUI.groups({ open: true, only: ['fix'] });
$('#add-rule [name=page]').innerHTML = PAGE_OPTIONS;
$('#search').addEventListener('input', (event) => YFFUI.search($('#groups'), event.target.value));

// Loosening from here would skip the popup's friction and lock, so the controls that loosen are disabled instead.
document.body.addEventListener(
  'change',
  (event) => {
    if (event.target.dataset.key === 'enabled' && !event.target.checked && YFF.locked(settings)) {
      event.stopImmediatePropagation();
      event.target.checked = true;
    }
  },
  true,
);
YFFUI.bind(document.body, () => settings, save);

$('#days').addEventListener('change', () => {
  settings.schedule.days = [...document.querySelectorAll('[data-day]:checked')].map((el) => Number(el.dataset.day));
  save({ schedule: settings.schedule });
});

// Custom rules -------------------------------------------------------------------------------------------------

const valid = (selector) => {
  try {
    document.createDocumentFragment().querySelector(selector);
    return Boolean(selector);
  } catch {
    return false;
  }
};

const renderRules = () => {
  if (document.activeElement?.matches('#rules input')) return; // mid-edit
  if (!settings.custom.length) {
    $('#rules').innerHTML = '<p>No custom rules yet.</p>';
    return;
  }
  $('#rules').innerHTML = `<table>${settings.custom
    .map(
      (rule, i) => `<tr data-i="${i}">
        <td><input type="text" value="${esc(rule.selector)}" class="${valid(rule.selector) ? '' : 'bad'}" spellcheck="false" aria-label="Selector" /></td>
        <td><select aria-label="Where">${PAGE_OPTIONS}</select></td>
        <td><button type="button" class="remove">Delete</button></td>
      </tr>`,
    )
    .join('')}</table>`;
  $('#rules')
    .querySelectorAll('select')
    .forEach((select, i) => (select.value = settings.custom[i].page in YFF.PAGE_LABELS ? settings.custom[i].page : 'all'));
};

$('#rules').addEventListener('change', (event) => {
  const i = Number(event.target.closest('tr').dataset.i);
  const rule = { ...settings.custom[i] };
  if (event.target.matches('input')) {
    const selector = event.target.value.trim();
    event.target.classList.toggle('bad', !valid(selector));
    if (!valid(selector)) return;
    rule.selector = selector;
  } else {
    rule.page = event.target.value;
  }
  save({ custom: settings.custom.with(i, rule) });
});
$('#rules').addEventListener('click', (event) => {
  if (!event.target.matches('.remove')) return;
  const i = Number(event.target.closest('tr').dataset.i);
  save({ custom: settings.custom.filter((_, j) => j !== i) });
});
$('#add-rule').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  const selector = form.elements.selector.value.trim();
  $('#rule-error').hidden = valid(selector);
  if (!valid(selector)) return note('#rule-error', `“${selector}” isn’t a valid CSS selector.`);
  save({ custom: [...settings.custom, { selector, page: form.elements.page.value, added: Date.now() }] });
  form.reset();
});

// Backup -------------------------------------------------------------------------------------------------------

$('#export').addEventListener('click', async () => {
  const data = {
    app: 'focus-and-fix-for-youtube',
    version: chrome.runtime.getManifest().version,
    exported: new Date().toISOString(),
    settings: await YFFStore.load(),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  Object.assign(document.createElement('a'), { href: url, download: `focus-and-fix-${data.exported.slice(0, 10)}.json` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  note('#backup-note', 'Exported.');
});
$('#import').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    await chrome.storage.sync.set(YFF.merge(json.settings ?? json));
    note('#backup-note', `Imported ${file.name}.`);
  } catch (error) {
    note('#backup-note', `Couldn’t import ${file.name}: ${error.message}`);
  }
});
$('#reset').addEventListener('click', async () => {
  if (!confirm('Reset every setting, filter and custom rule to the defaults?')) return;
  await chrome.storage.sync.clear();
  note('#backup-note', 'Reset to defaults.');
});

// State --------------------------------------------------------------------------------------------------------

const render = () => {
  YFFUI.fill(document.body, settings);
  for (const el of document.querySelectorAll('[data-day]')) el.checked = settings.schedule.days.includes(Number(el.dataset.day));
  const locked = YFF.locked(settings);
  for (const el of $('#general').querySelectorAll('input')) el.disabled = locked;
  const master = $('[data-key="enabled"]');
  if (!locked) master.disabled = settings.enabled && settings.friction.pauseDelaySec > 0;
  $('[data-preset="off"]').disabled = locked;
  const why = locked ? '' : master.disabled ? ' · with a friction delay set, switch off from the popup' : '';
  note('#status', YFFUI.statusText(settings, pausedUntil) + why);
  renderRules();
};

YFFStore.onChange(async () => {
  [settings, pausedUntil] = await Promise.all([YFFStore.load(), YFFStore.pausedUntil()]);
  render();
});
render();
