# Paper Sky: UI and UX

Screens, flows, the design system, input, accessibility and onboarding. All coordinates are
logical pixels of the 1280 × 720 stage (ARCHITECTURE §2). All UI is DOM in `#ui`, except world-space
labels, float texts and minigame play areas, which are canvas. Rules and numbers: GDD and BALANCE.

## 1. Principles

1. **Show the trade before the click.** Every action row shows its costs and gains as chips and,
   if disabled, the reason in one line. Hovering or focusing a row shows a ghost delta on the HUD.
2. **The world stays visible.** Menus are paper cards laid over a living scene, never full-screen
   blue panels. Interiors are illustrated dioramas with the card at the right.
3. **One key to act, one key to leave.** Enter / A acts, Esc / B backs out one level and never
   leaves a purchase half done. Hotkeys 1-9 trigger rows. R repeats the card's last action and
   holding Enter repeats it, but only for `repeatable` actions (food, training, TV, shifts,
   consumables): never anything with a confirm, a minigame, a sub-screen or an irreversible
   effect, and a repeat stops at any modal, dialog, minigame or stamp, **except a stat-gain
   stamp**: during a hold the first run's stat stamp shows and later ones are coalesced (float
   texts and flying chips still show every gain; CONTRACT D47). Hold-to-repeat can be turned off
   (Settings › Game).
4. **Same component, same meaning.** A time chip looks the same everywhere; so do money, HP and
   stat chips. Colour is never the only cue: every chip has an icon and a text label.
5. **Every input is first-class.** Keyboard, mouse, gamepad and touch can complete every screen.
6. **Receipts.** After an action, chips fly to the HUD, the clock sweeps, a sound plays and big
   gains are stamped. Every night ends with a newspaper.

## 2. Design system

### 2.1 Tokens (`css/tokens.css`; mirrored for canvas in `SR.art.palette.ui`)

```css
:root {
  /* surfaces: paper */
  --paper-0: #FFFDF8;   /* cards, rows */
  --paper-1: #F7F2E8;   /* notebook, report, sheets */
  --paper-2: #EFE6D4;   /* hover, sunken wells */
  --paper-3: #E2D6BE;   /* dividers, thin borders */
  /* ink */
  --ink-900: #1B1D2B;   /* text, outlines (15.9:1 on paper-0) */
  --ink-700: #3F4254;   /* secondary text */
  --ink-500: #5C6070;   /* tertiary text, disabled labels (6.1:1 on paper-0, 5.0:1 on paper-2) */
  --ink-300: #A8ABB8;   /* disabled strokes, placeholders (non-text only) */
  /* brand: the original's panel blue, refined */
  --primary-100: #DCE7FF; --primary-500: #2F6BFF; --primary-600: #1F4FD6; --primary-ink: #FFFFFF;
  /* primary-500 is for accents, focus fills and large display text only; filled buttons use
     primary-600 (white text 6.7:1). White on primary-500 is 4.50:1, too close to the limit. */
  /* focus: a nod to Flash's yellow focus box */
  --focus: #FFD23F;
  /* meaning (base = icons, bars, fills; -ink = text on paper; -100 = chip backgrounds) */
  --money: #19A35B; --money-ink: #0E7A41; --money-100: #DDF5E8;
  --hp:    #E5484D; --hp-ink:    #B42318; --hp-100:    #FDE2E2;
  --str:   #F07A2A; --str-ink:   #963F07; --str-100:   #FDE9DA;   /* 5.9:1 */
  --int:   #3D8BFD; --int-ink:   #1F5FC4; --int-100:   #DEEBFF;
  --cha:   #D946EF; --cha-ink:   #A21CAF; --cha-100:   #FBE3FD;
  --time:  #0E9FB5; --time-ink:  #0B6F80; --time-100:  #D9F3F7;
  --heat:  #FF6A00; --heat-ink:  #B54708; --heat-100:  #FFE7D6;
  --karma-zero: #0066CC; --karma-good: #FFFFFF; --karma-evil: #CA0000;   /* orig endpoints */
  --ok: #12B76A; --warn: #F79009; --danger: #D92D20; --danger-ink: #B42318; --info: #3D8BFD;
  --scrim: rgba(27, 29, 43, .45);
  /* type */
  --font-display: "Arial Black", "Segoe UI Black", "Helvetica Neue", Arial, sans-serif;  /* weight 900 */
  --font-ui: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-news: Georgia, "Times New Roman", Times, serif;                                   /* The Daily Fold */
  --fs-12: 12px; --fs-14: 14px; --fs-16: 16px; --fs-20: 20px; --fs-24: 24px; --fs-28: 28px;
  --fs-32: 32px; --fs-44: 44px; --fs-64: 64px; --fs-96: 96px;
  --lh-tight: 1.2; --lh-body: 1.4;
  /* space */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 24px; --sp-6: 32px; --sp-7: 48px; --sp-8: 64px;
  /* shape */
  --r-xs: 4px; --r-s: 6px; --r-m: 10px; --r-l: 16px; --r-pill: 999px;
  --line: 2px solid var(--ink-900);      /* the cut-paper outline */
  --line-thin: 1px solid var(--paper-3);
  /* elevation: stacked paper (hard offset) plus a soft ambient shadow at higher levels */
  --e-1: 0 2px 0 rgba(27, 29, 43, .18);
  --e-2: 0 4px 0 rgba(27, 29, 43, .18), 0 6px 16px rgba(27, 29, 43, .10);
  --e-3: 0 8px 0 rgba(27, 29, 43, .16), 0 16px 40px rgba(27, 29, 43, .22);
  /* motion */
  --dur-1: 120ms; --dur-2: 200ms; --dur-3: 350ms; --dur-4: 600ms;
  --ease-out: cubic-bezier(.2, .8, .2, 1); --ease-inout: cubic-bezier(.65, 0, .35, 1);
  --ease-spring: cubic-bezier(.34, 1.56, .64, 1);
  /* layers inside #ui */
  --z-hud: 10; --z-card: 20; --z-overlay: 30; --z-modal: 40; --z-toast: 50; --z-stamp: 60; --z-tip: 70;
  /* accessibility scaling */
  --ui-scale: 1;        /* text size setting: 1, 1.25, 1.5 */
  --grain: none;        /* set at boot to a generated 256 px paper-grain data URL (4 % opacity) */
}
```

- **Tokens added in wave 1** (W1-D, in `css/tokens.css`): `--white`, `--gold` (the achievement
  toast's edge), `--newsprint` (#F4F0E6, the report and newspaper paper, ART_AUDIO §11),
  `--grain-opacity` (1, because `--grain` from `js/art/paper.js` is already the 4 % grain; 0 in high
  contrast), `--stamp-alpha` (.85), `--focus-ring`, `--focus-ring-inset`, the karma bands
  `--karma-good-0..9` / `--karma-evil-0..9` (BALANCE B-04c; the KarmaMedallion is CSS and the
  colour-blind modes remap it) and the three colour-blind tables `:root[data-cb="protan" |
  "deutan" | "tritan"]` (Okabe-Ito hues, each `-ink` ≥ 4.5:1 on its `-100`, asserted by
  `tests/node/tokens.test.cjs`). `SR.art.palette.ui` mirrors `white`, `gold` and `newsprint`; the
  karma bands are `SR.art.palette.karma`. The accessibility root classes are `html.hc` (high
  contrast), `html.rm` (reduced motion), `html.fr` (flash reduction), `html[data-cb]`,
  `html[data-device]` and `html.sr-fast` (tests), and `--ui-scale` is set on `:root` by
  `js/ui/dom.js` from `SR.settings`.
- **Type roles:** display 64 / 900 (title logo tag, results headline); h1 44 / 900 (screen titles);
  h2 32 / 900 (report headline); money 28 / 900 (the HUD cash); h3 24 / 900 (card titles); label 20
  / 700 (HUD time); body 16 / 400-600; small 14 (chips, secondary); caption 12 (numbers and labels
  only, never sentences).
- **Contrast pairs** (asserted by `tests/node/tokens.test.cjs`): every `--x-ink` on `--x-100` ≥ 4.5:1
  (money 4.7, hp 5.4, str 5.9, int 5.0, cha 5.3, time 5.0, heat 4.6); white on `--primary-600`
  6.7:1 and on `--danger` 4.8:1; `--ink-500` on paper-0/1/2 ≥ 5.0:1.
  Every number uses `font-variant-numeric: tabular-nums`. Body text is never below 16 px at 100 %.
- **Weights:** 400, 600, 700, 900. Display text is uppercase with 0.02 em tracking.
- **High contrast mode** swaps: paper grain off, shadows off, `--line` 3 px, `--ink-500` → `--ink-700`,
  chip backgrounds white with a 2 px border in the base colour.
- **Colour-blind modes** (protan, deutan, tritan) remap the stat and karma base colours through a
  table in `tokens.css` (`[data-cb="protan"]` etc.); icons and labels never change.

### 2.2 Layout grid and regions

- 12 columns of 80 px with 24 px gutters inside 32 px side margins; 8 px baseline.

| Region | Rect (x0-x1, y0-y1) |
|---|---|
| HUD bar (city), 3 rows of 24 px + gaps | 16-1264, 8-96 (row 1: 8-32, row 2: 40-64, row 3: 72-96) |
| HUD compact (building, minigame none) | 16-760, 8-56 |
| Tracked goal line | 16-520, 104-132 |
| Toast lane | 560-960, 104-280 (stack of 3) |
| Context prompt | 16-496, 640-704 |
| Minimap | 1080-1264, 520-704 (touch: 1080-1264, 104-288) |
| Building card | 776-1248, 72-704 (472 × 632) |
| Interior scene | 0-760 |
| Dialog sheet | 32-1248, 472-704 |
| Pocket notebook | 80-1200, 48-688 (tab rail 168 wide) |
| Modal | 480 wide (large: 720), centred |
| Minigame frame | top bar 0-64, play area 64-640, bottom bar 640-720 |
| Report / Results page | 160-1120, 24-696 |

**Touch-compact layout** (coarse pointer and stage scale k < 0.92, ARCHITECTURE §2): `#ui` covers
the whole window at `uiK = 0.92` and regions anchor to its edges instead of this grid: the HUD
to the top edge (rows 2-3 collapse into a tap-to-expand strip), the building card becomes a
right-hand sheet of full height and 472 px wide (the interior shows beside it, cropped), the dialog
sheet and the context prompt anchor to the bottom, the minimap to the top right under the HUD,
the Pocket and modals are centred and shrink to the box; touch targets stay 48 logical px
(≥ 44 CSS px). In portrait, a "Turn your device sideways" card (with "Play anyway") covers the
stage.

### 2.3 Components (`js/ui/components.js`, `css/components.css`)

Every component: DOM built with `SR.ui.dom.h`, a `data-id`, visible focus (3 px `--focus` ring with
a 1 px ink outer line, offset 2 px), keyboard operable, ARIA role and name, and a `disabled` state
that remains focusable (so its reason can be read) but refuses activation with the error sound
and a 120 ms shake.

| Component | Anatomy and sizes | States / behaviour |
|---|---|---|
| **Button** | height 44 (touch 48), padding 0 16, radius `--r-m`, `--line`, `--e-1`; variants primary (**primary-600** fill, white text), secondary (paper-0), danger (danger fill), ghost (no border) | hover lifts 1 px; pressed moves 2 px down and drops the shadow; loading shows a pencil spinner |
| **IconButton** | 40 × 40 (touch 48), 24 px icon | tooltip on hover or focus after 400 ms |
| **Chip** | height 24, radius `--r-s`, 16 px icon + value in 14 / 700; background `--x-100`, icon `--x`, text `--x-ink` | kinds: money (`$20`), time (`2h`, `30m`, `rest of day`), hp (`+20 HP`, `-4 HP`), stat (`+2 INT`), karma (`+1` with a yin-yang pip), heat (`+30 Heat`), item (`-1 ammo`), chance (`62 %`); cost chips that you can't afford turn `--danger-ink` with a strikethrough icon; a capped gain shows "(full)" or "(max)" |
| **ActionRow** | 64 tall, full card width; hotkey badge 20 × 20 (1-9), icon 40, label 16 / 700, gain chips line, right-aligned cost chips; optional segmented variant control and a secondary button (Hustle ▶) | hover and focus: paper-2 background and the HUD ghost delta; disabled: label ink-500 and the reason line in `--danger-ink` in place of the gains; after running: a 200 ms flash and chips fly to the HUD |
| **Card** | radius `--r-l`, `--line`, `--e-2`, paper grain; header strip 8 px in the building's brand colour; header: title (h3), owner Portrait 56, SpeechBubble; body scrolls after 8 rows; footer with Leave and a mini readout (cash, time) | enters by sliding 24 px from the right with a fade (350 ms) |
| **SpeechBubble** | paper-0, 2 px ink, tail toward the portrait; text 16 | typewriter at `access.typewriterCps` (60 default), any key completes; gibberish voice blips |
| **Breadcrumb** | 14 / 600: "Bank › Loan" | the first crumb is Back |
| **Meter** | HP bar 220 × 16 with heart icon and "34 / 40"; poll meter 360 × 24 with the 50 % line; heat meter 120 × 12 | damage flashes red for 200 ms; heals fill over 400 ms; ghost segment for previews (striped) |
| **ClockRing** | 64 px ring: the full 24 h; night hours (20-06) shaded; the arc from now to 24:00 filled with `--time` (the time you have left, a nod to the original's pie clock); a hand at now; digits in the centre are not inside the ring but beside it | when hours are spent the fill sweeps with a tick-tock; at 24:00 the ring pulses red and the time reads "24:00 LATE" |
| **StatChip** | "STR 12" 64 × 24 with stat colour icon | pulses on gain; tooltip with the value to the next perk milestone |
| **KarmaMedallion** | 48 px head in the karma band colour with a ring glyph (halo / neutral dot / horns) | tooltip with the value and tier |
| **Toast** | 400 wide, max 3 stacked, 3.5 s; kinds info, reward (icon + chips), warning, achievement (gold edge) | enter from the top 200 ms; go to the `#aria` live region |
| **Stamp** | a rotated (-8°) rubber-stamp word in display 64-96 with a double outline, e.g. "+2 INTELLIGENCE!", "PROMOTED!", "FLATLINED", the rank | scales 1.4 → 1 with `--ease-spring` in 250 ms, a thud sound and a 4 px paper jolt of the stage; stays 900 ms; queued, never overlapping; the remaster's version of the original's "…INCREASED!!!" moment |
| **Modal / Confirm** | 480 wide, `--e-3`, scrim `--scrim` | focus trapped; Esc cancels; confirm needed for purchases ≥ the setting, crimes, loans, the election, quitting, deleting saves |
| **Tabs** | underline tabs, 44 tall | Q / E, LB / RB, swipe |
| **Segmented** | 2-4 options, 32 tall | arrows move; used for shift variants, bet sizes, settings |
| **NumberField** | integer input with - / + steppers and quick buttons (10 %, 50 %, All, or +$10 / +$100 / +$1k) | digits only; clamps to what is possible; Enter confirms; while focused, keys type (ARCHITECTURE §11 text entry) |
| **TextField** | single-line text input, height 44 (touch 48), `--line`, a label above and an optional hint and error line; `maxLength`, `pattern`, optional Paste button | while focused only Enter (submit), Esc (cancel / blur) and Tab act; used for the name (≤ 16), Rename the City, Paste save code; on touch the on-screen keyboard is expected and the field scrolls into view |
| **Slider / Toggle** | 200 wide / 48 × 28 | arrows / Space |
| **List** | rows 48 tall with icon, label, meta | arrow keys, type-ahead; scroll containers use `touch-action: pan-y` |
| **KeyHint** | a glyph for the bound key or button, switching with `SR.input.last` (keyboard, Xbox-style, PlayStation-style, touch) | hidden on touch where not applicable |
| **Tooltip** | max 280 wide, 14 | hover or focus after 400 ms; long-press on touch |
| **Portrait** | canvas head and shoulders of a stick, 32 / 56 / 96 / 176 px, from `SR.art.portraits` | idle blink every 4-7 s |
| **Sparkline / LineChart** | canvas; sparkline 96 × 24; chart 420 × 180 with axes in caption type | used by the bank rate board, stocks, stats and results |
| **ProgressBar** | 6 tall, radius pill | Advisor goals, Road to Office, degree progress |
| **Badge** | pill 20 tall | "NEW", "½ PRICE", "WED", "LOCKED" |
| **ContextPrompt** | card 480 × 64 at the bottom left: KeyHint + verb + object + a detail ("[E] Enter McSticks") | appears within 96 u (the Interact range, B-15 `door.prompt`) of a door or a person you can talk to; from 96 to 160 u a door shows only its plain name tag; fades 150 ms; announced once per new prompt (CONTRACT D52) |
| **FloatText** (canvas) | display 20 in the stat colour with a 3 px ink outline; rises 40 u over 900 ms | pooled |
| **NameTag** (canvas) | 14 / 700 on a paper pill above a named NPC | within 200 u or on hover |

**Component API.** Every component is a factory `SR.ui.<name>(opts)` returning its root element
(`id` becomes `data-id`, focusable parts carry `data-nav`, stateful components expose
`el.update(partialOpts)` and inputs `el.value`, chips carry `data-chip="<kind>"`). The names W1-D
built beyond this table (`iconButton`, `swipe`, `chip.gains / costs / fromDelta / text`,
`tooltip`, `SR.ui.dom`, `SR.ui.focus`, `SR.ui.toast`, `SR.ui.stamp`, `SR.ui.modal`, `SR.ui.confirm`,
the HUD's ghost deltas and chip targets, the card's feedback and hooks, `SR.ui.subhost`,
`SR.ui.dialog`) are listed in ARCHITECTURE §7.1 / §7.3 and CONTRACT §15.4.

## 3. Screen map and flows

```
Boot ─ Title ─┬─ Continue (latest of suspend / auto / slots) ─────────────────────────→ City
              ├─ New Game → 1 Length & Difficulty → 2 Character → 3 Name & Look → Intro → Home (day 1)
              ├─ Load → Save slots → City / Home
              ├─ Classic (2005 rules) → confirm → ../stick-rpg/index.html
              ├─ Hall of Fame · Achievements (→ Profile) · Settings · Credits
City ─┬─ door → resolver ─→ Building ─┬─ sub-screen (bank, stocks, real estate, furniture, shop, jobs,
      │   (home: Live / Owned /     │               bus board, transcript, campaign, TV, messages, VIP)
      │    For Sale → Tour →        │
      │    bank.realestate)         │
      │                           ├─ minigame overlay → back to Building
      │                           ├─ Sleep → Morning Report → City | Results
      │                           └─ Bus trip → Trip scene → Event card → City (24:00) | Jail
      ├─ street person / "!" → Dialog sheet (choices) → City
      ├─ Tab / Select → Pocket (Journal · Map · Stats · Bag · Messages · Phone · Achievements)
      ├─ Esc / Start → Pause (Resume · Settings · Save* · Load · Suspend & Quit · Retire† · Quit to title)
      ├─ edge → Fold Rescue (1.5 s) → City
      ├─ police → Dialog (Talk · Bribe · Run) → City | Jail
      └─ HP 0 (any scene; queued until the top scene is a base scene) → Second Wind toast
           | Hospital (FLATLINED gag → bill card → Stick General report → City 12:00, home door)
           | FLATLINED → Results with DECEASED (Hardcore)
Jail ─ Jail Day card + one-line night report ×N → City (08:00, outside City Hall)
Results (Final Edition) → Hall of Fame entry → Title | Keep playing (timed games)
Sleep on campaign day 7 → Election-night edition → City | Results
```
(*hidden on Hardcore, whose single slot saves itself after every HP, money or karma change and each
night; † Unlimited only.)

## 4. Global chrome

### 4.1 City HUD (P0)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ (◉) RIKKI          ♥ ▓▓▓▓▓▓▓▓▓░░░ 34 / 40     ◔  14:30              $1,240          [Tab ▤] [☰]│  row 1  y 8-32
│     Salesperson    [STR 12][INT 88][CHA 30]      Tue · Day 12 / 40 ☂   bank $3,000             │  row 2  y 40-64
│     [Winded] [Tipsy ×2]                                               🔥 Heat ▓▓░░ 35           │  row 3  y 72-96
│ ◎ Reach INT 120 for Executive  ▓▓▓▓▓▓░░ 88 / 120        ┌──────────────────────────┐           │  goal   y 104-132
│                                                         │ toast lane (x 560-960)   │           │
│                                                         └──────────────────────────┘           │
│                                                                                                │
│                                       ( the world )                                  ┌────────┐│
│ ┌──────────────────────────────────┐                                                 │minimap ││
│ │ [E] Enter McSticks               │                                                 │ 184²   ││
│ └──────────────────────────────────┘                                                 └────────┘│
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Left (x 16-420):** KarmaMedallion 48 (your head in karma colour; P0 colour, P1 glyph ring), name
  16 / 700, job title 14; HP Meter; three StatChips; status badges under them (Winded, Tipsy ×n,
  Wanted at Heat ≥ 50).
- **Centre (x 540-760):** ClockRing 64 (spans rows 1-2), time (label 20 / 700), "Tue · Day 12 / 40"
  (14; "Day 12" in Unlimited), today's weather glyph (P1); its tooltip shows tomorrow's forecast
  only once a source revealed it today (TV News, the paper, Market Watch, the binoculars),
  otherwise "Forecast: buy a paper".
- **Right (x 860-1264):** cash (`--fs-28` / 900, money-ink; counts up or down over 400 ms), bank
  (14), Heat meter (row 3) only while > 0, Pocket button (Tab), Pause button.
- **Tracked goal (P1):** the Advisor's first goal, with a ProgressBar; click opens the Journal.
- **Minimap (P0, toggle N or setting):** island silhouette, roads, doors as brand-coloured dots,
  your arrow, your car, "!" markers, waypoint. Click opens the Map tab.
- **Minimal HUD (H):** only HP and the ClockRing until something changes (then 3 s full HUD).
- **Edge-of-screen arrows (P1):** toward the waypoint and active encounters within 1.5 screens.
- The HUD updates only on events (ARCHITECTURE §13) through one batched write per frame.

### 4.2 Compact HUD (buildings)

A single 48 px strip over the interior (x 16-760): HP meter, ClockRing 40 + time, day, cash. The card
footer repeats cash and time for the reading eye.

### 4.3 Feedback after an action

1. The row flashes (200 ms); the proprietor plays a react animation; FloatTexts rise from your
   stick in the diorama.
2. Gain and cost chips fly from the row to their HUD counters (200 ms, staggered 60 ms).
3. The ClockRing sweeps through the spent time with a tick-tock (0.1 s per 30 m, max 0.8 s).
4. Money counters count; stat chips pulse; a Stamp plays for stat gains ≥ 2, promotions, degrees,
   jackpots and the rank ("+2 INTELLIGENCE!"). A stat gain stamps once: the card drops its own
   derived stat stamp when the rules already raised `stamp.stats.<stat>`, and during a hold-to-repeat
   only the first run's stat stamp shows (§1, principle 3).
5. The interior window's sky tweens to the new hour; the card refreshes previews.
6. On leaving a building after ≥ 1 h spent: the time-lapse (P1, GDD §3.12).

## 5. Screens

### 5.1 Boot (P0)

Paper background, the logo drawing itself in ink strokes (1.2 s), "Fan remaster. Not affiliated
with or endorsed by XGen Studios." (16), and "Press any key" (the audio unlock). Loads settings and
the profile. If storage is unavailable, a warning toast.

### 5.2 Title (P0)

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│  PAPER SKY                                             ┌───────────────────────┐  │
│  [a Stick RPG fan remaster]                             │ ▢ thumbnail 160×90    │  │
│                                                         │ RIKKI · Day 12 / 40   │  │
│  ▸ Continue                                             │ Salesperson · $4,210  │  │
│    New Game                                             │ Standard · 3h 12m     │  │
│    Load                                                 └───────────────────────┘  │
│    Classic (2005 rules)                                                            │
│    Hall of Fame                                                                    │
│    Achievements                          (the live city drifts at dusk behind)     │
│    Settings                                                                        │
│    Credits                                                                         │
│                                                                                    │
│  Fan remaster. Not affiliated with or endorsed by XGen Studios.   v0.1 · Old School ★│
└───────────────────────────────────────────────────────────────────────────────────┘
```

- The background is the real renderer in title mode: a slow camera drift over the city at 19:00,
  distant islands, clouds (P1: follows the real clock of the last save).
- Menu: a vertical List in display 24; the save card shows the most recent save. **Classic** opens
  a confirm ("Open the 2005-rules recreation? Your game is saved.") and then
  `../stick-rpg/index.html` in the same tab (after a suspend save if a game is running).
- A "What's new in the remaster" card appears once, under the menu (dismissible).
- **Achievements** opens the `profile` scene (§5.18). The Classic confirm adds: "Use your browser's
  Back button to return; Continue resumes your game."
- **Press any key or click** on the boot screen; with only a gamepad connected it reads "Press A to
  start. Sound begins after one click or key press." (a gamepad is not a user activation).

### 5.3 New Game wizard (P0)

A centred 960 × 560 paper card with a 3-step header (1 Length & Rules · 2 Character · 3 Name &
Look), Back and Next.

- **Step 1:** two Segmented controls with one-line explanations: Length (Short 15 · Medium 40 · Long
  100 · Unlimited; Custom 7-365 under "More", P2) and Difficulty (Relaxed · Standard · Hardcore).
- **Step 2:** three paper dice roll (animated) for STR / INT / CHA, the extra points pool, +/-
  steppers, **Roll again** (unlimited, orig) and **Fair start** (7/7/7 + 6); live readouts: HP
  (= STR + 15), "You can apply at NLI at INT 20".
- **Step 3:** name TextField (≤ 16), accessory carousel (8: none, cap, beanie, glasses, bow tie, scarf,
  headphones, top hat; P1, flag `accessories`, CONTRACT D68), a rotating stick preview in
  karma-neutral blue, the tutorial toggle, **Begin**. Naming yourself `PAPERGOD` shows a wink and no warning.

### 5.4 Intro (P0)

About 25 s, skippable by holding any key for 0.6 s (a hold-to-skip ring). Five beats with captions:
a desk at night lit by a lamp, with a doodled city on a sheet; you doze off; the sheet curls and
pulls you in as you flatten into ink lines; you fall past floating paper cities; the camera pulls
out of your apartment's roof to reveal the city floating in the sky and a card: "Day 1. 08:00.
$100. Mind the edges." The game starts inside the apartment with the answering machine blinking.

### 5.5 City (P0)

HUD (§4.1), the world, the context prompt ("[E] Enter McSticks" within 96 u), plain door name tags
(from 96 to 160 u), name tags,
"!" markers (P1). Click or tap the ground to walk there (a dotted ink route). With touch: the
virtual stick (floating, left half), and a button cluster at the bottom right: Action (96 px),
Skate toggle (64), Car (64), with the Pocket and Pause buttons in the HUD.

### 5.6 Building screen (P0)

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ ♥ 34/40  ◔ 14:30  Tue D12  $1,240                                                      │
│                                              ┌───────────────────────────────────────┐ │
│                                              │▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│ │
│       interior diorama (x 0-760)             │ McSTICKS                    (Mel ☺)  │ │
│       · window shows the live sky            │ ┌───────────────────────────────────┐ │ │
│       · proprietor at the counter            │ │ "Fries are a vegetable if you      │ │ │
│       · your stick stands in the scene       │ │  squint."                          │ │ │
│         and reacts to actions                │ └───────────────────────────────────┘ │ │
│                                              │ EAT                                   │ │
│                                              │ 1 🥤 Milkshake      +12 HP   $8  30m  │ │
│                                              │ 2 🍟 Fries          +20 HP  $12  30m  │ │
│                                              │ 3 🍔 Cheeseburger   +40 HP  $25  30m  │ │
│                                              │ 4 🍔 Triple Burger  +80 HP  $50  30m  │ │
│                                              │ WORK                                  │ │
│                                              │ 5 🧑‍🍳 Work: Cook [Full|Half|OT]       │ │
│                                              │     +$42 · +1 karma      6h [Hustle▶] │ │
│                                              │ 6 ▲ Ask for promotion                 │ │
│                                              │     Needs CHA 20 (you: 14)            │ │
│                                              │───────────────────────────────────────│ │
│                                              │ [Esc] Leave           $1,240 · 14:30  │ │
│                                              └───────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

- **Card** at 776-1248 × 72-704. Header: building name (h3, brand strip), the owner's Portrait and a
  greeting in a SpeechBubble (by first visit, time, karma, weather, job). Groups: Eat · Buy · Work ·
  Train · Services · Crime · Special, in that order, each with a small caps header.
- **Rows** come from `SR.preview` for every action of the building, re-evaluated after each action
  and when the clock changes. Hidden actions (conditions in `hidden`, or a `feature` flag that is
  off) don't show; everything else shows, disabled with a reason if needed ("Ends after midnight",
  "Need $20", "Full HP", "Too hurt", "Need INT 75 (you: 61)", "Buses leave at 00:00").
- **Hotkeys** 1-9 map to visible rows in order; ↑ / ↓ move focus; Enter runs; R repeats the last
  action of this card if it is `repeatable`; holding Enter / A repeats it every 0.35 s until it is
  refused or anything modal appears (§1).
- **Sub-screens** (ARCHITECTURE §7.1) replace the card body with a Breadcrumb and their own content;
  a row whose action has `screen` opens one; Esc goes back one crumb (a sub-screen can veto Back
  with a confirm, e.g. a typed amount). Sub-screens call `ctx.preview` for live chips and `ctx.act`
  to commit; the card plays the feedback and refreshes them.
- **Home door modes** (GDD §3.6): *Live* is the full home card; *Owned* shows that home's interior
  with Move in · Let out / End the let (P1) · Sell (P1) · Leave; *For Sale* shows a For Sale card
  (exterior thumbnail, price, slots, sleep bonus, perk) with Tour (opens `bank.realestate` focused
  on the home, where Buy works) · Leave.
- Proprietor animations: idle, talk (while the bubble types), react-happy (purchase), react-shock
  (robbery), work (while you work).

**Sub-screens** (inside the card, or a Pocket panel for phone apps; ids frozen in ARCHITECTURE §7.1):

| Sub-screen (id) | Content | P |
|---|---|---|
| Bank › Deposit / Withdraw (`bank.deposit`, `bank.withdraw`) | NumberField with 10 % / 50 % / All; the balance; Confirm | P0 |
| Bank › Loan (`bank.loan`) | credit limit, rate (r + 1 %), 15 days, NumberField; current loan with days left and Repay; a lien, if any, and the credit freeze date | P0 |
| Bank › Rates (`bank.rates`) | today's rate and a 30-day Sparkline; tier explanation and the nightly cap | P0 |
| Bank › CDs (`bank.cds`) | open (amount, rate × 1.2, matures on day n), list with Break | P1 |
| Bank › Real Estate (`bank.realestate`, optional `homeId` focus) | property cards: exterior thumbnail, price, slots, sleep bonus, perk, rent; Buy / Sell / Move in / Let out | P0 / P1 |
| Home › Stocks (`home.stocks`; computer; phone with Workstation) | 6 ticker rows: price, change, 30-day sparkline, held, average cost, P/L, Buy / Sell with NumberField (Sell only up to what you hold: no shorts); the day's tip banner only after a source revealed it ("NLI ▲ · seen on TV · reliability 62 %"), otherwise "No tip yet today"; position cap and spread noted | P0 / P1 |
| Home › TV (`home.tv`) | channel list (News, Fitness, Dating, Market Watch) with remaining views today; the show plays as a 2 s animated card with a joke headline | P0 |
| Home › Messages (`home.messages`) | inbox list (from, day, unread dot), reader with an answering-machine beep and a typewriter; Archive (archived messages are kept longest; the inbox holds 150) | P0 |
| Fine Line › Browse (`furniture.browse`) | piece cards in a 2-column grid with price, slots, effect; selecting one ghosts it into your current home's interior preview; Buy / Upgrade | P0 |
| Pawn › Buy / Sell (`pawn.shop`) | list rows; Sell tab (P1) lists pawnable items at 40 % | P0 / P1 |
| NLI › Jobs (`nli.jobs`) | the ladder as a vertical list: each rank's INT, CHA, shifts and wage; you-are-here marker; missing requirements in danger-ink | P0 |
| U of S › Transcript (`uofs.transcript`) | classes per track, degree progress bars, seminar status | P1 |
| Bus › Board (`bus.board`) | departure-board style rows: city, ticket, wants, demand hint (P1), reputation stars (P1), "toured this week" tick (P1), [Red-eye 00:00] and [Tour 06-10] buttons; "Next red-eye in 9h 30m"; "Wait for the tour bus" before 06:00 | P0 / P1 |
| City Hall › Campaign HQ (`cityhall.campaign`) | the poll Meter with the 50 % line, day n / 7, war chest, action rows with "used 1 / 2 today" and the halved second use, the rival's nightly gain, the event log, the debate on day 4 | P0 |
| City Hall › Mayor's Office (`cityhall.mayor`) | the 3 offered decree cards (pick one, or keep the offer); active decrees; Rename the City uses a TextField | P1 |
| Casino › VIP desk (`casino.vip`) | points, tier and progress to the next, "Claim a free drink" (Silver: 2 a day, 0 h, +1 CHA +1 Buzz), the limits table, Saturday double points | P1 |

### 5.7 Dialogs and choice cards (P0)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ┌──────────┐  HOMELESS HAROLD                                                        │
│ │ portrait │  "The sky ate my hat once. Still waiting for it to come back down."     │
│ │  176²    │                                                                         │
│ │          │  [1 Give $10   -$10 · +2 karma · 1h]   [2 Give a bottle  -1 🍺 ]        │
│ └──────────┘  [3 Leave]                                                              │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- The Dialog sheet (32-1248 × 472-704) freezes the world and the clock under it (the original's
  frozen map). A portrait on the left, the text, then 2-4 choice Buttons, each with chips and, for
  checks, a chance chip ("62 %"). Encounters, shift events, police stops and Jail Day use the same
  sheet. The camera eases 10 % toward the speaker.
- A choice may carry a **NumberField** (`SR.ui.dialog.open({ choices: [{ id, label, number: { min,
  max, step, label } }] })` returns `{ choice, n }`): Red's "Buy n grams" (1..99 minus what you hold,
  with the live price and karma chips) and the busker's tip use it.
- The Bag's **Give** works while a street dialog is open and runs the same action as the dialog's
  own row.

### 5.8 Minigame frame (P0)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◀ Exit  DARTS · MATCH           Stake $50 · Target 230      $1,240   [Auto][Assist]│  y 0-64
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                              play area (canvas)                              │  y 64-640
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ [Space / A] Throw     [Esc] Pause                    Darts left ▮▮▮▮▮▮▯▯▯▯     │  y 640-720
└──────────────────────────────────────────────────────────────────────────────┘
```

| Minigame | Play area layout | Controls |
|---|---|---|
| Fight | side view: you left, opponent right, both 280 u tall rigs; HP bars over each; AP pips; move buttons at the bottom (Punch 1 · Kick 2 · Fireball 3 · Ink Beam 4 · Guard 1 · End Turn · Run), each with its damage range chip; the "(it froze)" link at the bottom right; the taunt bubble | 1-7, click, D-pad + A |
| Darts | the board centred (r 220 px), the wobbling crosshair, the ghost board at Buzz ≥ 2, the score column; "match 2 of 3 today" | aim with the pointer, the stick or the arrows; Space / click / A throws |
| Slots | the cabinet centred: 3 reels 120 × 300, pay table on the left, bet Segmented, Spin lever | Space / A spin, 1-4 bet, A (hold) auto-spin |
| Blackjack | dealer's hand top, yours bottom, the shoe and discard, chips row, counts panel (Card Sharp), "hand 12 of 60 today" | context map: H hit, S stand, D double, P split, 1-5 chips (these keys never move you or toggle the HUD here); pad: A hit, B stand, X double, Y split |
| Roulette | the wheel left (r 180), the betting board right (a 3 × 12 grid plus outside bets), chip Segmented, history | context map: arrows / D-pad move the active space, 1-4 chips, Enter place, **C clears the bets**, Space spins; Backspace stays Back |
| Scratch | a card with 3 panels | drag, or Space scratches the next |
| Shift Rush | *orderup:* 6 ingredient bins in a row, the ticket rail above; *sortit:* a conveyor down the middle, 3 bins | 1-6 and Enter / ← ↓ → |
| Timing Ring | the ring centred (r 160), the sweet arc, hit pips | Space / A / tap |
| Duel | a card per beat: the situation, 2-4 option Buttons with stat, D and chance chips; in stance mode the opponent portrait with a stance hint | 1-4, click |

- **Auto** plays the round for you with a fixed policy and real draws (ARCHITECTURE §10), shown as a
  quick replay (≤ 2 s) that can lose; roulette has no Auto. **Assist** is a toggle for the session
  (settings default). **Pause** freezes timers. **Exit** asks to confirm if a stake is live.
- Every engine's **key map is an input context** pushed by the frame, so its keys never trigger the
  city's actions; the bottom bar shows the context's glyphs. Every skin of an engine shares its
  context (Shift Rush's is `orderup`), so Settings › Controls remaps `orderup`, `timingring` and
  `duel` once for all their skins.
- The play area is its **own canvas** (`[data-id="mg-canvas"]`, sized to the play area's device
  pixels) inside the frame, so pointer mapping stays exact in the touch-compact layout (CONTRACT
  D56).
- **Screen readers:** the frame mirrors the game state in DOM text (visually hidden where the canvas
  already shows it) and announces changes in `#aria`: cards and totals ("Dealer shows 10. You have
  17."), the roulette result ("Red 32. You win $50."), slot lines, fight HP and AP ("Your HP 34.
  Iron Irma 20. 3 AP left."), darts scores, beat outcomes.

### 5.9 Pocket (P0; Tab / Select)

A paper notebook slides up (350 ms) over the dimmed world (the city freezes). Owning the cell phone
reskins it as a phone with an app grid on the Phone tab.

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ JOURNAL   │  Tuesday · Day 12 of 40 · 14:30                                  [✕ Tab]│
│ MAP       │ ─────────────────────────────────────────────────────────────────────── │
│ STATS     │  ADVISOR                                                                │
│ BAG       │  ◎ Reach INT 120 for Executive       ▓▓▓▓▓▓▓░░░ 88/120                  │
│ MESSAGES •│  ◎ Save $2,000 for the Pixelwright PC ▓▓▓░░░░░░░ 640/2,000               │
│ PHONE     │  ◎ Skid is at the mansion corner now                                     │
│ ACHIEVE.  │  ROAD TO OFFICE  (castle ✗ · $200k ✗ · stats 666 ✗ · karma +25 ✓)       │
│           │  ARCS  Harold ▓▓▓░░ · Skid ▓░░░░                                        │
│           │  HELP  time · stats · karma · jobs · money · crime · the endgame        │
└────────────────────────────────────────────────────────────────────────────────────┘
```

| Tab | Content | P |
|---|---|---|
| Journal | the First Day list (tutorial), Advisor (3 goals with ProgressBars), Road to Office checklist, arcs, Help topics (re-read every tip) | P0 (First Day, Help) / P1 |
| Map | the whole island as an ink map (pan, zoom 0.25-1); place pins in brand colours; your arrow; filters (Food, Work, Train, Shops, Services, People); click a place → a card (actions summary, walking time) with **Set waypoint** and, with a phone, **Call a cab ($15)**; the Fold Map (P1) shows every interactable | P0 / P1 |
| Stats | name, title, STR / INT / CHA with 14-day Sparklines and next-perk ticks, karma slider (-100..+100 with the band colour and tier), HP, Heat, Buzz, job and rating, degrees, perks (and a pending pick), net-worth breakdown, days played, mode, records (falls, fights, jail days) | P0 / P1 |
| Bag | a grid of 64 px tiles with counts; Use, Give, Info; the pill auto-use toggle; owned furniture, homes and vehicles listed below | P0 |
| Messages | the inbox (read anywhere with a phone; otherwise "Messages can be played at home") | P0 |
| Phone | apps: Cab (pick a door on the map: $15, 30 m), Stocks (`home.stocks`, Workstation), Contacts, Summon car, Settings, Save | P1 |
| Achievements | a grid of 48 with locked silhouettes and progress; profile totals | P1 |

**Contacts** (`SR.def.contact`, `data/actions/phone.js`; each call is an action):

| Contact | Listed when | Call does | P |
|---|---|---|---|
| Sal Paperweight, lawyer | always | **Bail** while in jail (B-11c price); otherwise a 10-second joke about billable hours | P1 `police` |
| Paperweight Realty | always | opens `bank.realestate` in the phone (buy, sell, let from anywhere) | P1 `homesPlus` |
| Sky Cabs | always | the Cab app | P1 `phone` |
| Red | after your first purchase, until he is turned in | "Where you at?": sets a waypoint to Dealer Alley; shows what you owe and the due day | P1 `arcs` |
| Det. McHolland | informant stage | **Pass a tip** (the weekly Precinct tip, 30 m, by phone) | P1 `police` |
| Buyers (5) | after their voicemail | shows their city and today's demand hint for it | P1 `tours` |
| Stick General | always | hold music and "Please stay conscious" | P1 `phone` |
| The Electoral Board | while nominated | reads the acceptance deadline and the war-chest options | P1 `phone` |

### 5.10 Pause (P0)

A 480-wide card over the dimmed world: Resume · Settings · Save (Hardcore: hidden) · Load · Suspend &
quit · Retire (Unlimited) · Quit to title. Quit and Retire ask to confirm.

### 5.11 Morning report: The Daily Fold (P0; graphs and forecast P1)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│               THE  DAILY  FOLD            Morning Edition · Wed · Day 13     │
│ ═════════════════════════════════════════════════════════════════════════════│
│   LOCAL STICK FALLS OFF CITY FOR 20TH TIME; "I'M FINE," SAYS STICK            │
│ ─────────────────────────────────────────────────────────────────────────────│
│  OVERNIGHT            │ YOUR MONEY             │ MARKETS          │ WEATHER   │
│  +27 HP restored      │ Interest +$42 (1.4 %)  │ NLI ▲ 4.1 %      │ ☀ today   │
│  +2 INT (Atlas)       │ Loan: 6 days, $1,210   │ SKY ▼ 7.9 %      │           │
│  Caffeine pill used   │ Rent +$240             │ Yesterday's tip  │           │
│                       │                        │ (NLI ▲) was right│           │
│ ───────────────────────────────────────────────────────────────────────────── │
│  TODAY IN THE CITY: Half-price classes at U of S · 2 unread messages · Heat 15 │
│                                                         [ Good morning ▸ ]     │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Sections** come from each report line's `section` (ARCHITECTURE §6.6): Overnight · Your money ·
  Markets · Weather columns, then the "Today in the city" strip. A section with no lines collapses.
- **No free information:** Markets shows only yesterday's movers and, if you had seen yesterday's
  tip, whether it was right; today's tip appears nowhere until a source reveals it. Weather shows
  only today's weather; tomorrow's forecast is sold by the paper, TV, Market Watch and the
  binoculars.
- Newspaper type (`--font-news`) for the masthead and the headline; body in `--font-ui`. Each line
  has an icon. The headline is the heaviest entry of yesterday's log (BALANCE B-29), else a city
  absurdity. The Continue button is focused; A / Enter closes. On the last day of a timed game the
  button reads "Read the Final Edition ▸".
- **Editions** (from `report.kind` and `report.election`): *Morning* (sleep); *Stick General* (after a hospital night: the
  masthead "STICK GENERAL BULLETIN", the bill and the written-off part, then the usual sections);
  *Election night* (after campaign day 7: a full-width front page with the result headline, the
  final poll bar with the 50 % line, the ±5 roll animated as a swinging needle, then the stamp
  PRESIDENT OF STICKS / DICTATOR OF STICKS with confetti and the march, or "CONCEDES" with the sad
  trombone; then the usual sections of the night's kind; it is shown even on a jail or hospital
  night); *Jail* (no full page: one line on the Jail Day card).

### 5.12 Jail, hospital, FLATLINED (P0)

- **Jail:** a barred backdrop; a card with "Day 2 of 5", a one-line summary of last night
  ("Interest +$42 · NLI ▲ 2 % · 1 message"), the Jail Day choices as Buttons with chips, Bail (P1,
  with its price), and a gag line per day.
- **Hospital:** the FLATLINED stamp, a flatline, a defibrillator "BZZT", "...JUST KIDDING", then a
  Stick General card: the bill, any part written off, and "Discharged at 12:00"; then the Stick
  General edition of the report; then the city at 12:00 outside your home.
- **FLATLINED (Hardcore):** the stamp over a greyscale city, a dirge sting, then the results with
  the DECEASED banner. A Hardcore loan default shows the morning report first.

### 5.13 Bus trip (P0)

A 6 s scene (skippable after 1 s): the Sky Bus drives into the Bus Hole, rides the Sky Ribbon past
the clouds to the destination island, then the **event card** (an illustrated panel with the outcome
text and chips): the offer with Take it · Haggle (P1) · Walk away, or the bad news with OK. Then a
short ride home and the city at 24:00.

### 5.14 Results: The Daily Fold, Final Edition (P0; graphs P1)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│               THE  DAILY  FOLD        Final Edition · Day 40 of 40           │
│ ═════════════════════════════════════════════════════════════════════════════│
│  GO-GETTER RETIRES TO BIGGER APARTMENT; PIGEONS UNIMPRESSED                  │
│ ┌──────────┐  NET WORTH              $41,380   ┌────────────────────────────┐ │
│ │  photo   │  cash       $1,240                │  net worth by day (chart)  │ │
│ │ (pose by │  bank      $22,100                │  stats by day (chart)      │ │
│ │  karma)  │  stocks     $3,040                └────────────────────────────┘ │
│ └──────────┘  homes      $9,000   ...           STR 212 · INT 388 · CHA 190  │
│                                   ╔═══════════╗ karma +34                     │
│   PRESIDENT OF STICKS (banner)    ║ GO-GETTER ║ ← the rank stamp              │
│                                   ╚═══════════╝                               │
│  Achievements this run: 12 · Legacy 18,420 · Hall of Fame #3 (Medium)         │
│                     [ Keep playing ]  [ Title ]  [ Copy summary ]             │
└──────────────────────────────────────────────────────────────────────────────┘
```

- The net worth counts up (orig) over 2.5 s with ticks, then the rank stamp thumps on (orig motif)
  with a key change in the music. The headline is templated from rank, title and karma. The photo
  is your stick in a pose by karma column (halo, shrug, horns). Banners per BALANCE B-18.
- **Hall of Fame entry:** the run is filed under its length (Custom: the nearest standard length;
  Keep playing: entered once at the original end, never again; the cheat name never).
- **Copy summary** copies plain text (clipboard, or the textarea fallback of §5.16):

```
PAPER SKY · {name} · {RANK}{ · BANNER}
Day {day} of {length} · {difficulty} · Net worth ${netWorth}
STR {str} · INT {int} · CHA {cha} · Karma {karma}
{title} · {home} · Legacy {legacy}
"{headline}"
{fanNote}
```
  (`{length}` is "Unlimited" for unlimited runs; `{fanNote}` is the `ui.fanNote` text key.)

### 5.15 Settings (P0)

Tabs: **Game** (24 h clock, hints on later runs, "Tutorial for this game" (only while a game runs;
it writes the save's `mode.tutorial`), always Auto for hustles, confirm spends over $, hold Enter to
repeat, right-click = back, skate toggle vs hold, minimap, minimal HUD) · **Controls** (remap
keyboard and gamepad per action and per minigame context with conflict warnings; reset) ·
**Audio** (Master, Music, SFX, Ambience, UI sliders; mono) · **Display** (quality Auto / High /
Medium / Low, fps cap, fullscreen, screen shake, lean (P2)) · **Accessibility** (§8). Changes apply
live and save immediately. The pill auto-use toggle lives in the Bag (it belongs to the save).
There is no save tab: save codes and files are under Save / Load › More (§5.16).

### 5.16 Save / Load (P0)

Slot cards (3 + Auto + Suspend): thumbnail 160 × 90, name, day / length, title, net worth, play time,
saved-at. Actions: Save here / Load / Delete (confirm). **More** (the only place for save codes and
files): Copy save code (if the clipboard is unavailable, a modal shows the code in a read-only,
pre-selected textarea: "Press Ctrl+C / Cmd+C"), Paste save code (a TextField), Download file,
Import file. Hardcore shows only the ironman slot ("In progress · Day 12, 14:30" while a day is
under way).

### 5.17 Perk card (P1)

A modal with two perk cards side by side (icon, name, one-line rule) and "Decide later". Appears
after the action that crossed the milestone, never during a minigame.

### 5.18 Hall of Fame, Profile (Achievements), Credits (P1 / P0)

- **Hall of Fame:** tabs per length (Short, Medium, Long, Unlimited), top 10 rows (name, rank, net
  worth, legacy, date, difficulty).
- **Profile** (`profile` scene, from the title's Achievements; works with no game running): tabs
  *Achievements* (the 48-tile grid with the run day of each unlock and locked silhouettes),
  *Badges* ("Old School", "Met the Artist"), *Totals* (runs finished, days played, falls, fights,
  best net worth per length). The Pocket's Achievements tab shows the same grid for the current
  run.
- **Credits:** the fan note, the tools, "Classic mode is a separate faithful recreation included in
  this repository; your browser's Back button returns here", and a **Back to title** link.

## 6. Input mapping

Actions are defined in ARCHITECTURE §11. Per-screen meaning:

| Context | Keyboard / mouse | Gamepad | Touch |
|---|---|---|---|
| City | WASD / arrows move; Shift skate; C car; E / Enter interact; Tab pocket; M map; I bag; J journal; Esc pause; click ground to walk; wheel zoom; H minimal HUD; N minimap | LS move; RT skate; Y car; A interact; Select pocket; Start pause; RS click zoom | stick; Action, Skate, Car buttons; tap to walk; pinch zoom |
| Building card | 1-9 rows; ↑↓ focus; Enter run; R / hold Enter repeat (repeatable rows only); ←→ variant; Esc leave / back a crumb | D-pad focus; A run (hold repeats); LB / RB variant; B back | tap rows; long-press repeat |
| Text fields | typing; Enter submit; Esc cancel; Tab next (every other action is suppressed) | on-screen keyboard where available; A submit; B cancel | the system keyboard |
| Dialog | 1-4 choices; ↑↓; Enter; Esc = Leave where offered | D-pad, A, B | tap |
| Pocket | Q / E tabs; arrows; Enter; Tab or Esc close | LB / RB tabs; D-pad; A; B close | tap tabs, swipe |
| Minigames | the engine's context map (§5.8); Esc pause | the context map; Start pause | on-screen buttons per game |
| Menus | arrows, Enter, Esc | D-pad, A, B | tap |

- **Spatial focus navigation** (`js/ui/focus.js`): arrow keys and the D-pad move focus to the nearest
  `[data-nav]` element in that direction within the current focus scope (card, modal, notebook).
  Every screen is completable without a pointer.
- **Tab** opens the Pocket only in the city scene. Inside a focus scope (building card, menus,
  modals) Tab / Shift+Tab move focus in DOM order, and the Pocket opens from the compact HUD's
  Pocket button or the M / I / J shortcuts; Esc closes the Pocket everywhere. Tab fires the
  `pocket` action everywhere (CONTRACT §12.1), so scenes other than the city ignore `pocket` when
  `ev.code === 'Tab'`, and the Pocket closes on it (it does not also move focus).
- **How DOM UI takes input** (CONTRACT §15.5, D57): a scene's `onAction` offers each action to
  `SR.ui.focus.handle(action, ev)` first (arrows move focus inside the current scope or are consumed
  by the focused control; `confirm` activates it), then handles what is left (`back`, `rowN`,
  `repeat`, `tabPrev` / `tabNext`). UI scenes ignore `interact` (E, Enter, Space and A also fire
  `confirm`); the browser's own Enter / Space activation of a focused control is suppressed, so a
  key activates once; Tab / Shift+Tab wrap inside the scope; a Stamp swallows the press that skips
  it. Pause, Settings, Save / Load, Title and the Pocket follow the same rule.
- **Glyphs** follow `SR.input.last`. Everything is remappable (Settings › Controls), including each
  minigame context.
- **Touch scrolling:** only the world canvas and minigame play areas use `touch-action: none`; card
  bodies, Pocket lists, sub-screens, settings and save slots scroll with a finger (`pan-y`).
- **Haptics** (`navigator.vibrate` / gamepad rumble where available): 30 ms on hits and rewards
  (setting).

## 7. Motion rules

- UI tweens use `--dur-*` and `--ease-*`; the world uses springs. Nothing blocks input for more than
  350 ms, except the Stamp (900 ms), which input can skip.
- Scene transitions: page turn 350 ms; door zoom 200 ms + page turn.
- **Reduced Motion** (system default or setting): no screen shake, no Buzz sway, no parallax on the
  title, time-lapse and page turns become 200 ms crossfades, stamps appear without scale, confetti
  40 pieces instead of 120.

## 8. Accessibility

| Option | Effect |
|---|---|
| Text size | 100 / 125 / 150 % (`--ui-scale`); cards reflow, rows grow, bodies scroll; tested with no clipping at 150 % |
| High contrast | §2.1 swaps |
| Colour-blind | protan / deutan / tritan palettes for stats, karma and the map legend; karma always also has its glyph (halo / dot / horns) and a numeric tooltip; roulette colours also get patterns |
| Reduced motion | §7 |
| Flash reduction | lightning becomes a soft brighten; no neon flicker; casino lights steady; police bars steady |
| Captions | on-screen captions for important sounds with a direction arrow: "[car horn ←]", "[answering machine beeps]", "[wind at the edge →]", "[siren]" |
| Assist | minigame Assist by default; longer teeter grace (300 ms); two sub-options: **Safe edges** (unrailed edges bounce you back like Guard Rails; no falls; fall achievements and Pilot Ori's gags are off) and **No gusts** (Windy weather never pushes you) |
| Typewriter speed | 30 / 60 / 120 characters per second / instant |
| Hold vs toggle | skate, hold-to-skip |
| Screen reader | real `<button>`, headings and lists; ARIA roles and names; toasts, stamps and results in the `aria-live="polite"` region; the city prompt is announced; **canvas minigames mirror their state** as text (hands and totals, the roulette result, slot lines, fight HP and AP, darts scores, beat outcomes; §5.8) |
| Contrast | text ≥ 4.5:1, large text ≥ 3:1, verified by the a11y test |
| Pace | nothing in the UI is timed outside minigames; minigames pause |

## 9. Onboarding (P0 First Day and hints; P1 Advisor)

In the world, not on instruction pages. Every hint is stored in `journal.hintsSeen` (per run) and
`profile.hintsSeen` (skipped on later runs while `settings.game.hints` is off), can be re-read under
Journal › Help, and can be turned off. The Day 1 script runs when the save's `mode.tutorial` is on
(chosen in the new-game wizard).

**Day 1 script (tutorial on):**
1. Inside the apartment, the answering machine blinks; the card's Messages row pulses: Mel offers
   you a job at McSticks (new text for the original premise). The Journal's **First Day** list opens:
   check messages · eat something · work a shift at McSticks · study at U of S · go home and sleep.
2. First Leave: a move prompt with device glyphs; dismissed after 200 u of movement. A waypoint
   points to McSticks.
3. Near the McSticks door: "Walk into doors, or press [E]."
4. First building card: a one-time coach mark over one row's anatomy (time chip, cost, gain).
5. After the first timed action: a ClockRing coach mark: "Actions spend hours. Nothing can start
   after midnight. Walking is free."
6. First stat gain: the stat chip pulses; a tip explains STR (HP), INT (jobs), CHA (people) and karma.
7. At 20:00, or with ≤ 4 h left: a "Head home" waypoint.
8. First morning report: each section is highlighted once.
9. Day 2 morning: the Advisor opens with 3 goals (P1); the First Day list closes.

**One-shot hints on first occurrence:** near an unrailed edge ("Mind the edge. Really."); first fall
(Pilot Ori); first car ahead; first time at 24:00; first time with INT ≥ 20 ("NLI is hiring
janitors"); first street person; first rain; first phone; first casino visit (odds shown); first
Heat; first nomination condition met.

**Advisor (P1, `SR.rules.advisor.goals`):** up to 3 goals chosen by priority from state: the next
promotion's missing requirement, the next affordable useful purchase (alarm, bed, TV, PC, bigger
apartment...), a karma or arc opportunity nearby ("Skid is at the mansion corner"), an expiring
thing (loan days, encounters), the Road to Office once any stat reaches 400. Each goal has a
ProgressBar and a waypoint where it has a place.

## 10. UI copy rules

- Action labels ≤ 28 characters, verb first ("Drink a beer", "Ask for promotion").
- Reasons are short and specific: "Ends after midnight", "Need $20", "Need INT 75 (you: 61)",
  "Full HP", "Buses leave at 00:00", "Sticky cut you off", "Come back tomorrow".
- Money `$1,240`; thousands separators; `$1.2M` above a million in the HUD only. Time `14:30` (or
  `2:30 PM` with the 12 h setting); durations `30m`, `2h`, `rest of day`.
- Stat names in chips: STR, INT, CHA; in stamps: STRENGTH, INTELLIGENCE, CHARM.
- Numbers in stamps and results use the display face; everything else the UI face.
