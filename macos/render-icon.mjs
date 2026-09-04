#!/usr/bin/env node
// Rasterise icon.svg to PNGs at the sizes .icns needs (uses the Playwright Chromium already installed here).
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const [svgPath, outDir] = process.argv.slice(2);
const { chromium } = require('playwright');
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
const dataURI = 'data:image/svg+xml;base64,' + readFileSync(resolve(svgPath)).toString('base64');
for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img src="${dataURI}">`);
  await page.waitForTimeout(50);
  await page.screenshot({ path: `${outDir}/icon-${size}.png`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('icons rendered to', outDir);
