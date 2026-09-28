#!/usr/bin/env node
// Renders the Home Screen web app's icons into Game/icons/: the same picture as the macOS icon (scripts/icon.swift) — a
// dusk-blue tile with a T piece floating above a low stack, its landing spot drawn as a dashed ghost — drawn on a
// canvas in headless Chromium. The PNGs are committed; run this again only when the design changes.
//   node Lull/scripts/web-icons.cjs
// Needs Playwright (npm i -g playwright, or NODE_PATH pointing at one).
'use strict';
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  ({ chromium } = require(path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright')));
}

const OUT = path.join(__dirname, '..', 'Game', 'icons');

// Every icon the page and the manifest name. kind: 'tile' is the macOS shape (a rounded tile on transparent), for
// browsers and Android's "any"; 'bleed' fills the square (iOS rounds the corners itself); 'maskable' fills the square
// and keeps the picture inside the centre circle a launcher may cut to (40% of the size).
const ICONS = [
  { file: 'icon-32.png', size: 32, kind: 'tile' },
  { file: 'apple-touch-icon.png', size: 180, kind: 'bleed' },
  { file: 'icon-192.png', size: 192, kind: 'tile' },
  { file: 'icon-512.png', size: 512, kind: 'tile' },
  { file: 'icon-maskable-512.png', size: 512, kind: 'maskable' },
];

// Runs in the page. Coordinates are the Swift renderer's, turned right way up (y grows downwards here).
function draw(px, kind) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const ctx = cv.getContext('2d');
  const rgb = (r, g, b, a = 1) => `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
  const top = [0.23, 0.27, 0.42], bottom = [0.07, 0.08, 0.13], accent = [0.56, 0.70, 1.0];
  const stack = [[0.49, 0.85, 0.56], [0.96, 0.76, 0.47], [0.92, 0.44, 0.57], [0.61, 0.81, 0.85]];
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

  // The tile.
  let tile, art;
  if (kind === 'tile') {
    const inset = px * 0.08;
    tile = { x: inset, y: inset, w: px - 2 * inset, h: px - 2 * inset, r: px * 0.185 };
    art = tile;
  } else {
    tile = { x: 0, y: 0, w: px, h: px, r: 0 };
    const a = kind === 'maskable' ? px * 0.66 : px * 0.9;
    art = { x: (px - a) / 2, y: (px - a) / 2 + (kind === 'maskable' ? px * 0.012 : 0), w: a, h: a };
  }
  // The Swift sizes everything from the icon's width, whose tile is 84% of it; u is that width for this picture.
  const u = art.w / 0.84;
  const grad = ctx.createLinearGradient(0, tile.y, 0, tile.y + tile.h);
  grad.addColorStop(0, rgb(...top));
  grad.addColorStop(1, rgb(...bottom));
  if (kind === 'tile') {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = px * 0.03;
    ctx.shadowOffsetY = px * 0.012;
    ctx.fillStyle = rgb(...bottom);
    rr(tile.x, tile.y, tile.w, tile.h, tile.r); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = grad;
  rr(tile.x, tile.y, tile.w, tile.h, tile.r); ctx.fill();
  if (kind === 'tile') {
    ctx.strokeStyle = rgb(...accent, 0.55);
    ctx.lineWidth = Math.max(1, px * 0.008);
    const s = ctx.lineWidth / 2;
    rr(tile.x + s, tile.y + s, tile.w - 2 * s, tile.h - 2 * s, tile.r - s); ctx.stroke();
  }

  const small = px <= 32;
  const cell = art.w / (small ? 5.2 : 7.0);
  const gap = small ? 0 : cell * 0.08;
  const ox = art.x + art.w / 2 - cell * 1.5;
  const base = art.y + art.h - art.h * 0.1; // the floor line
  const block = (x, y, color) => {
    const bx = ox + x * cell + gap / 2, by = base - (y + 1) * cell + gap / 2, s = cell - gap;
    ctx.fillStyle = color;
    rr(bx, by, s, s, cell * 0.16); ctx.fill();
    if (!small) {
      const hs = ctx.shadowColor;
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      rr(bx + s * 0.12, by + s * 0.16, s * 0.5, s * 0.14, s * 0.07); ctx.fill();
      ctx.shadowColor = hs;
    }
  };
  if (!small) {
    // The stack: a low floor with one T-shaped gap.
    const floor = [[-1.5, 0], [-0.5, 0], [1.5, 0], [2.5, 0], [3.5, 0], [-1.5, 1], [2.5, 1], [3.5, 1]];
    floor.forEach(([x, y], i) => block(x, y, rgb(...stack[i % stack.length], 0.9)));
    // The ghost where the T would land.
    ctx.beginPath();
    for (const [x, y] of [[-0.5, 1], [0.5, 1], [1.5, 1], [0.5, 0]]) {
      ctx.roundRect(ox + x * cell + cell * 0.12, base - y * cell - cell * 0.12 - cell * 0.76, cell * 0.76, cell * 0.76, cell * 0.12);
    }
    ctx.lineWidth = Math.max(1, u * 0.008);
    ctx.setLineDash([u * 0.02, u * 0.015]);
    ctx.strokeStyle = rgb(...accent, 0.8);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // The floating T, with a soft glow.
  ctx.save();
  ctx.shadowColor = rgb(...accent, 0.7);
  ctx.shadowBlur = u * 0.05;
  const ty = small ? 1.7 : 4.0;
  for (const [x, y] of [[-0.5, ty], [0.5, ty], [1.5, ty], [0.5, ty + 1]]) block(x, y, rgb(...accent));
  ctx.restore();
  return cv.toDataURL('image/png');
}

if (require.main === module) (async () => {
  const launchOpts = {};
  if (process.env.CHROMIUM_PATH) launchOpts.executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>icons</title>');
  fs.mkdirSync(OUT, { recursive: true });
  for (const icon of ICONS) {
    const url = await page.evaluate(`(${draw.toString()})(${icon.size}, ${JSON.stringify(icon.kind)})`);
    fs.writeFileSync(path.join(OUT, icon.file), Buffer.from(url.split(',')[1], 'base64'));
    console.log('  ' + icon.file + '  ' + icon.size + ' px  ' + icon.kind);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

module.exports = { ICONS };
