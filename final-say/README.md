# Final Say

A talent show in 3D where you're one of the judges. Two other judges sit next to you, but the final decision is always yours.

**Play:** open [`dist/final-say.html`](dist/final-say.html) in a browser. It's a single file that works offline and needs no install. Chrome, Edge, Firefox and Safari all work.

## Audition Night

Each act walks on, and while they introduce themselves you pick what to say. There are three lines on screen at a time. Each one only stays for a few seconds before a new one replaces it, and you can say any of them whenever you like, even while someone else is still talking. A fourth line, **Just start**, stays on screen the whole time. Using it to rush the intro usually goes down badly with the audience, the other judges and the contestant. It's forgiven more if the act is cocky or has been rambling for a while.

- **Ask questions** (name, age, job, what they're doing, why they're here, who came with them, what they dream of) and the caption at the bottom fills in. Asking also makes the contestant more confident, and a good backstory gets the room on their side.
- **Be kind, tease them, or be rude.** Nervous contestants play better after some reassurance and worse after being put down. Teasing a confident act gets a laugh from the room. Teasing a shy one gets you booed.
- **Say nothing** and the contestant fills the silence. After a while the other judges start asking the questions for you, and then they tell the act to start.

The act then performs. There are 15 kinds: singers, opera, kazoo, whistlers, dancers, dance crews, bands, choirs, magicians, comedians, jugglers, dog acts, acrobats, ventriloquists and strongmen. Some acts are several people, and some bring a dog or a puppet. Each act has a hidden talent level, and how well it plays on the night depends on that and on how confident they are. Singers go out of tune, jugglers drop balls, pyramids fall over, the dog runs off to sniff the judges' desk, and a weak ventriloquist's lips move when the puppet talks.

**Reading the room:** the screen never shows a crowd meter. To find out what the audience thinks, hold **Space** to look over your shoulder, where they may be standing, clapping, booing, laughing, or bored and on their phones. You can also just listen: every sound in the crowd is generated live from its mood.

- **X** buzzes. When all three judges have buzzed, the act is stopped.
- **G** is the golden buzzer. You get one per show, and it sends an act straight through.
- **Y / N** is your final say. The other two judges comment and vote first, and you can overrule them. If you take too long, the crowd starts chanting.

At the end of the episode you get the next morning's front page, a star rating, the viewer figures, and a table of every decision you made next to how talented each act really was.

## Tournament

This is a knockout bracket for anything. Paste in a list (restaurants, names for a project, ideas) or add photos. Each entry gets its own contestant and a board on stage, and in every match you pick one to go through with **← / →** until one is left. Press **B** at any time to see the bracket. If the number of entries isn't a power of two, some entries get a bye in the first round. When it's over you get a full ranking, which you can copy or download.

**Use 8 random acts instead** runs the same bracket with performers. Both acts in a match perform a short routine and you choose who advances.

## Swipe

This mode sorts a pile of items one at a time. You can load:

- **photos**: pick image files, or a whole folder
- **a list file**: `.txt` with one item per line, `.csv` or `.tsv` with a header row, or a `.json` array
- **pasted lines**

Each item goes up on stage. Swipe or press **→** to keep it, **←** to bin it, **↑** to star it, and **Z** to undo. Your picks are saved in the browser as you go, so if you load the same set again later you can carry on where you stopped. The results screen shows the kept photos and has these options:

- copy the kept list
- download every decision as CSV
- **save the kept photos into a folder** (Chrome and Edge only; your original files are never moved or changed)
- run a tournament on the kept or starred items to find the best one

## Controls

| Key | Does |
| --- | --- |
| 1 2 3 4 | Say a line |
| Space (hold) | Look at the audience |
| Q / E (hold) | Look at the judge on your left / right |
| Drag | Look around |
| X · G | Buzz · golden buzzer |
| Y · N | Yes · No |
| ← → ↑ Z | Tournament picks; swipe keep / bin / star / undo |
| B | Bracket |
| M · Esc | Mute · pause |

Settings are on the title screen: voices (babble, your system's speech voices, or off), volume, dialogue timer (normal, relaxed, or no timer), acts per episode, graphics quality, and reaction hints.

## How it's made

It's plain JavaScript and [three.js](https://threejs.org). The only asset is code. The studio, the people, the dog and the props are all built from simple shapes. The crowd, the music, the buzzers and the voices are all synthesised with the Web Audio API.

| File | What it is |
| --- | --- |
| `src/studio.js` | stage, LED wall, X lights, lighting rig, judges' desk, renderer |
| `src/character.js` | people and dogs, and the pose library that animates them |
| `src/audience.js` | the instanced crowd and its mood |
| `src/audio.js` | crowd sounds, sound effects, the band, the babbling voices |
| `src/show.js`, `src/acts.js` | the audition flow and each kind of act |
| `src/contestants.js`, `src/data.js` | who the acts are and what everyone says |
| `src/tournament.js`, `src/swipe.js` | the other two modes |
| `src/hud.js`, `src/style.css`, `index.html` | the on-screen graphics and menus |

```sh
npm install
npm run dev     # http://localhost:8000, rebuilt on every reload
npm run build   # writes dist/final-say.html
npm test        # plays through all three modes in headless Chromium
```

Add `?speed=4` to the URL to run the game clock faster.
