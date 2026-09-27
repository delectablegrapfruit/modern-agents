// Builds Final Say into one self-contained HTML file (dist/final-say.html) that opens straight from the disk,
// or serves the game for development with `--serve` (rebuilds on every request).
import * as esbuild from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const options = {
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  legalComments: 'none',
  logLevel: 'warning',
};

if (args.includes('--serve')) {
  const ctx = await esbuild.context({ ...options, outfile: path.join(root, '.dev/main.js'), sourcemap: true });
  const port = Number(process.env.PORT || 8000);
  await ctx.serve({ servedir: root, port });
  console.log(`Final Say: http://localhost:${port}/`);
} else {
  const result = await esbuild.build({ ...options, write: false, minify: true, outfile: 'main.js' });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = await readFile(path.join(root, 'src/style.css'), 'utf8');
  let html = await readFile(path.join(root, 'index.html'), 'utf8');
  html = html
    .replace(/<link rel="stylesheet" href="src\/style.css">/, () => `<style>\n${css}</style>`)
    .replace(/<script type="module" src=".dev\/main.js"><\/script>/, () => `<script type="module">${js}</script>`);
  const artifactIndex = args.indexOf('--artifact');
  if (artifactIndex >= 0) {
    // A page body for hosts that wrap the file in their own document skeleton.
    const body = html
      .replace(/<!doctype html>\s*/i, '')
      .replace(/<\/?html[^>]*>\s*/gi, '')
      .replace(/<\/?head>\s*/gi, '')
      .replace(/<meta charset[^>]*>\s*/i, '')
      .replace(/<meta name="viewport"[^>]*>\s*/i, '')
      .replace(/<\/?body>\s*/gi, '');
    await writeFile(args[artifactIndex + 1], body);
  }
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist/final-say.html'), html);
  console.log(`dist/final-say.html  ${(html.length / 1024).toFixed(0)} KB`);
}
