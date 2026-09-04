/* Shared test harness: static server with Range support, headless Chromium
 * with the unpacked extension loaded, and input helpers. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startStaticServer } from './helpers/static-server.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const EXTENSION_DIR = join(ROOT, 'extension');
export const FIXTURES_DIR = join(ROOT, 'test', 'fixtures');

/* Serve the fixtures over http (same-origin, Range-capable, so <video> can
 * seek and canvas reads stay untainted). `url` ends with a slash. */
export async function startServer(dir = FIXTURES_DIR) {
  const srv = await startStaticServer(dir);
  return { url: srv.url + '/', close: srv.close };
}

export async function launchWithExtension() {
  const userDataDir = await mkdtemp(join(tmpdir(), 'scroll-to-scrub-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
    ],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;
  return {
    context,
    worker,
    extensionId,
    async close() {
      await context.close().catch(() => {});
      await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

/* Write settings through the service worker (chrome.storage.sync) and wait
 * until the content script in `page` has picked them up. */
export async function setSettings(worker, page, patch) {
  await worker.evaluate((p) => new Promise((resolve) => chrome.storage.sync.set(p, resolve)), patch);
  // storage.onChanged reaches content scripts asynchronously; give it a tick.
  if (page) await page.waitForTimeout(60);
}

export async function resetSettings(worker, page) {
  await worker.evaluate(
    () =>
      new Promise((resolve) => {
        const d = globalThis.ScrollToScrub.DEFAULTS;
        chrome.storage.sync.clear(() => chrome.storage.sync.set({ ...d }, resolve));
      })
  );
  if (page) await page.waitForTimeout(60);
}

/* Centre of the visible part of an element, in main-frame viewport
 * coordinates (Playwright reports boxes that way for elements inside iframes
 * too). Scrolls the element into view first. */
export async function centerOf(page, selector, frame = page) {
  const locator = frame.locator(selector);
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  const vp = page.viewportSize();
  const left = Math.max(0, box.x);
  const top = Math.max(0, box.y);
  const right = Math.min(vp.width, box.x + box.width);
  const bottom = Math.min(vp.height, box.y + box.height);
  if (right <= left || bottom <= top) throw new Error(`${selector} is not on screen`);
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

/* Dispatch one trusted wheel event at (x, y). `modifiers` is an array of
 * 'Shift' | 'Alt' | 'Control' | 'Meta'. */
export async function wheel(page, x, y, deltaX, deltaY, modifiers = []) {
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.move(x, y);
  await page.mouse.wheel(deltaX, deltaY);
  for (const m of modifiers) await page.keyboard.up(m);
}

/* A burst of `count` wheel events, `gapMs` apart. */
export async function wheelBurst(page, x, y, deltaX, deltaY, count, gapMs = 8, modifiers = []) {
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.move(x, y);
  for (let i = 0; i < count; i++) {
    await page.mouse.wheel(deltaX, deltaY);
    if (gapMs > 0) await page.waitForTimeout(gapMs);
  }
  for (const m of modifiers) await page.keyboard.up(m);
}

/* A burst dispatched straight through CDP without awaiting each ack, so the
 * events really arrive `periodMs` apart (page.mouse.wheel waits ~30 ms per
 * event for the renderer's ack). */
export async function wheelBurstFast(page, x, y, deltaX, deltaY, count, periodMs = 8) {
  const cdp = await page.context().newCDPSession(page);
  await page.mouse.move(x, y);
  const sends = [];
  await new Promise((resolve) => {
    let i = 0;
    const tick = () => {
      sends.push(
        cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY }).catch(() => {})
      );
      if (++i < count) setTimeout(tick, periodMs);
      else resolve();
    };
    tick();
  });
  await Promise.all(sends);
  await cdp.detach().catch(() => {});
}

/* Wait for every video on the page (including the frame) to have metadata
 * and be seekable. */
export async function waitForVideos(page) {
  await page.waitForFunction(
    () => {
      const all = [...document.querySelectorAll('video:not([data-lazy])')];
      const host = document.getElementById('shadowHost');
      if (host && host.shadowRoot) all.push(...host.shadowRoot.querySelectorAll('video'));
      if (typeof window.__closedVideo === 'function') all.push(window.__closedVideo());
      return all.length > 0 && all.every((v) => v.readyState >= 1 && v.seekable.length > 0);
    },
    null,
    { timeout: 20000 }
  );
}

export const near = (a, b, tol) => Math.abs(a - b) <= tol;
