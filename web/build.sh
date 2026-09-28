#!/usr/bin/env bash
# Builds the game's core for the web page: web/dist/ronin.wasm (RoninCore and RoninArt with the bridge in
# web/Sources/RoninWeb, compiled by Swift 6.0.3 for wasm32-unknown-wasi) and web/dist/core.js beside it.
#
#   web/build.sh            build (release, size-optimised), strip, wasm-opt -Oz when it can, copy core.js
#   web/build.sh --test     and then run web/test/core.test.mjs on the result (needs Node 22+)
#
# Needs Docker (the swift:6.0.3 image). The SwiftWasm SDK is downloaded once into the cache.
# Environment:
#   RONIN_WASM_CACHE   where the SDK and the build go (default ~/.cache/ronin-wasm)
#   RONIN_SWIFT_IMAGE  the Docker image (default swift:6.0, whose compiler is 6.0.3; it must be 6.0.3, as the SDK is)
#   RONIN_WASM_OPT     path to wasm-opt, or "npx" to fetch binaryen with npx, or "0" to skip (default: wasm-opt on
#                      PATH, else npx if Node is there)
#   NODE               the node binary for --test (default: node on PATH)
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
cache="${RONIN_WASM_CACHE:-$HOME/.cache/ronin-wasm}"
image="${RONIN_SWIFT_IMAGE:-swift:6.0}"
sdk_name="swift-wasm-6.0.3-RELEASE-wasm32-unknown-wasi"
sdk_url="https://github.com/swiftwasm/swift/releases/download/swift-wasm-6.0.3-RELEASE/$sdk_name.artifactbundle.zip"
sdk_sum="31d3585b06dd92de390bacc18527801480163188cd7473f492956b5e213a8618"
dist="$here/dist"
run_tests=0
for arg in "$@"; do
    case "$arg" in
        --test) run_tests=1 ;;
        *) echo "usage: $0 [--test]" >&2; exit 2 ;;
    esac
done

command -v docker >/dev/null || { echo "build.sh: Docker is needed (docker not found)" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "build.sh: Docker is not running" >&2; exit 1; }
mkdir -p "$cache" "$dist"
version=$(docker run --rm "$image" swift --version 2>/dev/null | head -1)
case "$version" in
    *"Swift version 6.0.3 "*) ;;
    *) echo "build.sh: $image has '$version'; the SDK needs Swift 6.0.3 (set RONIN_SWIFT_IMAGE)" >&2; exit 1 ;;
esac

# The SDK, once.
if [ ! -d "$cache/sdks/$sdk_name.artifactbundle" ]; then
    if [ ! -f "$cache/sdk.zip" ]; then
        echo "Downloading the SwiftWasm SDK..."
        curl -fL --retry 3 -o "$cache/sdk.zip.part" "$sdk_url"
        mv "$cache/sdk.zip.part" "$cache/sdk.zip"
    fi
    echo "$sdk_sum  $cache/sdk.zip" | sha256sum -c - >/dev/null || { echo "build.sh: the SDK download is not the one expected" >&2; rm -f "$cache/sdk.zip"; exit 1; }
    echo "Installing the SwiftWasm SDK into $cache/sdks..."
    docker run --rm -v "$cache":/cache "$image" \
        swift sdk install /cache/sdk.zip --swift-sdks-path /cache/sdks
fi

echo "Building RoninWeb for wasm32-unknown-wasi ($image)..."
docker run --rm -v "$root":/work -v "$cache":/cache -w /work/web "$image" \
    swift build --swift-sdks-path /cache/sdks --swift-sdk wasm32-unknown-wasi --scratch-path /cache/build \
        -c release -Xswiftc -Osize -Xlinker --strip-all
built="$cache/build/wasm32-unknown-wasi/release/RoninWeb.wasm"
[ -f "$built" ] || built="$cache/build/release/RoninWeb.wasm"
cp "$built" "$dist/ronin.wasm"
raw=$(wc -c <"$dist/ronin.wasm")

# wasm-opt, if there is one.
opt="${RONIN_WASM_OPT:-}"
if [ -z "$opt" ]; then
    if command -v wasm-opt >/dev/null; then opt="wasm-opt"; elif command -v npx >/dev/null; then opt="npx"; else opt="0"; fi
fi
if [ "$opt" != "0" ]; then
    echo "Optimising with wasm-opt -Oz..."
    flags=(-Oz --enable-bulk-memory --enable-sign-ext --enable-mutable-globals --enable-nontrapping-float-to-int
           --strip-debug --strip-producers)
    if [ "$opt" = "npx" ]; then
        npx -y -p binaryen wasm-opt "${flags[@]}" "$dist/ronin.wasm" -o "$dist/ronin.opt.wasm"
    else
        "$opt" "${flags[@]}" "$dist/ronin.wasm" -o "$dist/ronin.opt.wasm"
    fi
    mv "$dist/ronin.opt.wasm" "$dist/ronin.wasm"
fi
cp "$here/core.js" "$dist/core.js"

size=$(wc -c <"$dist/ronin.wasm")
gz=$(gzip -9 -c "$dist/ronin.wasm" | wc -c)
echo "web/dist/ronin.wasm: $size bytes ($gz gzipped; $raw before wasm-opt)"

if [ "$run_tests" = 1 ]; then
    "${NODE:-node}" "$here/test/core.test.mjs" "$dist/ronin.wasm"
fi
