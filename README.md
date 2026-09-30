# Vouch

Human taste across all media, as the antidote to machine content.

A visual prototype of a social network of named human curators for film, music, books, long reads, games, podcasts and art. You follow people, not feeds, and nothing is ranked by an algorithm.

## Run it

Open `index.html` in a browser. It is one self-contained file with no build step. On a wide screen it shows a phone frame with a screen index and demo states beside it. On a phone it runs full screen.

## Design: Counter & Stub

Picks are paper slips that named people hand you, laid on a steel counter in the order they were handed over. Each slip has the curator's tag on top and a perforated stub along the bottom. The counter runs out.

- **Tear the stub** to open the work in the app made for it (MUBI, Spotify, Libby, Steam, Safari, Overcast, Apple Maps...). The screen takes the cover's colour, shows the disclosure, and Vouch steps aside. The prototype never draws the other app.
- **Stamp it** when you come back: "Did it land?" with Not yet, Loved it, Good, Not for me. The stamp files into your tried record and adds to the curator's landed rate. "Not yet" comes back once, the next day.
- **Reputation in one line** on every tag: "86% landed · 31 vouch (4 yours) · 7 yrs". Tap it for the full record, including a private "With you: 7 of 9 landed".
- **Places**: Picks, Asks, Clubs and Live along the top. The bottom bar holds a place switcher, one context text field (Share a link, Ask for something, Add to the talk...), and You.
- Curators have square photos with a violet ID mark; members have round ones. Violet marks people, canary marks copies and saved things, pink appears only for an undisclosed placement.

## Screens

| Screen | What it shows |
|---|---|
| Picks | Slips newest first, Full or List view, and a finite end with what's coming up |
| Pick detail | The slip, where it's available, Pass it on / Save / Star, your people who tried it, and the talk |
| Record | A curator's landed rate, loved / good / not-for-me record, vouches, disclosures |
| Open in | Tear, opening, outside, return, "Did it land?", stamp, file |
| Curator profile | Their ten picks as a shelf, the record, Follow and Subscribe |
| Your profile | Your tried record by month, with privacy settings |
| Asks | Members ask, people answer with picks, the asker chooses one |
| Clubs | This week's pick, watch by Sunday, the talk, past weeks |
| Live | A shared countdown: everyone presses play in their own app at zero, and talks here |
| You | Activity first, then To rate, Saved, your profile, People and Settings |
| People | Introductions from people you follow, then every curator A to Z |
| Share | Paste a link (a note is optional), or switch to Ask |
| Settings | A default app for each medium |

## Notes

- All people, works and numbers are fictional sample data. Nothing is saved or charged.
- App names show where a pick would open. There is no affiliation with those companies, and no logos are used.
- Cover art and profile pictures are drawn in SVG at runtime, so there are no image files.
- Fonts load from Google Fonts: Public Sans, Barlow Condensed, Courier Prime and Newsreader (inside cover art). Without a connection, the system fallbacks are used.
- The page follows the system light or dark setting. The screen index has a theme switch and demo states (nothing live, an undisclosed placement, the next day, first run).
