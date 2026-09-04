#!/usr/bin/env bash
# Builds Books.app (universal arm64 + x86_64) from any host. Requirements: zig (https://ziglang.org or `pip install ziglang`), node.
#   ./macos/build.sh            → refreshes ../Books.app in place
#   ZIG="python3 -m ziglang" ./macos/build.sh   (when Zig came from PyPI)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export NODE_PATH="${NODE_PATH:-$(npm root -g 2>/dev/null)}"
ROOT="$(cd "$HERE/.." && pwd)"
APP="$ROOT/Books.app"
ZIG="${ZIG:-zig}"
BUILD="$HERE/.build"
mkdir -p "$BUILD" "$APP/Contents/MacOS" "$APP/Contents/Resources"

echo "▸ compiling shell (arm64 + x86_64)"
$ZIG cc -target aarch64-macos.11.0 -O2 -Wall -Wextra -Wno-cast-function-type -o "$BUILD/Books-arm64" "$HERE/BooksShell.c"
$ZIG cc -target x86_64-macos.11.0 -O2 -Wall -Wextra -Wno-cast-function-type -o "$BUILD/Books-x86_64" "$HERE/BooksShell.c"
node "$HERE/make-universal.mjs" "$APP/Contents/MacOS/Books" "$BUILD/Books-x86_64" "$BUILD/Books-arm64"
chmod 755 "$APP/Contents/MacOS/Books"

echo "▸ bundle metadata"
cp "$HERE/Info.plist" "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"
if [ ! -f "$APP/Contents/Resources/AppIcon.icns" ] || [ "$ROOT/icon.svg" -nt "$APP/Contents/Resources/AppIcon.icns" ]; then
  if node -e "require('playwright')" 2>/dev/null; then
    node "$HERE/render-icon.mjs" "$ROOT/icon.svg" "$BUILD/icons"
    node "$HERE/make-icns.mjs" "$APP/Contents/Resources/AppIcon.icns" "$BUILD/icons"
  else
    echo "  (playwright not available — keeping existing AppIcon.icns)"
  fi
fi

echo "▸ copying web app into Contents/Resources/app"
rm -rf "$APP/Contents/Resources/app"
mkdir -p "$APP/Contents/Resources/app"
cp "$ROOT/index.html" "$ROOT/icon.svg" "$ROOT/manifest.webmanifest" "$APP/Contents/Resources/app/"
cp -R "$ROOT/css" "$ROOT/js" "$APP/Contents/Resources/app/"
echo "✓ $APP"
