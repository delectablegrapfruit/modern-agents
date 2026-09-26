# dist/

Packaged builds of **Skirmish.app**, produced by CI (`.github/workflows/ci.yml`) on a macOS runner from the commit
named in the commit message:

- `Skirmish.app.zip` — the app bundle (Apple silicon and Intel, macOS 14 or later). Unzip, drag to Applications.
- `Skirmish.dmg` — the same bundle as a disk image.
- `SHA256SUMS.txt` — checksums of both.
- `screenshots/` — what the panel showed during the CI self-test.

Ad-hoc signed, not notarised: right-click ▸ Open the first time, or `xattr -dr com.apple.quarantine Skirmish.app`.
