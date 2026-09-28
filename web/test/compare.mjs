// Puts the page's screenshots (from run.mjs) under the macOS app's own (dist/screenshots), pair by pair, into one
// image: node web/test/compare.mjs <shots dir> [out.png]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const shots = process.argv[2];
const out = process.argv[3] || path.join(shots, 'compare.png');
const pairs = [
  ['0-first-look', '0-first-look'], ['2-cut', '2-cut'], ['3-fight', '3-fight'], ['3b-gourd', '3b-gourd'],
  ['4-flourish', '4-flourish'], ['5-cleared', '5-cleared'], ['6b-brute-glare', '6b-brute-glare'], ['7-warlord', '7-warlord'],
  ['8-warlord-slain', '8-warlord-slain'], ['9-oni-bloodlust', '9-bloodlust'], ['10-fallen', '10-fallen'], ['12-endless', '14-endless'],
].filter(([a, b]) => fs.existsSync(path.join(root, 'dist/screenshots', a + '.png')) && fs.existsSync(path.join(shots, b + '.png')));
const url = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const images = pairs.map(([a, b]) => ({ name: a, app: url(path.join(root, 'dist/screenshots', a + '.png')), web: url(path.join(shots, b + '.png')) }));
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find((p) => fs.existsSync(p));
const browser = await playwright.chromium.launch({ executablePath: exe });
const page = await browser.newPage();
const data = await page.evaluate(async (images) => {
  const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const cols = 2, w = 520, h = 180, gap = 18;
  const rows = Math.ceil(images.length / cols);
  const c = document.createElement('canvas');
  c.width = cols * (w + 12) + 12;
  c.height = rows * (2 * h + gap + 16) + 12;
  const x = c.getContext('2d');
  x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
  x.font = '12px sans-serif';
  for (let k = 0; k < images.length; k++) {
    const px = 12 + (k % cols) * (w + 12), py = 12 + Math.floor(k / cols) * (2 * h + gap + 16);
    x.drawImage(await load(images[k].app), px, py, w, h);
    x.drawImage(await load(images[k].web), px, py + h + 2, w, h);
    x.fillStyle = '#ddd';
    x.fillText(`${images[k].name}: the app (above), the page (below)`, px, py + 2 * h + 14);
  }
  return c.toDataURL('image/png');
}, images);
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
await browser.close();
console.log(out);
