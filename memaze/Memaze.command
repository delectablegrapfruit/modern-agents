#!/bin/bash
# Memaze launcher for macOS - double-click this file in Finder.
# Extra options are passed through, e.g.:  ./Memaze.command --host 0.0.0.0
cd "$(dirname "$0")" || exit 1

if ! python3 -c 'import sys; sys.exit(sys.version_info < (3, 8))' >/dev/null 2>&1; then
    echo
    echo "  Memaze needs Python 3.8 or newer, and it wasn't found on this Mac."
    echo
    echo "  Install it from https://www.python.org/downloads/"
    echo "  (or run 'xcode-select --install' in Terminal), then double-click"
    echo "  Memaze.command again."
    echo
    read -r -p "  Press Enter to close this window... " _
    exit 1
fi

exec python3 serve.py "$@"
