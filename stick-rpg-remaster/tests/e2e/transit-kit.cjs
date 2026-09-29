// tests/e2e/transit-kit.cjs — owner: W2-Transit. Shared helpers for the W2-Transit e2e suites
// (tests/e2e/{bus,jail,hospital}.test.cjs): open the game page with a new game, record events, read a
// W2-Transit scene's info(), let a transition and the CSS entrances settle before a screenshot. Not a
// test itself.
'use strict';
const path = require('path');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Transit');

/**
 * Opens index.html with a new game (seed 7) and an event recorder (window.__ev: [{ n, p }]).
 * @param {object=} opts harness options (fast defaults to true)
 */
async function open(opts) {
  const t = await h.open(Object.assign({ fast: true }, opts || {}));
  await t.newGame({ seed: 7 });
  await t.page.evaluate(() => {
    const SR = window.SR;
    window.__ev = [];
    ['trip', 'jail', 'release', 'night', 'day:started', 'player:down', 'game:over', 'action:done', 'down'].forEach((n) => {
      SR.events.on(n, (p) => window.__ev.push({ n, p: n === 'action:done' ? { id: p.id, ok: p.result.ok } : n === 'day:started' ? { day: p.day, kind: p.report && p.report.kind } : p }));
    });
  });
  return t;
}

/** @returns {Promise<object[]>} the recorded events named (all when names is omitted), then clears them. */
async function events(t, names) {
  return t.page.evaluate((names) => {
    const out = window.__ev.filter((e) => !names || names.indexOf(e.n) >= 0).map((e) => JSON.parse(JSON.stringify(e)));
    window.__ev.length = 0;
    return out;
  }, names || null);
}

/** @returns {Promise<object|null>} a scene's info() (the W2-Transit scenes expose one for tests). */
function info(t, scene) {
  return t.page.evaluate((id) => { const d = window.SR.scenes.get(id); return d && d.info ? JSON.parse(JSON.stringify(d.info())) : null; }, scene);
}

/** Lets the CSS entrances (350 ms) and a scene transition finish, then renders one frame. */
async function settle(t, ms) {
  await t.page.waitForTimeout(ms === undefined ? 420 : ms);
  await t.step(1);
}

/** @returns {Promise<string>} the text of the visible #ui element with data-id ('' when absent). */
function text(t, dataId) {
  return t.page.evaluate((id) => {
    const els = Array.prototype.filter.call(document.querySelectorAll('#ui [data-id="' + id + '"]'), (e) => e.offsetParent !== null || e.getClientRects().length);
    return els.length ? els[0].textContent.trim() : '';
  }, dataId);
}

/** @returns {Promise<boolean>} the #ui element with data-id exists and is visible. */
function visible(t, dataId) {
  return t.page.evaluate((id) => {
    const e = document.querySelector('#ui [data-id="' + id + '"]');
    if (!e) return false;
    const r = e.getBoundingClientRect();
    return !e.closest('[hidden]') && r.width > 0 && r.height > 0;
  }, dataId);
}

/** Finds a seed (1..n) for which fn(seed) resolves true (fixed seeds make each outcome replayable). */
async function seedFor(n, fn) {
  for (let seed = 1; seed <= n; seed++) if (await fn(seed)) return seed;
  return null;
}

module.exports = { h, SHOTS, open, events, info, settle, text, visible, seedFor };
