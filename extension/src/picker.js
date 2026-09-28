// Element picker: point at anything on YouTube, click, and it becomes a custom hide rule. Runs in the isolated world
// next to content.js; its UI lives in a closed shadow root so YouTube's styles can't reach it.
const YFFPicker = (() => {
  'use strict';

  const STABLE_ATTRS = ['page-subtype', 'target-id', 'is-shorts', 'tab-title', 'overlay-style'];
  const MAX_OUTLINES = 60;
  let session = null;

  const goodId = (id) => /^[a-zA-Z][\w-]*$/.test(id) && !/\d{4,}/.test(id);
  const quote = (value) => `"${value.replace(/["\\]/g, '\\$&')}"`;
  const isCustom = (el) => el.localName.includes('-');
  const meaningful = (el) => isCustom(el) || (el.id && goodId(el.id)) || STABLE_ATTRS.some((a) => el.hasAttribute(a));

  const segment = (el) => {
    let s = el.id && goodId(el.id) ? `${isCustom(el) ? el.localName : ''}#${CSS.escape(el.id)}` : el.localName;
    for (const a of STABLE_ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const value = el.getAttribute(a);
      s += value ? `[${a}=${quote(value)}]` : `[${a}]`;
    }
    return s;
  };

  const count = (selector) => {
    try {
      return document.querySelectorAll(selector).length;
    } catch {
      return -1;
    }
  };

  // The element's own segment, then meaningful ancestors (custom elements, ids, stable attributes) added only while
  // each one narrows the matches. Repeated things (a badge on every video) stay general; one-offs become unique.
  const selectorFor = (el) => {
    const parts = [segment(el)];
    let best = parts[0];
    for (let node = el.parentElement; node && node !== document.body && parts.length < 5; node = node.parentElement) {
      if (count(best) <= 1) break;
      if (!meaningful(node)) continue;
      const candidate = [segment(node), ...parts].join(' ');
      if (count(candidate) < count(best)) {
        parts.unshift(segment(node));
        best = candidate;
      }
    }
    return best;
  };

  const TEMPLATE = `
    <style>
      :host { all: initial; }
      .outline { position: fixed; pointer-events: none; z-index: 2147483646; box-sizing: border-box;
        border: 2px solid #ff4e45; background: rgba(255, 78, 69, .14); border-radius: 3px; }
      .outline.hover { border-style: dashed; background: rgba(255, 78, 69, .08); }
      .panel { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: min(420px, calc(100vw - 32px));
        box-sizing: border-box; padding: 12px 14px; border-radius: 12px; background: #1f1f1f; color: #f1f1f1;
        font: 13px/1.4 system-ui, sans-serif; box-shadow: 0 8px 28px rgba(0, 0, 0, .45); }
      .panel b { font-size: 14px; }
      .panel p { margin: 4px 0 8px; color: #aaa; }
      input, select, button { font: inherit; color: inherit; }
      input { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #444; border-radius: 6px;
        background: #121212; font-family: ui-monospace, monospace; font-size: 12px; }
      input.bad { border-color: #ff4e45; }
      .row { display: flex; gap: 6px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
      .count { color: #aaa; margin-right: auto; }
      button, select { padding: 5px 10px; border: 1px solid #444; border-radius: 6px; background: #2b2b2b; cursor: pointer; }
      button.primary { background: #ff4e45; border-color: #ff4e45; color: #fff; }
      button:disabled { opacity: .5; cursor: default; }
    </style>
    <div class="outlines"></div>
    <div class="panel">
      <b>Hide an element</b>
      <p class="hint">Click something on the page. ↑ ↓ wider / narrower · Enter saves · Esc cancels</p>
      <input class="selector" spellcheck="false" placeholder="CSS selector" />
      <div class="row">
        <span class="count"></span>
        <button class="wider" title="Parent (↑)">↑ Wider</button>
        <button class="narrower" title="Back toward what you clicked (↓)">↓ Narrower</button>
      </div>
      <div class="row">
        <select class="scope"></select>
        <span style="margin-right:auto"></span>
        <button class="cancel">Cancel</button>
        <button class="save primary">Hide</button>
      </div>
    </div>`;

  const start = ({ initial = null, page = 'all', onSave }) => {
    if (session) return;
    const host = document.createElement('yff-picker');
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = TEMPLATE;
    document.documentElement.append(host);
    const $ = (s) => shadow.querySelector(s);
    const input = $('.selector');
    const scope = $('.scope');
    scope.innerHTML = [page, 'all']
      .filter((p, i, a) => p in YFF.PAGE_LABELS && a.indexOf(p) === i)
      .map((p) => `<option value="${p}">${p === 'all' ? 'On every page' : `Only on ${YFF.PAGE_LABELS[p]}`}</option>`)
      .join('');

    const state = { hovered: null, chain: null, level: 0 };
    session = { host };

    const draw = () => {
      const boxes = [];
      const outline = (el, cls = '') => {
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return;
        boxes.push(`<div class="outline ${cls}" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px"></div>`);
      };
      if (state.chain) {
        const n = count(input.value);
        input.classList.toggle('bad', n < 0);
        $('.count').textContent = n < 0 ? 'Not a valid selector' : `${n} match${n === 1 ? '' : 'es'}`;
        $('.save').disabled = n <= 0;
        if (n > 0) [...document.querySelectorAll(input.value)].slice(0, MAX_OUTLINES).forEach((el) => outline(el));
      } else if (state.hovered) {
        outline(state.hovered, 'hover');
      }
      $('.outlines').innerHTML = boxes.join('');
      $('.wider').disabled = !state.chain?.length || state.level >= state.chain.length - 1;
      $('.narrower').disabled = !state.chain?.length || state.level === 0;
    };

    const select = (el) => {
      state.chain = [];
      for (let node = el; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
        state.chain.push(node);
      }
      state.level = 0;
      input.value = selectorFor(el);
      draw();
    };
    const move = (delta) => {
      if (!state.chain?.length) return;
      state.level = Math.min(Math.max(state.level + delta, 0), state.chain.length - 1);
      input.value = selectorFor(state.chain[state.level]);
      draw();
    };

    const close = () => {
      for (const [type, fn] of listeners) window.removeEventListener(type, fn, true);
      host.remove();
      session = null;
    };
    const save = () => {
      if (count(input.value) <= 0) return;
      onSave({ selector: input.value.trim(), page: scope.value, added: Date.now() });
      close();
    };

    const own = (event) => event.composedPath().includes(host);
    const block = (event) => {
      if (own(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    let frame = 0;
    const redraw = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), draw()));
    };

    const listeners = [
      ['mousemove', (event) => {
        if (own(event) || state.chain) return;
        state.hovered = event.target;
        redraw();
      }],
      ['click', (event) => {
        if (own(event)) return;
        block(event);
        select(event.target);
      }],
      ...['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'dblclick', 'contextmenu'].map((t) => [t, block]),
      ['keydown', (event) => {
        if (event.key === 'Escape') close();
        else if (event.key === 'Enter') save();
        else if (event.key === 'ArrowUp' && !own(event)) move(1);
        else if (event.key === 'ArrowDown' && !own(event)) move(-1);
        else return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }],
      ['scroll', redraw],
      ['resize', redraw],
    ];
    for (const [type, fn] of listeners) window.addEventListener(type, fn, true);

    input.addEventListener('input', () => {
      if (!state.chain) state.chain = [];
      draw();
    });
    $('.wider').addEventListener('click', () => move(1));
    $('.narrower').addEventListener('click', () => move(-1));
    $('.cancel').addEventListener('click', close);
    $('.save').addEventListener('click', save);

    if (initial) select(initial);
    else draw();
  };

  return { start, selectorFor };
})();
