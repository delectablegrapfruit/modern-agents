# dist/

Packaged builds of **Audio Limiter.app**, produced by the CI workflow (`.github/workflows/ci.yml`) on a macOS runner
from the commit named in the commit message:

- `AudioLimiter.app.zip` — the app bundle (Apple silicon and Intel, macOS 14.2 or later). Unzip, drag to Applications.
- `AudioLimiter.dmg` — the same bundle as a disk image.
- `SHA256SUMS.txt` — checksums of both.

The app is ad-hoc signed but not notarised. If macOS says it cannot verify the developer: right-click ▸ Open, or
allow it under System Settings ▸ Privacy & Security, or run `xattr -dr com.apple.quarantine "Audio Limiter.app"`.
