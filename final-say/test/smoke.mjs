// Smoke test: opens the built game in headless Chromium (software WebGL) and plays through each mode quickly,
// failing on any page error. Run `npm run build` first. Set PLAYWRIGHT_CHROMIUM to use a specific browser binary.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = `file://${path.join(root, 'dist/final-say.html')}?speed=10&quality=low`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message));
page.on('console', (m) => m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text()) && errors.push(m.text()));

const until = async (test, seconds, what) => {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    if (await page.evaluate(test)) return;
    await page.waitForTimeout(300);
  }
  throw new Error(`Timed out waiting for ${what}`);
};
const step = (name) => console.log(`· ${name}`);

await page.goto(url);
await until(() => !!window.__finalSay, 20, 'the game to boot');

step('Audition Night: one act from walk-on to verdict');
await page.click('[data-act="play"]');
await until(() => window.__finalSay.show.phase === 'intro', 90, 'the first intro');
await page.keyboard.press('1');
await page.waitForTimeout(800);
await page.evaluate(() => window.__finalSay.show.slots.choose(3)); // "Just start."
await until(() => window.__finalSay.show.phase === 'perform', 60, 'the performance');
await page.keyboard.press('x');
await until(() => window.__finalSay.show.phase === 'verdict', 120, 'the verdict');
await page.keyboard.press('y');
await until(() => ['walkoff', 'walkon', 'intro'].includes(window.__finalSay.show.phase), 60, 'the next act');
await page.keyboard.press('Escape');
await page.click('[data-act="quit"]');

step('Swipe: sample photos, keys, undo, results');
await page.click('[data-act="swipe"]');
await page.click('[data-act="s-sample"]');
for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'z', 'ArrowRight']) {
  await page.keyboard.press(k);
  await page.waitForTimeout(250);
}
const counts = await page.evaluate(() => window.__finalSay.swipe.counts());
if (counts.keep !== 2 || counts.nope !== 1 || counts.star !== 0) throw new Error(`Unexpected swipe counts ${JSON.stringify(counts)}`);
await page.click('[data-act="finish"]');
await until(() => !document.getElementById('screen-results').hidden, 10, 'swipe results');
await page.click('#s-menu');

step('Tournament: five entries down to a champion');
await page.click('[data-act="tournament"]');
await page.fill('#t-entries', 'Alpha\nBravo\nCharlie\nDelta\nEcho');
await page.click('[data-act="t-start"]');
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !document.getElementById('screen-results').hidden)) break;
  if (await page.evaluate(() => document.getElementById('pick').getAttribute('aria-disabled') === 'false')) await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight');
  await page.waitForTimeout(700);
}
await until(() => !document.getElementById('screen-results').hidden, 30, 'the champion');
const champion = await page.evaluate(() => document.querySelector('.champion .name')?.textContent);
console.log(`  champion: ${champion}`);

await browser.close();
if (errors.length) {
  console.error(errors.join('\n\n'));
  process.exit(1);
}
console.log('ok');
