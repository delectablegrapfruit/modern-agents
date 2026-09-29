#!/usr/bin/env node
// Builds the web app as it is deployed (GitHub Pages): every file in sw.js's FILES copied into <out>, and sw.js with
// BUILD stamped to a hash of their contents — so each change to the game is a new offline copy, and an unchanged game
// keeps the one phones already have.
//   node Lull/scripts/web-build.cjs <out-dir>
// Also the helpers scripts/test.cjs uses to hold FILES to the files the page really loads.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GAME = path.join(__dirname, '..', 'Game');
const SW = 'sw.js';

/** FILES from sw.js, in order. */
function precacheList(swSource) {
  const src = swSource || fs.readFileSync(path.join(GAME, SW), 'utf8');
  const m = src.match(/const FILES = (\[[\s\S]*?\]);/);
  if (!m) throw new Error('sw.js: no FILES list');
  // Whole-line comments (the board options' part: markers) are not files.
  return JSON.parse(m[1].split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'));
}

/** Every file under Game/, relative, with forward slashes (sw.js itself left out). */
function gameFiles(dir = GAME, pre = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const rel = pre + e.name;
    if (e.isDirectory()) out.push(...gameFiles(path.join(dir, e.name), rel + '/'));
    else if (rel !== SW) out.push(rel);
  }
  return out.sort();
}

/**
 * Every local file the page names: index.html's src and href, the manifest's icons, url(...) in the stylesheets, and
 * any quoted path to a file in the scripts. Each comes back relative to Game/.
 */
function referencedFiles() {
  const found = new Set();
  const local = (ref, from) => {
    if (!ref || /^(?:[a-z]+:|\/\/|#)/i.test(ref)) return;
    const clean = ref.split(/[?#]/)[0];
    if (!clean || clean === './') return;
    found.add(path.posix.normalize(path.posix.join(path.posix.dirname(from), clean)));
  };
  const html = fs.readFileSync(path.join(GAME, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) local(m[1], 'index.html');
  const manifest = JSON.parse(fs.readFileSync(path.join(GAME, 'manifest.webmanifest'), 'utf8'));
  for (const i of manifest.icons || []) local(i.src, 'manifest.webmanifest');
  for (const s of manifest.screenshots || []) local(s.src, 'manifest.webmanifest');
  for (const f of gameFiles()) {
    const text = /\.(css|js)$/.test(f) ? fs.readFileSync(path.join(GAME, f), 'utf8') : null;
    if (!text) continue;
    if (f.endsWith('.css')) for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) local(m[1], f);
    // In a script a path is relative to the page, not the script.
    else for (const m of text.matchAll(/["'`]((?:\.\/)?[\w-]+(?:\/[\w.-]+)*\.(?:png|jpe?g|gif|webp|svg|ico|mp3|m4a|wav|ogg|woff2?|ttf|otf|json|webmanifest|css|js|html))["'`]/g)) local(m[1], 'index.html');
  }
  found.delete(SW);
  return [...found].sort();
}

/** The build's hash: every precached file's path and bytes, in order. */
function buildHash(files = precacheList()) {
  const h = crypto.createHash('sha256');
  for (const f of files) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(GAME, f))); h.update('\0'); }
  return h.digest('hex').slice(0, 12);
}

/** sw.js with BUILD set to `hash`. */
function stampedWorker(hash) {
  const src = fs.readFileSync(path.join(GAME, SW), 'utf8');
  const out = src.replace(/const BUILD = '[^']*';/, `const BUILD = '${hash}';`);
  if (out === src && !src.includes(`const BUILD = '${hash}';`)) throw new Error('sw.js: no BUILD to stamp');
  return out;
}

function build(outDir) {
  const files = precacheList();
  const missing = files.filter((f) => !fs.existsSync(path.join(GAME, f)));
  if (missing.length) throw new Error('sw.js lists files that are not there: ' + missing.join(', '));
  const hash = buildHash(files);
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(outDir, f)), { recursive: true });
    fs.copyFileSync(path.join(GAME, f), path.join(outDir, f));
  }
  fs.writeFileSync(path.join(outDir, SW), stampedWorker(hash));
  return { hash, files };
}

module.exports = { GAME, precacheList, gameFiles, referencedFiles, buildHash, stampedWorker, build };

if (require.main === module) {
  const out = process.argv[2];
  if (!out) { console.error('usage: node Lull/scripts/web-build.cjs <out-dir>'); process.exit(2); }
  const { hash, files } = build(path.resolve(out));
  console.log('web app ' + hash + ': ' + (files.length + 1) + ' files in ' + path.resolve(out));
}
