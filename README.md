# Vouch

Human taste across all media, as the antidote to machine content.

A visual prototype of a social network of named human curators for film, music, books, long reads, games, podcasts and art. You follow people, not feeds, and nothing is ranked by an algorithm.

## Why people, when everyone has an AI

Personal assistants will know each person's taste closely. Vouch doesn't compete on prediction. It offers what an assistant can't:

| | What Vouch does | Where it shows |
|---|---|---|
| Accountable | Every curator has a public landed rate: how often people who tried a pick loved it | Reputation card, profiles |
| Wider | Picks outside your usual are labeled. They were chosen by a person, not predicted | "Your first podcast" on cards, Discover |
| Human-made | Each pick carries a curator's check that people made the work | Card footer |
| Together | Clubs, asks and live rooms with people you know; "Tried by" rows on cards | Home, Club, Live room |
| Works with your AI | Your assistant can read your follows and saved picks if you allow it. It can't post | Settings |

## Run it

Open `index.html` in a browser. It is one self-contained file with no build step. On a wide screen it shows a phone frame with a screen index beside it. On a phone it runs full screen.

## Screens

| Screen | What it shows |
|---|---|
| Welcome | The pitch in the app: picks from people who sign their name |
| Home | Following or Everyone, newest first, and a timeline that ends |
| Reputation check | Tap any name: landed rate, vouches, years curating, disclosure record |
| Open in | The handoff to the app built for the medium, then "Did it land?" on return |
| Post and replies | A pick with its signature, where it's available, and the conversation |
| Ask | A member asks; curators and members answer with picks |
| Club | A weekly pinned pick and the talk around it |
| Live room | Everyone presses play at the same moment in their own app and talks here |
| Discover | Curators your circle vouches for, clubs, open asks, tags |
| Activity | Stars, replies, re-vouches, answers, vouches |
| Curator profile | Reputation first, then the list of ten |
| You | Your posts, tried record and saved picks |
| Open-in settings | A default app for each medium |
| Share | Paste a link; Vouch matches it and builds the card. A note is optional |

## Posts are embeds

Most posts are a link and nothing else. Paste a link from any app and Vouch turns it into a card for the work. A note is optional, like a tweet. Asks are the exception: they need words, and people answer with picks.

## How "Open in" works

- Each pick lists where it's available. The button uses your default app for that medium, or the first app that carries it, and says so.
- Tapping it shows a short handoff with the disclosure (whether the curator earns from the link), then Vouch steps aside. The prototype never draws the other app's screens.
- Coming back asks "Did it land?". Answers are anonymous and make up the curator's landed rate.

## Notes

- All people, works and numbers are fictional sample data. Nothing is saved or charged.
- App names show where a pick would open. There is no affiliation with those companies, and no logos are used.
- Cover art is drawn in SVG at runtime, so there are no image files.
- Fonts load from Google Fonts: Geist, Geist Mono, Newsreader and Mrs Saint Delafield. Without a connection, the system fallbacks are used.
- The page follows the system light or dark setting. The screen index has a theme switch.
