// js/art/stick.js — owner: W1-A. SR.art.stick: the stick-person rig, its poses and clips, the
// accessories and every named person's look (ART_AUDIO §7).
//
// The rig: 14 points (head, neck, shoulders L/R, elbows L/R, hands L/R, hips L/R, knees L/R, feet L/R)
// driven by a pose of 12 numbers (radians, except `lift` in body units):
//   [lean, head, armL upper, armL fore, armR upper, armR fore, legL thigh, legL shin, legR thigh,
//    legR shin, lift, rot]
// Arms and thighs are measured from straight down, positive = forward (toward the facing); a forearm
// adds its bend forward; a shin bends backward (knee flexion). `lift` raises the figure off the
// ground, `rot` turns the whole figure around the hips (knocked down: -90°).
//
// Views: 'city' (the 3/4 top-down standee: adult 52 u, child 38 u, limbs 3 u, 4 facings with left
// mirrored from right, a face only when facing down) and 'side' (interiors, fights, portraits: head
// r 28, limbs 7 u; the player's torso takes the karma colour).
//
// draw(ctx, pose, opts) — pose: a pose array, a pose name (poses.*) or a clip name (evaluated at
// opts.t). A name that is both (sit, drive, knocked, sleep, guard, punch, kick, fireball, inkbeam,
// hurt, win, lose) plays the clip when opts.t is given and is the still pose otherwise.
// opts (every field optional; pass one reused object in hot loops):
//   x, y       ground contact point (between the feet), or the hips with anchor: 'hip'
//   view       'city' | 'side' (default 'city')
//   facing     'down' | 'up' | 'left' | 'right' (default 'down' in the city, 'right' in side view)
//   scale      extra scale (the painter passes zoom here only if it draws in screen units)
//   look       a person id ('harold', 'mel', 'fighter.7', a data/fighters.js id, 'player'), a
//              pedestrian number (pedLook), or a look object { head, child, acc: ['beanie', ...],
//              col: { beanie: 'acc.red' } }; with player: true and no look, the player's own look
//              (SR.state.player.look: the accessory chosen in the New Game wizard)
//   player     true: karma-coloured head (and side-view torso), the white under-stroke in the city
//   karma      the player's karma (default: SR.state.stats.karma)
//   head, torso, limb   colour overrides (palette keys or colours)
//   mood       face: 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'hurt' | 'sleep' |
//              'smug' | 'worried' | 'blink'
//   t          seconds, when pose is a clip name
//   rot        extra rotation (radians) around the hips (the fall spin)
//   mount      'board': standing on a skateboard (drawn under the feet)
//   upper      true: no legs (drive: the upper body in a car)
//   anchor     'feet' (default: the lowest point touches y) | 'hip'
//   shadow     false: no stacked-paper shadow (default on in the city, off in side view)
//   alpha      overall alpha
//   splay      front and back views: how far the arms and legs spread sideways (default 1)
//
// Public: draw, clip(name, t, out), poses, clips, looks, look(id), pedLook(n), karmaColor(k),
// metrics(view, child), joints(pose, opts) (the solved points, for attaching props), ACCESSORIES.
(function () {
  'use strict';
  var SR = window.SR;
  var D = Math.PI / 180;

  // ---- metrics (ART_AUDIO §7) ----------------------------------------------------------------------
  // City adult: legs 22 (thigh 11 + shin 11), torso 18, head r 8 centred 4 u above the neck → 52 u.
  // Child: 38 u. Side view: × 3.5 (head r 28), limbs 7 u.
  function makeMetrics(base, k, limb, outline, detail) {
    var m = {};
    for (var key in base) m[key] = base[key] * k;
    m.limb = limb; m.ol = outline; m.dl = detail; m.k = k;
    return m;
  }
  var ADULT = { thigh: 11, shin: 11, torso: 18, upper: 10, fore: 9, head: 8, neck: 4, shDrop: 2.5, elbowLat: 4.2, handLat: 6.4, kneeLat: 2.6, footLat: 3.6 };
  var CHILD = { thigh: 7.5, shin: 7.5, torso: 12.5, upper: 7, fore: 6.5, head: 7, neck: 3.5, shDrop: 2, elbowLat: 3.2, handLat: 4.8, kneeLat: 2.1, footLat: 2.8 };
  var METRICS = {
    city: { adult: makeMetrics(ADULT, 1, 3, 1.5, 1), child: makeMetrics(CHILD, 1, 2.6, 1.4, 0.9) },
    side: { adult: makeMetrics(ADULT, 3.5, 7, 3, 1.5), child: makeMetrics(CHILD, 3.5, 6, 3, 1.5) },
  };

  /** @returns {object} the body metrics of a view ('city' | 'side') for an adult or a child. */
  function metrics(view, child) { return METRICS[view === 'side' ? 'side' : 'city'][child ? 'child' : 'adult']; }

  // ---- poses (degrees here, radians at load) -----------------------------------------------------------
  //               lean head  aLu  aLf  aRu  aRf  lLt  lLb  lRt  lRb lift rot
  var P = {
    stand:       [2, 0, -6, 12, 8, 14, 3, 0, -3, 0, 0, 0],
    idleB:       [0, -2, -8, 15, 10, 17, 3, 0, -3, 0, 0.5, 0],
    walk0:       [6, 0, -28, 18, 30, 34, 26, 6, -24, 12, 0, 0],
    walk1:       [6, 0, -4, 16, 6, 20, 2, 0, 8, 58, 1.2, 0],
    walk2:       [6, 0, 30, 34, -28, 18, -24, 12, 26, 6, 0, 0],
    walk3:       [6, 0, 6, 20, -4, 16, 8, 58, 2, 0, 1.2, 0],
    skate0:      [14, 4, -20, 30, 24, 40, 22, 38, -38, 12, 0, 0],
    skate1:      [10, 2, -10, 24, 16, 30, 16, 30, -10, 24, 0, 0],
    sit:         [-4, 0, 14, 40, 16, 44, 88, 90, 84, 86, 0, 0],
    sitB:        [-3, 2, 16, 42, 18, 46, 88, 90, 84, 86, 0, 0],
    drive:       [-6, 0, 58, 26, 62, 22, 86, 86, 82, 84, 0, 0],
    drive2:      [-6, 3, 62, 22, 56, 28, 86, 86, 82, 84, 0, 0],
    talk0:       [2, -3, -6, 12, 34, 70, 3, 0, -3, 0, 0, 0],
    talk1:       [2, 3, -10, 16, 52, 92, 3, 0, -3, 0, 0, 0],
    eat0:        [4, -4, -6, 12, 62, 150, 3, 0, -3, 0, 0, 0],
    eat1:        [2, 2, -6, 12, 34, 80, 3, 0, -3, 0, 0, 0],
    drink0:      [-6, -16, -6, 12, 76, 136, 3, 0, -3, 0, 0, 0],
    drink1:      [0, 0, -6, 12, 40, 70, 3, 0, -3, 0, 0, 0],
    work0:       [6, 4, 10, 30, 120, 60, 5, 4, -5, 4, 0, 0],
    work1:       [10, 8, 12, 34, 40, 50, 5, 4, -5, 4, 0, 0],
    desk0:       [8, 8, 50, 50, 56, 44, 88, 90, 84, 86, 0, 0],
    desk1:       [8, 8, 54, 44, 52, 50, 88, 90, 84, 86, 0, 0],
    mop0:        [12, 6, 40, 30, 30, 20, 6, 4, -6, 6, 0, 0],
    mop1:        [8, 4, 20, 40, 14, 34, 6, 4, -6, 6, 0, 0],
    cook0:       [4, 4, -4, 14, 60, 50, 3, 0, -3, 0, 0, 0],
    cook1:       [4, 4, -4, 14, 44, 100, 3, 0, -3, 0, 0, 0],
    serve0:      [4, 0, -6, 12, 30, 60, 3, 0, -3, 0, 0, 0],
    serve1:      [8, 0, -6, 12, 80, 10, 3, 0, -3, 0, 0, 0],
    study0:      [10, 14, 44, 90, 50, 86, 88, 90, 84, 86, 0, 0],
    study1:      [10, 18, 44, 94, 54, 80, 88, 90, 84, 86, 0, 0],
    lift0:       [0, 0, 20, 140, 24, 136, 6, 4, -6, 4, 0, 0],
    lift1:       [0, -4, 170, 10, 174, 6, 6, 4, -6, 4, 0, 0],
    cheer0:      [-4, -8, 160, 10, 150, 20, 6, 0, -6, 0, 3, 0],
    cheer1:      [-2, -4, 170, 0, 170, 0, 6, 0, -6, 0, 0, 0],
    happy0:      [-4, -6, 60, 60, 60, 60, 4, 0, -4, 0, 3, 0],
    happy1:      [0, 0, 40, 70, 40, 70, 4, 0, -4, 0, 0, 0],
    shock0:      [-14, -12, 130, 40, 140, 30, 10, 4, -12, 8, 4, 0],
    shock1:      [-10, -8, 120, 50, 128, 40, 10, 4, -12, 8, 0, 0],
    wave0:       [0, 0, -6, 12, 150, 20, 3, 0, -3, 0, 0, 0],
    wave1:       [0, 2, -6, 12, 140, -30, 3, 0, -3, 0, 0, 0],
    cower0:      [30, 20, 120, 120, 110, 130, 60, 110, 50, 120, 0, 0],
    cower1:      [33, 22, 124, 116, 114, 126, 60, 110, 50, 120, 0, 0],
    knocked:     [0, 10, 100, 20, 150, -10, 20, 10, -10, 30, 0, -90],
    knockedB:    [0, 14, 104, 24, 146, -6, 22, 12, -8, 32, 0, -90],
    fall0:       [-10, -10, 160, 30, 20, 30, 30, 20, -20, 40, 0, 0],
    fall1:       [-10, -10, 20, 30, 160, 30, -20, 40, 30, 20, 0, 0],
    teeter0:     [-18, -12, 120, 20, 150, 30, 10, 0, -14, 10, 0, 0],
    teeter1:     [-14, -8, 160, 30, 110, 20, 10, 0, -14, 10, 0, 0],
    sleep:       [0, 10, 20, 30, 10, 40, 10, 20, 6, 30, 0, -90],
    sleepB:      [0, 12, 22, 32, 12, 42, 10, 20, 6, 30, 0, -90],
    // Fight: the 12 keyed poses (guard, punch ×2, kick ×2, fireball ×2, ink beam ×2, hurt, win, lose).
    guard:       [8, 4, 40, 120, 60, 110, 16, 14, -18, 10, 0, 0],
    guardB:      [10, 6, 42, 118, 62, 108, 18, 18, -18, 14, 0, 0],
    punchWind:   [4, 4, 36, 120, 20, 140, 16, 14, -18, 10, 0, 0],
    punch:       [16, 4, 40, 120, 92, 4, 20, 10, -22, 8, 0, 0],
    kickChamber: [-6, 0, 40, 100, 50, 100, 80, 110, -6, 4, 0, 0],
    kick:        [-18, -4, 30, 90, 40, 90, 96, 4, -8, 4, 0, 0],
    fireCharge:  [-4, -4, 50, 100, 30, 120, 16, 14, -18, 10, 0, 0],
    fireball:    [14, 2, 86, 6, 94, 0, 20, 10, -22, 8, 0, 0],
    inkCharge:   [-10, -8, 150, 30, 150, 30, 14, 10, -16, 10, 0, 0],
    inkbeam:     [12, 0, 90, 0, 84, 0, 22, 8, -24, 10, 0, 0],
    hurt:        [-20, -18, 20, 40, -10, 50, 14, 10, -20, 20, 0, 0],
    win:         [-6, -10, 164, 8, 20, 140, 6, 0, -6, 0, 0, 0],
    winB:        [-4, -6, 150, 30, 24, 130, 6, 0, -6, 0, 2, 0],
    lose:        [24, 30, 6, 10, 2, 8, 30, 70, 20, 80, 0, 0],
    loseB:       [26, 34, 6, 12, 2, 10, 30, 70, 20, 80, 0, 0],
  };
  var poses = {};
  Object.keys(P).forEach(function (k) {
    poses[k] = P[k].map(function (v, i) { return i === 10 ? v : v * D; });
  });

  // ---- clips (ART_AUDIO §7) --------------------------------------------------------------------------
  // keys: [phase 0..1, pose name]; loop clips wrap, one-shots hold their last key. ease: 'linear' or
  // the default smooth (cosine) ease between keys.
  function clipDef(dur, loop, keys, ease) { return { dur: dur, loop: loop, keys: keys, ease: ease || 'smooth' }; }
  var clips = {
    idle: clipDef(2, true, [[0, 'stand'], [0.5, 'idleB'], [1, 'stand']]),
    walk: clipDef(0.5, true, [[0, 'walk0'], [0.25, 'walk1'], [0.5, 'walk2'], [0.75, 'walk3'], [1, 'walk0']], 'linear'),
    skate: clipDef(0.9, true, [[0, 'skate1'], [0.35, 'skate0'], [0.6, 'skate1'], [1, 'skate1']]),
    drive: clipDef(1.6, true, [[0, 'drive'], [0.5, 'drive2'], [1, 'drive']]),
    sit: clipDef(3, true, [[0, 'sit'], [0.5, 'sitB'], [1, 'sit']]),
    talk: clipDef(1.2, true, [[0, 'talk0'], [0.5, 'talk1'], [1, 'talk0']]),
    eat: clipDef(1, true, [[0, 'eat1'], [0.45, 'eat0'], [0.6, 'eat0'], [1, 'eat1']]),
    drink: clipDef(1.4, true, [[0, 'drink1'], [0.35, 'drink0'], [0.7, 'drink0'], [1, 'drink1']]),
    work: clipDef(0.6, true, [[0, 'work0'], [0.45, 'work1'], [1, 'work0']]),
    work_desk: clipDef(0.3, true, [[0, 'desk0'], [0.5, 'desk1'], [1, 'desk0']]),
    work_mop: clipDef(1.2, true, [[0, 'mop0'], [0.5, 'mop1'], [1, 'mop0']]),
    work_cook: clipDef(0.8, true, [[0, 'cook0'], [0.4, 'cook1'], [1, 'cook0']]),
    work_serve: clipDef(1.4, true, [[0, 'serve0'], [0.4, 'serve1'], [0.6, 'serve1'], [1, 'serve0']]),
    study: clipDef(3, true, [[0, 'study0'], [0.5, 'study1'], [1, 'study0']]),
    lift: clipDef(1.4, true, [[0, 'lift0'], [0.5, 'lift1'], [1, 'lift0']]),
    cheer: clipDef(0.6, true, [[0, 'cheer0'], [0.5, 'cheer1'], [1, 'cheer0']]),
    happy: clipDef(0.8, true, [[0, 'happy1'], [0.5, 'happy0'], [1, 'happy1']]),
    shock: clipDef(0.5, true, [[0, 'shock1'], [0.5, 'shock0'], [1, 'shock1']]),
    wave: clipDef(0.8, true, [[0, 'wave0'], [0.5, 'wave1'], [1, 'wave0']]),
    cower: clipDef(0.25, true, [[0, 'cower0'], [0.5, 'cower1'], [1, 'cower0']]),
    knocked: clipDef(1.2, true, [[0, 'knocked'], [0.5, 'knockedB'], [1, 'knocked']]),
    fall: clipDef(0.3, true, [[0, 'fall0'], [0.5, 'fall1'], [1, 'fall0']]),
    teeter: clipDef(0.15, true, [[0, 'teeter0'], [0.5, 'teeter1'], [1, 'teeter0']]),
    sleep: clipDef(3, true, [[0, 'sleep'], [0.5, 'sleepB'], [1, 'sleep']]),
    guard: clipDef(0.7, true, [[0, 'guard'], [0.5, 'guardB'], [1, 'guard']]),
    punch: clipDef(0.35, false, [[0, 'guard'], [0.3, 'punchWind'], [0.55, 'punch'], [1, 'guard']]),
    kick: clipDef(0.5, false, [[0, 'guard'], [0.3, 'kickChamber'], [0.55, 'kick'], [1, 'guard']]),
    fireball: clipDef(0.7, false, [[0, 'guard'], [0.4, 'fireCharge'], [0.65, 'fireball'], [1, 'guard']]),
    inkbeam: clipDef(0.9, false, [[0, 'guard'], [0.45, 'inkCharge'], [0.7, 'inkbeam'], [0.85, 'inkbeam'], [1, 'guard']]),
    hurt: clipDef(0.4, false, [[0, 'hurt'], [0.5, 'hurt'], [1, 'guard']]),
    win: clipDef(0.8, true, [[0, 'win'], [0.5, 'winB'], [1, 'win']]),
    lose: clipDef(2, true, [[0, 'lose'], [0.5, 'loseB'], [1, 'lose']]),
  };
  // UI.md §5.6 proprietor animations use these names too: idle, talk, happy (react-happy), shock
  // (react-shock), work.
  Object.keys(clips).forEach(function (k) {
    clips[k].keys.forEach(function (key) { key.pose = poses[key[1]]; });
  });

  var POOL = [];
  for (var pi = 0; pi < 32; pi++) POOL.push(new Array(12).fill(0));
  var poolAt = 0;

  /**
   * Evaluates a clip.
   * @param {string} name a clip name (clips.*); unknown names play idle
   * @param {number} t seconds (for walk, pass t × speed / 280: the cycle is 0.5 s at 280 u/s)
   * @param {number[]=} out a 12-slot array to fill; without it the result is one of 32 pooled
   *   arrays (valid until 32 more clip() calls)
   * @returns {number[]} the pose
   */
  function clip(name, t, out) {
    var c = clips[name] || clips.idle;
    if (!out) { out = POOL[poolAt]; poolAt = (poolAt + 1) & 31; }
    var ph;
    if (c.loop) { ph = (t % c.dur) / c.dur; if (ph < 0) ph += 1; } else { ph = t / c.dur; ph = ph < 0 ? 0 : ph > 1 ? 1 : ph; }
    var keys = c.keys, i = 0;
    while (i < keys.length - 2 && ph >= keys[i + 1][0]) i++;
    var a = keys[i], b = keys[i + 1];
    var span = b[0] - a[0];
    var u = span > 0 ? (ph - a[0]) / span : 1;
    if (u < 0) u = 0; else if (u > 1) u = 1;
    var e = c.ease === 'linear' ? u : 0.5 - 0.5 * Math.cos(Math.PI * u);
    var pa = a.pose, pb = b.pose;
    for (var j = 0; j < 12; j++) out[j] = pa[j] + (pb[j] - pa[j]) * e;
    return out;
  }

  // ---- solving the rig -----------------------------------------------------------------------------
  // Joint slots in J (x, y pairs): 0 head, 1 neck, 2 shoulder L, 3 shoulder R, 4 elbow L, 5 elbow R,
  // 6 hand L, 7 hand R, 8 hip L, 9 hip R, 10 knee L, 11 knee R, 12 foot L, 13 foot R, 14 hip centre,
  // 15 shoulder centre.
  var J = new Float64Array(32);
  var S = new Float64Array(32); // side-view solution before projection

  function solveSide(pose, m) {
    var lean = pose[0], sl = Math.sin(lean), cl = Math.cos(lean);
    S[28] = 0; S[29] = 0;                                   // hip centre (origin)
    S[2] = m.torso * sl; S[3] = -m.torso * cl;               // neck
    var ha = lean + pose[1];
    S[0] = S[2] + m.neck * Math.sin(ha); S[1] = S[3] - m.neck * Math.cos(ha); // head centre
    var sd = m.torso - m.shDrop;
    S[30] = sd * sl; S[31] = -sd * cl;                       // shoulder centre
    S[4] = S[6] = S[30]; S[5] = S[7] = S[31];
    // arms
    var a1 = lean + pose[2], a2 = a1 + pose[3];
    S[8] = S[30] + m.upper * Math.sin(a1); S[9] = S[31] + m.upper * Math.cos(a1);
    S[12] = S[8] + m.fore * Math.sin(a2); S[13] = S[9] + m.fore * Math.cos(a2);
    var b1 = lean + pose[4], b2 = b1 + pose[5];
    S[10] = S[30] + m.upper * Math.sin(b1); S[11] = S[31] + m.upper * Math.cos(b1);
    S[14] = S[10] + m.fore * Math.sin(b2); S[15] = S[11] + m.fore * Math.cos(b2);
    // legs
    S[16] = S[18] = 0; S[17] = S[19] = 0;
    var t1 = pose[6], t2 = t1 - pose[7];
    S[20] = m.thigh * Math.sin(t1); S[21] = m.thigh * Math.cos(t1);
    S[24] = S[20] + m.shin * Math.sin(t2); S[25] = S[21] + m.shin * Math.cos(t2);
    var u1 = pose[8], u2 = u1 - pose[9];
    S[22] = m.thigh * Math.sin(u1); S[23] = m.thigh * Math.cos(u1);
    S[26] = S[22] + m.shin * Math.sin(u2); S[27] = S[23] + m.shin * Math.cos(u2);
  }

  // Lateral offsets (front and back views) per joint slot, as fractions of the metrics' lat fields.
  var LAT_KEY = [null, null, null, null, 'elbowLat', 'elbowLat', 'handLat', 'handLat', null, null, 'kneeLat', 'kneeLat', 'footLat', 'footLat', null, null];
  var LAT_SIDE = [0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 0, 0]; // +1 = the figure's left

  function frontArm(a1, a2, sgn, fs, m, e, h) {
    var sx = J[30], sy = J[31];
    var ex = sx + sgn * m.upper * (0.3 + 0.7 * Math.abs(Math.sin(a1))), ey = sy + m.upper * Math.cos(a1) + m.upper * Math.sin(a1) * 0.2 * fs;
    J[e] = ex; J[e + 1] = ey;
    J[h] = ex + sgn * m.fore * (0.3 + 0.7 * Math.abs(Math.sin(a2))); J[h + 1] = ey + m.fore * Math.cos(a2) + m.fore * Math.sin(a2) * 0.2 * fs;
  }

  /**
   * Solves the joints into J (local units, origin at the ground contact or the hips).
   * @returns {Float64Array} J (shared; copy it if you keep it)
   */
  function solve(pose, m, facing, anchorHip, extraRot, upper, splay) {
    solveSide(pose, m);
    splay = splay || 1;
    var i;
    if (facing === 'down' || facing === 'up') {
      var fs = facing === 'down' ? 1 : -1;  // forward (x) shows as lower (toward the viewer) or higher
      var ls = facing === 'down' ? 1 : -1;  // the figure's left is the viewer's right when facing us
      for (i = 0; i < 16; i++) {
        var sx = S[i * 2], sy = S[i * 2 + 1];
        var lk = LAT_KEY[i];
        J[i * 2] = lk ? LAT_SIDE[i] * ls * m[lk] * splay : 0;
        J[i * 2 + 1] = sy + sx * 0.35 * fs;
      }
      // Arms seen from the front: the swing becomes an outward lift, so a raised arm makes a V
      // (hanging arms keep a slight A-shape).
      frontArm(pose[0] + pose[2], pose[0] + pose[2] + pose[3], ls * splay, fs, m, 8, 12);
      frontArm(pose[0] + pose[4], pose[0] + pose[4] + pose[5], -ls * splay, fs, m, 10, 14);
    } else {
      var dir = facing === 'left' ? -1 : 1;
      for (i = 0; i < 16; i++) { J[i * 2] = S[i * 2] * dir; J[i * 2 + 1] = S[i * 2 + 1]; }
      extraRot = extraRot * dir;
    }
    var rot = (facing === 'left' ? -pose[11] : pose[11]) + (extraRot || 0);
    if (rot) {
      var c = Math.cos(rot), s = Math.sin(rot);
      for (i = 0; i < 16; i++) {
        var x = J[i * 2], y = J[i * 2 + 1];
        J[i * 2] = x * c - y * s; J[i * 2 + 1] = x * s + y * c;
      }
    }
    var dy = 0;
    if (!anchorHip) {
      // Ground: the lowest point (feet, hands, the bottom of the head) touches y = 0.
      var low = J[1] + m.head;
      var last = upper ? 7 : 13;
      for (i = 2; i <= last; i++) if (J[i * 2 + 1] > low) low = J[i * 2 + 1];
      dy = -low;
    }
    dy -= pose[10] * m.k;
    if (dy) for (i = 0; i < 16; i++) J[i * 2 + 1] += dy;
    return J;
  }

  // ---- colours ---------------------------------------------------------------------------------------
  function col(k) { return SR.art.draw.color(k); }

  /**
   * The karma band colour of the player's head (BALANCE B-04c).
   * @param {number} k karma (-100..100)
   * @returns {string} colour
   */
  function karmaColor(k) {
    k = +k || 0;
    var bands = SR.art.palette.karma[k < 0 ? 'evil' : 'good'];
    var n = bands.length;
    var i = -1;
    if (SR.rules && SR.rules.stats && typeof SR.rules.stats.band === 'function') {
      var b = SR.rules.stats.band(k);
      if (typeof b === 'number' && b >= 0 && b < n) i = b;
    }
    if (i < 0) {
      // B-04c: i = clamp(ceil(|karma| / 10) - 1, 0, 9); the band width follows the palette's band count.
      i = Math.ceil(Math.abs(k) / (100 / n)) - 1;
      i = i < 0 ? 0 : i > n - 1 ? n - 1 : i;
    }
    return bands[i];
  }

  // ---- accessories (ART_AUDIO §7) --------------------------------------------------------------------
  // Each: layer ('back' drawn before the body, 'body' after the legs and torso, 'head' after the head,
  // 'hand' last), a default colour key and draw(ctx, J, m, f, c) with f = 'down' | 'up' | 'left' | 'right'.
  var INK = 'ink';
  function fs(ctx, fill, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = col('inkLine'); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
  function ellipse(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot || 0, 0, Math.PI * 2); }
  function quad(ctx, a, b, c, d, e, f, g, h) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.lineTo(e, f); ctx.lineTo(g, h); ctx.closePath(); }
  function dirOf(f) { return f === 'left' ? -1 : f === 'right' ? 1 : 0; }
  function side(f) { return f === 'left' || f === 'right'; }

  // A dome over the top of the head (caps, beanies, hard hats): from angle a0 over the top.
  function dome(ctx, hx, hy, r, k, cut) {
    ctx.beginPath();
    ctx.arc(hx, hy, r * k, Math.PI + cut, -cut);
    ctx.closePath();
  }
  function brim(ctx, J, m, f, c, len, back) {
    var hx = J[0], hy = J[1], r = m.head, d = dirOf(f) * (back ? -1 : 1);
    if (d) {
      var y = hy - r * 0.18;
      quad(ctx, hx, y - r * 0.12, hx + d * r * len, y - r * 0.02, hx + d * r * len, y + r * 0.14, hx, y + r * 0.12);
      fs(ctx, c, m.dl);
    } else if ((f === 'down') !== !!back) {
      // Seen from the front the peak sits on the brow (y -0.52r .. -0.2r), clear of the eyes, so a
      // cap never hides the face's mood (the eyes span -0.2r .. +0.04r).
      ellipse(ctx, hx, hy - r * 0.36, r * 1.0, r * 0.16);
      fs(ctx, c, m.dl);
    }
  }

  var ACC = {
    cap: { layer: 'head', col: 'acc.red', draw: function (ctx, J, m, f, c) {
      dome(ctx, J[0], J[1] - m.head * 0.06, m.head, 1.06, 0.12); fs(ctx, c, m.dl);
      brim(ctx, J, m, f, SR.art.draw.tone(c, -1), 1.35, false);
    } },
    capback: { layer: 'head', col: 'acc.orange', draw: function (ctx, J, m, f, c) {
      dome(ctx, J[0], J[1] - m.head * 0.06, m.head, 1.06, 0.12); fs(ctx, c, m.dl);
      brim(ctx, J, m, f, SR.art.draw.tone(c, -1), 1.1, true);
    } },
    beanie: { layer: 'head', col: 'acc.crimson', draw: function (ctx, J, m, f, c) {
      var hx = J[0], hy = J[1], r = m.head;
      // pulled down to the brow: the rolled band ends at -0.22r, just above the eyes
      dome(ctx, hx, hy - r * 0.2, r, 1.06, 0.12); fs(ctx, c, m.dl);
      ctx.beginPath(); ctx.rect(hx - r * 1.08, hy - r * 0.5, r * 2.16, r * 0.28); fs(ctx, SR.art.draw.tone(c, -1), m.dl);
      circle(ctx, hx, hy - r * 1.3, r * 0.2); fs(ctx, c, m.dl);
    } },
    tophat: { layer: 'head', col: 'acc.black', draw: function (ctx, J, m, f, c) {
      var hx = J[0], hy = J[1], r = m.head;
      ctx.beginPath(); ctx.rect(hx - r * 0.62, hy - r * 2.05, r * 1.24, r * 1.35); fs(ctx, c, m.dl);
      ctx.beginPath(); ctx.rect(hx - r * 0.62, hy - r * 0.95, r * 1.24, r * 0.22); fs(ctx, col('acc.red'), 0);
      ellipse(ctx, hx, hy - r * 0.7, r * 1.05, r * 0.22); fs(ctx, c, m.dl);
    } },
    hardhat: { layer: 'head', col: 'acc.yellow', draw: function (ctx, J, m, f, c) {
      var hx = J[0], hy = J[1], r = m.head;
      ellipse(ctx, hx + dirOf(f) * r * 0.2, hy - r * 0.38, r * 1.3, r * 0.18); fs(ctx, c, m.dl);
      dome(ctx, hx, hy - r * 0.36, r, 1.0, 0); fs(ctx, c, m.dl);
    } },
    visor: { layer: 'head', col: 'acc.green', draw: function (ctx, J, m, f, c) {
      var hx = J[0], hy = J[1], r = m.head;
      ctx.beginPath(); ctx.arc(hx, hy, r * 1.02, Math.PI + 0.55, -0.55); ctx.lineWidth = r * 0.28; ctx.strokeStyle = c; ctx.stroke();
      brim(ctx, J, m, f, c, 1.3, false);
    } },
    mortarboard: { layer: 'head', col: 'acc.black', draw: function (ctx, J, m, f, c) {
      var hx = J[0], hy = J[1], r = m.head;
      dome(ctx, hx, hy - r * 0.1, r, 0.98, 0.2); fs(ctx, c, m.dl);
      quad(ctx, hx - r * 1.35, hy - r * 1.0, hx, hy - r * 1.35, hx + r * 1.35, hy - r * 1.0, hx, hy - r * 0.68); fs(ctx, c, m.dl);
      ctx.beginPath(); ctx.moveTo(hx, hy - r * 1.02); ctx.lineTo(hx + r * 1.1, hy - r * 0.95); ctx.lineTo(hx + r * 1.15, hy - r * 0.35);
      ctx.lineWidth = m.dl * 1.4; ctx.strokeStyle = col('acc.gold'); ctx.stroke();
    } },
    peakedcap: { layer: 'head', col: 'acc.army', draw: function (ctx, J, m, f, c) {
      var hx = J[0], hy = J[1], r = m.head;
      ctx.beginPath(); ctx.rect(hx - r * 0.95, hy - r * 0.78, r * 1.9, r * 0.45); fs(ctx, SR.art.draw.tone(c, -1), m.dl);
      ellipse(ctx, hx, hy - r * 0.95, r * 1.2, r * 0.38); fs(ctx, c, m.dl);
      circle(ctx, hx + dirOf(f) * r * 0.7, hy - r * 0.58, r * 0.14); fs(ctx, col('acc.gold'), 0);
      brim(ctx, J, m, f, col('acc.black'), 1.25, false);
    } },
    conductorcap: { layer: 'head', col: 'acc.navy', draw: function (ctx, J, m, f, c) {
      var hx = J[0], hy = J[1], r = m.head;
      ctx.beginPath(); ctx.rect(hx - r * 0.9, hy - r * 1.02, r * 1.8, r * 0.7); fs(ctx, c, m.dl);
      ctx.beginPath(); ctx.rect(hx - r * 0.9, hy - r * 0.5, r * 1.8, r * 0.16); fs(ctx, col('acc.gold'), 0);
      brim(ctx, J, m, f, col('acc.black'), 1.2, false);
    } },
    paperhat: { layer: 'head', col: 'acc.paper', draw: function (ctx, J, m, f, c) {
      var hx = J[0], hy = J[1], r = m.head, w = side(f) ? 0.8 : 1.15;
      ctx.beginPath(); ctx.moveTo(hx - r * w, hy - r * 0.45); ctx.lineTo(hx, hy - r * 1.55); ctx.lineTo(hx + r * w, hy - r * 0.45); ctx.closePath(); fs(ctx, c, m.dl);
      ctx.beginPath(); ctx.rect(hx - r * w, hy - r * 0.62, r * w * 2, r * 0.2); fs(ctx, col('bld.mcsticks.trim'), 0);
    } },
    fedora: { layer: 'head', col: 'acc.brown', draw: function (ctx, J, m, f, c) {
      var hx = J[0], hy = J[1], r = m.head;
      ellipse(ctx, hx, hy - r * 0.55, r * 1.55, r * 0.28); fs(ctx, c, m.dl);
      quad(ctx, hx - r * 0.85, hy - r * 0.6, hx - r * 0.7, hy - r * 1.45, hx + r * 0.7, hy - r * 1.45, hx + r * 0.85, hy - r * 0.6); fs(ctx, c, m.dl);
      ctx.beginPath(); ctx.rect(hx - r * 0.84, hy - r * 0.85, r * 1.68, r * 0.2); fs(ctx, col('acc.black'), 0);
    } },
    hood: { layer: 'back', col: 'acc.red', draw: function (ctx, J, m, f, c) {
      var hx = J[0], hy = J[1], r = m.head;
      ctx.beginPath(); ctx.arc(hx, hy + r * 0.05, r * 1.32, 0, Math.PI * 2);
      ctx.moveTo(J[30] - r * 1.2, J[31] + r * 0.2); ctx.lineTo(J[30] + r * 1.2, J[31] + r * 0.2); ctx.lineTo(hx, hy); ctx.closePath();
      fs(ctx, c, m.dl);
      if (f === 'up') { circle(ctx, hx, hy, r * 1.05); fs(ctx, c, 0); }
    } },
    headphones: { layer: 'head', col: 'acc.black', draw: function (ctx, J, m, f, c) {
      var hx = J[0], hy = J[1], r = m.head;
      ctx.beginPath(); ctx.arc(hx, hy, r * 1.12, Math.PI + 0.25, -0.25); ctx.lineWidth = r * 0.22; ctx.strokeStyle = c; ctx.stroke();
      if (side(f)) { ellipse(ctx, hx - dirOf(f) * r * 0.1, hy + r * 0.05, r * 0.36, r * 0.46); fs(ctx, col('acc.red'), m.dl); }
      else { ellipse(ctx, hx - r * 1.05, hy + r * 0.1, r * 0.28, r * 0.42); fs(ctx, col('acc.red'), m.dl); ellipse(ctx, hx + r * 1.05, hy + r * 0.1, r * 0.28, r * 0.42); fs(ctx, col('acc.red'), m.dl); }
    } },
    headset: { layer: 'head', col: 'acc.charcoal', draw: function (ctx, J, m, f, c) {
      var hx = J[0], hy = J[1], r = m.head, d = dirOf(f) || 1, ex = side(f) ? hx - d * r * 0.1 : hx - r * 1.02;
      ctx.beginPath(); ctx.arc(hx, hy, r * 1.08, Math.PI + 0.3, -0.3); ctx.lineWidth = r * 0.14; ctx.strokeStyle = c; ctx.stroke();
      ellipse(ctx, ex, hy + r * 0.08, r * 0.26, r * 0.34); fs(ctx, c, m.dl);
      ctx.beginPath(); ctx.moveTo(ex, hy + r * 0.3); ctx.quadraticCurveTo(ex + d * r * 0.4, hy + r * 0.85, hx + d * r * (side(f) ? 0.75 : 0.35), hy + r * 0.62);
      ctx.lineWidth = m.dl * 1.2; ctx.strokeStyle = c; ctx.stroke();
      circle(ctx, hx + d * r * (side(f) ? 0.75 : 0.35), hy + r * 0.62, r * 0.1); fs(ctx, c, 0);
    } },
    goggles: { layer: 'head', col: 'acc.brown', draw: function (ctx, J, m, f, c) {
      var hx = J[0], hy = J[1], r = m.head, y = hy - r * 0.42;
      ctx.beginPath(); ctx.arc(hx, hy, r * 1.0, Math.PI + 0.45, -0.45); ctx.lineWidth = r * 0.2; ctx.strokeStyle = c; ctx.stroke();
      if (f === 'up') return;
      if (side(f)) { circle(ctx, hx + dirOf(f) * r * 0.62, y, r * 0.3); fs(ctx, col('acc.lensHi'), m.dl); }
      else { circle(ctx, hx - r * 0.38, y, r * 0.3); fs(ctx, col('acc.lensHi'), m.dl); circle(ctx, hx + r * 0.38, y, r * 0.3); fs(ctx, col('acc.lensHi'), m.dl); }
    } },
    glasses: { layer: 'head', col: 'acc.black', lens: 'acc.white', draw: function (ctx, J, m, f, c, lensKey) {
      if (f === 'up') return;
      var hx = J[0], hy = J[1], r = m.head, y = hy - r * 0.08, lr = r * 0.27;
      var lens = col(lensKey || 'acc.white');
      ctx.lineWidth = m.dl; ctx.strokeStyle = c;
      if (side(f)) {
        var d = dirOf(f);
        circle(ctx, hx + d * r * 0.5, y, lr); fs(ctx, lens, 0); ctx.lineWidth = m.dl; ctx.strokeStyle = c; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hx + d * r * 0.25, y); ctx.lineTo(hx - d * r * 0.4, y - r * 0.05); ctx.stroke();
      } else {
        circle(ctx, hx - r * 0.36, y, lr); fs(ctx, lens, 0); ctx.lineWidth = m.dl; ctx.strokeStyle = c; ctx.stroke();
        circle(ctx, hx + r * 0.36, y, lr); fs(ctx, lens, 0); ctx.lineWidth = m.dl; ctx.strokeStyle = c; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hx - r * 0.1, y); ctx.lineTo(hx + r * 0.1, y); ctx.stroke();
      }
    } },
    sunglasses: { layer: 'head', col: 'acc.black', draw: function (ctx, J, m, f, c) { ACC.glasses.draw(ctx, J, m, f, c, 'acc.lens'); } },
    quill: { layer: 'head', col: 'acc.white', draw: function (ctx, J, m, f, c) {
      var hx = J[0], hy = J[1], r = m.head, d = side(f) ? -dirOf(f) : 1;
      var bx = hx + d * r * (side(f) ? 0.2 : 0.95), by = hy + r * 0.05;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + d * r * 0.9, by - r * 0.8, bx + d * r * 0.6, by - r * 1.7);
      ctx.quadraticCurveTo(bx + d * r * 0.2, by - r * 0.8, bx, by); fs(ctx, c, m.dl);
    } },
    pencil: { layer: 'head', col: 'acc.yellow', draw: function (ctx, J, m, f, c) {
      var hx = J[0], hy = J[1], r = m.head, d = side(f) ? -dirOf(f) : 1;
      var bx = hx + d * r * (side(f) ? 0.1 : 0.9);
      quad(ctx, bx - r * 0.5, hy - r * 0.55, bx + r * 0.55, hy - r * 0.95, bx + r * 0.6, hy - r * 0.78, bx - r * 0.45, hy - r * 0.38); fs(ctx, c, m.dl);
    } },
    headband: { layer: 'head', col: 'acc.red', draw: function (ctx, J, m, f, c) {
      var hx = J[0], hy = J[1], r = m.head;
      ctx.beginPath(); ctx.rect(hx - r * 1.02, hy - r * 0.62, r * 2.04, r * 0.3); fs(ctx, c, m.dl);
      if (side(f)) { var d = -dirOf(f); ctx.beginPath(); ctx.moveTo(hx + d * r, hy - r * 0.5); ctx.lineTo(hx + d * r * 1.7, hy - r * 0.1); ctx.moveTo(hx + d * r, hy - r * 0.45); ctx.lineTo(hx + d * r * 1.55, hy + r * 0.2); ctx.lineWidth = r * 0.16; ctx.strokeStyle = c; ctx.stroke(); }
    } },
    mask: { layer: 'head', col: 'acc.black', draw: function (ctx, J, m, f, c) {
      if (f === 'up') return;
      var hx = J[0], hy = J[1], r = m.head;
      var x0 = side(f) ? hx - r * 0.1 * dirOf(f) : hx - r * 0.98;
      ctx.beginPath(); ctx.rect(side(f) ? Math.min(x0, hx + dirOf(f) * r) : x0, hy - r * 0.34, side(f) ? r * 1.05 : r * 1.96, r * 0.4); fs(ctx, c, 0);
      if (!side(f)) { circle(ctx, hx - r * 0.36, hy - r * 0.14, r * 0.12); fs(ctx, col('acc.white'), 0); circle(ctx, hx + r * 0.36, hy - r * 0.14, r * 0.12); fs(ctx, col('acc.white'), 0); }
      else { circle(ctx, hx + dirOf(f) * r * 0.5, hy - r * 0.14, r * 0.12); fs(ctx, col('acc.white'), 0); }
    } },
    // ---- neck and body
    bowtie: { layer: 'body', col: 'acc.red', draw: function (ctx, J, m, f, c) {
      if (f === 'up') return;
      var x = J[2] + (side(f) ? dirOf(f) * m.limb * 0.6 : 0), y = J[3] + m.head * 0.15, s = m.head * (side(f) ? 0.28 : 0.42);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s, y - s * 0.7); ctx.lineTo(x - s, y + s * 0.7); ctx.closePath();
      ctx.moveTo(x, y); ctx.lineTo(x + s, y - s * 0.7); ctx.lineTo(x + s, y + s * 0.7); ctx.closePath(); fs(ctx, c, m.dl);
    } },
    tie: { layer: 'body', col: 'acc.navy', draw: function (ctx, J, m, f, c) {
      if (f === 'up') return;
      var ox = side(f) ? dirOf(f) * m.limb * 0.7 : 0;
      var nx = J[2] + ox, ny = J[3] + m.head * 0.1, hx = J[28] + ox, hy = J[29];
      var tx = nx + (hx - nx) * 0.62, ty = ny + (hy - ny) * 0.62, w = m.head * (side(f) ? 0.18 : 0.28);
      ctx.beginPath(); ctx.moveTo(nx - w * 0.6, ny); ctx.lineTo(nx + w * 0.6, ny); ctx.lineTo(tx + w, ty - w); ctx.lineTo(tx, ty + w); ctx.lineTo(tx - w, ty - w); ctx.closePath(); fs(ctx, c, m.dl);
    } },
    scarf: { layer: 'body', col: 'acc.teal', draw: function (ctx, J, m, f, c) {
      var nx = J[2], ny = J[3] + m.head * 0.12, r = m.head;
      ellipse(ctx, nx, ny, r * 0.75, r * 0.26); fs(ctx, c, m.dl);
      var d = side(f) ? -dirOf(f) : 1;
      quad(ctx, nx + d * r * 0.2, ny, nx + d * r * 0.55, ny, nx + d * r * 0.72, ny + r * 1.15, nx + d * r * 0.36, ny + r * 1.2); fs(ctx, c, m.dl);
    } },
    sash: { layer: 'body', col: 'acc.sash', draw: function (ctx, J, m, f, c) {
      var ax = J[30], ay = J[31], bx = J[28], by = J[29], w = m.head * 0.32;
      var sx = side(f) ? 0 : m.head * 0.55, d = f === 'up' ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(ax - d * sx - w, ay); ctx.lineTo(ax - d * sx + w, ay); ctx.lineTo(bx + d * sx + w, by - w * 0.5); ctx.lineTo(bx + d * sx - w, by + w * 0.2); ctx.closePath();
      fs(ctx, c, m.dl);
    } },
    chain: { layer: 'body', col: 'acc.chain', draw: function (ctx, J, m, f, c) {
      if (f === 'up') return;
      var nx = J[2] + (side(f) ? dirOf(f) * m.limb * 0.5 : 0), ny = J[3] + m.head * 0.1, r = m.head;
      ctx.beginPath(); ctx.moveTo(nx - r * 0.5, ny); ctx.quadraticCurveTo(nx, ny + r * 1.2, nx + r * 0.5, ny);
      ctx.lineWidth = Math.max(m.dl, r * 0.13); ctx.strokeStyle = c; ctx.stroke();
      circle(ctx, nx, ny + r * 0.62, r * 0.16); fs(ctx, c, 0);
    } },
    medals: { layer: 'body', col: 'acc.medal', draw: function (ctx, J, m, f, c) {
      if (f === 'up') return;
      var r = m.head, d = side(f) ? dirOf(f) : 1;
      var cx = J[30] + (J[28] - J[30]) * 0.28 + d * (side(f) ? m.limb * 0.6 : r * 0.35), cy = J[31] + (J[29] - J[31]) * 0.28;
      for (var i = 0; i < 3; i++) {
        var x = cx + (side(f) ? 0 : (i - 1) * r * 0.32) , y = cy + (side(f) ? i * r * 0.3 : 0);
        ctx.beginPath(); ctx.rect(x - r * 0.08, y - r * 0.22, r * 0.16, r * 0.2); fs(ctx, col('acc.ribbon'), 0);
        circle(ctx, x, y + r * 0.08, r * 0.12); fs(ctx, c, m.dl * 0.8);
      }
    } },
    apron: { layer: 'body', col: 'acc.apron', draw: function (ctx, J, m, f, c) {
      if (f === 'up') return;
      var r = m.head, ax = J[30] + (J[28] - J[30]) * 0.35, ay = J[31] + (J[29] - J[31]) * 0.35;
      var kx = (J[20] + J[22]) / 2, ky = (J[21] + J[23]) / 2;
      if (side(f)) {
        var d = dirOf(f);
        quad(ctx, ax + d * m.limb * 0.4, ay, ax + d * r * 0.55, ay, kx + d * r * 0.75, ky, kx + d * m.limb * 0.2, ky);
      } else {
        quad(ctx, ax - r * 0.6, ay, ax + r * 0.6, ay, kx + r * 0.85, ky, kx - r * 0.85, ky);
      }
      fs(ctx, c, m.dl);
    } },
    vest: { layer: 'body', col: 'acc.black', draw: function (ctx, J, m, f, c) {
      var r = m.head, sx = J[30], sy = J[31], hx = J[28], hy = J[29] - r * 0.1;
      if (side(f)) {
        var d = dirOf(f);
        quad(ctx, sx - d * r * 0.35, sy, sx + d * r * 0.5, sy + r * 0.3, hx + d * r * 0.5, hy, hx - d * r * 0.35, hy); fs(ctx, c, m.dl);
      } else {
        quad(ctx, sx - r * 0.75, sy, sx - r * 0.08, sy + r * 0.9, hx - r * 0.1, hy, hx - r * 0.8, hy); fs(ctx, c, m.dl);
        quad(ctx, sx + r * 0.75, sy, sx + r * 0.08, sy + r * 0.9, hx + r * 0.1, hy, hx + r * 0.8, hy); fs(ctx, c, m.dl);
      }
    } },
    longcoat: { layer: 'body', col: 'acc.brown', draw: function (ctx, J, m, f, c) { coat(ctx, J, m, f, c, 0.95, false); } },
    trenchcoat: { layer: 'body', col: 'acc.khaki', draw: function (ctx, J, m, f, c) { coat(ctx, J, m, f, c, 0.9, true); } },
    tweed: { layer: 'body', col: 'acc.tweed', draw: function (ctx, J, m, f, c) { coat(ctx, J, m, f, c, 0.1, false); } },
    towel: { layer: 'body', col: 'acc.towel', draw: function (ctx, J, m, f, c) {
      var r = m.head, d = side(f) ? -dirOf(f) : -1, x = J[30] + d * r * (side(f) ? 0.15 : 0.55), y = J[31];
      quad(ctx, x - r * 0.3, y - r * 0.15, x + r * 0.3, y - r * 0.15, x + r * 0.34, y + r * 0.95, x - r * 0.26, y + r * 0.95); fs(ctx, c, m.dl);
      ctx.beginPath(); ctx.moveTo(x - r * 0.28, y + r * 0.7); ctx.lineTo(x + r * 0.32, y + r * 0.7); ctx.strokeStyle = col('acc.sky'); ctx.lineWidth = m.dl; ctx.stroke();
    } },
    sandwichboard: { layer: 'body', col: 'acc.paper', draw: function (ctx, J, m, f, c) {
      var r = m.head, top = J[31] + r * 0.2, ky = (J[21] + J[23]) / 2 + r * 0.3, cx = J[28];
      if (side(f)) {
        var d = dirOf(f);
        quad(ctx, cx + d * r * 0.25, top, cx + d * r * 0.55, top, cx + d * r * 1.05, ky, cx + d * r * 0.75, ky); fs(ctx, c, m.dl);
        quad(ctx, cx - d * r * 0.25, top, cx - d * r * 0.55, top, cx - d * r * 1.05, ky, cx - d * r * 0.75, ky); fs(ctx, SR.art.draw.tone(c, -1), m.dl);
      } else {
        ctx.beginPath(); ctx.rect(cx - r * 1.35, top, r * 2.7, ky - top); fs(ctx, c, m.dl);
        if (f === 'down') boardText(ctx, cx, top, r, ky - top, m);
      }
    } },
    backpack: { layer: 'back', col: 'acc.green', draw: function (ctx, J, m, f, c) {
      var r = m.head, sx = J[30], sy = J[31], hy = J[29];
      if (side(f)) { var d = -dirOf(f); SR.art.draw.roundRect(ctx, sx + d * r * 0.2 - (d < 0 ? r * 0.9 : 0), sy + r * 0.1, r * 0.9, (hy - sy) * 0.8, r * 0.25); fs(ctx, c, m.dl); }
      else if (f === 'up') { SR.art.draw.roundRect(ctx, sx - r * 0.8, sy + r * 0.1, r * 1.6, (hy - sy) * 0.85, r * 0.3); fs(ctx, c, m.dl); }
      else { ctx.beginPath(); ctx.moveTo(sx - r * 0.45, sy); ctx.lineTo(sx - r * 0.5, sy + (hy - sy) * 0.7); ctx.moveTo(sx + r * 0.45, sy); ctx.lineTo(sx + r * 0.5, sy + (hy - sy) * 0.7); ctx.lineWidth = m.dl * 1.4; ctx.strokeStyle = c; ctx.stroke(); }
    } },
    bag: { layer: 'body', col: 'acc.tan', draw: function (ctx, J, m, f, c) {
      var r = m.head, sx = J[30], sy = J[31], hx = J[28], hy = J[29], d = side(f) ? -dirOf(f) : 1;
      ctx.beginPath(); ctx.moveTo(sx - d * r * 0.4, sy); ctx.lineTo(hx + d * r * 0.7, hy - r * 0.2); ctx.lineWidth = m.dl * 1.3; ctx.strokeStyle = col('acc.brown'); ctx.stroke();
      SR.art.draw.roundRect(ctx, hx + d * r * 0.4 - r * 0.45, hy - r * 0.45, r * 0.9, r * 0.7, r * 0.15); fs(ctx, c, m.dl);
    } },
    camera: { layer: 'body', col: 'acc.black', draw: function (ctx, J, m, f, c) {
      if (f === 'up') return;
      var r = m.head, x = J[30] + (J[28] - J[30]) * 0.3 + (side(f) ? dirOf(f) * m.limb : 0), y = J[31] + (J[29] - J[31]) * 0.3;
      ctx.beginPath(); ctx.rect(x - r * 0.45, y - r * 0.28, r * 0.9, r * 0.56); fs(ctx, c, m.dl);
      circle(ctx, x, y, r * 0.18); fs(ctx, col('acc.lensHi'), m.dl * 0.8);
    } },
    // ---- held in a hand
    cup: { layer: 'hand', col: 'acc.cup', draw: function (ctx, J, m, f, c) { heldCup(ctx, J[14], J[15], m, c); } },
    clipboard: { layer: 'hand', col: 'acc.clip', draw: function (ctx, J, m, f, c) {
      var r = m.head, x = J[12], y = J[13];
      ctx.beginPath(); ctx.rect(x - r * 0.45, y - r * 0.9, r * 0.9, r * 1.2); fs(ctx, c, m.dl);
      ctx.beginPath(); ctx.rect(x - r * 0.32, y - r * 0.72, r * 0.64, r * 0.92); fs(ctx, col('acc.paper'), 0);
      ctx.beginPath(); ctx.rect(x - r * 0.18, y - r * 0.98, r * 0.36, r * 0.16); fs(ctx, col('acc.silver'), 0);
    } },
    notepad: { layer: 'hand', col: 'acc.notepad', draw: function (ctx, J, m, f, c) {
      var r = m.head, x = J[12], y = J[13];
      ctx.beginPath(); ctx.rect(x - r * 0.32, y - r * 0.75, r * 0.64, r * 0.85); fs(ctx, c, m.dl);
      ctx.beginPath(); ctx.moveTo(x - r * 0.2, y - r * 0.45); ctx.lineTo(x + r * 0.2, y - r * 0.45); ctx.moveTo(x - r * 0.2, y - r * 0.25); ctx.lineTo(x + r * 0.15, y - r * 0.25);
      ctx.lineWidth = m.dl * 0.8; ctx.strokeStyle = col('acc.grey'); ctx.stroke();
    } },
    magnifier: { layer: 'hand', col: 'acc.brown', draw: function (ctx, J, m, f, c) {
      var r = m.head, x = J[14], y = J[15], d = side(f) ? dirOf(f) : 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + d * r * 0.5, y - r * 0.5); ctx.lineWidth = r * 0.2; ctx.strokeStyle = c; ctx.stroke();
      circle(ctx, x + d * r * 0.85, y - r * 0.85, r * 0.45); fs(ctx, col('acc.lensHi'), m.dl);
    } },
    umbrella: { layer: 'hand', col: 'acc.umbrella', draw: function (ctx, J, m, f, c) {
      var r = m.head, x = J[14], y = J[15], top = J[1] - r * 1.9;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, top); ctx.lineWidth = m.dl * 1.2; ctx.strokeStyle = col('acc.charcoal'); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, top + r * 0.2, r * 2.2, Math.PI, 0); ctx.closePath(); fs(ctx, c, m.dl);
    } },
    glowstick: { layer: 'hand', col: 'acc.glow', draw: function (ctx, J, m, f, c) {
      var r = m.head, x = J[14], y = J[15];
      ctx.beginPath(); ctx.moveTo(x - r * 0.3, y + r * 0.3); ctx.lineTo(x + r * 0.35, y - r * 0.6); ctx.lineWidth = r * 0.22; ctx.strokeStyle = c; ctx.stroke();
    } },
    skateboard: { layer: 'hand', col: 'acc.board', draw: function (ctx, J, m, f, c) {
      // Held at the side (Skid); standing on one is opts.mount = 'board'.
      var r = m.head, x = J[12] + (side(f) ? -dirOf(f) * r * 0.3 : r * 0.3), y = J[13];
      SR.art.draw.roundRect(ctx, x - r * 0.3, y - r * 1.5, r * 0.6, r * 2.6, r * 0.3); fs(ctx, c, m.dl);
      circle(ctx, x, y - r * 1.2, r * 0.14); fs(ctx, col('acc.wheel'), 0);
      circle(ctx, x, y + r * 0.8, r * 0.14); fs(ctx, col('acc.wheel'), 0);
    } },
  };
  var ACC_ALIAS = {
    backwardscap: 'capback', capbackwards: 'capback', baseballcap: 'cap', hat: 'fedora',
    goldchain: 'chain', papercup: 'cup', coffee: 'cup', paperhat: 'paperhat', tweedjacket: 'tweed',
    jacket: 'tweed', magnifyingglass: 'magnifier', glass: 'magnifier', coat: 'longcoat', trench: 'trenchcoat',
    bandana: 'headband', sandwich: 'sandwichboard', board: 'sandwichboard', shades: 'sunglasses',
    earphones: 'headphones', cane: 'umbrella', pilotgoggles: 'goggles', crown: 'tophat', none: '',
  };

  function coat(ctx, J, m, f, c, len, belt) {
    var r = m.head, sx = J[30], sy = J[31] - r * 0.05, hx = J[28], hy = J[29];
    var kx = (J[20] + J[22]) / 2, ky = (J[21] + J[23]) / 2;
    var bx = hx + (kx - hx) * len, by = hy + (ky - hy) * len + r * 0.15;
    if (side(f)) {
      var d = dirOf(f);
      quad(ctx, sx - d * r * 0.4, sy, sx + d * r * 0.45, sy, bx + d * r * 0.75, by, bx - d * r * 0.6, by);
    } else {
      quad(ctx, sx - r * 0.72, sy, sx + r * 0.72, sy, bx + r * 0.95, by, bx - r * 0.95, by);
    }
    fs(ctx, c, m.dl);
    if (!side(f) && f === 'down') {
      ctx.beginPath(); ctx.moveTo(sx, sy + r * 0.1); ctx.lineTo(bx, by);
      ctx.moveTo(sx - r * 0.3, sy); ctx.lineTo(sx, sy + r * 0.6); ctx.lineTo(sx + r * 0.3, sy);
      ctx.lineWidth = m.dl * 0.8; ctx.strokeStyle = col('inkLine'); ctx.stroke();
    }
    if (belt) {
      var ty = hy - r * 0.2, w = side(f) ? r * 0.6 : r * 0.82;
      ctx.beginPath(); ctx.rect(hx - w, ty, w * 2, r * 0.2); fs(ctx, SR.art.draw.tone(c, -1), 0);
    }
  }

  function heldCup(ctx, x, y, m, c) {
    var r = m.head;
    quad(ctx, x - r * 0.28, y - r * 0.65, x + r * 0.28, y - r * 0.65, x + r * 0.2, y + r * 0.05, x - r * 0.2, y + r * 0.05);
    fs(ctx, c, m.dl);
    ctx.beginPath(); ctx.rect(x - r * 0.27, y - r * 0.45, r * 0.54, r * 0.16); fs(ctx, col('acc.coffee'), 0);
  }

  // Brother Margin's board: its text is a text key (en-park, W3-Park); scribbles until it exists.
  function boardText(ctx, cx, top, r, h, m) {
    var key = 'bark.preacher.board';
    if (SR.text && SR.text.has && SR.text.has(key) && r >= 12) {
      var words = String(SR.text(key)).toUpperCase().split(' ');
      var lines = [], cur = '';
      words.forEach(function (w) { if ((cur + ' ' + w).trim().length > 7 && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
      if (cur) lines.push(cur);
      var fsz = Math.min(r * 0.42, h / (lines.length + 1));
      ctx.fillStyle = col('ink');
      ctx.font = SR.art.draw.font(fsz, 900, 'display');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], cx, top + h * (i + 1) / (lines.length + 1));
      return;
    }
    ctx.beginPath();
    for (var j = 1; j <= 4; j++) { var y = top + h * j / 5; ctx.moveTo(cx - r * 0.9, y); ctx.lineTo(cx + r * (j % 2 ? 0.9 : 0.5), y); }
    ctx.lineWidth = Math.max(m.dl, r * 0.12); ctx.strokeStyle = col('ink'); ctx.stroke();
  }

  function accName(n) {
    var k = String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (Object.prototype.hasOwnProperty.call(ACC_ALIAS, k)) k = ACC_ALIAS[k];
    return k;
  }

  // ---- looks: every named person (ART_AUDIO §7) --------------------------------------------------
  // head: a palette key; acc: accessory names; col: per-accessory colour keys; child: 38 u.
  var looks = {
    harold: { head: 'npc.sand', acc: ['longcoat', 'beanie', 'cup'], col: { beanie: 'acc.crimson', longcoat: 'acc.brown' } },
    kid: { head: 'npc.peach', child: true, acc: ['capback', 'skateboard'], col: { capback: 'acc.orange' } },
    dealer: { head: 'npc.olive', acc: ['hood', 'sunglasses'], col: { hood: 'acc.red' } },
    newguy: { head: 'npc.moss', acc: ['hood', 'sunglasses'], col: { hood: 'acc.charcoal' } },
    mcholland: { head: 'npc.stone', acc: ['trenchcoat', 'fedora', 'notepad'], col: { trenchcoat: 'acc.khaki', fedora: 'acc.brown' } },
    sticky: { head: 'npc.clay', acc: ['apron', 'towel'], col: { apron: 'acc.cream' } },
    mel: { head: 'npc.butter', acc: ['paperhat'] },
    dee: { head: 'npc.mint', acc: ['visor'], col: { visor: 'acc.pink' } },
    vinnie: { head: 'npc.taupe', acc: ['chain'] },
    sofia: { head: 'npc.peach', acc: ['scarf'], col: { scarf: 'acc.teal' } },
    penny: { head: 'npc.mustard', acc: ['visor', 'pencil'], col: { visor: 'acc.green' } },
    bea: { head: 'npc.sage', acc: ['headset'] },
    gil: { head: 'npc.moss', acc: ['tie', 'glasses'], col: { tie: 'acc.red' } },
    frankie: { head: 'npc.clay', acc: ['bowtie', 'headphones'], col: { bowtie: 'acc.purple' } },
    terry: { head: 'npc.grey', acc: ['tie', 'clipboard'], col: { tie: 'acc.denim' } },
    lou: { head: 'npc.butter', acc: ['vest', 'bowtie'], col: { vest: 'acc.black', bowtie: 'acc.red' } },
    tabby: { head: 'npc.mint', acc: ['conductorcap', 'headset'] },
    quill: { head: 'npc.stone', acc: ['mortarboard', 'glasses'] },
    plume: { head: 'npc.sand', acc: ['quill', 'tie'], col: { tie: 'acc.green' } },
    crease: { head: 'npc.taupe', acc: ['tweed', 'magnifier'] },
    preacher: { head: 'npc.grey', acc: ['sandwichboard'] },
    ori: { head: 'npc.peach', acc: ['scarf', 'goggles'], col: { scarf: 'acc.red', goggles: 'acc.brown' } },
    doodle: { head: 'npc.butter', acc: ['sash', 'tie'], col: { sash: 'acc.sash', tie: 'acc.navy' } },
    crayon: { head: 'npc.olive', acc: ['medals', 'peakedcap'], col: { peakedcap: 'acc.army' } },
    officer: { head: 'npc.clay', acc: ['peakedcap'], col: { peakedcap: 'acc.navy' } },
    board: { head: 'npc.grey', acc: ['tie', 'glasses'], col: { tie: 'acc.charcoal' } },
    stranger: { head: 'fighter.0', acc: ['mask'] },
  };
  var LOOK_ALIAS = {
    skid: 'kid', red: 'dealer', margin: 'preacher', brother_margin: 'preacher', brothermargin: 'preacher',
    homeless_harold: 'harold', lucky_lou: 'lou', luckylou: 'lou', penny_wise: 'penny', pennywise: 'penny',
    dean_quill: 'quill', clerk_plume: 'plume', professor_crease: 'crease', pilot_ori: 'ori',
    mayor_doodle: 'doodle', general_crayon: 'crayon', manager_mel: 'mel', new_guy: 'newguy',
    detective_mcholland: 'mcholland', police: 'officer', electoral_board: 'board', you: 'player',
  };
  // Fight ladder defaults (GDD §6.3) when data/fighters.js does not name an accessory.
  var FIGHTER_ACC = ['mask', 'beanie', 'tophat', 'glasses', 'headband', 'goggles', 'cap', 'chain',
    'glasses', 'hardhat', 'peakedcap', 'sunglasses', 'fedora'];
  var PED_ACC = ['', '', '', 'cap', 'beanie', 'glasses', 'scarf', 'headphones', 'backpack', 'bag',
    'tie', 'visor', 'umbrella', 'camera', 'bowtie', 'sunglasses', 'capback', 'hardhat', 'apron', 'cup'];
  var PED_COL = ['acc.red', 'acc.navy', 'acc.denim', 'acc.green', 'acc.teal', 'acc.purple', 'acc.orange',
    'acc.pink', 'acc.tan', 'acc.charcoal', 'acc.yellow', 'acc.olive'];
  var NPC_HEADS = ['sage', 'mustard', 'sand', 'grey', 'mint', 'olive', 'peach', 'clay', 'moss', 'stone', 'butter', 'taupe'];

  var normCache = new Map();
  var objCache = typeof WeakMap === 'function' ? new WeakMap() : null;

  /** Normalises a look definition: { head (colour), child, player, back[], body[], head[], hand[] }. */
  function normalize(def) {
    var n = { headCol: col(def.head || 'npc.stone'), child: !!def.child, player: !!def.player,
      layers: { back: [], body: [], head: [], hand: [] }, names: [] };
    var list = def.acc || [];
    if (!Array.isArray(list)) list = [list];
    list.forEach(function (a) {
      var k = accName(a);
      var spec = k && ACC[k];
      if (!spec) { if (k) SR.util.warnOnce('acc:' + k, 'SR.art.stick: unknown accessory "' + a + '"'); return; }
      var ck = (def.col && (def.col[k] || def.col[a])) || spec.col;
      n.layers[spec.layer].push({ fn: spec.draw, c: col(ck), name: k });
      n.names.push(k);
    });
    return n;
  }

  function fighterLook(id) {
    var reg = SR.reg && SR.reg.fighter;
    var def = null, num = null;
    var m = /^fighter[._](\d+)$/.exec(id);
    if (m) {
      num = +m[1];
      if (reg) for (var k in reg) if (reg[k] && +reg[k].n === num) { def = reg[k]; break; }
    } else if (reg && reg[id]) { def = reg[id]; num = +def.n; }
    if (num === null || isNaN(num)) return null;
    var fp = SR.art.palette.fighter;
    var headKey = def && def.palette ? def.palette : 'fighter.' + Math.min(num, fp.length - 1);
    var acc = def && def.accessory ? def.accessory : FIGHTER_ACC[num % FIGHTER_ACC.length];
    return { head: headKey, acc: [acc] };
  }

  /**
   * A deterministic pedestrian look for a number (W2-City's `look` field).
   * @param {number} n
   * @returns {object} a normalised look
   */
  var pedCache = new Map();   // keyed by the number itself: no string built per pedestrian per frame
  function pedLook(n) {
    var hit = pedCache.get(n);
    if (hit) return hit;
    var h = SR.util.hash('ped', n);
    var acc = PED_ACC[h % PED_ACC.length];
    var def = { head: 'npc.' + NPC_HEADS[(h >>> 8) % NPC_HEADS.length], child: ((h >>> 16) % 100) < 8, acc: acc ? [acc] : [], col: {} };
    if (acc) def.col[acc] = PED_COL[(h >>> 20) % PED_COL.length];
    var out = normalize(def);
    pedCache.set(n, out);
    return out;
  }

  var DEFAULT_LOOK = null;
  /**
   * Resolves a look (person id, fighter, pedestrian number, 'player' or a look object) to its
   * normalised form. Unknown ids fall back to data/people.js `look` and then to a plain stick.
   * @returns {object}
   */
  function look(v, depth) {
    depth = depth || 0;
    if (v === undefined || v === null || v === '') {
      if (!DEFAULT_LOOK) DEFAULT_LOOK = normalize({ head: 'npc.stone', acc: [] });
      return DEFAULT_LOOK;
    }
    if (typeof v === 'number') return pedLook(v);
    if (typeof v === 'object') {
      if (v.layers && v.headCol) return v;
      var o = objCache ? objCache.get(v) : null;
      if (!o) { o = normalize(v); if (objCache) objCache.set(v, o); }
      return o;
    }
    if (v === 'player') return playerLook();
    var raw = normCache.get(v);   // the common case: an id seen before, no string work
    if (raw) return raw;
    var id = String(v);
    var low = id.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(LOOK_ALIAS, low)) id = LOOK_ALIAS[low]; else id = low;
    if (id === 'player') return playerLook();
    var hit = normCache.get(id);
    if (hit) { normCache.set(v, hit); return hit; }
    var def = looks[id] || fighterLook(id);
    var out;
    if (!def) {
      // data/people.js (W2-Street) may give a person a look object or another person's look id.
      var pd = SR.reg && SR.reg.person && SR.reg.person[id];
      if (pd && pd.look && pd.look !== id && depth < 3) out = look(pd.look, depth + 1);
      else SR.util.warnOnce('look:' + id, 'SR.art.stick: unknown person "' + v + '" (drawn with the plain look)');
    }
    // Cached either way (an unknown id too), so a frame never re-normalises a look.
    if (!out) out = normalize(def || { head: 'npc.stone', acc: [] });
    normCache.set(id, out);
    if (v !== id) normCache.set(v, out);
    return out;
  }

  var playerCache = {};
  function playerLook() {
    var acc = SR.state && SR.state.player && SR.state.player.look ? SR.state.player.look.acc : 'none';
    var k = String(acc || 'none');
    if (!playerCache[k]) {
      var n = normalize({ head: 'karma.good.0', acc: k === 'none' ? [] : [k] });
      n.player = true;
      playerCache[k] = n;
    }
    return playerCache[k];
  }

  // ---- faces -----------------------------------------------------------------------------------------
  var MOOD_ALIAS = { shock: 'surprised', shocked: 'surprised', idle: 'neutral', calm: 'neutral', joy: 'happy', glad: 'happy',
    mad: 'angry', scared: 'worried', afraid: 'worried', tired: 'sleep', asleep: 'sleep', pain: 'hurt' };
  function face(ctx, hx, hy, r, f, mood, lw) {
    if (f === 'up') return;
    if (MOOD_ALIAS[mood]) mood = MOOD_ALIAS[mood];
    var c = col('stick.face');
    ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.lineCap = 'round';
    var er = Math.max(0.8, r * 0.12);
    var sideView = f === 'left' || f === 'right';
    var d = f === 'left' ? -1 : 1;
    var eyes = sideView ? [hx + d * r * 0.45] : [hx - r * 0.34, hx + r * 0.34];
    var ey = hy - r * 0.08;
    var closed = mood === 'sleep' || mood === 'blink';
    if (closed || mood === 'hurt') {
      ctx.beginPath();
      for (var i = 0; i < eyes.length; i++) {
        if (closed) { ctx.moveTo(eyes[i] - er * 1.2, ey); ctx.quadraticCurveTo(eyes[i], ey + er * 1.2, eyes[i] + er * 1.2, ey); }
        else { ctx.moveTo(eyes[i] - er, ey - er); ctx.lineTo(eyes[i] + er, ey + er); ctx.moveTo(eyes[i] + er, ey - er); ctx.lineTo(eyes[i] - er, ey + er); }
      }
      ctx.stroke();
    }
    if (!closed && mood !== 'hurt') {
      var big = mood === 'surprised' ? 1.35 : 1;
      ctx.beginPath();
      for (var j = 0; j < eyes.length; j++) { ctx.moveTo(eyes[j] + er * big, ey); ctx.arc(eyes[j], ey, er * big, 0, Math.PI * 2); }
      ctx.fill();
    }
    // brows
    if (mood === 'angry' || mood === 'worried') {
      ctx.beginPath();
      for (var b = 0; b < eyes.length; b++) {
        var inner = sideView ? -d : (eyes[b] < hx ? 1 : -1);
        var yIn = mood === 'angry' ? ey - er * 1.4 : ey - er * 2.8, yOut = mood === 'angry' ? ey - er * 2.8 : ey - er * 1.8;
        ctx.moveTo(eyes[b] + inner * er * 1.6, yIn); ctx.lineTo(eyes[b] - inner * er * 1.6, yOut);
      }
      ctx.stroke();
    }
    // mouth
    var mx = sideView ? hx + d * r * 0.52 : hx, my = hy + r * 0.38, mw = sideView ? r * 0.2 : r * 0.28;
    ctx.beginPath();
    switch (mood) {
      case 'happy': ctx.moveTo(mx - mw, my - r * 0.06); ctx.quadraticCurveTo(mx, my + r * 0.22, mx + mw, my - r * 0.06); break;
      case 'sad': case 'hurt': ctx.moveTo(mx - mw, my + r * 0.1); ctx.quadraticCurveTo(mx, my - r * 0.14, mx + mw, my + r * 0.1); break;
      case 'surprised': ctx.moveTo(mx + r * 0.1, my); ctx.arc(mx, my, r * 0.1, 0, Math.PI * 2); break;
      case 'smug': ctx.moveTo(mx - mw, my); ctx.quadraticCurveTo(mx + mw * 0.5, my + r * 0.05, mx + mw, my - r * 0.12); break;
      case 'worried': ctx.moveTo(mx - mw, my); ctx.quadraticCurveTo(mx - mw * 0.3, my - r * 0.08, mx, my); ctx.quadraticCurveTo(mx + mw * 0.3, my + r * 0.08, mx + mw, my); break;
      case 'sleep': ctx.moveTo(mx - mw * 0.4, my); ctx.lineTo(mx + mw * 0.4, my); break;
      default: ctx.moveTo(mx - mw, my); ctx.lineTo(mx + mw, my);
    }
    ctx.stroke();
  }

  // ---- drawing ---------------------------------------------------------------------------------------
  var EMPTY = {};

  function limbPath(ctx, J, ox, oy, legs, arms, torso) {
    ctx.beginPath();
    if (legs) {
      ctx.moveTo(J[28] + ox, J[29] + oy); ctx.lineTo(J[20] + ox, J[21] + oy); ctx.lineTo(J[24] + ox, J[25] + oy);
      ctx.moveTo(J[28] + ox, J[29] + oy); ctx.lineTo(J[22] + ox, J[23] + oy); ctx.lineTo(J[26] + ox, J[27] + oy);
    }
    if (torso) { ctx.moveTo(J[28] + ox, J[29] + oy); ctx.lineTo(J[2] + ox, J[3] + oy); }
    if (arms) {
      ctx.moveTo(J[30] + ox, J[31] + oy); ctx.lineTo(J[8] + ox, J[9] + oy); ctx.lineTo(J[12] + ox, J[13] + oy);
      ctx.moveTo(J[30] + ox, J[31] + oy); ctx.lineTo(J[10] + ox, J[11] + oy); ctx.lineTo(J[14] + ox, J[15] + oy);
    }
  }

  function board(ctx, f, m) {
    // A skateboard on the ground under the feet, along the facing (plan view is not squashed).
    var L = m.head * 1.9, W = m.head * 0.55, horiz = f === 'left' || f === 'right';
    var hw = horiz ? L : W, hh = horiz ? W * 0.8 : L * 0.8;
    ctx.fillStyle = col('acc.wheel');
    var wx = horiz ? L * 0.62 : W * 0.95, wy = horiz ? W * 0.75 : L * 0.55;
    ctx.beginPath();
    ctx.arc(-wx, wy, W * 0.32, 0, Math.PI * 2); ctx.moveTo(wx + W * 0.32, wy); ctx.arc(wx, wy, W * 0.32, 0, Math.PI * 2);
    if (!horiz) { ctx.moveTo(-wx + W * 0.32, -wy); ctx.arc(-wx, -wy, W * 0.32, 0, Math.PI * 2); ctx.moveTo(wx + W * 0.32, -wy); ctx.arc(wx, -wy, W * 0.32, 0, Math.PI * 2); }
    ctx.fill();
    SR.art.draw.roundRect(ctx, -hw, -hh, hw * 2, hh * 2, Math.min(hw, hh));
    fs(ctx, col('acc.board'), m.dl);
  }

  /**
   * Draws a stick person (see the header for opts).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number[]|string} pose a pose array, a pose name or a clip name (at opts.t)
   * @param {object=} o options
   */
  /**
   * A pose array for draw() / joints(): a name that is both a pose and a clip plays the clip when a
   * time is given (a fight move over time) and is the still pose otherwise (the art bible's poses).
   */
  function resolvePose(pose, o) {
    if (typeof pose === 'string') {
      if (o.t !== undefined && o.t !== null && clips[pose]) return clip(pose, o.t);
      return poses[pose] || clip(pose, o.t || 0);
    }
    return pose || poses.stand;
  }
  /** The look for opts: the given one, else the player's own look for the player, else the plain one. */
  function lookOf(o) {
    return look(o.look !== undefined && o.look !== null ? o.look : o.player ? 'player' : undefined);
  }

  function draw(ctx, pose, o) {
    o = o || EMPTY;
    pose = resolvePose(pose, o);
    var view = o.view === 'side' ? 'side' : 'city';
    var facing = o.facing || (view === 'side' ? 'right' : 'down');
    var L = lookOf(o);
    var player = o.player || L.player;
    var child = o.child !== undefined ? o.child : L.child;
    var m = metrics(view, child);
    var sc = o.scale || 1;
    var upper = !!o.upper;
    var mounted = o.mount === 'board';
    solve(pose, m, facing, o.anchor === 'hip', o.rot || 0, upper, o.splay);
    if (mounted) for (var q = 0; q < 16; q++) J[q * 2 + 1] -= m.head * 0.45;

    var karma = o.karma !== undefined ? o.karma : (SR.state && SR.state.stats ? SR.state.stats.karma : 0);
    var headCol = o.head ? col(o.head) : player ? karmaColor(karma) : L.headCol;
    var limbCol = o.limb ? col(o.limb) : col('stick.limb');
    var torsoCol = o.torso ? col(o.torso) : (player && view === 'side') ? headCol : limbCol;
    var r = m.head;

    ctx.save();
    ctx.translate(o.x || 0, o.y || 0);
    if (sc !== 1) ctx.scale(sc, sc);
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. the stacked-paper shadow (city standees)
    if (o.shadow !== false && (view === 'city' || o.shadow)) {
      // legs, torso and head only: the arms add raster cost and read the same in an 18 % shadow
      var sx = 4, sy = 6, shc = col('stick.shadow');
      ctx.strokeStyle = shc;
      ctx.fillStyle = shc;
      ctx.lineWidth = m.limb;
      limbPath(ctx, J, sx, sy, !upper, false, true);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(J[0] + sx, J[1] + sy, r, 0, Math.PI * 2); ctx.fill();
    }
    if (mounted) board(ctx, facing, m);

    // 2. back accessories
    var k, list = L.layers.back;
    for (k = 0; k < list.length; k++) list[k].fn(ctx, J, m, facing, list[k].c);

    // 3. the player's white under-stroke (ART_AUDIO §1.1 rule 5)
    if (player && view === 'city' && o.under !== false) {
      ctx.strokeStyle = col('stick.under');
      ctx.lineWidth = m.limb + 3;
      limbPath(ctx, J, 0, 0, !upper, true, true);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.arc(J[0], J[1], r + 1.5 + m.ol / 2, 0, Math.PI * 2); ctx.fill();
    }

    // 4-5. legs and torso, body accessories, then the arms over them. With nothing between them
    // (no body accessory, an ink torso) the limbs go out as one stroke: the common city case.
    ctx.lineWidth = m.limb;
    list = L.layers.body;
    if (!list.length && torsoCol === limbCol) {
      ctx.strokeStyle = limbCol;
      limbPath(ctx, J, 0, 0, !upper, true, true);
      ctx.stroke();
    } else {
      if (!upper) { ctx.strokeStyle = limbCol; limbPath(ctx, J, 0, 0, true, false, false); ctx.stroke(); }
      ctx.strokeStyle = torsoCol; limbPath(ctx, J, 0, 0, false, false, true); ctx.stroke();
      for (k = 0; k < list.length; k++) list[k].fn(ctx, J, m, facing, list[k].c);
      ctx.lineWidth = m.limb;
      ctx.strokeStyle = limbCol;
      limbPath(ctx, J, 0, 0, false, true, false);
      ctx.stroke();
    }

    // 6. head, face, head accessories
    ctx.beginPath(); ctx.arc(J[0], J[1], r, 0, Math.PI * 2);
    ctx.fillStyle = headCol; ctx.fill();
    ctx.lineWidth = m.ol; ctx.strokeStyle = col('inkLine'); ctx.stroke();
    if (view === 'side' || facing === 'down') face(ctx, J[0], J[1], r, facing, o.mood || 'neutral', Math.max(m.dl, r * 0.09));
    list = L.layers.head;
    for (k = 0; k < list.length; k++) list[k].fn(ctx, J, m, facing, list[k].c);
    list = L.layers.hand;
    for (k = 0; k < list.length; k++) list[k].fn(ctx, J, m, facing, list[k].c);

    ctx.restore();
  }

  /**
   * Solves a pose without drawing, for attaching props (a held item, the fight hit point).
   * @returns {{head: number[], neck: number[], handL: number[], handR: number[], footL: number[],
   *   footR: number[], hip: number[], r: number}} points in the caller's units (x, y, scale applied)
   */
  function joints(pose, o) {
    o = o || EMPTY;
    pose = resolvePose(pose, o);
    var view = o.view === 'side' ? 'side' : 'city';
    var L = lookOf(o);
    var m = metrics(view, o.child !== undefined ? o.child : L.child);
    solve(pose, m, o.facing || (view === 'side' ? 'right' : 'down'), o.anchor === 'hip', o.rot || 0, !!o.upper, o.splay);
    var sc = o.scale || 1, x = o.x || 0, y = o.y || 0;
    function pt(i) { return [x + J[i * 2] * sc, y + J[i * 2 + 1] * sc]; }
    return { head: pt(0), neck: pt(1), handL: pt(6), handR: pt(7), footL: pt(12), footR: pt(13), hip: pt(14), shoulder: pt(15), r: m.head * sc };
  }

  SR.art.stick = {
    draw: draw, clip: clip, poses: poses, clips: clips, looks: looks, look: look, pedLook: pedLook,
    karmaColor: karmaColor, metrics: metrics, joints: joints, ACCESSORIES: ACC,
    /** @returns {string} the canonical accessory name ('bow tie' → 'bowtie'); '' when unknown. */
    accessory: function (n) { var k = accName(n); return ACC[k] ? k : ''; },
    /** @returns {number} a clip's length in seconds (0 for an unknown clip). */
    duration: function (name) { return clips[name] ? clips[name].dur : 0; },
  };
})();
