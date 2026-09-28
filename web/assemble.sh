#!/bin/sh
# Assembles the browser page: web/dist/index.html (the page, everything inline), with core.js and ronin.wasm beside it
# once the core has been built (web/build.sh). Also writes web/dist/harness.html, the page in a full HTML skeleton, for
# testing it locally only (the published page is wrapped in a skeleton of its own).
set -e
cd "$(dirname "$0")"
mkdir -p dist
SRC="src/util.js src/engine.js src/art.js src/icons.js src/figures.js src/sprites.js src/carnage.js src/session.js src/scene.js src/events.js src/panel.js src/main.js"
{
  cat src/head.html
  printf '<script type="module">\n'
  for f in $SRC; do cat "$f"; printf '\n'; done
  printf '</script>\n'
} > dist/index.html
{
  printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n'
  cat dist/index.html
  printf '</body>\n</html>\n'
} > dist/harness.html
# The core, once built: its glue and its module, where the page loads them (./core.js, ./ronin.wasm).
for glue in core.js build/core.js; do
  if [ -f "$glue" ]; then cp "$glue" dist/core.js; break; fi
done
for wasm in ronin.wasm build/ronin.wasm; do
  if [ -f "$wasm" ]; then cp "$wasm" dist/ronin.wasm; break; fi
done
ls -l dist
