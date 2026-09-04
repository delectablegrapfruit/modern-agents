#!/usr/bin/env bash
# Local build of Books.app from any host (Linux/macOS/Windows-WSL) with Zig + Node.
#   pip install ziglang && ZIG="python3 -m ziglang" ./macos/build.sh     → dist/Books.app + dist/Books.app.zip
# CI (.github/workflows/macos-app.yml) does the same with Xcode's clang, then signs, launches and packages.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
ZIG="${ZIG:-zig}"
BUILD="$HERE/.build"
DIST="$ROOT/dist"
export NODE_PATH="${NODE_PATH:-$(npm root -g 2>/dev/null || true)}"
mkdir -p "$BUILD" "$DIST"

echo "▸ compiling shell (arm64 + x86_64, macOS 11+)"
$ZIG cc -target aarch64-macos.11.0 -O2 -Wall -Wextra -Wno-cast-function-type -o "$BUILD/Books-arm64" "$HERE/BooksShell.c"
$ZIG cc -target x86_64-macos.11.0 -O2 -Wall -Wextra -Wno-cast-function-type -o "$BUILD/Books-x86_64" "$HERE/BooksShell.c"
node "$HERE/make-universal.mjs" "$BUILD/Books" "$BUILD/Books-x86_64" "$BUILD/Books-arm64"

if [ "$ROOT/icon.svg" -nt "$HERE/AppIcon.icns" ] && node -e "require('playwright')" 2>/dev/null; then
  echo "▸ regenerating AppIcon.icns from icon.svg"
  node "$HERE/render-icon.mjs" "$ROOT/icon.svg" "$BUILD/icons"
  node "$HERE/make-icns.mjs" "$HERE/AppIcon.icns" "$BUILD/icons"
fi

echo "▸ assembling bundle"
"$HERE/package.sh" "$BUILD/Books" "$DIST"

echo "▸ zipping"
rm -f "$DIST/Books.app.zip"
if command -v ditto >/dev/null 2>&1; then ditto -c -k --keepParent "$DIST/Books.app" "$DIST/Books.app.zip"
else (cd "$DIST" && zip -qry Books.app.zip Books.app); fi
echo "✓ $DIST/Books.app  and  $DIST/Books.app.zip"
