# Paper Sky: Art and Audio Direction

Everything is drawn and synthesized in code. No image or audio file is copied from the original;
small SVG path strings authored for this project are allowed (icons). Palettes live in
`js/art/palette.js` (canvas) and `css/tokens.css` (DOM); no other file contains a colour literal.
The hex values in this document are the **definitions** of palette entries: data and art files
refer to them by key (`'bld.bank.walls'`, `'int.mcsticks.floorB'`, `'karma.good.3'`, `'fighter.7'`,
`'city.gusty.tower'`), and the validator fails on any colour literal elsewhere (ARCHITECTURE §18).

## 1. The art bible

- **Look in one line:** *an ink-and-paper diorama*: flat cut-paper shapes with ink outlines, a
  city printed on one sheet floating over cut-paper clouds, stick people drawn as pure ink strokes.
  Clean and readable first, charming second.
- **The art-bible scene** (`index.html#artbible`, built in wave 1 by W1-A) shows, on one screen:
  every palette swatch with its name, the three tones of five materials, line weights at zoom 0.8 /
  1.0 / 1.25, a sample building (all three door treatments), a sample stick in 8 poses and every
  karma band, a sample interior corner, 24 icons, the paper grain, the Stamp and a FloatText.
  Every art package checks its contact sheet against it; wave 4 audits against it.

### 1.1 Style rules

1. **Flat fills in three tones** per material: base, shade (-12 % lightness) for the south face
   and undersides, highlight (+10 %) for roof edges and top lights. `SR.art.draw.tone(base, -1|0|1)`
   computes them in HSL. No gradients on objects; gradients only for sky, glass, metal, water and
   light.
2. **Ink outlines:** `--ink-900` #1B1D2B at 90 % alpha, round joins and caps. World 2 u at zoom 1
   (scaled with zoom, min 1.5 device px); interiors 3 u; details inside shapes 1 u; UI 2 px.
3. **Paper grain:** a 256 × 256 pattern generated at boot (value noise plus short fibre strokes),
   multiplied at 6 % over ground chunks and building sprites, 4 % over UI paper.
4. **Stacked-paper shadows:** props and characters cast a hard offset shadow (+4, +6) u at 18 %
   ink; buildings cast sun shadows (P1, §4).
5. **Readability:** the player has a 1.5 u white under-stroke and the only karma-coloured head.
   Interactables within 160 u get a soft pulsing 2 u accent rim. Doors always carry a sign, an
   awning or porch, a mat and (at night) a light spill.
6. **Humour in the details:** signs, posters, props and background gags (a stick on the NLI roof
   fishing into the clouds, a "ROAD ENDS. OBVIOUSLY." sawhorse at every road end, a pigeon on the
   statue plinth). All text is drawn with `fillText` in the system fonts.
7. **Faithful identity:** every original building keeps its signature colour and silhouette role
   (§5.2), so the city reads the same at a glance.

## 2. Palette (`SR.art.palette`)

### 2.1 World

| Name | Hex | Use |
|---|---|---|
| `grass` / `grassShade` / `grassHi` | #6CC84A / #4FA83A / #8BD86D | lawns (stipple dots in shade) |
| `parkGrass` | #7BD35A | park lawn |
| `asphalt` / `asphaltSpeck` | #54575F / #62656E | roads |
| `lanePaint` | #FFD23F | centre dashes (54 u dash, 112 u period, 13 u wide, the original's rhythm ×2 on length) |
| `zebra` | #F4F1EA | crossings |
| `sidewalk` / `sidewalkJoint` | #C3C7CF / #9EA3AD | sidewalks, joints every 80 u |
| `path` | #D9CDB5 | paths |
| `plaza` / `plazaJoint` | #CDBFA3 / #B8A987 | Origin Plaza herringbone |
| `paperEdge` / `strata1` / `strata2` / `fibre` | #F3EBDD / #D9C9A8 / #B79A6B / #FFFFFF (70 %) | the sheet's thickness band and torn fibres |
| `paperBack` / `backPrint` | #E4DED3 / #B9B2A6 (25 %) | the Dog-Ear flap, mirrored print |
| `water` / `waterHi` | #4FB6E8 / #9ADCF7 | pond, fountain |
| `glass` / `glassLit` | #8FD6FF / #FFE08A | windows by day / lit at night |
| `ink` | #1B1D2B | outlines |
| `railing` | #3F4254 | promenade railings |
| `stone` / `stoneShade` | #A7A9B4 / #8A8C98 | castle, wall |

### 2.2 Sky keyframes (`SR.art.palette.sky`; interpolated per game minute)

| Hour | Sky top → horizon | Ambient (multiply) | Light factor | Notes |
|---|---|---|---|---|
| 00 | #0E1433 → #26305E | #3A4275 | 1.0 | stars, moon, a comet on day 1's night (a nod to the original's night sky) |
| 05 | #1B2150 → #4B3F6E | #464A7E | 1.0 | birds from 05:30 |
| 06 | #3E4C8A → #F29E7A | #C99488 | 0.6 | dawn, long pink shadows |
| 07 | #7FB6E8 → #F7D3A8 | #F2DCC4 | 0.15 | |
| 09-16 | #5DB8FF → #D6F0FF | #FFFFFF | 0 | crisp shadows |
| 17 | #78BDEB → #FFE2B0 | #FFEBD0 | 0 | |
| 19 | #5A7FC2 → #F7A05E | #F0AE7A | 0.3 | golden hour; neon on |
| 20 | #34407A → #B0668A | #9A7AA8 | 0.7 | lamps on at 19:45 |
| 21-23 | #121A40 → #2E3868 | #3F477A | 1.0 | |

Weather modifies it: Cloudy lerps the sky 30 % toward #9AA6B8 and softens shadows (alpha 10 %);
Rain 50 % toward #7D8794 and the ambient ×0.9; Fog adds a #D8DEE6 veil beyond 500 u.

### 2.3 Characters and the karma palette

- Karma bands: BALANCE B-04c (the original's palettes). Only the **player's head fill** uses them.
- NPC head colours (never inside the karma hues): sage #9DBF8E, mustard #E3B94B, sand #D8C29A,
  grey #A7A9B4, mint #9ED9C3, olive #A4A45A, peach #F2B98E, clay #C9A27E, moss #7FA36B, stone
  #B5B0A1, butter #F1DE8A, taupe #9C8F80.
- Accessory colours come from the district and person tables below.

## 3. Lighting and time

- **Grade:** after the Y-sorted pass, a full-view `multiply` fill with the hour's ambient colour
  (skipped when white).
- **Emissive:** `lighter` pass scaled by the light factor: lit windows (each building has a seeded
  window schedule: 15 % lit 07-17, 60-90 % lit 20-23, 25 % after 01), lamp pools (radial sprite,
  r 90 u, #FFE6A8 at 55 %), neon signs (Sticky's, the casino, McSticks; flicker: 2 % chance per second
  of a 120 ms dropout, off with Flash Reduction), headlights (cone 160 u, 35° half angle) and red tail
  lights, the fountain's underwater lights, the distant islands' pinpricks.
- **Sun shadows (P1):** azimuth sweeps east (06:00) → south → west (20:00), altitude peaks at 13:00
  (60°). Shadow = the roof polygon projected along the sun vector, length h × 0.5 / tan(altitude)
  capped at 3h, 22 % ink; baked per chunk (ARCHITECTURE §9.1); none at night.
- **Time-lapse on exit (P1):** 1.2 s: clouds race ×40, shadows swing, windows and lamps switch on in
  a quick cascade, the sky lerps; a soft tick-tock accelerando.
- **Weather visuals (P1):** rain streaks (angle 12°, length 18-28 u, ≤ preset count), puddle ripples at
  up to 30 decals, a wet sheen strip on asphalt, umbrellas on 50 % of pedestrians, drips from
  awnings; storms add lightning (a 120 ms white-blue flash to 35 %, Flash Reduction: a 400 ms
  brighten to 12 %); fog: cloud banks spill over the edges and drift; wind: litter and leaves,
  flags stream, the torn edge flutters.

## 4. The sheet, the ground and the sky

- **Torn edge:** midpoint displacement per outline segment (amplitude 6-14 u, seeded per segment),
  plus fibre hairs every 6-10 u (1 u white strokes, 4-10 u long). South, east and west facing edges
  get a 24 u thickness band: `paperEdge` top line, `strata1` and `strata2` layers, dangling fibres.
- **The Dog-Ear:** the crease is a straight edge with a 2 u highlight and a 6 u soft shadow cast on
  the flap; the flap is `paperBack` with faint mirrored "print" (mirrored street-name lettering and
  a mirrored ghost of a sign).
- **The Bus Hole:** the hole shows the sky beneath with the Sky Ribbon's start curling away; its rim
  has the thickness band on all four sides.
- **Clouds:** three cut-paper layers (parallax 0.3 / 0.5 / 0.7), flat white shapes with a 1 u grey
  underside line; the sheet casts a soft shadow on the nearest layer.
- **Distant islands:** six small paper cities (each a unique silhouette: Crayonburg crayons as
  towers, Rustbelt Rise chimneys, Glitter Gulch sequin towers, Gustytown windmills, Port Eraser
  pink eraser blocks, Las Pegas clothes-peg towers), 0.15 parallax, pinprick lights at night.
- **The Sky Ribbon:** a paper strip road that curls from under the Bus Hole east toward Port Eraser
  and Las Pegas, with a dashed centre line and tiny moving buses.
- **Road ends:** each has a sawhorse ("ROAD ENDS. OBVIOUSLY.") and the thickness band; cars tumble
  with a spin and a cartoon "whee" (their scream, the original's gag, made friendlier).

## 5. Buildings

### 5.1 The painter (`js/art/exteriors.js`)

Input: the worldmap entry (masses with footprints and heights, door, kerb) plus the exterior def
(archetype, palette key, windows, roof, sign, props, detail). Output at the current zoom only: an
albedo sprite (sprite DPR ≤ 1.5), the lit-window rect list and small neon sprites for the emissive
pass, and the screen bounds (ARCHITECTURE §9.3 has the memory-bounded cache). Projection: for each
mass, the south face spans screen y from `y1 - 0.5h` to `y1` and the roof is the footprint shifted
up by 0.5h; **east, west and north faces are never visible**. Masses are painted back to front
(north first), so a set-back tower rises behind its podium's roof.

| Archetype | Shape language |
|---|---|
| `box` | flat roof with a parapet line and roof clutter (vents, AC units) |
| `tower` | setback tiers every 200 u of height, curtain-wall window grid |
| `hall` | columns and a pediment on the south face, stairs |
| `shop` | a big display window, awning stripes, a roof sign |
| `castle` | crenellated walls, 4 corner towers with cone roofs, flags |
| `house` | gable roof, chimney, porch |
| `depot` | a long low hall with a sawtooth roof and bay doors |

**Door treatments:**
- **South:** a door in the facade with a step and a mat (ground decal).
- **East / west:** an awning 32 u deep over the sidewalk (drawn as part of the sprite, projecting
  from the roof edge), a blade sign, a mat and a light spill cone at night (ground decals).
- **North** (Fine Line, the bus depot): the door itself is on a face you never see, so it is shown
  as a **porch**: on the ground north of the entrance annex, a mat, a two-step stoop, a standing
  sign post (a prop standee with the shop's sign) and the night light spill, all within the porch
  rect of 96 × 56 u whose outer 32 u stay uncovered; on the annex roof's north edge, a canopy strip
  with the sign lettering that overhangs the edge by 8 u. The annex's north face is not drawn.
- The ARCHITECTURE §8.1 invariant guarantees that every porch or awning and every signature
  element below is never covered by another building; the `#debug` overlay can draw the projected
  rects, porches and signatures (`SR.debug.projected(true)`).

### 5.2 Identity table

Palette columns define `bld.<id>.walls`, `.shade`, `.roof`, `.trim` in `palette.js`. The
signature (registered with `SR.def.exterior(id, { detail, signature })`) is what the visibility
invariant protects.

| Id | Archetype | Palette (walls / shade / roof / trim) | Sign and detail (≤ 150 lines each in `exteriors-detail.js`) |
|---|---|---|---|
| `home_apt` | house (3 floors) | #C98F5B / #A87142 / #7A4A2A / #F3EBDD | brown roof with skylights (a nod to the original), balcony on the top floor, "PAPERVIEW" letters |
| `home_mansion` | house | #D8B48A / #B8936A / #8A5A3A / #FFFFFF | tall windows, a grove of 3 trees, gate and butler (P1) |
| `home_castle` | castle | stone / stoneShade / #5B6ED8 cones / #FFD23F | the tallest cone tower, flags in your karma colour once owned (P1), a moat line; it stands on the Castle Rim north of Paperview with its gate in the south face |
| `home_pent` | tower (podium + set-back tower) | #6FB7C8 / #3F7F99 / #2E4F66 / #E6F4F8 | "EDGEVIEW" crown lettering, a rooftop garden on the penthouse level, the podium's roof terrace |
| `bank` | hall | #A61B1B / #7E1414 / #5A0E0E / #FFD23F | gold columns, a big "$" relief, "BANK" letters (a nod to the original's red bank) |
| `nli` | tower (podium + set-back tower) | #9AA3B5 / #767F92 / #4B5263 / #5BC8F5 | "NEW LINES INC." on a yellow plate over the podium entrance, three stacked-line logo, rooftop billboard on the tower (your portrait when CEO), the fishing stick |
| `uofs` | hall | #E6D27A / #C7B25A / #A8923A / #FFFFFF | pediment with "U of S", a statue of a thinking stick, ivy |
| `cityhall` | hall + dome | #E6DCC6 / #C9BDA3 / #22335C dome / #C9A34A | brass dome, flagpole, clock face, "CITY HALL" |
| `furniture` | shop | #EEEEEE / #CFCFCF / #9E9E9E / #1B1D2B | "FINE LINE FURNISHINGS" in thin serif-ish letters, a sofa in the window (a nod to the original's white store) |
| `mcsticks` | shop | #C9A227 / #A8861A / #7A6212 / #D92D20 | a burger-on-a-stick mascot sign (original character, not the original's logo), fry-shaped roof arches |
| `bar` | shop | #6E8B1E / #566D16 / #3C4C0F / #FFC83F | a neon beer mug, "STICKY'S" neon script; Harold under the awning |
| `casino` | box + marquee | #2F6BFF / #1F4FD6 / #15379A / #FFFFFF | two giant dice on the roof, marquee bulbs, silver-lining cloud logo |
| `store` | shop | #FFB000 / #E09000 / #B07000 / #FF3FA4 | graffiti-style "FIVE-O" lettering, a slushee sign |
| `pawn` | box | #8A2BE2 / #6D1FB5 / #4E1585 / #FFD23F | three gold balls, barred windows, "PAWN" |
| `bus` | depot | #1CB5F5 / #1590C4 / #0F6A91 / #FFFFFF | "BUS DEPOT" on the annex canopy, a departures board |
| `skybus` | vehicle prop | #F3EBDD / #1CB5F5 stripe | the parked Sky Bus, paper-white with a cyan stripe |

**Reacting elements (P1):** the NLI billboard (portrait), castle flags (karma colour), the plinth
statue (your stick; President white marble, Dictator red with a raised fist), bunting or banners
along Main Street, wanted posters on shelters and lamp posts (Heat ≥ 50), For Sale signs on
unowned homes, the kid's memorial (skateboard and flowers).

## 6. Props (`js/art/props.js`)

Cached sprites per type, variant and zoom: trees (round oak r 40, poplar, and a cloud tree whose
crown is a paper cloud), lamps (every 256 u on sidewalks), benches, hydrants, bins, planters, bus
shelters, mailboxes, newspaper boxes, billboards (5), railings (posts every 48 u), the castle
wall, the fountain (animated water), the statue plinth, the pond with ducks, chess tables, the
skate bowl, coin binoculars, sawhorses, parked cars.

## 7. Characters (`js/art/stick.js`)

- **Rig:** 12 joints (head, neck, shoulders L/R, elbows L/R, hands L/R, hips L/R, knees L/R, feet
  L/R), poses as joint-angle arrays, clips as keyframes with eased interpolation.
- **City view (3/4 top-down standee):** adult 52 u tall (head r 8, torso 18, legs 22), children
  38 u; limbs 3 u ink; the head fill is the karma colour for the player and a neutral tone for
  everyone else; 4 facings (side mirrored); a face (two dots and a mouth line by mood) when facing
  down.
- **Side view (interiors, fights, portraits):** head r 28, limbs 7 u; the player's torso stroke also
  takes the karma colour; NPCs' torsos are ink.
- **Clips:** idle (breathing, 2 s), walk (cycle 0.5 s at 280 u/s, scaled by speed), skate (crouch and
  push), drive (upper body in the car), sit, talk, eat, drink, work (per building), study, lift,
  cheer, wave, cower, knocked down, fall (windmill and spin), fight: guard, punch, kick, fireball,
  ink beam, hurt, win, lose (12 keyed poses), sleep.
- **Accessories:** drawn relative to head and hand joints: cap, beanie, glasses, bow tie, scarf,
  headphones, top hat, hard hat, visor, mortarboard, sash, peaked cap, goggles, apron, tie,
  backpack, bag, camera, umbrella, glow stick.
- **Named people:** Harold (beanie, long coat, a paper cup), Skid (backwards cap, skateboard), Red
  (hood, sunglasses), McHolland (hat, trench coat, notepad), Sticky (apron, towel on the shoulder),
  Mel (paper hat), Dee (visor), Vinnie (gold chain), Sofia (scarf), Penny Wise (visor and pencil),
  Bea (headset), Terry (clipboard), Lucky Lou (bow tie, vest), Tabby (headset, conductor cap),
  Dean Quill (mortarboard), Clerk Plume (quill behind the ear), Professor Crease (tweed jacket,
  magnifying glass), Brother Margin (sandwich board "THE FOLD IS COMING"), Pilot Ori (goggles,
  scarf), Mayor Doodle (sash), General Crayon (peaked cap, medals). Fighters: one accessory each
  (data).
- **Line boil (P2 option, off by default):** stroke endpoints jitter ±0.6 u, redrawn every 150 ms,
  characters only.

## 8. Vehicles (`js/art/vehicles.js`)

Seen from 3/4 above: roof, windshield, the side panel on the facing side; 8 directions (4 drawn,
mirrored). Types: compact, sedan, taxi, van, police (light bar red/blue at 2 Hz; steady with Flash
Reduction), the junker (yellow with a mismatched door, a nod to the original's yellow car), the
sports car (red convertible), the Sky Bus. Wheels spin; headlights and brake lights are emissive
spots; skid marks on hard braking.

## 9. Interiors (`js/art/interiors/`)

- **Composition:** full 1280 × 720, one-point perspective with the vanishing point near (400, 300);
  the scene lives in x 0-760 and stays calm behind the card (x 776-1248: only wall and floor).
- **Layers:** back wall (with the **live-sky window**: the hour's gradient, weather streaks on the
  glass), floor with perspective lines, the counter or furniture, the proprietor rig, your stick
  (standing where actions happen), foreground props, ambient animation. Static layers are cached.
- **The kit** (`kit.js`) draws interiors from data:

```js
SR.def.interior('mcsticks', {
  wall: { type: 'tiles', color: 'int.mcsticks.wall', trim: 'bld.mcsticks.walls' },
  floor: { type: 'checker', a: 'int.mcsticks.floorA', b: 'int.mcsticks.floorB', perspective: 0.35 },
  window: { x: 60, y: 90, w: 220, h: 140 },
  props: [{ type: 'counter', x: 120, y: 470, w: 520, color: 'bld.mcsticks.walls' },
          { type: 'menuBoard', x: 180, y: 110, items: ['fries', 'burger', 'shake'] },
          { type: 'fryer', x: 520, y: 400, anim: 'steam' }],
  owner: { id: 'mel', x: 360, y: 430, pose: 'idle' },
  you: { x: 250, y: 560 },
  lights: [{ x: 300, y: 60, r: 220, color: 'int.mcsticks.light' }],
  custom: 'mcsticksHero',       // optional named draw fn for the hero prop
});
// palette.js defines: int.mcsticks.wall #F3E3B0, floorA #F4F1EA, floorB #D92D20, light #FFF3C4.
// Each interior's owner adds its `int.<id>.*` entries to palette.js through a request (W1-A
// pre-seeds every entry named in this document and one neutral set per building).
```

  About 60 prop types: counter, stool, table, booth, shelf, cooler, register, slot machine, card
  table, roulette wheel, bar, beer taps, dartboard, fight ring rope, bed, sofa, TV, computer, desk,
  lectern, chalkboard, lockers, barbell, treadmill, plants, lamps, posters, rugs, vault door, teller
  window, water cooler, filing cabinet, elevator, departures board, ticket window, bench, ballot box,
  podium, flags, and each furniture piece (8 + 6 tier-2 variants) for home interiors.

| Interior | Hero prop and loops | Proprietor |
|---|---|---|
| Home ×5 tiers | apartment (bare, a crack in the wall), bigger apartment (balcony door with a view), penthouse (skyline windows), mansion (grand hall, chandelier), castle (throne room, banners); the answering machine blinks; owned furniture appears in fixed spots | you |
| McSticks | the fryer bubbling, steam, the order ticker | Mel |
| Five-O | the slushee machine swirling, a flickering fridge light | Dee |
| Pawn | ceiling fan, the gun case glinting, a mounted fish | Vinnie |
| Fine Line | showroom spotlights, a rotating display bed | Sofia |
| Bank | the vault door, a wall clock ticking, the rate board | Penny Wise |
| NLI | the water cooler glugging, an elevator light, a motivational poster | Bea (or Terry at VP+) |
| U of S | the chalkboard with a new absurd formula every day, a pendulum | Dean Quill |
| Sticky's | the neon beer sign, a dartboard, the Classic cabinet's glowing screen (P1) | Sticky |
| Casino | the fountain, spinning slot reels in the background, chandelier sparkle | Lucky Lou |
| Bus depot | the departures board flipping letters, the Sky Bus through the window | Tabby |
| City Hall | the ballot box, flags, the portrait of the mayor (yours in office) | Clerk Plume |
| Special | jail (bars, a cot, a calendar with tally marks), hospital (a curtain, a heart monitor), trip cards (destination skylines), the newspaper page | — |

## 10. Icons (`js/art/icons.js`)

48 u grid, 2 u ink strokes, two-tone fills (base + the category's meaning colour), drawn into a
cache per size and DPR; `SR.art.iconURL(name, size)` returns a data URL for DOM use. About 150
names:

```
general   leave ok cancel back home money bank time hp karma heat buzz star lock info warning
          save load settings pocket map bag journal phone messages achievement trophy stamp
stats     str int cha
food      milkshake fries burger tripleburger megameal takeout slushee candybar nachos
store     smokes pills paper scratch gum rob
pawn      knife knuckles gun ammo vest alarm cellphone skateboard prodeck sell
furniture bed pod tv skydish pc workstation books library treadmill homegym freezer minibar lounge aquarium
bank      deposit withdraw loan repay cd realestate rateboard apt apt2 penthouse mansion castle
nli       apply promotion work janitor mailroom sales executive vp ceo overtime half hustle
uofs      study class gym seminar degree transcript
bar       beer bottle barfight darts mingle openmic ring cabinet
casino    slots blackjack roulette vip chip
bus       bus redeye tour city rumour
city      election ballot decree charity soup precinct fine bail campaign rally tvad debate
street    give10 givebooze givesmokes givegum snow hotwire harold kid dealer
park      jog chess ducks bench binoculars scrap skatebowl
fight     punch kick fireball inkbeam guard endturn run
weather   clear cloudy rain fog windy storm
vehicle   car sportscar cab
```

## 11. UI art

- **Logo** (`js/art/logo.js`): "PAPER SKY" in custom ink-brush letterforms from Bézier strokes, with
  a torn paper tag "a Stick RPG fan remaster"; it draws itself stroke by stroke on the boot screen.
- **Stamps:** display type in a double-outlined rounded rectangle, rotated -8°, ink at 85 % with a
  grain mask so it looks inked.
- **The Daily Fold:** a newsprint tone (#F4F0E6), a serif masthead, column rules, halftone dots on
  the "photo" of your stick (a 3 px dot screen drawn in canvas).

## 12. Effects and animation

| Effect | Spec |
|---|---|
| FloatText | display 20, stat colour, 3 u ink outline; rises 40 u over 900 ms, ease-out, fades the last 300 ms |
| Coin burst | 8-16 pooled coins with gravity 900 u/s² and a bounce, on wages and wins |
| Dust / paper scraps | on landing, car hits and skate stops, 6-12 particles |
| Confetti | 120 paper bits (40 with Reduced Motion) on promotions, degrees, the election, day 365 |
| Fall | teeter windmill 150 ms → drop: the stick shrinks to 40 % and spins 1.5 turns while three cloud layers rush up (0.55 s) → the Fold Rescue plane (a folded-paper plane, 90 u span, with Pilot Ori) swoops in along a curve and catches you (0.5 s) → loops back and drops you on the rim with a squash (0.45 s) |
| Car hit | a 4 u screen shake for 250 ms, the stick flips once and lies down for 1.14 s, stars circle |
| Fight hit | 60 ms hit stop, 6 u shake, a spark burst, the damage number |
| KO / FLATLINED | an ink blot grows from the centre to cover the screen (400 ms) |
| Stamp | scale 1.4 → 1 with spring easing in 250 ms, a 4 px stage jolt, a thud |
| Page turn | the outgoing frame folds away diagonally (350 ms) on `#fx` |
| Time-lapse | §3 |
| Buzz sway | a sinusoidal x offset of ±6 u at 0.4 Hz at Buzz ≥ 3 (off with Reduced Motion) |
| Squash and stretch | landings 0.85 / 1.15 for 120 ms; jumps none |
| Screen shake | max 6 u, 250 ms decay; off with the setting |

## 13. Audio direction

### 13.1 Principles

Warm, bouncy, slightly lo-fi: chiptune-adjacent synthesis played like a small live band. Every
sound is short, readable and friendly; nothing harsh above 8 kHz; no sound is louder than the
Stamp. Music loops are 60-120 s and never annoying on repeat (A/B sections, a breakdown every
third loop). All music is original; the city theme captures the spirit of the original's funky
street loop, never its notes.

### 13.2 Engine and instruments

ARCHITECTURE §12 has the graph. Instrument recipes (`js/audio/synth.js`):

| Instrument | Recipe |
|---|---|
| bass | saw → lowpass 600 Hz (env amount +1,200 Hz), ADSR 5/120/0.6/80 ms |
| slap | bass plus a 20 ms noise click and a pitch blip |
| lead | pulse 25 % with PWM 0.3 Hz and vibrato 5.5 Hz ± 12 cents after 200 ms |
| whistle | sine with vibrato and breath noise at -24 dB |
| keys (Rhodes) | two-operator FM, ratio 1:14, index decaying 3 → 0.5 |
| clav | square through a bandpass 1.2 kHz, short decay |
| pluck | Karplus-Strong: a 4 ms noise burst into a delay line with lowpass feedback 0.98 |
| pad | 3 saws detuned ±7 cents, lowpass 1.8 kHz, attack 400 ms |
| brass | 2 saws + filter swell (attack 60 ms, env +2 kHz) |
| bell / vibes | FM ratio 1:3.5, fast decay; vibes add 5 Hz tremolo |
| organ | 3 sines at 1, 2, 3 × f |
| harmonica | square + bandpass 1.5 kHz + vibrato |
| drums | kick: sine 120 → 45 Hz in 80 ms; snare: noise bandpass 1.8 kHz + 190 Hz tone; hat: noise highpass 7 kHz, 30 ms (open 180 ms); brush: filtered noise swell; clap: 3 noise bursts 10 ms apart; shaker: noise bandpass 5 kHz |

### 13.3 Leitmotif

"Paper Sky": five notes, scale degrees 1-3-5-6-5 with a lift on the 6 (in F major: F A C D C;
intervals from the first note 0, +4, +7, +9, +7 semitones). It appears in the title theme's A
section (`paper_sky`), as the city day theme's horn hook (`crossroads_strut`), in the morning report
sting (`morning_edition`, bells), in the promotion stinger (`stingers.promotion`, brass) and in the
results anthem (`final_edition`). Each of these songs marks the motif's start with a `motif`
annotation, and the audio test checks the interval sequence there.

### 13.4 Music (`js/audio/songs/*.js`)

| Song id | Context | Tempo / key / metre | Mood and instrumentation | P |
|---|---|---|---|---|
| `paper_sky` | title, credits | 92, F major, 4/4 | hopeful; whistle lead, pluck, warm pad, brushed kit; AABA 32 bars | P0 |
| `crossroads_strut` | city, day | 104, E dorian | funky slap-bass ostinato, clav chops, call-and-response lead, the leitmotif as a horn hook; rain variant: hats replaced by a rain-drum pattern, pad lowered | P0 |
| `streetlights` | city, night (20:00-05:00) | 84, D minor, lazy swing | lo-fi swung hats, Rhodes chords, sparse walking bass, vinyl crackle | P0 |
| `home_sweet_paper` | home | 76, C major, 3/4 | music-box lullaby over a soft pad | P0 |
| `fry_day` | McSticks | 128, E major | surf twang: pluck with spring-style delay, shaker, cheesy organ | P0 |
| `funky_aisle` | Funkytown Five-O | 100, E minor | slap bass, wah square, clap | P0 |
| `pawnbroker_blues` | pawn shop | 76 shuffle, A | slide lead (pitch-bent saw), upright-style bass | P0 |
| `showroom_smooth` | Fine Line | 96, B♭ major | smooth jazz Rhodes and a breathy lead | P0 |
| `compound_interest` | bank | 90, F major | elevator bossa, a bored flute-ish whistle | P0 |
| `please_hold` | NLI | 100, C major | corporate hold music, marimba; restarts every 30 s as a joke | P0 |
| `campus_canon` | U of S, City Hall lobby | 90, G major | a baroque-ish two-voice pluck canon, bassoon-ish square | P0 |
| `last_call_shuffle` | Sticky's | 112, A blues | swinging 12-bar, walking bass, honky keys (detuned pair) | P0 |
| `high_roller_lounge` | casino | 118 swing, C major | vibes, brushed snare, walking bass | P0 |
| `brawl_hall` | fights, the ring | 150, D minor | driving square arpeggios, four-on-the-floor, distorted bass | P0 |
| `tick_tock_trouble` | hustles, darts, scratch | 124, A minor | light chiptune with a ticking hat | P1 |
| `midnight_express` | bus depot, trips | 120, E minor | train rhythm on hats, harmonica-like pulse, boogie bass | P0 |
| `hail_to_the_stick` | campaign, City Hall in office | 116 march, B♭ major (Dictator: B♭ minor) | brass saws, snare rolls, cymbal swells | P0 |
| `doing_time` | jail | 70, E blues | harmonica blues, a slow shuffle | P0 |
| `waiting_room` | hospital | 80, E major | sparse bells over a sine pad, a heart-monitor blip in tempo | P0 |
| `morning_edition` | the morning report | 4 bars, F major | the leitmotif on bells and a paper-rustle | P0 |
| `final_edition` | results | 84 → 100, D major | reflective intro, then an anthem; key change up a tone on the stamp; a minor variant below $1,500 | P0 |
| `stingers` | events | — | fall (whistle-down, 1 s), rescue (up-swoop), jail (low brass), flatlined (dirge, 3 s), promotion (brass fanfare with the leitmotif), degree (organ chord), jackpot (bells), election win (march tutti), election loss (sad trombone glide), level-up / stamp (rising triad) | P0 |

**Adaptive rules:** day and night city songs share a harmonic grid and cross-fade over 4 s at 19:30
and 05:30; the rain variant swaps drum patterns on the bar line; entering a building cross-fades
to its song in 600 ms; minigames duck the song 6 dB (casino and fights switch songs); the song
resumes at its position after overlays.

### 13.5 SFX palette (`js/audio/sfx.js`, about 80 recipes)

| Group | Sounds (recipe notes) |
|---|---|
| UI | click (a paper flick: 8 ms noise, highpass 3 kHz), open / close (page turn: filtered noise sweep), confirm (ink stamp: 60 Hz thump + noise slap), error (two falling square notes, soft), hover tick (very quiet), toggle, typewriter blip (per character, 3 random pitches) |
| Money | coin (square 988 → 1319 Hz, 60 ms each), purchase (coin + a register "ka": noise burst through a 2 kHz bandpass), cash count ticks, loss thud |
| Stats | STR (low brass swell), INT (bell ding), CHA (sparkle gliss), karma up (choir-like pad chord), karma down (low whoosh), HP heal (rising sine blip), hurt (a short 90 Hz thump) |
| Time | clock tick-tock (for sweeps), time-lapse accelerando, alarm-clock beep, snore, 24:00 chime |
| Food | eat (three noise crunches, bandpass 1.2 kHz, random pitch), drink (sine gulp 300 → 180 Hz), smoke (a match strike and a soft cough) |
| Movement | footstep (25 ms filtered click, alternating pitch; grass softer, paper creak on the Dog-Ear), skate roll loop (low-passed noise) and push clack, car engine loop pitched by speed, horn (saws 440 + 466 Hz), brake squeal, car hit (noise burst + 60 Hz thump + paper crumple), crash, ignition, door (shop bell, revolving whoosh, creak, casino ding) |
| Edge | wind bed (edge-proximity driven), teeter wobble, fall whistle (sine 800 → 120 Hz, 0.9 s), plane swoop, paper-crinkle landing (12 micro noise bursts) |
| World | fountain loop, rain loop, thunder (noise swell with a lowpass sweep), crickets (night), birds (morning; sine chirps from a random scheduler), crowd murmur, neon buzz, siren (two-tone), bus air-brake, pigeons |
| Fights and games | punch, kick, fireball (noise whoosh + sine boom), ink beam (rising FM zap), guard clank, crowd cheer; cards (deal, shuffle), chips, roulette ball loop and settle (clicks slowing on a decay curve), reel spin and three stops (pitched clicks), jackpot bells, dart throw and thunk, Timing Ring tick and hit, Shift Rush item and bin sounds |
| Phone | ring, vibrate, answering-machine beep (1 kHz + tape hiss), voicemail start |
| Voices | gibberish blips per character: a formant-filtered saw at the character's pitch with syllable timing from the text (Harold low and slow, Skid high and fast, Terry nervous vibrato, Sticky gravelly, Lou smooth) |

### 13.6 Ambience (`js/audio/ambience.js`)

City bed (distant traffic from low-passed noise with slow swells, level by traffic density), birds
by day, crickets by night, rain, wind (edge-driven plus Windy weather), fog horn (fog, rare), casino
murmur (band-passed noise with AM), bar chatter, fryer sizzle, office hum, campus murmur, the park's
ducks and fountain.

### 13.7 Mixing

| Bus | Level | Notes |
|---|---|---|
| master | 0 dB | compressor: threshold -14 dB, ratio 3, attack 5 ms, release 150 ms |
| music | -14 LUFS-ish reference (peaks ≤ -10 dBFS) | ducks 6 dB under dialogs, voicemails and stingers (attack 80 ms, release 400 ms); 4 dB under voice blips |
| sfx | peaks ≤ -6 dBFS | the Stamp and the jackpot are the loudest events |
| ambience | -24 dB | fades 1 s on scene changes |
| ui | -12 dB | clicks never mask speech blips |
| voice | -16 dB | blips only |

- **Spatial:** `StereoPannerNode` by the screen-x offset (±0.8 max); gain = 1 / (1 + d / 400) within
  900 u; beyond that sources are culled.
- **Voices:** ≤ 24 simultaneous; stealing takes the oldest lowest-priority voice (priorities: stamp
  and stingers 3, UI 2, world one-shots 1, loops 0).
- **Captions:** each sound with a caption key (`cap.horn`, `cap.siren`, `cap.answering`,
  `cap.edgeWind`, `cap.thunder`, `cap.knock`) emits a `caption` event with its direction.

### 13.8 Data formats (frozen at M0 in `docs/CONTRACT.md`)

W1-S implements these formats and their validator before W2-Music starts; changes go through the
requests protocol.

**Song** (`js/audio/songs/<id>.js`):

```js
SR.def.song('crossroads_strut', {
  bpm: 104, swing: 0.12,            // 0..0.5: every second 16th is delayed by swing × one 16th
  meter: [4, 4], stepsPerBeat: 4,   // a bar = meter[0] × stepsPerBeat steps
  key: 'E', scale: 'dorian', gain: 0.7,
  inst: {                           // track name → instrument preset (§13.2) and mix
    bass:  { preset: 'slap', gain: 0.8, pan: 0 },
    clav:  { preset: 'clav', gain: 0.45, pan: -0.3 },
    lead:  { preset: 'brass', gain: 0.5, pan: 0.2 },
    drums: { preset: 'kit', gain: 0.7 },
  },
  patterns: {
    intro: { bars: 2, tracks: { drums: 'k . h . s . h . k . h . s . h o | k . h . s . h . k k h . s . h o' } },
    A1: { bars: 2, tracks: {
      bass:  'E2:2 . E2 . G2:2 . A2 . | B2:3 . . A2 G2 . E2:2 . D2 . E2:4 . . . . . . .',
      lead:  'F4:2 . A4:2 . C5:2 . D5:3 . . C5:4 . . . | . . . . . . . . . . . . . . . .',
      drums: 'k . h . s . h . k k h . s . h o | k . h . s . h . k . h . s ! h o',
    } },
  },
  order: ['intro', 'A1', 'A1', 'B1', 'A2'], loopFrom: 1,   // plays order, then loops from index loopFrom
  variants: { rain: { tracks: { drums: { A1: 'k . z . s . z . k . z . s . z z | ...' } }, inst: { lead: { gain: 0.4 } } } },
  motif: [{ pattern: 'A1', track: 'lead', step: 0 }],
});
```

Step strings: tokens separated by spaces, one per step, `|` ignored (bar separators for reading).
`.` continues the previous note or rests; `-` is an explicit note-off; a note is `<pitch><octave>`
with optional `#` / `b` and an optional `:<length in steps>` (default 1), e.g. `C#4:3`; a chord is
`[C4 E4 G4]:4`; an accent suffix `!` plays at velocity 1.0 and a ghost suffix `?` at 0.4 (default
0.75). Drum tokens: `k` kick, `s` snare, `h` closed hat, `o` open hat, `c` clap, `b` brush, `r` rim,
`z` shaker, `t` tom; `!` / `?` suffixes as above. Every track string of a pattern has exactly `bars
× meter[0] × stepsPerBeat` tokens (validated). Stingers are songs with `order` of one pattern and
no `loopFrom` (`js/audio/songs/stingers.js` registers `stingers.<name>`).

**SFX recipe** (`js/audio/sfx.js`):

```js
SR.def.sfx('coin', {
  bus: 'sfx', gain: 0.5, priority: 1, caption: null,       // caption: a text key (§13.7)
  layers: [
    { osc: 'square', freq: [988, 1319], at: [0, 0.06],       // sequential pitches at these offsets (s)
      env: { a: 0.005, d: 0.05, s: 0, r: 0.02 }, dur: 0.12 },
    { noise: 'white', filter: { type: 'bandpass', freq: 2000, q: 2 },
      env: { a: 0.005, d: 0.04, s: 0, r: 0.01 }, dur: 0.05, start: 0 },
  ],
  vary: { pitch: 0.03, gain: 0.1 },                           // random ± per play (fx RNG)
});
```

A layer is one source: `osc` (`sine`, `square`, `saw`, `triangle`, `pulse` with `duty`), `noise`
(`white`, `pink`), `pluck` (Karplus-Strong at `freq`) or `fm` (`carrier`, `ratio`, `index`,
`indexDecay`); `freq` is a number, a list with `at` offsets, or a `sweep: [from, to, seconds,
'exp'|'lin']`; optional `filter` (`type`, `freq`, `q`, optional `sweep`); `env` is ADSR in seconds
with `a ≥ 0.005` (no clicks); `start` offsets the layer; `dur` is the gate length; `gain` per layer.

**Objective checks** (`tests/e2e/audio.test.cjs`, ARCHITECTURE §18) replace listening: every song
and sfx is rendered offline and must meet the peak, RMS, click, loop-seam, NaN / denormal, length
and motif rules there. An ear review is an optional step for the user.
