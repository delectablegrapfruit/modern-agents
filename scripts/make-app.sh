#!/usr/bin/env bash
# Builds Books.app from the Swift package (macOS only).
#   scripts/make-app.sh [debug|release]
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG="${1:-release}"
APP="build/Books.app"

swift build -c "$CONFIG" --product Books
swift build -c "$CONFIG" --product books-cli
BINDIR="$(swift build -c "$CONFIG" --show-bin-path)"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BINDIR/Books" "$APP/Contents/MacOS/Books"
cp "$BINDIR/books-cli" "$APP/Contents/MacOS/books-cli"
# The typesetting page and its scripts: a plain folder in Resources, where BooksSchemeHandler looks first.
cp -R Sources/Books/Resources/Reader "$APP/Contents/Resources/Reader"
test -f "$APP/Contents/Resources/Reader/reader.html"
cp Packaging/Info.plist "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"
cmp -s "$BINDIR/Books" "$APP/Contents/MacOS/Books" || { echo "app binary was overwritten in the bundle" >&2; exit 1; }

if command -v swiftc >/dev/null && command -v iconutil >/dev/null; then
  ICONSET="build/AppIcon.iconset"
  rm -rf "$ICONSET" && mkdir -p "$ICONSET"
  swiftc -O -o build/render-icon scripts/icon.swift 2>/dev/null \
    && build/render-icon "$ICONSET" \
    && iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns" \
    || echo "icon skipped"
fi

# Ad-hoc signature: enough for Gatekeeper's "Open Anyway" and for WebKit's web content process to launch.
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || echo "codesign skipped"

echo "built $APP"
