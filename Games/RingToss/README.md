# Ring Toss

A 3D carnival ring toss in one HTML file: three.js for the booth, a hand-written rigid-body solver for the rings.

Open `index.html` in a browser (three.js loads from cdn.jsdelivr.net, so it needs a connection).

## Play

| Input | Does |
| --- | --- |
| Drag down | Wind up: farther = more power |
| Drag sideways | Aim, slingshot style (pull left to throw right) |
| Release | Toss |
| ← → / ↑ ↓ (Shift = ×5) | Aim / power by keyboard |
| Space | Toss |

Five rings a round. The power meter keeps a tick at your last toss.

| Target | Outcome | Points |
| --- | --- | --- |
| Hot dog | Ringer: resting around the dog | 5 |
| | Leaner: resting against the dog | 1 |
| Water balloon (knot up) | Bullseye: resting around the knot | 10 |
| | On the balloon, off the stand and floor | 3 |

The balloon is slick (μ 0.1), springy (restitution 0.58) and rocks and squashes when hit, so most rings that reach it
bounce off.

## Physics

- Ring: torus, R 12 cm, tube 1.6 cm, 60 g, exact torus inertia; tube sampled as 48 spheres.
- Static colliders are signed-distance functions: floor, tent wall, posts, drum stand, hot dog capsule, and the
  balloon as a lathe profile under a live squash-and-tilt transform (its surface velocity feeds the contacts).
- Ring–ring: each sample of one ring against the other's exact torus distance.
- Solver: 120 Hz × 4 substeps, sequential impulses (Coulomb friction, restitution threshold), split-impulse position
  correction, angular momentum carried so spinning rings precess; resting rings sleep.

`node Games/RingToss/physics-check.cjs` runs the physics headless: a straight 58% toss rings the hot dog, short and
long tosses don't, near-perfect throws ring the dog at least twice as often as the knot, everything settles.
