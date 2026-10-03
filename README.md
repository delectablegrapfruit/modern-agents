# livenet

Free utilities that each fix one thing that's broken in the software you already use. No accounts, no tracking,
nothing leaves your device. Every app is MIT licensed.

`index.html` is the site: one self-contained page (no build step, no dependencies) listing every app with the
problem it fixes, and *What's broken?*, the board where people name problems and vote on what gets fixed next.
The board is a preview for now: votes and added problems stay in the visitor's browser.

| App | Fixes | Branch |
|-----|-------|--------|
| Sift | `.DS_Store` and `._` files on every disk; Finder forgetting folder views | `claude/sift-pro` |
| Audio Limiter | headphones too loud by half volume, the slider crammed into its first steps | `audio-limiter` |
| Books | EPUB, Kindle and PDF needing different apps; unreadable small-print PDFs | `main` |
| Scroll to Scrub | seeking in web videos by dragging a thin timeline | `claude/horizontal-video-scrub-extension-ww3dr6` |

Adding an app is one entry in the `APPS` list in `index.html`.

To publish: any static host. GitHub Pages: Settings ▸ Pages ▸ Deploy from a branch ▸ `livenet` / root.
