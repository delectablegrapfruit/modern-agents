#!/usr/bin/env bash
# Builds Winnow.app from the Swift package (macOS only).
#   scripts/make-app.sh [debug|release]
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG="${1:-release}"
APP="build/Winnow.app"

swift build -c "$CONFIG" --product Winnow
swift build -c "$CONFIG" --product winnow-cli
BINDIR="$(swift build -c "$CONFIG" --show-bin-path)"
BIN="$BINDIR/Winnow"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/Winnow"
cp "$BINDIR/winnow-cli" "$APP/Contents/MacOS/winnow-cli"
cp Packaging/Info.plist "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"

if command -v swiftc >/dev/null && command -v iconutil >/dev/null; then
  ICONSET="build/AppIcon.iconset"
  rm -rf "$ICONSET" && mkdir -p "$ICONSET"
  swiftc -O -o build/render-icon scripts/render-icon.swift 2>/dev/null \
    && build/render-icon "$ICONSET" \
    && iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns" \
    || echo "icon skipped"
fi

# Ad-hoc signature so the app can register as a login item and post notifications.
codesign --force --sign - "$APP" >/dev/null 2>&1 || echo "codesign skipped"

echo "built $APP"
