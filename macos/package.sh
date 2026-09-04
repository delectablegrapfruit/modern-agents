#!/usr/bin/env bash
# Assemble Books.app from a compiled shell binary.
#   macos/package.sh <shell-binary> <out-dir>     → <out-dir>/Books.app
# Used both by CI (.github/workflows/macos-app.yml, Xcode clang) and by macos/build.sh (Zig cross-compile).
set -euo pipefail
BIN="${1:?usage: package.sh <shell-binary> <out-dir>}"
OUT="${2:?usage: package.sh <shell-binary> <out-dir>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
APP="$OUT/Books.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/app"
cp "$BIN" "$APP/Contents/MacOS/Books"
chmod 755 "$APP/Contents/MacOS/Books"
cp "$HERE/Info.plist" "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"
cp "$HERE/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
cp "$ROOT/index.html" "$ROOT/icon.svg" "$ROOT/manifest.webmanifest" "$APP/Contents/Resources/app/"
cp -R "$ROOT/css" "$ROOT/js" "$APP/Contents/Resources/app/"
# Stamp the build into the bundle for "About Books" / bug reports.
if command -v plutil >/dev/null 2>&1 && [ -n "${GITHUB_SHA:-}" ]; then
  plutil -replace CFBundleVersion -string "${GITHUB_RUN_NUMBER:-1}" "$APP/Contents/Info.plist"
  plutil -replace BooksSourceRevision -string "${GITHUB_SHA}" "$APP/Contents/Info.plist"
fi
echo "assembled $APP"
