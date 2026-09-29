# Vouch

Human taste across all media, as the antidote to machine content.

A visual prototype of a social network of named human curators for film, music, books, long reads, games, podcasts and art. You follow people, not feeds, and nothing is ranked by an algorithm.

## Run it

Open `index.html` in a browser. It is one self-contained file with no build step. On a wide screen it shows a phone frame with a screen index beside it. On a phone it runs full screen.

## Screens

| Screen | What it shows |
|---|---|
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

## Layout

- Each post leads with the person: avatar, name, and a reputation token (a ring filled to the landed rate, the vouchers you follow, total vouches, medium).
- The embed follows as a full-width card: cover on a panel tinted from the art, then title, maker and a human-made check, then the Open-in bar.
- Home is split into Today, Yesterday and earlier, with a post count for each, and ends when you're caught up.
- Replies and answers keep a compact avatar-column layout with small cards.

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
