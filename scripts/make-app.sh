#!/usr/bin/env bash
# Builds "Audio Limiter.app" from the Swift package (macOS only).
#   scripts/make-app.sh [debug|release]
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG="${1:-release}"
APP="build/Audio Limiter.app"

swift build -c "$CONFIG" --product AudioLimiter
BINDIR="$(swift build -c "$CONFIG" --show-bin-path)"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BINDIR/AudioLimiter" "$APP/Contents/MacOS/AudioLimiter"
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

# Ad-hoc signature: enough for Gatekeeper's "Open Anyway". macOS keys the audio-capture permission to the signature,
# so a rebuilt copy asks again.
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || echo "codesign skipped"

echo "built $APP"
