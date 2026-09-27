# Ring Toss

A 3D ring toss in one HTML file: three.js for rendering, a hand-written rigid-body solver for the physics. A plain hot
dog or an upside-down water balloon floats in a white void, pinned at its centre.

Open `index.html` in a browser (three.js loads from cdn.jsdelivr.net, so it needs a connection).

## Play

| Input | Does |
| --- | --- |
| Drag down | Wind up: farther = more power (the meter keeps a tick at your last toss) |
| Drag sideways | Aim, slingshot style; a dashed line shows where the ring will cross the target |
| Release | Toss |
| ← → / ↑ ↓ (Shift = ×5), Space | Aim / power / toss by keyboard |
| Look (sliders button) | Ring colour (black default), background colour (white default), pattern, anchor marker |

Five rings a round.

| Target | Outcome | Points |
| --- | --- | --- |
| Hot dog | Ringer: the ring squeezes onto the dog and holds | 5 |
| Water balloon | Bullseye: the ring threads the knot and settles on the balloon | 10 |
| | Resting on the balloon anywhere else | 3 |

## What happens

- Gravity is on, and there is no floor. Misses fall away.
- Both targets are pinned at their centre (the anchor marker). Hits swing and spin them, and a torsion spring stands them
  back up.
- The ring (inner Ø 86 mm) is tighter than the hot dog (Ø 97 mm). A ring that threads the tip grips on and slides
  down 3–11 cm, squeezing the dog (a pinch with the meat bulging either side). It holds, then after 2–3 s the dog
  snaps it into three pieces that fly off, and the dog springs back.
- The balloon is translucent, slick (μ 0.1) and springy (restitution 0.55). It squashes and dents where rings press
  and rocks on its pivot, so most rings bounce off it.
- Assist: because the rings are so tight, a ring coming down near the tip (within 10 cm) or the knot (within 6 cm)
  gets steered onto it and squared up.

## Physics

- Ring: torus R 52 mm, tube 9 mm, 15 g, exact torus inertia; the tube is sampled as 32 spheres.
- Targets: surfaces of revolution (lathe profiles) collided as exact 2D distance to the profile, under the target's
  live rotation and (balloon) squash. Each is a pinned rigid body in the same solver as the rings, so hits transfer
  angular momentum both ways.
- The gripping ring runs as a 1-D slider on the dog's axis: kinetic friction `30 + 25·|v|` m/s², static hold,
  gravity along the axis. Its weight torques the dog.
- Solver: 120 Hz × 4 substeps, sequential impulses (Coulomb friction, restitution threshold), split-impulse
  position correction; rings keep angular momentum, so a spinning ring precesses.

`node Games/RingToss/physics-check.cjs` runs the physics headless: grip, slide, hold and snap on a straight toss;
short and long tosses miss; clipping swings the dog; the knot is at most half as easy as the dog; every throw is
decided within 7 s.
