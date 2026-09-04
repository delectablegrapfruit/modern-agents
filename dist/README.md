# dist/

Packaged builds of **Books.app**, produced by the *Build Books.app* GitHub Actions workflow
(`.github/workflows/macos-app.yml`) on a macOS runner from the commit named in the commit message:

- `Books.app.zip` — the app bundle (universal: Apple silicon + Intel, macOS 11+). Unzip, drag to Applications.
- `Books.dmg` — the same bundle as a disk image.
- `SHA256SUMS.txt` — checksums of both.

The app is ad-hoc signed but not notarised. If macOS says it cannot verify the developer: right-click ▸ Open, or
allow it under System Settings ▸ Privacy & Security, or run `xattr -dr com.apple.quarantine Books.app`.
