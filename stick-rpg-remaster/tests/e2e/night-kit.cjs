// tests/e2e/night-kit.cjs — owner: W2-Night. Shared helpers for the W2-Night e2e suites
// (bar, casino, fight, darts): open the game over file:// with the page-side recorders (#aria
// lines, minigame:done payloads, the actions the scenes receive), read the open engine's peek(),
// step until a condition holds, and take screenshots into shots/W2-Night/ (git-ignored).
// Not a suite itself (run-all runs *.test.cjs only).
'use strict';
const path = require('path');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Night');

/** Page-side recorders, installed once per page (and again after a reload). */
function install(page) {
  return page.evaluate(() => {
    window.__aria = [];
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.textContent) window.__aria.push(n.textContent); })))
      .observe(document.getElementById('aria'), { childList: true, subtree: true });
    window.__done = [];
    SR.events.on('minigame:done', (p) => window.__done.push(JSON.parse(JSON.stringify(p))));
    window.__acted = [];
    SR.events.on('action:done', (p) => window.__acted.push({ id: p.id, ok: p.result.ok, reason: p.result.reason || null,
      events: (p.result.events || []).map((e) => ({ name: e.name, payload: e.payload })), toasts: (p.result.toasts || []).map((x) => x.key) }));
    window.__acts = [];
    const orig = SR.scenes.dispatch;
    SR.scenes.dispatch = function (a, ev) { window.__acts.push({ a, code: ev && ev.code, ctx: ev && ev.context }); return orig.apply(this, arguments); };
    // A matcher for a text key's template ({vars} match anything), so checks never hard-code wording.
    window.__re = (key) => {
      const v = SR.reg.text[key];
      const src = String(Array.isArray(v) ? v[0] : v).replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\w+\}/g, '[\\s\\S]*?');
      return new RegExp(src);
    };
    window.__heard = (key) => window.__aria.filter((s) => window.__re(key).test(s)).length;
  });
}

/**
 * Opens the game and installs the recorders.
 * @returns {Promise<object>} the harness page object plus helpers
 */
async function open(opts) {
  const t = await h.open(opts || {});
  await install(t.page);
  const E = (fn, arg) => t.page.evaluate(fn, arg);
  const k = {
    t, E,
    /** @returns {Promise<object|null>} the open engine's peek() */
    peek: () => E(() => { const c = SR.minigame.current(); return c && c.inst && c.inst.peek ? JSON.parse(JSON.stringify(c.inst.peek())) : null; }),
    /** @returns {Promise<object|null>} the frame's state */
    cur: () => E(() => {
      const c = SR.minigame.current();
      return c ? { id: c.id, skin: c.skin, panel: c.panel, finished: c.finished, replaying: c.replaying, context: c.context, contextPushed: c.contextPushed, device: c.device, params: JSON.parse(JSON.stringify(c.params)) } : null;
    }),
    /** Steps until fn(peek) holds (or max steps); @returns the last peek */
    until: async (fn, max, stepN) => {
      let p = null;
      for (let i = 0; i < (max || 600); i++) {
        p = await k.peek();
        if (fn(p)) return p;
        await t.step(stepN || 5);
      }
      return p;
    },
    /** Steps until the minigame frame has closed. */
    closed: async (max) => {
      for (let i = 0; i < (max || 400); i++) {
        if ((await t.scenes()).indexOf('minigame') < 0) return true;
        await t.step(10);
      }
      return false;
    },
    aria: () => E(() => window.__aria.slice()),
    heard: (key) => E((key) => window.__heard(key), key),
    done: () => E(() => window.__done.slice()),
    acted: () => E(() => window.__acted.slice()),
    clearLogs: () => E(() => { window.__aria.length = 0; window.__done.length = 0; window.__acted.length = 0; window.__acts.length = 0; }),
    acts: () => E(() => window.__acts.slice()),
    shot: (name) => t.shot(path.join(SHOTS, name + '.png')),
    state: (p) => E((p) => { let v = SR.state; String(p || '').split('.').filter(Boolean).forEach((x) => { v = v == null ? v : v[x]; }); return JSON.parse(JSON.stringify(v === undefined ? null : v)); }, p),
    /** Clears stamps and toasts (a stamp swallows the next press, and the loop is paused in tests). */
    quiet: () => E(() => { if (SR.ui.stamp && SR.ui.stamp.clear) SR.ui.stamp.clear(); if (SR.ui.toast && SR.ui.toast.clear) SR.ui.toast.clear(); }),
    /** Runs a card row by a real click and steps a frame. */
    row: async (id) => { await t.clickUI('row-' + id); await t.step(2); },
    /** The a11y audit of W1-Q (names, roles, contrast, text size) on a root: @returns issues */
    audit: async (sel) => {
      // CSS fade-ins run on wall-clock time; SR.debug.fast zeroes them for the audit, then is restored.
      const was = await E(() => { const f = SR.debug.fast(); SR.debug.fast(true); return f; });
      await t.step(1);
      const r = (await t.eval(require('./a11y.test.cjs').audit, sel || '[data-id="mg-frame"]')).issues;
      await E((was) => SR.debug.fast(was), was);
      return r;
    },
    /** Sets the rules stream to a seed's state. */
    rngSeed: (seed) => E((seed) => { SR.rng.rules.setState(SR.rng.create(seed).state()); }, seed),
  };
  return k;
}

module.exports = { open, install, SHOTS, h };
