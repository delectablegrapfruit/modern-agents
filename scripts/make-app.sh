#!/usr/bin/env bash
# Builds Sift.app from the Swift package (macOS only).
#   scripts/make-app.sh [debug|release]
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG="${1:-release}"
APP="build/Sift.app"

swift build -c "$CONFIG" --product Sift
swift build -c "$CONFIG" --product sift-cli
swift build -c "$CONFIG" --product sift-helper
BINDIR="$(swift build -c "$CONFIG" --show-bin-path)"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BINDIR/Sift" "$APP/Contents/MacOS/Sift"
cp "$BINDIR/sift-cli" "$APP/Contents/MacOS/sift-cli"
cp "$BINDIR/sift-helper" "$APP/Contents/MacOS/sift-helper"
cp Packaging/Info.plist "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"
# The two executables must stay distinct files, whatever the disk's case rules.
cmp -s "$BINDIR/Sift" "$APP/Contents/MacOS/Sift" || { echo "app binary was overwritten in the bundle" >&2; exit 1; }
cmp -s "$BINDIR/sift-cli" "$APP/Contents/MacOS/sift-cli" || { echo "command line missing from the bundle" >&2; exit 1; }
cmp -s "$BINDIR/sift-helper" "$APP/Contents/MacOS/sift-helper" || { echo "helper missing from the bundle" >&2; exit 1; }

if command -v swiftc >/dev/null && command -v iconutil >/dev/null; then
  ICONSET="build/AppIcon.iconset"
  rm -rf "$ICONSET" && mkdir -p "$ICONSET"
  swiftc -O -o build/render-icon scripts/icon.swift 2>/dev/null \
    && build/render-icon "$ICONSET" \
    && iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns" \
    || echo "icon skipped"
fi

# Ad-hoc signature so the app can register as a login item.
codesign --force --sign - "$APP" >/dev/null 2>&1 || echo "codesign skipped"

echo "built $APP"
