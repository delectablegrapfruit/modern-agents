// tests/e2e/stage.test.cjs — owner: W1-K (lead). The stage (ARCHITECTURE §2; BUILD_PLAN §3.1):
// the letterbox at 1280×720, 1920×1080, 2560×1080, 1366×768 and 800×1280 (canvas and UI on the
// same pixel-aligned box, the bars in the sky's horizon colour), the backing store (DPR, the
// preset's renderScale, the 2560 × 1440 cap), toLogical, the debounced resize with stage:resized,
// the touch-compact layout at 844×390 on a coarse pointer, the portrait card, and the crispness
// check at 1366×768 (a sharpness metric on text in #ui versus 1280×720 and a blurred control).
//   node tests/e2e/stage.test.cjs        (screenshots: shots/W1-K-M1/stage-*.png)
'use strict';
const path = require('path');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W1-K-M1');
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 0.01 : eps);

/** The layout facts of the page: stage box, canvas and #ui rects, backing store, #app background. */
function facts(page) {
  return page.evaluate(() => {
    const SR = window.SR;
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
    return {
      win: [innerWidth, innerHeight], dpr: devicePixelRatio,
      k: SR.stage.k, uiK: SR.stage.uiK, sdpr: SR.stage.dpr, scale: SR.stage.scale, compact: SR.stage.compact, portrait: SR.stage.portrait,
      stage: r(document.getElementById('stage')), world: r(SR.stage.world), fx: r(SR.stage.fx), ui: r(document.getElementById('ui')),
      backing: [SR.stage.world.width, SR.stage.world.height], fxBacking: [SR.stage.fx.width, SR.stage.fx.height],
      transform: (() => { const m = SR.stage.ctx.getTransform(); return [m.a, m.d]; })(),
      bg: getComputedStyle(document.getElementById('app')).backgroundColor,
      horizon: SR.stage.horizon(SR.state ? SR.state.clock.min : 720),
      layout: document.getElementById('app').getAttribute('data-layout'),
    };
  });
}
// Chrome keeps layout positions in 1/64 CSS px (LayoutUnit), so "on a device pixel" allows that step.
const onDevicePx = (v, dpr) => Math.abs(v * dpr - Math.round(v * dpr)) <= dpr / 64 + 1e-9;
const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return 'rgb(' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(', ') + ')'; };

(async () => {
  const T = h.suite('e2e stage');

  T.section('letterbox');
  for (const [w, hh] of [[1280, 720], [1920, 1080], [2560, 1080], [1366, 768], [800, 1280]]) {
    const t = await h.open({ width: w, height: hh });
    const f = await facts(t.page);
    const k0 = Math.min(w / 1280, hh / 720);
    const k = Math.floor(1280 * k0 + 1e-6) / 1280;
    const label = w + '×' + hh;
    T.ok(near(f.k, k, 1e-9) && near(f.stage.w, 1280 * k) && near(f.stage.h, 720 * k), label + ': the stage is 1280k × 720k with k = ' + k.toFixed(4), f.stage);
    T.ok(near(f.stage.x, Math.round((w - 1280 * k) / 2)) && near(f.stage.y, Math.round((hh - 720 * k) / 2)), label + ': centred in the window', f.stage);
    T.ok(onDevicePx(f.stage.x, f.dpr) && onDevicePx(f.stage.y, f.dpr) && onDevicePx(f.stage.w, f.dpr), label + ': left, top and width sit on whole device pixels');
    T.ok(['world', 'fx', 'ui'].every((n) => near(f[n].x, f.stage.x) && near(f[n].y, f.stage.y) && near(f[n].w, f.stage.w) && near(f[n].h, f.stage.h)),
      label + ': canvas#world, canvas#fx and #ui (zoom ' + f.uiK.toFixed(4) + ') cover exactly the stage box', { world: f.world, ui: f.ui });
    T.eq([f.backing, f.fxBacking, f.compact, f.layout], [[Math.round(1280 * k), Math.round(720 * k)], [Math.round(1280 * k), Math.round(720 * k)], false, 'stage'], label + ': backing store 1280·k·dpr at DPR 1 (both canvases)');
    T.ok(near(f.transform[0], f.backing[0] / 1280, 1e-6) && near(f.transform[1], f.backing[1] / 720, 1e-6), label + ': the context transform maps logical units to the backing store');
    T.eq(f.bg, rgbOf(f.horizon), label + ': the bars show the sky horizon colour (' + f.horizon + '), never black');
    const mid = await t.page.evaluate(([x, y]) => window.SR.stage.toLogical(x, y), [f.stage.x + f.stage.w / 2, f.stage.y + f.stage.h / 2]);
    const corner = await t.page.evaluate(([x, y]) => window.SR.stage.toLogical(x, y), [f.stage.x, f.stage.y + f.stage.h]);
    T.ok(near(mid.x, 640, 0.01) && near(mid.y, 360, 0.01) && near(corner.x, 0, 0.01) && near(corner.y, 720, 0.01), label + ': toLogical maps the stage centre to (640, 360) and its corner to (0, 720)', [mid, corner]);
    await t.page.evaluate(() => { const d = document.createElement('div'); d.setAttribute('data-id', 'test-grid'); d.style.cssText = 'position:absolute;left:0;top:0;width:1280px;height:720px;box-sizing:border-box;border:8px solid var(--primary-500);'; document.getElementById('ui').appendChild(d); });
    await t.shot(path.join(SHOTS, 'stage-' + w + 'x' + hh + '.png'));
    T.eq(t.errors(), [], label + ': zero console errors');
    await t.close();
  }

  T.section('device pixels, presets, the cap');
  {
    const t = await h.open({ width: 1920, height: 1080, dpr: 2 });
    let f = await facts(t.page);
    T.eq([f.k, f.sdpr, f.backing, f.scale], [1.5, 2, [2560, 1440], 2], '1920×1080 at DPR 2: dpr 2, the backing store is capped at 2560 × 1440');
    await t.quality('medium');
    f = await facts(t.page);
    T.eq([f.sdpr, f.backing], [1.5, [2560, 1440]], 'Medium caps DPR at 1.5 (the cap still holds)');
    await t.quality('low');
    f = await facts(t.page);
    T.eq([f.sdpr, f.backing, f.scale], [1, [1440, 810], 1.125], 'Low: DPR 1 and renderScale 0.75 → 1440 × 810, scale 1.125');
    await t.quality('high');
    await t.close();
  }
  {
    const t = await h.open({ width: 3840, height: 2160 });
    const f = await facts(t.page);
    T.eq([f.k, f.stage.w, f.backing], [3, 3840, [2560, 1440]], '3840×2160 at DPR 1: k 3, the backing store capped at 2560 × 1440');
    await t.close();
  }
  {
    const t = await h.open({ width: 1366, height: 768, dpr: 1.5 });
    const f = await facts(t.page);
    T.ok(onDevicePx(f.stage.x, 1.5) && onDevicePx(f.stage.w, 1.5) && f.backing[0] === Math.round(f.stage.w * 1.5), 'a fractional DPR (1.5) keeps the stage on whole device pixels (within Chrome\'s 1/64 px layout step)', f);
    await t.close();
  }

  T.section('resize');
  {
    const t = await h.open({ width: 1280, height: 720 });
    await t.page.evaluate(() => { window.__resized = []; window.SR.events.on('stage:resized', (p) => window.__resized.push(p)); });
    await t.page.setViewportSize({ width: 1600, height: 900 });
    await t.page.setViewportSize({ width: 1700, height: 900 });
    await t.page.setViewportSize({ width: 1920, height: 1080 });
    const early = await t.page.evaluate(() => window.__resized.length);
    await t.page.waitForTimeout(400);
    const ev = await t.page.evaluate(() => window.__resized);
    T.eq(early, 0, 'window resizes are debounced (nothing yet right after them)');
    T.eq(ev, [{ k: 1.5, uiK: 1.5, dpr: 1, scale: 1.5, compact: false }], 'one stage:resized { k, uiK, dpr, scale, compact } after 150 ms');
    const f = await facts(t.page);
    T.eq([f.stage.w, f.backing], [1920, [1920, 1080]], 'and the stage follows the new window');
    await t.page.evaluate(() => window.SR.stage.resize());
    T.eq(await t.page.evaluate(() => window.__resized.length), 1, 'a layout that changes nothing emits nothing');
    const fs = await t.page.evaluate(() => window.SR.stage.fullscreen(true).then((on) => ({ on, type: typeof on })));
    T.eq(fs.type, 'boolean', 'fullscreen() resolves to a boolean (a headless page without a gesture stays windowed)');
    T.eq(t.errors(), [], 'zero console errors');
    await t.close();
  }

  T.section('touch-compact layout (844×390, coarse pointer)');
  {
    const t = await h.open({ width: 844, height: 390, dpr: 3, touch: true });
    const f = await facts(t.page);
    const k = Math.floor(1280 * (390 / 720) * 3 + 1e-6) / (1280 * 3);
    T.eq([f.compact, f.uiK, f.layout, f.portrait], [true, 0.92, 'compact', false], 'coarse pointer and k < 0.92: compact layout, uiK 0.92, #app[data-layout=compact]');
    T.ok(near(f.k, k, 1e-9) && near(f.world.w, 1280 * k) && near(f.world.x, f.stage.x) && near(f.world.y, 0), 'the world canvases keep the letterboxed stage', f.world);
    T.ok(near(f.ui.x, 0) && near(f.ui.y, 0) && near(f.ui.w, 844) && near(f.ui.h, 390), '#ui covers the whole window', f.ui);
    const box = await t.page.evaluate(() => { const u = document.getElementById('ui'); return { w: parseFloat(u.style.width), h: parseFloat(u.style.height) }; });
    T.ok(near(box.w, 844 / 0.92, 0.01) && near(box.h, 390 / 0.92, 0.01), '#ui is a logical box of winW / 0.92 × winH / 0.92', box);
    T.eq(f.sdpr, 1.5, 'the touch-compact profile caps DPR at 1.5 (device DPR 3)');
    const target = await t.page.evaluate(() => {
      const b = document.createElement('button');
      b.setAttribute('data-id', 'test-target');
      b.style.cssText = 'position:absolute;right:16px;bottom:16px;width:48px;height:48px';
      document.getElementById('ui').appendChild(b);
      const r = b.getBoundingClientRect();
      return { w: r.width, right: innerWidth - r.right, bottom: innerHeight - r.bottom };
    });
    T.ok(target.w >= 44 && near(target.right, 16 * 0.92, 0.05) && near(target.bottom, 16 * 0.92, 0.05), 'a 48-unit touch target is ≥ 44 CSS px and anchors to the window edge', target);
    await t.shot(path.join(SHOTS, 'stage-844x390-touch.png'));
    T.eq(t.errors(), [], 'zero console errors');
    await t.close();
  }
  {
    const t = await h.open({ width: 1280, height: 800, touch: true });
    const f = await facts(t.page);
    T.eq([f.compact, f.uiK], [false, 1], 'a coarse pointer with k ≥ 0.92 (a tablet) keeps the regular layout');
    await t.close();
  }
  {
    const t = await h.open({ width: 844, height: 390 });
    const f = await facts(t.page);
    T.eq([f.compact, f.layout], [false, 'stage'], 'a fine pointer at 844×390 stays letterboxed (no compact layout)');
    await t.close();
  }

  T.section('portrait card');
  {
    const t = await h.open({ width: 390, height: 844, dpr: 3, touch: true });
    let f = await facts(t.page);
    const card = t.page.locator('#ui [data-id="stage-portrait"]');
    T.eq([f.portrait, await card.isVisible()], [true, true], 'portrait on a coarse pointer shows the "turn your device" card');
    const rect = await card.evaluate((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    T.ok(near(rect[0], 0) && near(rect[1], 0) && near(rect[2], 390) && near(rect[3], 844), 'it covers the stage (the whole window in the compact layout)', rect);
    T.ok(await t.page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-id') === 'stage-portrait-play'), '"Play anyway" has focus');
    await t.shot(path.join(SHOTS, 'stage-390x844-portrait.png'));
    await t.clickUI('stage-portrait-play');
    T.eq(await card.isVisible(), false, '"Play anyway" dismisses it');
    await t.resize(400, 860);
    f = await facts(t.page);
    T.eq([f.portrait, await card.isVisible()], [true, false], 'and it stays dismissed in portrait (the letterbox is kept)');
    T.ok(near(f.world.w, 400 * 1) || f.world.w <= 400, 'the stage stays letterboxed', f.world);
    await t.page.evaluate(() => window.SR.stage.resetPortrait());
    T.eq(await card.isVisible(), true, 'resetPortrait() shows it again');
    await t.key('Enter');
    T.eq(await card.isVisible(), false, 'Enter on the focused "Play anyway" dismisses it too (keyboard)');
    await t.page.evaluate(() => window.SR.stage.resetPortrait());
    await t.resize(844, 390);
    T.eq(await card.isVisible(), false, 'turning the device sideways removes it');
    T.eq(t.errors(), [], 'zero console errors');
    await t.close();
  }

  // ARCHITECTURE §2 names 1366 × 768 with k = 0.7125, but a 1366 × 768 window gives k = 768 / 720
  // ≈ 1.066; k = 0.7125 is a 912 × 513 window. Both fractional scales are checked.
  // The check: text in #ui (16 px, zoomed by k) is screenshotted next to the same text laid out
  // natively at 16·k px at the same sub-pixel offset. CSS zoom lays out and rasterises text at the
  // final size, so the two must match pixel for pixel; a control (the text drawn at the 1280 scale
  // into a canvas that the browser then scales) must not, which shows the comparison can see blur.
  T.section('crispness at 1366×768 (k ≈ 1.066) and 912×513 (k = 0.7125)');
  const crisp = async (w, hh, mode) => {
    const t = await h.open({ width: w, height: hh });
    const rect = await t.page.evaluate((mode) => {
      const k = window.SR.stage.k;
      const txt = 'The quick brown fox jumps over 12,345 lazy dogs. $1,240 · 14:30 · +2 INT. The quick brown fox jumps over the lazy dog.';
      const css = 'box-sizing:border-box;background:var(--paper-0);color:var(--ink-900);font-weight:600;font-family:system-ui, sans-serif;line-height:1.4;overflow:hidden;';
      const a = document.createElement('div');
      a.setAttribute('data-id', 'test-text');
      a.style.cssText = 'position:absolute;left:40px;top:40px;width:900px;height:96px;padding:12px;font-size:16px;' + css;
      document.getElementById('ui').appendChild(a);
      if (mode === 'bitmap') {
        a.style.padding = '0';
        const c = document.createElement('canvas');
        c.width = 900; c.height = 96;
        a.appendChild(c);
        const g = c.getContext('2d');
        g.fillStyle = getComputedStyle(a).backgroundColor; g.fillRect(0, 0, 900, 96);
        g.fillStyle = getComputedStyle(a).color; g.font = '600 16px system-ui, sans-serif'; g.textBaseline = 'top';
        g.fillText(txt.slice(0, 80), 12, 14); g.fillText(txt.slice(80), 12, 36);
      } else {
        a.textContent = txt;
      }
      const ra = a.getBoundingClientRect();
      const b = document.createElement('div');
      b.setAttribute('data-id', 'test-text-native');
      b.style.cssText = 'position:fixed;z-index:999;left:' + ra.left + 'px;top:' + (ra.top + 200) + 'px;width:' + ra.width + 'px;height:' + ra.height + 'px;padding:' + 12 * k + 'px;font-size:' + 16 * k + 'px;' + css;
      b.textContent = txt;
      document.getElementById('app').appendChild(b);
      return { x: Math.ceil(ra.left), y: Math.ceil(ra.top), width: Math.floor(ra.width) - 2, height: Math.floor(ra.height) - 2 };
    }, mode);
    const zoomed = await t.page.screenshot({ clip: rect });
    const native = await t.page.screenshot({ clip: Object.assign({}, rect, { y: rect.y + 200 }) });
    if (mode === 'text') await t.shot(path.join(SHOTS, 'stage-' + w + 'x' + hh + '-text.png'));
    const r = await t.page.evaluate(([a, b]) => Promise.all([a, b].map((src) => new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        res(g.getImageData(0, 0, c.width, c.height).data);
      };
      img.src = 'data:image/png;base64,' + src;
    }))).then(([A, B]) => {
      let sum = 0, n = 0, lo = 255, hi = 0;
      for (let i = 0; i < A.length; i += 4) {
        const la = 0.299 * A[i] + 0.587 * A[i + 1] + 0.114 * A[i + 2], lb = 0.299 * B[i] + 0.587 * B[i + 1] + 0.114 * B[i + 2];
        sum += Math.abs(la - lb); n++; lo = Math.min(lo, lb); hi = Math.max(hi, lb);
      }
      return { diff: sum / n / Math.max(1, hi - lo), contrast: hi - lo };
    }), [zoomed.toString('base64'), native.toString('base64')]);
    r.k = await t.page.evaluate(() => window.SR.stage.k);
    r.errors = t.errors();
    await t.close();
    return r;
  };
  for (const [w, hh, k] of [[1366, 768, 1365 / 1280], [912, 513, 0.7125]]) {
    const z = await crisp(w, hh, 'text');
    const b = await crisp(w, hh, 'bitmap');
    T.ok(Math.abs(z.k - k) < 1e-9, w + '×' + hh + ': k = ' + z.k);
    T.ok(z.contrast > 150, w + '×' + hh + ': the sample has full ink-on-paper contrast', z);
    T.ok(z.diff <= 0.01, w + '×' + hh + ': text in #ui matches text rasterised natively at the final size (difference ' + z.diff.toFixed(4) + ' ≤ 0.01): crisp');
    T.ok(b.diff >= 0.03, w + '×' + hh + ': the comparison sees blur (the browser-scaled bitmap differs by ' + b.diff.toFixed(4) + ')');
    T.eq(z.errors, [], w + '×' + hh + ': zero console errors');
  }
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
