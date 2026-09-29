// js/ui/components.js — owner: W1-D. The components of UI.md §2.3 as DOM factories on SR.ui:
// button, iconButton, chip (+ chip.gains / chip.costs / chip.fromDelta), actionRow, speech,
// meter, clockRing, statChip, karmaMedallion, tabs, segmented, numberField, textField, slider,
// toggle, list, keyHint, tooltip, portrait, sparkline, lineChart, progress, badge, breadcrumb,
// contextPrompt. (card is in card.js, toast in toast.js, stamp in stamp.js, modal and confirm in
// modal.js, so each public name has one file.)
//
// Conventions: every factory takes one options object and returns its root element; `id` becomes
// data-id; focusable parts carry data-nav (spatial navigation, js/ui/focus.js); stateful
// components expose el.update(partialOpts) (and el.value where it applies). A disabled control
// stays focusable (aria-disabled) and refuses activation with the error sound and a 120 ms shake.
// Text: text keys or literals through SR.ui.dom.t; numbers: SR.text formatters.
// Load-time rule: defines functions only.
(function () {
  'use strict';
  var SR = window.SR;
  var hasOwn = Object.prototype.hasOwnProperty;

  // UI.md §2.3 / §4.3 timings (motion specs, not balance numbers).
  var TOOLTIP_DELAY_MS = 400;
  var LONG_PRESS_MS = 500;
  var FLASH_MS = 200;
  var SWEEP_MS_PER_30M = 100;
  var SWEEP_MAX_MS = 800;
  var BLINK_MIN_MS = 4000;
  var BLINK_MAX_MS = 7000;
  var STATS = ['str', 'int', 'cha'];

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function t(k, v) { return D().t(k, v); }
  function money(n, o) { return SR.text.money(n, o); }
  function signed(n) { return (n > 0 ? '+' : '') + SR.text.num(n); }
  /** @returns {number} the wall of the day in minutes (BALANCE B-01 `time.dayEnd`, 24:00). */
  function dayEnd() { return (SR.tuning && SR.tuning.time && SR.tuning.time.dayEnd) || 1440; }
  function merge(a, b) { var o = {}, k; for (k in a) if (hasOwn.call(a, k)) o[k] = a[k]; for (k in b) if (hasOwn.call(b, k)) o[k] = b[k]; return o; }

  /** Common disabled behaviour: refuses clicks with feedback while aria-disabled. */
  function guardClick(el, getState, onClick) {
    el.addEventListener('click', function (ev) {
      var st = getState();
      if (st.disabled) {
        ev.preventDefault();
        ev.stopPropagation();
        D().refuse(el, st.reason ? t(st.reason, st.reasonVars) : '');
        return;
      }
      if (onClick) onClick(ev);
    });
  }

  var descSeq = 0;
  function describe(el, text) {
    var id = el.getAttribute('data-desc-id');
    var node = id ? el.querySelector('[data-desc="' + id + '"]') : null;
    if (!text) { if (node) node.textContent = ''; return; }
    if (!node) {
      id = 'd' + (++descSeq);
      el.setAttribute('data-desc-id', id);
      node = h('span', { class: 'vh', 'data-desc': id, id: 'desc-' + id });
      el.appendChild(node);
      el.setAttribute('aria-describedby', 'desc-' + id);
    }
    node.textContent = text;
  }

  // ------------------------------------------------------------------ Button / IconButton
  /**
   * @param {{id: string, label: string, vars: object, icon: string, variant: string, size: string,
   *   disabled: boolean, reason: string, onClick: function, loading: boolean, iconOnly: boolean,
   *   hint: string, nav: boolean, autofocus: boolean, cls: string}} o
   *   variant: 'primary' | 'secondary' | 'danger' | 'ghost'; hint: an input action shown as a KeyHint
   * @returns {HTMLButtonElement}
   */
  function button(o) {
    var st = merge({ variant: 'secondary', nav: true }, o || {});
    var el = h('button', { type: 'button', class: 'btn', 'data-id': st.id || null });
    if (st.nav) el.setAttribute('data-nav', '');
    if (st.autofocus) el.setAttribute('data-autofocus', '');
    var detachTip = null;
    function render() {
      el.className = ['btn', 'btn--' + st.variant, st.size ? 'btn--' + st.size : '', st.iconOnly ? 'btn--icon' : '',
        st.disabled ? 'is-disabled' : '', st.loading ? 'is-loading' : '', st.cls || ''].filter(Boolean).join(' ');
      D().clear(el);
      var label = t(st.label, st.vars);
      if (st.hint && !st.iconOnly) el.appendChild(keyHint({ action: st.hint, context: st.hintContext }));
      if (st.icon) el.appendChild(D().icon(st.icon, st.iconOnly ? 24 : 20, 'btn-ico'));
      if (st.loading) el.appendChild(h('span', { class: 'btn-spin', 'aria-hidden': 'true' }));
      if (!st.iconOnly) el.appendChild(h('span', { class: 'btn-label' }, label));
      el.setAttribute('aria-label', label);
      if (st.disabled) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled');
      if (st.loading) el.setAttribute('aria-busy', 'true'); else el.removeAttribute('aria-busy');
      describe(el, st.disabled && st.reason ? t(st.reason, st.reasonVars) : '');
      if (detachTip) { detachTip(); detachTip = null; }
      if (st.iconOnly || (st.disabled && st.reason)) {
        detachTip = tooltip(el, function () { return st.disabled && st.reason ? label + ' · ' + t(st.reason, st.reasonVars) : label; });
      }
    }
    guardClick(el, function () { return st; }, function (ev) {
      if (st.loading) return;
      D().sfx('click');
      if (st.onClick) st.onClick(ev);
    });
    el.update = function (p) { st = merge(st, p || {}); render(); return el; };
    render();
    return el;
  }

  /** An IconButton: 40 × 40 (touch 48), 24 px icon, tooltip after 400 ms. @returns {HTMLButtonElement} */
  function iconButton(o) { return button(merge(o, { iconOnly: true })); }

  // ------------------------------------------------------------------ Chip
  var CHIP_ICON = { money: 'money', bank: 'bank', time: 'time', hp: 'hp', hpMax: 'hp', karma: 'karma',
    heat: 'heat', buzz: 'buzz', chance: 'star', info: 'info', job: 'work', home: 'home', furniture: 'bed', lien: 'loan' };
  var CHIP_CLASS = { money: 'money', bank: 'money', lien: 'money', time: 'time', hp: 'hp', hpMax: 'hp', karma: 'karma',
    heat: 'heat', buzz: 'cha', chance: 'info', info: 'info', job: 'money', home: 'info', furniture: 'info', item: 'item' };

  function itemName(key) {
    var def = SR.reg.item && SR.reg.item[key];
    if (def && def.name) return t(def.name);
    var k = 'item.' + key;
    return SR.text.has(k) ? SR.text(k) : String(key);
  }

  /** The label of a chip (UI.md §2.3: `$20`, `2h`, `+20 HP`, `+2 INT`, `+1`, `+30 Heat`, `-1 ammo`, `62 %`). */
  function chipText(o) {
    if (o.text !== undefined && o.text !== null) return t(o.text, o.vars);
    var n = o.n, kind = o.kind;
    var num = o.range ? (o.cost ? '' : '+') + SR.text.num(o.range[0]) + '–' + SR.text.num(o.range[1]) : null;
    var out;
    switch (kind) {
      case 'money': case 'bank': case 'lien':
        out = o.cost ? money(Math.abs(n)) : money(n, { sign: true });
        if (kind === 'bank') out = t('ui.chip.bank', { money: out });
        break;
      case 'time': out = o.restOfDay ? t('ui.chip.restOfDay') : SR.text.dur(Math.abs(n)); break;
      case 'hp': out = t('ui.chip.hp', { n: num || signed(o.cost ? -Math.abs(n) : n) }); break;
      case 'hpMax': out = t('ui.chip.hpMax', { n: num || signed(n) }); break;
      case 'stat': out = t('ui.chip.stat', { n: num || signed(n), stat: t('ui.stat.' + o.key) }); break;
      case 'karma': out = t('ui.chip.karma', { n: num || signed(n) }); break;
      case 'heat': out = t('ui.chip.heat', { n: num || signed(n) }); break;
      case 'buzz': out = t('ui.chip.buzz', { n: num || signed(n) }); break;
      case 'item': out = t('ui.chip.item', { n: num || signed(o.cost ? -Math.abs(n) : n), item: itemName(o.key) }); break;
      case 'chance': out = SR.text.pct(n); break;
      case 'job': out = o.key ? t('ui.chip.job', { job: SR.text.has('job.' + o.key) ? SR.text('job.' + o.key) : o.key }) : ''; break;
      case 'home': case 'furniture': out = o.key ? itemName(o.key) : ''; break;
      default: out = n !== undefined ? signed(n) : '';
    }
    if (o.capped) out += ' ' + t(kind === 'hp' ? 'ui.chip.full' : 'ui.chip.max');
    return out;
  }

  function chipIcon(o) {
    if (o.icon) return o.icon;
    if (o.kind === 'stat') return o.key;
    if (o.kind === 'item') { var def = SR.reg.item && SR.reg.item[o.key]; return (def && def.icon) || o.key; }
    return CHIP_ICON[o.kind] || 'info';
  }

  /**
   * A Chip (UI.md §2.3): 24 tall, 16 px icon + value in 14 / 700 on the kind's -100 well.
   * @param {{kind: string, key: string, n: number, text: string, cost: boolean, short: boolean,
   *   capped: boolean, range: number[], restOfDay: boolean, id: string, icon: string}} o
   *   kind: money | bank | time | hp | hpMax | stat | karma | heat | buzz | item | chance | job | home | furniture | info
   * @returns {HTMLElement}
   */
  function chip(o) {
    o = o || {};
    if (o.kind === 'cash') o = merge(o, { kind: 'money' });   // the Delta / gain kind of money on hand
    var cls = o.kind === 'stat' ? o.key : CHIP_CLASS[o.kind] || 'info';
    var label = chipText(o);
    var el = h('span', {
      class: ['chip', 'chip--' + cls, o.cost ? 'chip--cost' : '', o.short ? 'chip--short' : '', o.capped ? 'chip--capped' : ''],
      'data-id': o.id || null, 'data-chip': o.kind || 'info', 'data-key': o.key || null,
    },
    h('span', { class: 'chip-ico' }, D().icon(chipIcon(o), 16)),
    h('span', { class: 'chip-v' }, label));
    if (o.kind === 'karma') el.setAttribute('aria-label', t('ui.aria.karmaChip', { n: label }));
    if (o.short) el.setAttribute('title', t('ui.chip.short', { what: label }));
    return el;
  }

  /** Chips for a Preview's gains and chance (UI.md §5.6 rows). @returns {HTMLElement[]} */
  chip.gains = function (preview) {
    var out = [];
    if (!preview || !preview.gains) return out;
    preview.gains.forEach(function (g) {
      if (!g || g.kind === 'time') return;
      var range = g.min !== undefined && g.max !== undefined && g.min !== g.max ? [g.min, g.max] : null;
      out.push(chip({ kind: g.kind, key: g.key, n: g.n !== undefined ? g.n : g.max, range: range, capped: g.capped }));
    });
    if (typeof preview.chance === 'number') out.push(chip({ kind: 'chance', n: preview.chance }));
    return out;
  };

  /**
   * Cost chips of a Preview, marked short when the state cannot pay (UI.md §2.3).
   * @param {object} preview
   * @param {{state: object, def: object}=} o
   * @returns {HTMLElement[]}
   */
  chip.costs = function (preview, o) {
    o = o || {};
    var out = [];
    var c = preview && preview.cost;
    if (!c) return out;
    var s = o.state || SR.state;
    var def = o.def || {};
    if (c.cash) out.push(chip({ kind: 'money', n: c.cash, cost: true, short: !!(s && s.money && s.money.cash < c.cash) }));
    if (c.min) {
      var now = s && s.clock ? s.clock.min : 0;
      var end = dayEnd();
      var rest = (def.timeRule === 'robbery' || def.timeRule === 'trip') && now + c.min >= end;
      out.push(chip({ kind: 'time', n: c.min, cost: true, restOfDay: rest || c.restOfDay, short: !rest && !!(s && s.clock && now + c.min > end) }));
    }
    if (c.hp) out.push(chip({ kind: 'hp', n: c.hp, cost: true, short: !!(s && s.stats && s.stats.hp <= c.hp) }));
    if (c.items) {
      Object.keys(c.items).forEach(function (k) {
        var n = c.items[k];
        if (!n) return;
        var held = s && s.items ? s.items[k] : undefined;
        var have = Array.isArray(held) ? held.length : held;
        out.push(chip({ kind: 'item', key: k, n: n, cost: true, short: typeof have === 'number' && have < n }));
      });
    }
    return out;
  };

  /** A chip for a Result Delta (the chips that fly to the HUD). @returns {HTMLElement|null} */
  chip.fromDelta = function (d) {
    if (!d || !d.n) return null;
    if (d.kind === 'cash' || d.kind === 'bank') return chip({ kind: d.kind === 'cash' ? 'money' : 'bank', n: d.n });
    if (d.kind === 'time') return chip({ kind: 'time', n: d.n, cost: true });
    return chip({ kind: d.kind, key: d.key, n: d.n });
  };
  chip.text = chipText;

  // ------------------------------------------------------------------ ActionRow
  /**
   * An ActionRow (UI.md §2.3): hotkey badge, icon 40, label 16 / 700, gain chips (or the reason),
   * right-aligned cost chips; optional Segmented variants and a secondary Hustle button.
   * @param {{id: string, hotkey: number, icon: string, label: string, gains: HTMLElement[],
   *   costs: HTMLElement[], badges: string[], disabled: boolean, reason: string,
   *   variants: {id: string, label: string}[], variant: string, onVariant: function,
   *   hustle: {label: string, onClick: function, disabled: boolean}, onRun: function,
   *   onFocus: function, onBlur: function, repeatable: boolean}} o
   * @returns {HTMLElement} the row (.arow); el.main is the focusable button
   */
  function actionRow(o) {
    var st = merge({}, o || {});
    var el = h('div', { class: 'arow', 'data-row': st.id, role: 'group' });
    var main = h('button', { type: 'button', class: 'arow-main nav-inset', 'data-nav': '', 'data-id': 'row-' + st.id });
    var seg = null, hustle = null;
    el.main = main;
    function render() {
      el.classList.toggle('is-disabled', !!st.disabled);
      el.classList.toggle('has-variants', !!st.variants);
      D().clear(main);
      var label = t(st.label, st.vars);
      main.appendChild(h('span', { class: 'arow-key' + (st.hotkey ? '' : ' is-empty'), 'aria-hidden': 'true' }, st.hotkey ? String(st.hotkey) : ''));
      main.appendChild(h('span', { class: 'arow-ico' }, D().icon(st.icon, 40)));
      var mid = h('span', { class: 'arow-mid' },
        h('span', { class: 'arow-label' }, label,
          (st.badges || []).map(function (b) { return badge({ text: b, kind: 'info' }); })));
      var line = h('span', { class: 'arow-line' });
      if (st.disabled && st.reason) line.appendChild(h('span', { class: 'arow-reason' }, t(st.reason, st.reasonVars)));
      else (st.gains || []).forEach(function (c) { line.appendChild(c); });
      mid.appendChild(line);
      main.appendChild(mid);
      main.appendChild(h('span', { class: 'arow-costs' }, st.costs || []));
      main.setAttribute('aria-label', label + (st.hotkey ? ' (' + st.hotkey + ')' : ''));
      if (st.disabled) main.setAttribute('aria-disabled', 'true'); else main.removeAttribute('aria-disabled');
      if (st.repeatable) main.setAttribute('data-repeatable', ''); else main.removeAttribute('data-repeatable');
      var desc = [];
      if (st.disabled && st.reason) desc.push(t(st.reason, st.reasonVars));
      else (st.gains || []).forEach(function (c) { desc.push(c.textContent); });
      (st.costs || []).forEach(function (c) { desc.push(c.textContent); });
      describe(main, desc.join(', '));
      // Extras: variants and Hustle live outside the main button (no nested interactive content).
      var extras = el.querySelector('.arow-extras');
      if (extras) extras.parentNode.removeChild(extras);
      seg = null; hustle = null;
      if (st.variants || st.hustle) {
        extras = h('div', { class: 'arow-extras' });
        if (st.variants) {
          seg = segmented({ id: 'row-' + st.id + '-variant', options: st.variants, value: st.variant, size: 's', nav: false,
            label: label, onChange: function (v) { st.variant = v; if (st.onVariant) st.onVariant(v); } });
          extras.appendChild(seg);
        }
        if (st.hustle) {
          hustle = button({ id: 'row-' + st.id + '-hustle', label: st.hustle.label || 'ui.hustle', size: 's', variant: 'secondary',
            icon: 'hustle', disabled: st.hustle.disabled || st.disabled, reason: st.hustle.reason || st.reason, onClick: st.hustle.onClick });
          extras.appendChild(hustle);
        }
        el.appendChild(extras);
      }
    }
    el.appendChild(main);
    main.addEventListener('click', function (ev) {
      if (el._suppressClick) { el._suppressClick = false; ev.preventDefault(); return; }
      if (st.disabled) { D().refuse(main, st.reason ? t(st.reason, st.reasonVars) : ''); if (st.onRefuse) st.onRefuse(); return; }
      if (st.onRun) st.onRun(ev);
    });
    main.addEventListener('focus', function () { if (st.onFocus) st.onFocus(); });
    main.addEventListener('blur', function () { if (st.onBlur) st.onBlur(); });
    main.addEventListener('mouseenter', function () { if (st.onFocus) st.onFocus(); });
    main.addEventListener('mouseleave', function () { if (st.onBlur && document.activeElement !== main) st.onBlur(); });
    // Left / right change the variant; past the last variant, focus moves on (to Hustle).
    SR.ui.focus.setHandler(main, function (action, ev) {
      if (!seg || (action !== 'left' && action !== 'right')) return false;
      if (ev && ev.down === false) return false;
      return seg.step(action === 'left' ? -1 : 1);
    });
    el.update = function (p) { st = merge(st, p || {}); render(); return el; };
    el.variant = function () { return st.variant; };
    el.stepVariant = function (d) { return seg ? seg.step(d) : false; };
    el.flash = function () {
      if (D().reduced()) return;
      el.classList.remove('is-flash');
      void el.offsetWidth;
      el.classList.add('is-flash');
      setTimeout(function () { el.classList.remove('is-flash'); }, FLASH_MS);
    };
    render();
    return el;
  }

  // ------------------------------------------------------------------ SpeechBubble
  /**
   * A SpeechBubble (UI.md §2.3): typewriter at access.typewriterCps (60), any key completes,
   * gibberish voice blips. @param {{text: string, vars: object, id: string, typewriter: boolean,
   * cps: number, voice: number, tail: string}} o voice: blip pitch factor (1 = neutral)
   * @returns {HTMLElement} el.complete(), el.done(), el.update({ text })
   */
  function speech(o) {
    var st = merge({ typewriter: true, tail: 'left' }, o || {});
    var shown = h('span', { class: 'speech-text', 'aria-hidden': 'true' });
    var ghostText = h('span', { class: 'speech-ghost', 'aria-hidden': 'true' });   // reserves the final size
    var full = h('span', { class: 'vh' });
    var el = h('div', { class: 'speech speech--' + st.tail, 'data-id': st.id || null, role: 'note' }, ghostText, shown, full);
    var text = '', pos = 0, raf = 0, t0 = 0, lastBlip = 0;
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
    function speed() {
      // access.typewriterCps: 30 / 60 / 120 characters per second, or 0 = instant (UI.md §8).
      var v = st.cps !== undefined ? st.cps : D().setting('access.typewriterCps');
      v = Number(v);
      return isFinite(v) && v >= 0 ? v : 60;
    }
    function tick() {
      raf = 0;
      var cps = speed();
      var n = Math.min(text.length, Math.floor((D().now() - t0) * cps / 1000));
      if (n !== pos) {
        pos = n;
        shown.textContent = text.slice(0, pos);
        if (pos - lastBlip >= 3 && /\w/.test(text.charAt(pos - 1))) {
          lastBlip = pos;
          D().sfx('blip', { pitch: (st.voice || 1) * (0.9 + SR.rng.fx.float() * 0.2), gain: 0.5 });
        }
      }
      if (pos < text.length) raf = requestAnimationFrame(tick);
      else el.classList.remove('is-typing');
    }
    function set(p) {
      stop();
      text = t(p.text, p.vars);
      full.textContent = text;
      ghostText.textContent = text;
      var cps = speed();
      var instant = !st.typewriter || D().fast() || cps <= 0 || cps >= 1000 || typeof requestAnimationFrame !== 'function';
      pos = instant ? text.length : 0;
      lastBlip = 0;
      shown.textContent = text.slice(0, pos);
      el.classList.toggle('is-typing', !instant);
      if (!instant) { t0 = D().now(); raf = requestAnimationFrame(tick); }
    }
    el.complete = function () {
      if (pos >= text.length) return false;
      stop(); pos = text.length; shown.textContent = text; el.classList.remove('is-typing'); return true;
    };
    el.done = function () { return pos >= text.length; };
    el.update = function (p) { st = merge(st, p || {}); set(st); return el; };
    el.addEventListener('click', function () { el.complete(); });
    set(st);
    return el;
  }

  // ------------------------------------------------------------------ Meter
  var METER_ICON = { hp: 'hp', heat: 'heat', buzz: 'buzz', poll: 'ballot', progress: null };
  /**
   * A Meter (UI.md §2.3): hp 220 × 16 with a heart and "34 / 40"; poll 360 × 24 with the 50 % line;
   * heat 120 × 12. Damage flashes red for 200 ms; heals fill over 400 ms; a striped ghost segment
   * previews a change. @param {{kind: string, value: number, max: number, ghost: number,
   * label: boolean, id: string, w: number}} o
   * @returns {HTMLElement} el.update({ value, max, ghost })
   */
  function meter(o) {
    var st = merge({ kind: 'hp', value: 0, max: 100, label: true }, o || {});
    var fill = h('span', { class: 'meter-fill' });
    var ghost = h('span', { class: 'meter-ghost' });
    var track = h('span', { class: 'meter-track' }, fill, ghost, st.kind === 'poll' ? h('span', { class: 'meter-line' }) : null);
    var val = h('span', { class: 'meter-v' });
    var el = h('div', { class: 'meter meter--' + st.kind, role: 'meter', 'data-id': st.id || null,
      'aria-valuemin': '0', style: st.w ? { '--meter-w': st.w + 'px' } : null },
      METER_ICON[st.kind] ? D().icon(METER_ICON[st.kind], st.kind === 'hp' ? 20 : 16, 'meter-ico') : null, track, val);
    var shown = null;
    function pct(v) { return st.max > 0 ? Math.max(0, Math.min(100, v / st.max * 100)) : 0; }
    function render() {
      var v = st.value;
      if (shown !== null && v < shown && !D().reduced()) {
        el.classList.remove('is-hit');
        void el.offsetWidth;
        el.classList.add('is-hit');
        setTimeout(function () { el.classList.remove('is-hit'); }, FLASH_MS);
      }
      el.classList.toggle('is-healing', shown !== null && v > shown);
      shown = v;
      fill.style.width = pct(v) + '%';
      var g = st.ghost || 0;
      if (g) {
        var a = pct(Math.min(v, v + g)), b = pct(Math.max(v, v + g));
        ghost.style.left = a + '%';
        ghost.style.width = Math.max(0, b - a) + '%';
        ghost.className = 'meter-ghost ' + (g > 0 ? 'is-gain' : 'is-loss');
      } else {
        ghost.style.width = '0';
      }
      var text = st.kind === 'poll' ? SR.text.pct(st.max ? v / st.max : 0) : st.kind === 'hp' ? t('hud.hpValue', { hp: SR.text.num(v), max: SR.text.num(st.max) }) : SR.text.num(v);
      val.textContent = st.label ? text : '';
      el.setAttribute('aria-valuenow', String(v));
      el.setAttribute('aria-valuemax', String(st.max));
      el.setAttribute('aria-label', t('ui.aria.meter.' + st.kind, { value: text }));
    }
    el.update = function (p) { st = merge(st, p || {}); render(); return el; };
    render();
    return el;
  }

  // ------------------------------------------------------------------ ClockRing
  function pt(min, r) { var a = min / 1440 * Math.PI * 2; return [50 + r * Math.sin(a), 50 - r * Math.cos(a)]; }
  function arcPath(from, to, r) {
    if (to - from >= 1440) to = from + 1439.9;
    if (to <= from) return '';
    var p0 = pt(from, r), p1 = pt(to, r);
    var large = to - from > 720 ? 1 : 0;
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
  }
  /**
   * The ClockRing (UI.md §2.3): the full 24 h; night hours (20-06) shaded; the time left today
   * (now → 24:00) filled with --time; a hand at now. When hours are spent the fill sweeps with a
   * tick-tock (0.1 s per 30 m, max 0.8 s); at 24:00 it pulses red.
   * @param {{min: number, size: number, ghost: number, label: boolean, id: string}} o
   *   ghost: minutes a previewed action would spend; label: the time digits beside the ring
   * @returns {HTMLElement} el.update({ min, ghost, animate })
   */
  function clockRing(o) {
    var st = merge({ min: 480, size: 64, label: false }, o || {});
    var S = D().svg;
    var R = 38;
    var track = S('circle', { cx: 50, cy: 50, r: R, class: 'clk-track' });
    var night1 = S('path', { class: 'clk-night', d: arcPath(1200, 1440, R) });
    var night2 = S('path', { class: 'clk-night', d: arcPath(0, 360, R) });
    var left = S('path', { class: 'clk-left' });
    var ghost = S('path', { class: 'clk-ghost' });
    var hand = S('line', { class: 'clk-hand', x1: 50, y1: 50 });
    var hub = S('circle', { cx: 50, cy: 50, r: 5, class: 'clk-hub' });
    var svgEl = S('svg', { viewBox: '0 0 100 100', class: 'clk-svg', 'aria-hidden': 'true', width: st.size, height: st.size },
      track, left, night1, night2, ghost, hand, hub);
    var digits = h('span', { class: 'clk-digits t-label' });
    var el = h('div', { class: 'clk', role: 'img', 'data-id': st.id || null, style: { '--clk-size': st.size + 'px' } }, svgEl, st.label ? digits : null);
    var shown = st.min, raf = 0;
    function draw(m) {
      var mm = Math.max(0, Math.min(1440, m));
      left.setAttribute('d', arcPath(mm, 1440, R));
      var p = pt(mm, R - 6);
      hand.setAttribute('x2', p[0].toFixed(2));
      hand.setAttribute('y2', p[1].toFixed(2));
      var g = st.ghost || 0;
      ghost.setAttribute('d', g > 0 ? arcPath(mm, Math.min(1440, mm + g), R) : '');
      el.classList.toggle('is-late', mm >= 1440);
      var tt = SR.text.time(Math.round(st.min));
      digits.textContent = st.min >= 1440 ? tt + ' ' + t('hud.late') : tt;
      el.setAttribute('aria-label', t(st.min >= 1440 ? 'ui.aria.clockLate' : 'ui.aria.clock',
        { time: tt, left: SR.text.dur(Math.max(0, 1440 - st.min)) }));
    }
    function sweep(from, to) {
      if (raf) cancelAnimationFrame(raf);
      var dur = Math.min(SWEEP_MAX_MS, (to - from) / 30 * SWEEP_MS_PER_30M);
      if (D().reduced() || dur <= 0 || typeof requestAnimationFrame !== 'function') { shown = to; draw(to); return; }
      var t0 = D().now(), lastTick = -1;
      el.classList.add('is-sweeping');
      function step() {
        var k = Math.min(1, (D().now() - t0) / dur);
        shown = from + (to - from) * SR.util.easeOut(k);
        draw(shown);
        var tick = Math.floor(k * dur / 100);
        if (tick !== lastTick) { lastTick = tick; D().sfx('ticktock', { gain: 0.4 }); }
        if (k < 1) raf = requestAnimationFrame(step);
        else { raf = 0; shown = to; el.classList.remove('is-sweeping'); }
      }
      raf = requestAnimationFrame(step);
    }
    el.update = function (p) {
      var prev = st.min;
      st = merge(st, p || {});
      if (p && p.min !== undefined && p.min > prev && p.animate !== false) sweep(prev, st.min);
      else { shown = st.min; draw(st.min); }
      return el;
    };
    draw(shown);
    return el;
  }

  // ------------------------------------------------------------------ StatChip
  /**
   * A StatChip (UI.md §2.3): "STR 12", 64 × 24, pulses on gain, tooltip with the next perk
   * milestone (P1 perks). @param {{stat: string, value: number, id: string, ghost: number}} o
   * @returns {HTMLElement} el.update({ value, ghost })
   */
  function statChip(o) {
    var st = merge({ stat: 'str', value: 0 }, o || {});
    var val = h('span', { class: 'statchip-v' });
    var gh = h('span', { class: 'statchip-ghost' });
    var el = h('span', { class: 'statchip statchip--' + st.stat, 'data-id': st.id || 'stat-' + st.stat, tabindex: '-1' },
      D().icon(st.stat, 16, 'statchip-ico'), h('b', { class: 'statchip-k' }, t('ui.stat.' + st.stat)), val, gh);
    var shown = null;
    function nextPerk(v) {
      var levels = SR.tuning && SR.tuning.perks && SR.tuning.perks.levels;
      if (!SR.features || !SR.features.perks || !Array.isArray(levels)) return null;
      for (var i = 0; i < levels.length; i++) if (levels[i] > v) return levels[i];
      return null;
    }
    function render() {
      if (shown !== null && st.value > shown && !D().reduced()) {
        el.classList.remove('is-pulse');
        void el.offsetWidth;
        el.classList.add('is-pulse');
      }
      shown = st.value;
      val.textContent = SR.text.num(st.value);
      gh.textContent = st.ghost ? signed(st.ghost) : '';
      var np = nextPerk(st.value);
      el.setAttribute('aria-label', t('ui.statLong.' + st.stat) + ' ' + st.value + (np ? ', ' + t('hud.nextPerk', { n: np }) : ''));
      el.setAttribute('data-tip', np ? t('hud.nextPerk', { n: np }) : t('ui.statLong.' + st.stat));
    }
    tooltip(el, function () { return el.getAttribute('data-tip'); });
    el.update = function (p) { st = merge(st, p || {}); render(); return el; };
    render();
    return el;
  }

  // ------------------------------------------------------------------ KarmaMedallion
  /** @returns {{side: string, i: number}} the karma band (BALANCE B-04c). */
  function karmaBand(k) {
    var i;
    if (SR.rules.stats && typeof SR.rules.stats.band === 'function') {
      try {
        var b = SR.rules.stats.band(k);
        if (typeof b === 'number') i = b;
        else if (b && typeof b.i === 'number') i = b.i;
      } catch (e) { i = undefined; }
    }
    if (typeof i !== 'number' || !(i >= 0 && i <= 9)) i = Math.max(0, Math.min(9, Math.ceil(Math.abs(k) / 10) - 1));
    return { side: k < 0 ? 'evil' : 'good', i: i };
  }
  // Glyph thresholds of the karma tiers (BALANCE B-04b), used only while SR.rules.stats.tier is a stub.
  var KARMA_HALO_AT = 80;
  function karmaTier(k) {
    if (SR.rules.stats && typeof SR.rules.stats.tier === 'function') {
      try { var tt = SR.rules.stats.tier(k); if (typeof tt === 'string') return tt.toLowerCase(); } catch (e) { /* stub-era */ }
    }
    return k >= KARMA_HALO_AT ? 'angelic' : k <= -KARMA_HALO_AT ? 'wicked' : 'neutral';
  }
  var GLYPH = {
    halo: 'M20 9c0-2.8 5.4-4.5 12-4.5S44 6.2 44 9s-5.4 4.5-12 4.5S20 11.8 20 9zm3 0c.6 1 4.2 2.1 9 2.1s8.4-1.1 9-2.1c-.6-1-4.2-2.1-9-2.1S23.6 8 23 9z',
    horns: 'M14 20c-2-6-1-12 3-16 0 5 2 9 6 12zM50 20c2-6 1-12-3-16 0 5-2 9-6 12z',
    dot: 'M29 7a3 3 0 1 0 6 0a3 3 0 1 0-6 0z',
  };
  /**
   * The KarmaMedallion (UI.md §2.3): a head in the karma band colour with a ring glyph (halo /
   * neutral dot / horns; the glyph shows with the P1 tiers or a colour-blind mode, UI.md §8).
   * @param {{karma: number, size: number, id: string, glyph: boolean}} o
   * @returns {HTMLElement} el.update({ karma })
   */
  function karmaMedallion(o) {
    var st = merge({ karma: 0, size: 48 }, o || {});
    var S = D().svg;
    var head = S('circle', { cx: 32, cy: 36, r: 20, class: 'karma-head' });
    var glyph = S('path', { class: 'karma-glyph' });
    var svgEl = S('svg', { viewBox: '0 0 64 64', width: st.size, height: st.size, 'aria-hidden': 'true' }, head, glyph);
    var el = h('span', { class: 'karma', role: 'img', 'data-id': st.id || null, tabindex: '-1' }, svgEl);
    function render() {
      var k = Math.round(st.karma);
      var b = karmaBand(k);
      el.style.setProperty('--k-col', 'var(--karma-' + b.side + '-' + b.i + ')');
      var tier = karmaTier(k);
      var showGlyph = st.glyph !== undefined ? st.glyph : !!(SR.features && SR.features.karmaTiers) || D().setting('access.colorblind', 'none') !== 'none';
      var g = tier === 'angelic' ? 'halo' : tier === 'wicked' ? 'horns' : 'dot';
      glyph.setAttribute('d', showGlyph ? GLYPH[g] : '');
      el.setAttribute('data-band', b.side + '-' + b.i);
      el.setAttribute('data-glyph', showGlyph ? g : '');
      var label = t('hud.karmaTip', { karma: signed(k), tier: t('ui.karmaTier.' + tier) });
      el.setAttribute('aria-label', label);
      el.setAttribute('data-tip', label);
    }
    tooltip(el, function () { return el.getAttribute('data-tip'); });
    el.update = function (p) { st = merge(st, p || {}); render(); return el; };
    render();
    return el;
  }
  karmaMedallion.band = karmaBand;
  karmaMedallion.tier = karmaTier;

  // ------------------------------------------------------------------ Tabs
  /**
   * Underline Tabs, 44 tall (UI.md §2.3): Q / E, LB / RB (the host routes tabPrev / tabNext to
   * el.prev / el.next), arrows move between tabs, swipe on opts.swipe.
   * @param {{id: string, tabs: {id: string, label: string, badge: string, disabled: boolean}[],
   *   value: string, onChange: function, swipe: HTMLElement, label: string}} o
   * @returns {HTMLElement} el.select(id), el.next(), el.prev(), el.value
   */
  function tabs(o) {
    var st = merge({ tabs: [] }, o || {});
    var el = h('div', { class: 'tabs', role: 'tablist', 'data-id': st.id || null, 'aria-label': st.label ? t(st.label) : null });
    var btns = {};
    function render() {
      D().clear(el);
      btns = {};
      st.tabs.forEach(function (tb) {
        var sel = tb.id === st.value;
        var b = h('button', { type: 'button', role: 'tab', class: ['tab', sel ? 'is-selected' : '', tb.disabled ? 'is-disabled' : ''],
          'data-nav': '', 'data-id': (st.id ? st.id + '-' : 'tab-') + tb.id, 'aria-selected': sel ? 'true' : 'false',
          'aria-disabled': tb.disabled ? 'true' : null },
          h('span', { class: 'tab-label' }, t(tb.label)), tb.badge ? badge({ text: tb.badge, kind: 'new' }) : null);
        b.addEventListener('click', function () {
          if (tb.disabled) { D().refuse(b, tb.reason ? t(tb.reason) : ''); return; }
          select(tb.id, true);
        });
        btns[tb.id] = b;
        el.appendChild(b);
      });
    }
    function select(id, user) {
      if (id === st.value) return false;
      st.value = id;
      render();
      if (user) { D().sfx('click'); if (btns[id]) SR.ui.focus.focus(btns[id]); }
      if (st.onChange) st.onChange(id);
      return true;
    }
    function stepTab(d) {
      var ids = st.tabs.filter(function (x) { return !x.disabled; }).map(function (x) { return x.id; });
      var i = ids.indexOf(st.value);
      var n = ids[(i + d + ids.length) % ids.length];
      var had = el.contains(document.activeElement);
      var r = select(n, false);
      if (had && btns[n]) SR.ui.focus.focus(btns[n]);
      D().sfx('click');
      return r;
    }
    el.select = function (id) { return select(id, false); };
    el.next = function () { return stepTab(1); };
    el.prev = function () { return stepTab(-1); };
    Object.defineProperty(el, 'value', { get: function () { return st.value; } });
    el.update = function (p) { st = merge(st, p || {}); render(); return el; };
    if (st.swipe) swipe(st.swipe, function () { el.next(); }, function () { el.prev(); });
    render();
    return el;
  }

  /** Horizontal swipe detection on touch: left → onLeft, right → onRight. @returns {function()} detach */
  function swipe(target, onLeft, onRight) {
    var sx = 0, sy = 0, active = false;
    function down(e) { if (e.pointerType !== 'touch') return; active = true; sx = e.clientX; sy = e.clientY; }
    function up(e) {
      if (!active) return;
      active = false;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onLeft : onRight)();
    }
    target.addEventListener('pointerdown', down);
    target.addEventListener('pointerup', up);
    return function () { target.removeEventListener('pointerdown', down); target.removeEventListener('pointerup', up); };
  }

  // ------------------------------------------------------------------ Segmented
  /**
   * A Segmented control, 2-4 options, 32 tall (UI.md §2.3): arrows move the selection.
   * @param {{id: string, options: {id: string, label: string, disabled: boolean}[], value: string,
   *   onChange: function, size: string, nav: boolean, label: string}} o nav false: not a focus
   *   stop of its own (inside an ActionRow the row drives it)
   * @returns {HTMLElement} el.step(d), el.value
   */
  function segmented(o) {
    var st = merge({ options: [], nav: true }, o || {});
    var el = h('div', { class: ['seg', st.size ? 'seg--' + st.size : ''], role: 'radiogroup', 'data-id': st.id || null,
      'aria-label': st.label ? t(st.label) : null });
    if (st.nav) { el.setAttribute('data-nav', ''); el.setAttribute('tabindex', '0'); }
    function render() {
      D().clear(el);
      st.options.forEach(function (op) {
        var sel = op.id === st.value;
        var b = h('button', { type: 'button', role: 'radio', tabindex: '-1', class: ['seg-opt', sel ? 'is-selected' : ''],
          'aria-checked': sel ? 'true' : 'false', 'data-id': (st.id ? st.id + '-' : 'seg-') + op.id,
          'aria-disabled': op.disabled ? 'true' : null }, t(op.label));
        b.addEventListener('click', function (ev) {
          ev.stopPropagation();
          if (op.disabled) { D().refuse(b); return; }
          set(op.id);
        });
        el.appendChild(b);
      });
    }
    function set(id) {
      if (id === st.value) return false;
      st.value = id;
      render();
      D().sfx('toggle');
      if (st.onChange) st.onChange(id);
      return true;
    }
    el.step = function (d) {
      var ids = st.options.filter(function (x) { return !x.disabled; }).map(function (x) { return x.id; });
      var i = ids.indexOf(st.value);
      var n = i + d;
      if (n < 0 || n >= ids.length) return false;
      return set(ids[n]);
    };
    Object.defineProperty(el, 'value', { get: function () { return st.value; } });
    el.update = function (p) { st = merge(st, p || {}); render(); return el; };
    if (st.nav) SR.ui.focus.setHandler(el, function (a, ev) {
      if (ev && ev.down === false) return false;
      if (a === 'left') return el.step(-1) || true;
      if (a === 'right') return el.step(1) || true;
      return false;
    });
    render();
    return el;
  }

  // ------------------------------------------------------------------ NumberField
  /**
   * A NumberField (UI.md §2.3): integer input with - / + steppers and quick buttons (10 %, 50 %,
   * All, or +$10 / +$100 / +$1k). Digits only; clamps to [min, max]; Enter confirms; while the
   * input is focused, keys type (the text-entry rule of ARCHITECTURE §11).
   * @param {{id: string, label: string, value: number, min: number, max: number, step: number,
   *   quick: (string|{label: string, set: number, add: number})[], money: boolean,
   *   onChange: function, onSubmit: function}} o quick strings: '10%', '50%', 'all', '+10', '+100', '+1000'
   * @returns {HTMLElement} el.value (get / set), el.update({ max, ... }), el.input
   */
  function numberField(o) {
    var st = merge({ value: 0, min: 0, max: 999999, step: 1, quick: [] }, o || {});
    var id = st.id || 'num';
    var input = h('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', class: 'num-input', 'data-nav': '',
      'data-id': id + '-input', autocomplete: 'off', 'aria-label': st.label ? t(st.label) : t('ui.amount') });
    var minus = button({ id: id + '-minus', label: 'ui.less', iconOnly: true, cls: 'num-step', onClick: function () { add(-st.step); } });
    var plus = button({ id: id + '-plus', label: 'ui.more', iconOnly: true, cls: 'num-step', onClick: function () { add(st.step); } });
    function glyphs() {
      if (!minus.querySelector('.num-glyph')) minus.appendChild(h('span', { class: 'num-glyph', 'aria-hidden': 'true' }, '−'));
      if (!plus.querySelector('.num-glyph')) plus.appendChild(h('span', { class: 'num-glyph', 'aria-hidden': 'true' }, '+'));
    }
    var quick = h('div', { class: 'num-quick' });
    var el = h('div', { class: 'num', 'data-id': id, role: 'group', 'aria-label': st.label ? t(st.label) : null },
      st.label ? h('label', { class: 'num-label t-small' }, t(st.label)) : null,
      h('div', { class: 'num-row' }, minus, h('span', { class: 'num-box' }, st.money ? h('span', { class: 'num-cur', 'aria-hidden': 'true' }, '$') : null, input), plus),
      quick);
    function clamp(n) { n = Math.floor(Number(n) || 0); return Math.max(st.min, Math.min(st.max, n)); }
    function set(n, fire) {
      var v = clamp(n);
      var changed = v !== st.value;
      st.value = v;
      input.value = String(v);
      minus.update({ disabled: v <= st.min });
      plus.update({ disabled: v >= st.max });
      glyphs();
      if (changed && fire !== false && st.onChange) st.onChange(v);
      return changed;
    }
    function add(d) { set(st.value + d); D().sfx('click'); }
    function renderQuick() {
      D().clear(quick);
      (st.quick || []).forEach(function (q) {
        var spec = typeof q === 'string' ? quickSpec(q) : q;
        quick.appendChild(button({ id: id + '-q-' + (spec.key || spec.label), label: spec.label, vars: spec.vars, size: 's', variant: 'ghost',
          onClick: function () {
            if (spec.frac !== undefined) set(Math.floor(st.max * spec.frac));
            else if (spec.set !== undefined) set(spec.set);
            else if (spec.add !== undefined) set(st.value + spec.add);
          } }));
      });
    }
    function quickSpec(q) {
      if (q === '10%') return { key: 'p10', label: 'ui.pct', vars: { n: 10 }, frac: 0.1 };
      if (q === '50%') return { key: 'p50', label: 'ui.pct', vars: { n: 50 }, frac: 0.5 };
      if (q === 'all') return { key: 'all', label: 'ui.all', frac: 1 };
      var n = Number(q);
      var lbl = st.money ? money(n, { sign: true }).replace(/,000$/, 'k') : signed(n);
      return { key: 'add' + n, label: lbl, add: n };
    }
    input.addEventListener('input', function () {
      var digits = input.value.replace(/[^0-9]/g, '');
      if (digits !== input.value) input.value = digits;
      var n = digits === '' ? st.min : Number(digits);
      if (n > st.max) { input.value = String(st.max); n = st.max; }
      if (n !== st.value) { st.value = Math.max(st.min, n); if (st.onChange) st.onChange(st.value); }
    });
    input.addEventListener('blur', function () { set(input.value === '' ? st.min : input.value); });
    SR.ui.focus.setHandler(input, function (a, ev) {
      if (ev && ev.down === false) return a === 'confirm' || a === 'back';
      if (a === 'confirm') { set(input.value); if (st.onSubmit) st.onSubmit(st.value); return true; }
      if (a === 'back') { set(input.value); SR.ui.focus.focus(plus); return true; }
      if (a === 'up') { add(st.step); return true; }
      if (a === 'down') { add(-st.step); return true; }
      return false;
    });
    Object.defineProperty(el, 'value', { get: function () { return st.value; }, set: function (v) { set(v, false); } });
    el.input = input;
    el.update = function (p) { st = merge(st, p || {}); renderQuick(); set(st.value, false); return el; };
    renderQuick();
    set(st.value, false);
    return el;
  }

  // ------------------------------------------------------------------ TextField
  /**
   * A TextField (UI.md §2.3): single-line input, 44 tall (touch 48), a label above, an optional
   * hint and error line, maxLength, pattern, and an optional Paste button. While focused only
   * Enter (submit), Esc (cancel / blur) and Tab act.
   * @param {{id: string, label: string, value: string, maxLength: number, pattern: string,
   *   hint: string, error: string, placeholder: string, paste: boolean, onSubmit: function,
   *   onCancel: function, onChange: function}} o
   * @returns {HTMLElement} el.value, el.update({ error, hint }), el.input
   */
  function textField(o) {
    var st = merge({ value: '' }, o || {});
    var id = st.id || 'text';
    var input = h('input', { type: 'text', class: 'tf-input', 'data-nav': '', 'data-id': id + '-input', autocomplete: 'off',
      spellcheck: 'false', maxlength: st.maxLength || null, placeholder: st.placeholder ? t(st.placeholder) : null,
      'aria-label': t(st.label) });
    input.value = st.value;
    var hint = h('span', { class: 'tf-hint t-small' });
    var err = h('span', { class: 'tf-error t-small', role: 'alert' });
    var row = h('div', { class: 'tf-row' }, input);
    var el = h('div', { class: 'tf', 'data-id': id }, h('label', { class: 'tf-label t-small' }, t(st.label)), row, hint, err);
    if (st.paste) {
      row.appendChild(button({ id: id + '-paste', label: 'ui.paste', size: 's', onClick: function () {
        var cb = navigator.clipboard;
        if (cb && typeof cb.readText === 'function') {
          cb.readText().then(function (txt) { setValue(String(txt || '')); SR.ui.focus.focus(input); }, function () {
            el.update({ hint: 'ui.pasteHint' }); SR.ui.focus.focus(input);
          });
        } else { el.update({ hint: 'ui.pasteHint' }); SR.ui.focus.focus(input); }
      } }));
    }
    function valid(v) {
      if (!st.pattern) return true;
      try { return new RegExp('^(?:' + st.pattern + ')$').test(v); } catch (e) { return true; }
    }
    function setValue(v) {
      if (st.maxLength) v = v.slice(0, st.maxLength);
      input.value = v;
      st.value = v;
      if (st.onChange) st.onChange(v);
    }
    function render() {
      hint.textContent = st.hint ? t(st.hint, st.hintVars) : '';
      err.textContent = st.error ? t(st.error, st.errorVars) : '';
      el.classList.toggle('has-error', !!st.error);
      if (st.error) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    }
    input.addEventListener('input', function () { st.value = input.value; if (st.onChange) st.onChange(input.value); });
    SR.ui.focus.setHandler(input, function (a, ev) {
      if (ev && ev.down === false) return a === 'confirm' || a === 'back';
      if (a === 'confirm') {
        if (!valid(input.value)) { el.update({ error: st.patternError || 'ui.invalid' }); D().refuse(input); return true; }
        if (st.onSubmit) st.onSubmit(input.value);
        return true;
      }
      if (a === 'back') {
        if (st.onCancel) st.onCancel();
        input.blur();
        var s = SR.ui.focus.current();
        if (s) SR.ui.focus.focus(input);   // stay on the field, now leaving typing mode
        return true;
      }
      return false;
    });
    input.addEventListener('focus', function () {
      if (input.scrollIntoView) { try { input.scrollIntoView({ block: 'nearest' }); } catch (e) { /* old browsers */ } }
    });
    Object.defineProperty(el, 'value', { get: function () { return input.value; }, set: function (v) { setValue(String(v)); } });
    el.input = input;
    el.update = function (p) { st = merge(st, p || {}); render(); return el; };
    render();
    return el;
  }

  // ------------------------------------------------------------------ Slider / Toggle
  /**
   * A Slider, 200 wide (UI.md §2.3): arrows step; pointer drag on the track.
   * @param {{id: string, label: string, value: number, min: number, max: number, step: number,
   *   onChange: function, format: function}} o
   * @returns {HTMLElement} el.value, el.update
   */
  function slider(o) {
    var st = merge({ value: 0, min: 0, max: 1, step: 0.1 }, o || {});
    var fill = h('span', { class: 'sld-fill' });
    var knob = h('span', { class: 'sld-knob' });
    var track = h('span', { class: 'sld-track' }, fill, knob);
    var val = h('span', { class: 'sld-v t-small' });
    var ctl = h('div', { class: 'sld-ctl', role: 'slider', 'data-nav': '', tabindex: '0', 'data-id': st.id || null,
      'aria-label': t(st.label) }, track);
    var el = h('div', { class: 'sld' }, h('span', { class: 'sld-label t-small' }, t(st.label)), ctl, val);
    function fmt(v) { return st.format ? st.format(v) : SR.text.pct((v - st.min) / ((st.max - st.min) || 1)); }
    function set(v, fire) {
      var n = Math.round((Math.max(st.min, Math.min(st.max, v)) - st.min) / st.step) * st.step + st.min;
      n = Number(n.toFixed(6));
      var changed = n !== st.value;
      st.value = n;
      var p = (n - st.min) / ((st.max - st.min) || 1) * 100;
      fill.style.width = p + '%';
      knob.style.left = p + '%';
      val.textContent = fmt(n);
      ctl.setAttribute('aria-valuemin', String(st.min));
      ctl.setAttribute('aria-valuemax', String(st.max));
      ctl.setAttribute('aria-valuenow', String(n));
      ctl.setAttribute('aria-valuetext', fmt(n));
      if (changed && fire !== false && st.onChange) st.onChange(n);
      return changed;
    }
    SR.ui.focus.setHandler(ctl, function (a, ev) {
      if (ev && ev.down === false) return false;
      if (a === 'left') { set(st.value - st.step); D().sfx('click'); return true; }
      if (a === 'right') { set(st.value + st.step); D().sfx('click'); return true; }
      return false;
    });
    function fromPointer(e) {
      var r = track.getBoundingClientRect();
      set(st.min + (e.clientX - r.left) / (r.width || 1) * (st.max - st.min));
    }
    ctl.addEventListener('pointerdown', function (e) {
      fromPointer(e);
      if (ctl.setPointerCapture) try { ctl.setPointerCapture(e.pointerId); } catch (x) { /* synthetic events */ }
      function move(ev) { fromPointer(ev); }
      function up() { ctl.removeEventListener('pointermove', move); ctl.removeEventListener('pointerup', up); }
      ctl.addEventListener('pointermove', move);
      ctl.addEventListener('pointerup', up);
    });
    Object.defineProperty(el, 'value', { get: function () { return st.value; }, set: function (v) { set(v, false); } });
    el.control = ctl;
    el.update = function (p) { st = merge(st, p || {}); set(st.value, false); return el; };
    set(st.value, false);
    return el;
  }

  /**
   * A Toggle, 48 × 28 (UI.md §2.3): Space / confirm / click flips it.
   * @param {{id: string, label: string, value: boolean, onChange: function, disabled: boolean, reason: string}} o
   * @returns {HTMLElement} el.value, el.update
   */
  function toggle(o) {
    var st = merge({ value: false }, o || {});
    var sw = h('button', { type: 'button', role: 'switch', class: 'tgl-sw', 'data-nav': '', 'data-id': st.id || null,
      'aria-label': t(st.label) }, h('span', { class: 'tgl-knob' }));
    var el = h('div', { class: 'tgl' }, sw, h('span', { class: 'tgl-label' }, t(st.label)));
    function render() {
      sw.setAttribute('aria-checked', st.value ? 'true' : 'false');
      el.classList.toggle('is-on', !!st.value);
      if (st.disabled) sw.setAttribute('aria-disabled', 'true'); else sw.removeAttribute('aria-disabled');
    }
    guardClick(sw, function () { return st; }, function () {
      st.value = !st.value;
      render();
      D().sfx('toggle');
      if (st.onChange) st.onChange(st.value);
    });
    el.addEventListener('click', function (ev) { if (ev.target !== sw && !sw.contains(ev.target)) sw.click(); });
    Object.defineProperty(el, 'value', { get: function () { return st.value; }, set: function (v) { st.value = !!v; render(); } });
    el.control = sw;
    el.update = function (p) { st = merge(st, p || {}); render(); return el; };
    render();
    return el;
  }

  // ------------------------------------------------------------------ List
  /**
   * A List (UI.md §2.3): rows 48 tall with icon, label and meta; arrows move, type-ahead jumps;
   * the container scrolls with a finger (touch-action pan-y).
   * @param {{id: string, label: string, items: {id: string, icon: string, label: string,
   *   meta: string, disabled: boolean, reason: string, selected: boolean}[], onSelect: function,
   *   typeAhead: boolean, maxRows: number}} o
   * @returns {HTMLElement} el.update({ items })
   */
  function list(o) {
    var st = merge({ items: [], typeAhead: true }, o || {});
    var el = h('ul', { class: 'list scroll-y', role: 'listbox', 'data-id': st.id || null, 'aria-label': st.label ? t(st.label) : null,
      style: st.maxRows ? { maxHeight: 'calc(' + (st.maxRows * 48) + 'px * var(--ui-scale))' } : null });
    var typed = '', typedAt = 0;
    function render() {
      D().clear(el);
      st.items.forEach(function (it) {
        var li = h('li', { class: ['list-row', it.disabled ? 'is-disabled' : '', it.selected ? 'is-selected' : ''], role: 'option',
          'data-nav': '', tabindex: '-1', 'data-id': (st.id ? st.id + '-' : 'item-') + it.id, 'aria-selected': it.selected ? 'true' : 'false',
          'aria-disabled': it.disabled ? 'true' : null },
          it.icon ? D().icon(it.icon, 24, 'list-ico') : null,
          h('span', { class: 'list-label' }, t(it.label, it.vars)),
          it.meta !== undefined ? h('span', { class: 'list-meta t-small' }, t(it.meta, it.metaVars)) : null);
        li.classList.add('nav-inset');
        li.addEventListener('click', function () {
          if (it.disabled) { D().refuse(li, it.reason ? t(it.reason) : ''); return; }
          D().sfx('click');
          if (st.onSelect) st.onSelect(it);
        });
        el.appendChild(li);
      });
    }
    el.addEventListener('keydown', function (e) {
      if (!st.typeAhead || e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      var nowMs = D().now();
      typed = nowMs - typedAt > 800 ? e.key.toLowerCase() : typed + e.key.toLowerCase();
      typedAt = nowMs;
      var rows = el.querySelectorAll('.list-row');
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].querySelector('.list-label').textContent.toLowerCase().indexOf(typed) === 0) { SR.ui.focus.focus(rows[i]); break; }
      }
    });
    el.update = function (p) { st = merge(st, p || {}); render(); return el; };
    render();
    return el;
  }

  // ------------------------------------------------------------------ KeyHint
  // Display fallback while SR.input is a stub: CONTRACT §12.1 default bindings of the actions that
  // UI shows glyphs for. SR.input.bindings() replaces it as soon as the kernel's input lands.
  var DEFAULT_BINDINGS = {
    confirm: ['Enter', 'Pad0'], interact: ['KeyE', 'Pad0'], back: ['Escape', 'Pad1'], pause: ['Escape', 'Pad9'],
    pocket: ['Tab', 'Pad8'], repeat: ['KeyR', 'Pad0'], map: ['KeyM'], bag: ['KeyI'], journal: ['KeyJ'], minimap: ['KeyN'],
    car: ['KeyC', 'Pad3'], skate: ['ShiftLeft', 'Pad7'], tabPrev: ['KeyQ', 'Pad4'], tabNext: ['KeyE', 'Pad5'],
    up: ['ArrowUp', 'Pad12'], down: ['ArrowDown', 'Pad13'], left: ['ArrowLeft', 'Pad14'], right: ['ArrowRight', 'Pad15'],
    zoomIn: ['Equal'], zoomOut: ['Minus'], minimalHud: ['KeyH'],
  };
  for (var rn = 1; rn <= 9; rn++) DEFAULT_BINDINGS['row' + rn] = ['Digit' + rn];
  var CODE_KEYS = { Enter: 'key.enter', NumpadEnter: 'key.enter', Escape: 'key.esc', Space: 'key.space', Tab: 'key.tab',
    Backspace: 'key.backspace', ShiftLeft: 'key.shift', ShiftRight: 'key.shift', ArrowUp: 'key.up', ArrowDown: 'key.down',
    ArrowLeft: 'key.left', ArrowRight: 'key.right', Equal: 'key.plus', NumpadAdd: 'key.plus', Minus: 'key.minus',
    NumpadSubtract: 'key.minus', WheelUp: 'key.wheelUp', WheelDown: 'key.wheelDown', Mouse0: 'key.mouseLeft', Mouse2: 'key.mouseRight' };

  /** @returns {'xbox'|'ps'} the glyph style of the connected gamepad. */
  function padStyle() {
    try {
      var pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected !== false) {
        return /054c|playstation|dualshock|dualsense|sony/i.test(pads[i].id || '') ? 'ps' : 'xbox';
      }
    } catch (e) { /* no gamepad API */ }
    return 'xbox';
  }

  /** @returns {string} the glyph text of one binding string ('KeyE' → 'E', 'Pad0' → 'A' or '✕'). */
  function glyph(code, style) {
    var m = /^Pad(\d+)$/.exec(code);
    if (m) return t('key.pad.' + (style || padStyle()) + '.' + m[1]);
    if (hasOwn.call(CODE_KEYS, code)) return t(CODE_KEYS[code]);
    var k = /^Key([A-Z])$/.exec(code) || /^Digit(\d)$/.exec(code) || /^Numpad(\d)$/.exec(code);
    if (k) return k[1];
    return code;
  }

  function bindingsOf(action, context) {
    if (SR.input && typeof SR.input.bindings === 'function') {
      try { var b = SR.input.bindings(action, context); if (b && b.length) return b; } catch (e) { /* unknown action */ }
    }
    return DEFAULT_BINDINGS[action] || [];
  }

  /** @returns {string} the device kind of the last input: 'kb' | 'mouse' | 'pad' | 'touch'. */
  function device() { return (SR.input && SR.input.last) || 'kb'; }

  var liveHints = [];
  /**
   * A KeyHint (UI.md §2.3): the glyph of the bound key or button for the last device
   * (keyboard, Xbox-style, PlayStation-style); hidden on touch.
   * @param {{action: string, context: string, text: string, id: string}} o
   * @returns {HTMLElement}
   */
  function keyHint(o) {
    o = o || {};
    var el = h('kbd', { class: 'keyhint', 'data-id': o.id || null, 'data-action': o.action || null, 'aria-hidden': 'true' });
    el.refresh = function () {
      var dev = device();
      var list = bindingsOf(o.action, o.context);
      var pad = list.filter(function (b) { return /^Pad/.test(b); });
      var keys = list.filter(function (b) { return !/^Pad/.test(b) && !/^Mouse|^Wheel/.test(b); });
      var pick = dev === 'pad' ? pad[0] : keys[0] || list[0];
      var text = o.text ? t(o.text) : pick ? glyph(pick) : '';
      el.textContent = text;
      el.classList.toggle('is-empty', !text);
      el.classList.toggle('keyhint--pad', dev === 'pad');
      el.setAttribute('data-glyph', text);
    };
    el.refresh();
    liveHints.push(el);
    if (liveHints.length > 400) liveHints = liveHints.filter(function (x) { return x.isConnected; });
    return el;
  }
  keyHint.glyph = glyph;
  keyHint.refreshAll = function () {
    liveHints = liveHints.filter(function (x) { return x.isConnected; });
    liveHints.forEach(function (x) { x.refresh(); });
  };

  // ------------------------------------------------------------------ Tooltip
  var tipEl = null, tipTimer = 0, tipOwner = null;
  function hideTip(owner) {
    if (owner && owner !== tipOwner) return;
    if (tipTimer) { clearTimeout(tipTimer); tipTimer = 0; }
    if (tipEl) tipEl.classList.remove('is-shown');
    tipOwner = null;
  }
  function showTip(target, content) {
    var text = typeof content === 'function' ? content() : t(content);
    if (!text || !target.isConnected) return;
    var fr = D().frame(target);
    var host = fr.root === document.body ? D().layer('tip') : fr.root;
    if (!tipEl || tipEl.parentNode !== host) {
      if (tipEl && tipEl.parentNode) tipEl.parentNode.removeChild(tipEl);
      tipEl = h('div', { class: 'tip', role: 'tooltip', 'data-id': 'tooltip' });
      host.appendChild(tipEl);
    }
    tipEl.textContent = text;
    tipEl.classList.add('is-shown');
    var r = D().logicalRect(target, fr);
    var W = host.offsetWidth || 1280;
    var tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    var x = Math.max(8, Math.min(W - tw - 8, r.x + r.w / 2 - tw / 2));
    var y = r.y - th - 8;
    if (y < 8) y = r.y + r.h + 8;
    tipEl.style.left = x + 'px';
    tipEl.style.top = y + 'px';
    tipOwner = target;
  }
  /**
   * Attaches a Tooltip (UI.md §2.3): max 280 wide, 14 px; hover or focus after 400 ms;
   * long-press on touch. @param {HTMLElement} target @param {string|function(): string} content
   * @returns {function()} detach
   */
  function tooltip(target, content) {
    var pressTimer = 0;
    function later() { hideTip(); tipTimer = setTimeout(function () { tipTimer = 0; showTip(target, content); }, TOOLTIP_DELAY_MS); }
    function enter(e) { if (e.pointerType === 'touch') return; later(); }
    function leave() { hideTip(target); }
    function down(e) {
      if (e.pointerType !== 'touch') return;
      pressTimer = setTimeout(function () { pressTimer = 0; showTip(target, content); setTimeout(function () { hideTip(target); }, 1500); }, LONG_PRESS_MS);
    }
    function up() { if (pressTimer) { clearTimeout(pressTimer); pressTimer = 0; } }
    target.addEventListener('pointerenter', enter);
    target.addEventListener('pointerleave', leave);
    target.addEventListener('focus', later);
    target.addEventListener('blur', leave);
    target.addEventListener('pointerdown', down);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    return function () {
      ['pointerenter', 'pointerleave', 'focus', 'blur', 'pointerdown', 'pointerup', 'pointercancel'].forEach(function (ev, i) {
        target.removeEventListener(ev, [enter, leave, later, leave, down, up, up][i]);
      });
      hideTip(target);
    };
  }
  tooltip.hide = function () { hideTip(); };

  // ------------------------------------------------------------------ Portrait
  function canvasFor(w, hgt, cls) {
    var dpr = Math.min(2, (window.devicePixelRatio || 1) * ((SR.stage && SR.stage.uiK) || 1));
    var c = h('canvas', { class: cls, width: Math.round(w * dpr), height: Math.round(hgt * dpr), style: { width: w + 'px', height: hgt + 'px' } });
    var ctx = c.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { canvas: c, ctx: ctx, dpr: dpr };
  }

  function placeholderHead(ctx, size, blink) {
    // Stand-in until W1-A's portraits land: a paper disc with a stick head, from the tokens.
    var s = size;
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = D().token('--paper-2');
    ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = D().token('--ink-900');
    ctx.lineWidth = Math.max(1.5, s / 28);
    ctx.lineCap = 'round';
    ctx.fillStyle = D().token('--paper-0');
    ctx.beginPath(); ctx.arc(s / 2, s * 0.42, s * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s / 2, s * 0.62); ctx.lineTo(s / 2, s * 0.95); ctx.moveTo(s * 0.26, s * 0.8); ctx.lineTo(s * 0.74, s * 0.8); ctx.stroke();
    ctx.fillStyle = D().token('--ink-900');
    var ey = s * 0.41, ex = s * 0.07;
    if (blink) { ctx.beginPath(); ctx.moveTo(s / 2 - ex - s * 0.02, ey); ctx.lineTo(s / 2 - ex + s * 0.02, ey); ctx.moveTo(s / 2 + ex - s * 0.02, ey); ctx.lineTo(s / 2 + ex + s * 0.02, ey); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(s / 2 - ex, ey, s * 0.018 + 0.6, 0, Math.PI * 2); ctx.arc(s / 2 + ex, ey, s * 0.018 + 0.6, 0, Math.PI * 2); ctx.fill(); }
  }

  /**
   * A Portrait (UI.md §2.3): canvas head and shoulders from SR.art.portraits, 32 / 56 / 96 / 176
   * px, idle blink every 4-7 s. @param {{person: string, size: number, mood: string, id: string,
   * label: string}} o @returns {HTMLElement} el.update({ person, mood })
   */
  function portrait(o) {
    var st = merge({ size: 56, mood: 'neutral' }, o || {});
    var cv = canvasFor(st.size, st.size, 'portrait-cv');
    cv.canvas.style.width = '100%';     // fills the frame inside its 2 px border
    cv.canvas.style.height = '100%';
    var el = h('span', { class: 'portrait portrait--' + st.size, 'data-id': st.id || null, role: 'img',
      style: { width: st.size + 'px', height: st.size + 'px' } }, cv.canvas);
    var blinkTimer = 0;
    function draw(blink) {
      var ctx = cv.ctx;
      if (!ctx) return;
      ctx.clearRect(0, 0, st.size, st.size);
      var real = SR.art && SR.art.portraits && typeof SR.art.portraits.draw === 'function';
      if (real && st.person) {
        try { SR.art.portraits.draw(ctx, st.person, st.size, st.mood, { blink: !!blink }); return; } catch (e) { SR.util.warnOnce('ui.portrait.' + st.person, 'SR.ui.portrait: ' + e.message); }
      }
      placeholderHead(ctx, st.size, !!blink);
    }
    function scheduleBlink() {
      if (blinkTimer) clearTimeout(blinkTimer);
      blinkTimer = setTimeout(function () {
        blinkTimer = 0;
        if (!el.isConnected) return;
        draw(true);
        setTimeout(function () { if (el.isConnected) { draw(false); scheduleBlink(); } }, 140);
      }, BLINK_MIN_MS + SR.rng.fx.float() * (BLINK_MAX_MS - BLINK_MIN_MS));
    }
    function render() {
      el.setAttribute('aria-label', st.label ? t(st.label) : t('ui.aria.portrait', { name: st.person || '' }));
      el.setAttribute('data-person', st.person || '');
      draw(false);
    }
    el.update = function (p) { st = merge(st, p || {}); render(); return el; };
    render();
    if (!D().reduced()) scheduleBlink();
    return el;
  }

  // ------------------------------------------------------------------ Sparkline / LineChart
  var KIND_TOKEN = { money: '--money', hp: '--hp', str: '--str', int: '--int', cha: '--cha', time: '--time', heat: '--heat',
    karma: '--karma-zero', info: '--info', ink: '--ink-700', primary: '--primary-500' };
  function kindColour(kind) { return D().token(KIND_TOKEN[kind] || '--ink-700'); }

  function drawLine(ctx, data, x0, y0, w, hh, lo, hi, colour, width) {
    if (!data.length) return;
    var span = hi - lo || 1;
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < data.length; i++) {
      var x = x0 + (data.length === 1 ? w / 2 : i / (data.length - 1) * w);
      var y = y0 + hh - (data[i] - lo) / span * hh;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  /**
   * A Sparkline (UI.md §2.3): canvas 96 × 24. @param {{data: number[], kind: string, w: number,
   * h: number, id: string, label: string}} o @returns {HTMLElement} el.update({ data })
   */
  function sparkline(o) {
    var st = merge({ data: [], kind: 'money', w: 96, h: 24 }, o || {});
    var cv = canvasFor(st.w, st.h, 'spark-cv');
    var el = h('span', { class: 'spark', role: 'img', 'data-id': st.id || null }, cv.canvas);
    function render() {
      var ctx = cv.ctx, d = st.data || [];
      el.setAttribute('aria-label', (st.label ? t(st.label) + ': ' : '') + (d.length ? SR.text.num(d[0]) + ' → ' + SR.text.num(d[d.length - 1]) : '—'));
      if (!ctx) return;
      ctx.clearRect(0, 0, st.w, st.h);
      if (!d.length) return;
      var lo = Math.min.apply(null, d), hi = Math.max.apply(null, d);
      drawLine(ctx, d, 2, 2, st.w - 4, st.h - 4, lo, hi, kindColour(st.kind), 2);
      var last = d[d.length - 1];
      ctx.fillStyle = kindColour(st.kind);
      ctx.beginPath();
      ctx.arc(st.w - 2, 2 + (st.h - 4) - (last - lo) / ((hi - lo) || 1) * (st.h - 4), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    el.update = function (p) { st = merge(st, p || {}); render(); return el; };
    render();
    return el;
  }

  /**
   * A LineChart (UI.md §2.3): canvas 420 × 180 with axes in caption type.
   * @param {{series: {data: number[], kind: string, label: string}[], w: number, h: number,
   *   id: string, label: string, format: function, xLabels: string[]}} o format: y-axis labels
   * @returns {HTMLElement} el.update({ series })
   */
  function lineChart(o) {
    var st = merge({ series: [], w: 420, h: 180 }, o || {});
    var cv = canvasFor(st.w, st.h, 'chart-cv');
    var legend = h('div', { class: 'chart-legend t-caption' });
    var el = h('figure', { class: 'chart', 'data-id': st.id || null, role: 'img' }, cv.canvas, legend);
    function render() {
      var ctx = cv.ctx;
      var all = [];
      st.series.forEach(function (s) { all = all.concat(s.data || []); });
      D().clear(legend);
      st.series.forEach(function (s) {
        legend.appendChild(h('span', { class: 'chart-key chart-key--' + (s.kind || 'ink') }, h('i', { 'aria-hidden': 'true' }), t(s.label || '')));
      });
      el.setAttribute('aria-label', (st.label ? t(st.label) + '. ' : '') + st.series.map(function (s) {
        var d = s.data || [];
        return t(s.label || '') + ' ' + (d.length ? SR.text.num(d[0]) + ' → ' + SR.text.num(d[d.length - 1]) : '—');
      }).join('; '));
      if (!ctx) return;
      ctx.clearRect(0, 0, st.w, st.h);
      var padL = 44, padB = 20, padT = 8, padR = 8;
      var W = st.w - padL - padR, H = st.h - padT - padB;
      var lo = all.length ? Math.min.apply(null, all) : 0, hi = all.length ? Math.max.apply(null, all) : 1;
      if (lo === hi) { lo -= 1; hi += 1; }
      ctx.strokeStyle = D().token('--paper-3');
      ctx.lineWidth = 1;
      ctx.fillStyle = D().token('--ink-700');
      ctx.font = '12px ' + D().token('--font-ui');
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      for (var g = 0; g <= 3; g++) {
        var y = padT + H - g / 3 * H;
        ctx.beginPath(); ctx.moveTo(padL, Math.round(y) + 0.5); ctx.lineTo(padL + W, Math.round(y) + 0.5); ctx.stroke();
        var v = lo + g / 3 * (hi - lo);
        ctx.fillText(st.format ? st.format(v) : SR.text.num(Math.round(v)), padL - 6, y);
      }
      ctx.strokeStyle = D().token('--ink-900');
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + H); ctx.lineTo(padL + W, padT + H); ctx.stroke();
      if (st.xLabels && st.xLabels.length) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        st.xLabels.forEach(function (lb, i) {
          var x = padL + (st.xLabels.length === 1 ? W / 2 : i / (st.xLabels.length - 1) * W);
          ctx.fillText(String(lb), x, padT + H + 4);
        });
      }
      st.series.forEach(function (s) { drawLine(ctx, s.data || [], padL, padT, W, H, lo, hi, kindColour(s.kind), 2.5); });
    }
    el.update = function (p) { st = merge(st, p || {}); render(); return el; };
    render();
    return el;
  }

  // ------------------------------------------------------------------ ProgressBar / Badge
  /**
   * A ProgressBar (UI.md §2.3): 6 tall, pill radius, with an optional label and value text.
   * @param {{value: number, max: number, kind: string, label: string, id: string, showValue: boolean}} o
   * @returns {HTMLElement} el.update({ value, max })
   */
  function progress(o) {
    var st = merge({ value: 0, max: 100, kind: 'primary', showValue: true }, o || {});
    var fill = h('span', { class: 'prog-fill' });
    var lab = h('span', { class: 'prog-label t-small' });
    var val = h('span', { class: 'prog-v t-small' });
    var el = h('div', { class: 'prog prog--' + st.kind, role: 'progressbar', 'data-id': st.id || null, 'aria-valuemin': '0' },
      h('div', { class: 'prog-head' }, lab, val), h('span', { class: 'prog-track' }, fill));
    function render() {
      var p = st.max > 0 ? Math.max(0, Math.min(1, st.value / st.max)) : 0;
      fill.style.width = (p * 100) + '%';
      lab.textContent = st.label ? t(st.label, st.vars) : '';
      val.textContent = st.showValue ? SR.text.num(st.value) + ' / ' + SR.text.num(st.max) : '';
      el.setAttribute('aria-valuenow', String(st.value));
      el.setAttribute('aria-valuemax', String(st.max));
      el.setAttribute('aria-label', (st.label ? t(st.label, st.vars) + ' ' : '') + SR.text.num(st.value) + ' / ' + SR.text.num(st.max));
    }
    el.update = function (p) { st = merge(st, p || {}); render(); return el; };
    render();
    return el;
  }

  /**
   * A Badge (UI.md §2.3): pill 20 tall: "NEW", "½ PRICE", "WED", "LOCKED".
   * @param {{text: string, kind: string, id: string}} o kind: new | info | warn | locked | money
   * @returns {HTMLElement}
   */
  function badge(o) {
    o = o || {};
    var txt = o.text;
    if (txt && !/\s/.test(txt) && !/^[\w-]+(\.[\w-]+)+$/.test(txt)) {
      // A bare Preview badge id ('wed-half-price'): its text key, else the id itself.
      var k = 'ui.badge.' + txt;
      txt = SR.text.has(k) ? SR.text(k) : txt.replace(/-/g, ' ').toUpperCase();
    } else txt = t(txt);
    return h('span', { class: 'badge badge--' + (o.kind || 'info'), 'data-id': o.id || null }, txt);
  }

  // ------------------------------------------------------------------ Breadcrumb
  /**
   * A Breadcrumb (UI.md §2.3): 14 / 600, "Bank › Loan"; the first crumb is Back.
   * @param {{items: {label: string, onClick: function}[], id: string}} o the last item is current
   * @returns {HTMLElement}
   */
  function breadcrumb(o) {
    o = o || {};
    var el = h('nav', { class: 'crumbs', 'aria-label': t('ui.aria.breadcrumb'), 'data-id': o.id || 'breadcrumb' });
    var items = o.items || [];
    items.forEach(function (it, i) {
      var last = i === items.length - 1;
      if (i) el.appendChild(h('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '›'));
      if (last) el.appendChild(h('span', { class: 'crumb crumb--here', 'aria-current': 'page' }, t(it.label, it.vars)));
      else {
        var b = h('button', { type: 'button', class: ['crumb', i === 0 ? 'crumb--back' : ''], 'data-nav': '', 'data-id': 'crumb-' + i },
          i === 0 ? h('span', { class: 'crumb-arrow', 'aria-hidden': 'true' }, '‹') : null, t(it.label, it.vars));
        if (i === 0) b.setAttribute('aria-label', t('ui.back') + ': ' + t(it.label, it.vars));
        b.addEventListener('click', function () { D().sfx('click'); if (it.onClick) it.onClick(); });
        el.appendChild(b);
      }
    });
    return el;
  }

  // ------------------------------------------------------------------ ContextPrompt
  /**
   * The ContextPrompt (UI.md §2.3): a 480 × 64 card at the bottom left: KeyHint + verb + object +
   * a detail ("[E] Enter McSticks"); fades 150 ms. The city announces it (UI.md §8).
   * @param {{action: string, verb: string, object: string, detail: string, id: string}} o
   * @returns {HTMLElement} el.show(opts), el.hide()
   */
  function contextPrompt(o) {
    var el = h('div', { class: 'ctx-prompt paper', 'data-id': (o && o.id) || 'context-prompt', role: 'status' });
    var last = '';
    el.show = function (p) {
      p = p || {};
      D().clear(el);
      var verb = t(p.verb, p.vars), obj = t(p.object, p.vars);
      el.appendChild(keyHint({ action: p.action || 'interact' }));
      el.appendChild(h('span', { class: 'ctx-main' }, h('b', { class: 'ctx-verb' }, verb), ' ', h('span', { class: 'ctx-obj' }, obj)));
      if (p.detail) el.appendChild(h('span', { class: 'ctx-detail t-small' }, t(p.detail, p.vars)));
      el.classList.add('is-shown');
      var line = verb + ' ' + obj;
      if (line !== last) { last = line; D().announce(line); }
      return el;
    };
    el.hide = function () { el.classList.remove('is-shown'); last = ''; return el; };
    if (o && (o.verb || o.object)) el.show(o);
    return el;
  }

  Object.assign(SR.ui, {
    button: button,
    iconButton: iconButton,
    chip: chip,
    actionRow: actionRow,
    speech: speech,
    meter: meter,
    clockRing: clockRing,
    statChip: statChip,
    karmaMedallion: karmaMedallion,
    tabs: tabs,
    segmented: segmented,
    numberField: numberField,
    textField: textField,
    slider: slider,
    toggle: toggle,
    list: list,
    keyHint: keyHint,
    tooltip: tooltip,
    portrait: portrait,
    sparkline: sparkline,
    lineChart: lineChart,
    progress: progress,
    badge: badge,
    breadcrumb: breadcrumb,
    contextPrompt: contextPrompt,
    swipe: swipe,
  });
  SR.ui.STATS = STATS;

  SR.onBoot(50, function () {
    if (typeof document === 'undefined') return;
    SR.events.on('input:device', function () { keyHint.refreshAll(); });
    SR.events.on('settings:changed', function (p) { if (p && /^controls/.test(String(p.key || ''))) keyHint.refreshAll(); });
  });
})();
