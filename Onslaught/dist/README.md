# dist/

Packaged builds of **Onslaught.app**, produced by CI (`.github/workflows/onslaught.yml`) on a macOS runner from the
commit named in the commit message:

- `Onslaught.app.zip` — the app bundle (Apple silicon and Intel, macOS 14 or later). Unzip, drag to Applications.
- `Onslaught.dmg` — the same bundle as a disk image.
- `SHA256SUMS.txt` — checksums of both.
- `screenshots/` — what the panel showed during the CI self-test.

Ad-hoc signed, not notarised: right-click ▸ Open the first time, or `xattr -dr com.apple.quarantine Onslaught.app`.
