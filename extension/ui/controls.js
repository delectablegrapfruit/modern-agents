// Controls shared by the popup and the options page. Any input with data-key="section.field" is filled from the
// settings and saved back on change; one top-level section is written per change (storage.sync keys).
const YFFUI = (() => {
  const esc = (value) =>
    String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
  const set = (obj, path, value) => {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((o, k) => o[k], obj)[last] = value;
  };

  const toggle = (key, label, hint = '') => `
    <label class="opt" data-search="${esc(`${label} ${hint}`.toLowerCase())}">
      <input type="checkbox" class="switch" data-key="${key}" />
      <span><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span>
    </label>`;

  const homeRedirect = () => `
    <label class="opt select" data-search="home redirect open instead subscriptions watch later history library">
      <span><b>When Home opens</b><small>Go somewhere calmer instead</small></span>
      <select data-key="homeRedirect">
        ${YFF.HOME_REDIRECTS.map((r) => `<option value="${r.id}">${esc(r.label)}</option>`).join('')}
      </select>
    </label>`;

  const groupItems = (id) => {
    if (id === 'fix') return YFF.FIXES.map((f) => toggle(`fix.${f.id}`, f.label, f.hint));
    const items = YFF.FEATURES.filter((f) => f.group === id).map((f) => toggle(`hide.${f.id}`, f.label, f.hint));
    if (id === 'home') items.push(homeRedirect());
    return items;
  };

  const groups = ({ open = false, only = null } = {}) =>
    YFF.GROUPS.filter((g) => !only || only.includes(g.id))
      .map(
        (g) => `
      <details class="group" data-group="${g.id}" ${open ? 'open' : ''}>
        <summary><span>${esc(g.label)}</span><span class="count" data-count="${g.id}"></span></summary>
        <div class="opts">${groupItems(g.id).join('')}</div>
      </details>`,
      )
      .join('');

  const presets = () =>
    YFF.PRESETS.map((p) => `<button type="button" class="chip" data-preset="${p.id}">${esc(p.label)}</button>`).join('');

  const fill = (root, settings) => {
    for (const el of root.querySelectorAll('[data-key]')) {
      if (el === document.activeElement && el.type !== 'checkbox') continue; // don't fight typing
      const value = get(settings, el.dataset.key);
      if (el.type === 'checkbox') el.checked = Boolean(value);
      else if (el.type === 'radio') el.checked = el.value === value;
      else if ('list' in el.dataset) el.value = (value ?? []).join('\n');
      else el.value = value ?? '';
    }
    for (const el of root.querySelectorAll('[data-count]')) {
      const id = el.dataset.count;
      const values =
        id === 'fix'
          ? YFF.FIXES.map((f) => settings.fix[f.id])
          : YFF.FEATURES.filter((f) => f.group === id).map((f) => settings.hide[f.id]);
      el.textContent = `${values.filter(Boolean).length}/${values.length}`;
    }
    const preset = YFF.matchingPreset(settings.hide);
    for (const el of root.querySelectorAll('[data-preset]')) el.classList.toggle('on', el.dataset.preset === preset);
  };

  const bind = (root, getSettings, save) => {
    root.addEventListener('change', (event) => {
      const el = event.target.closest('[data-key]');
      if (!el) return;
      const settings = getSettings();
      let value;
      if (el.type === 'checkbox') value = el.checked;
      else if (el.type === 'number') {
        value = Math.max(Number(el.min || 0), Number(el.value) || 0);
        el.value = value;
      } else if ('list' in el.dataset) value = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
      else value = el.value;
      set(settings, el.dataset.key, value);
      const section = el.dataset.key.split('.')[0];
      save({ [section]: settings[section] });
    });
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-preset]');
      if (!button) return;
      const settings = getSettings();
      settings.hide = YFF.applyPreset(settings.hide, button.dataset.preset);
      save({ hide: settings.hide });
    });
  };

  // Shows only options whose label or hint contains the query and opens the groups holding them.
  const search = (root, query) => {
    const q = query.trim().toLowerCase();
    for (const opt of root.querySelectorAll('.opt[data-search]')) opt.hidden = Boolean(q) && !opt.dataset.search.includes(q);
    for (const group of root.querySelectorAll('details.group')) {
      const any = [...group.querySelectorAll('.opt')].some((o) => !o.hidden);
      group.hidden = !any;
      if (q) group.open = any;
    }
  };

  const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const statusText = (settings, pausedUntil) => {
    const s = settings.schedule;
    const locked = YFF.locked(settings) ? ' · locked until ' + s.end : '';
    switch (YFF.status(settings, pausedUntil)) {
      case 'off':
        return 'Hiding is off';
      case 'paused':
        return `Paused until ${time(pausedUntil)}`;
      case 'outside':
        return `Outside scheduled hours (${s.start}–${s.end})`;
      default:
        return `Hiding is on${s.enabled ? ` until ${s.end}` : ''}${locked}`;
    }
  };

  return { esc, groups, presets, fill, bind, search, statusText, time };
})();
