#!/usr/bin/env bash
# Builds Lull.app: the Swift shell plus the game page (macOS only).
#   Lull/scripts/make-app.sh [debug|release]
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG="${1:-release}"
APP="build/Lull.app"

swift build -c "$CONFIG" --product Lull
BINDIR="$(swift build -c "$CONFIG" --show-bin-path)"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BINDIR/Lull" "$APP/Contents/MacOS/Lull"
# The game itself: plain files in Resources, loaded by the web view.
cp -R Game "$APP/Contents/Resources/Game"
test -f "$APP/Contents/Resources/Game/index.html"
cp Packaging/Info.plist "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"

if command -v swiftc >/dev/null && command -v iconutil >/dev/null; then
  ICONSET="build/AppIcon.iconset"
  rm -rf "$ICONSET" && mkdir -p "$ICONSET"
  swiftc -O -o build/render-icon scripts/icon.swift 2>/dev/null \
    && build/render-icon "$ICONSET" \
    && iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns" \
    || echo "icon skipped"
fi

# Ad-hoc signature: enough for Gatekeeper's "Open Anyway" and for WebKit's content process to launch.
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || echo "codesign skipped"

echo "built $APP"
