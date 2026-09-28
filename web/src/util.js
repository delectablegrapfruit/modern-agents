// Ronin for the browser: the presentation of the macOS app (Sources/Ronin), ported to Canvas.
// The game itself (RoninCore) and the figures (RoninArt) come from the WebAssembly core (core.js).
//
// util.js: colours, the palette, the settings' looks and light, the gore, and the seeded random numbers the app
// paints its scenery with (SplitMix64, as RoninCore's SeededRNG).

'use strict';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (lo, hi) => lo + (hi - lo) * Math.random();
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const hypot = Math.hypot;

/** A colour kept as its components (RoninArt's RGB). */
class RGB {
  constructor(r, g, b) { this.r = r; this.g = g; this.b = b; }
  mix(o, t) { return new RGB(this.r + (o.r - this.r) * t, this.g + (o.g - this.g) * t, this.b + (o.b - this.b) * t); }
  scaled(k) { return new RGB(this.r * k, this.g * k, this.b * k); }
  eq(o) { return !!o && o.r === this.r && o.g === this.g && o.b === this.b; }
  css(a = 1) {
    const c = (v) => Math.round(clamp(v, 0, 1) * 255);
    return a >= 1 ? `rgb(${c(this.r)},${c(this.g)},${c(this.b)})` : `rgba(${c(this.r)},${c(this.g)},${c(this.b)},${a})`;
  }
  key() { return `${Math.round(this.r * 255)},${Math.round(this.g * 255)},${Math.round(this.b * 255)}`; }
}
RGB.white = new RGB(1, 1, 1);
RGB.black = new RGB(0, 0, 0);
const rgb = (r, g, b) => new RGB(r, g, b);

const Palette = {
  background: rgb(0.035, 0.025, 0.03),
  header: rgb(0.06, 0.045, 0.05),
  ink: rgb(0.95, 0.92, 0.88),
  gold: rgb(0.93, 0.76, 0.42),
  blood: rgb(0.86, 0.08, 0.1),
  steel: rgb(0.9, 0.94, 1.0),
  jade: rgb(0.35, 0.95, 0.62),
  silhouette: rgb(0.025, 0.02, 0.03),
  shade: rgb(0.075, 0.068, 0.085),
};

/** SplitMix64, the same sequence as RoninCore's SeededRNG, so the scenery is painted as the app paints it. */
class SeededRNG {
  constructor(seed) { this.state = BigInt.asUintN(64, BigInt(seed)); }
  next() {
    this.state = BigInt.asUintN(64, this.state + 0x9E3779B97F4A7C15n);
    let z = this.state;
    z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n);
    z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94D049BB133111EBn);
    return z ^ (z >> 31n);
  }
  unit() { return Number(this.next() >> 11n) / 9007199254740992; }
  range(lo, hi) { return lo + (hi - lo) * this.unit(); }
}

/** Where each stage is fought (RoninCore's Setting). */
const Settings8 = ['crimsonDusk', 'bambooGrove', 'bloodMoon', 'frozenPass', 'stormBridge', 'burningVillage', 'sakuraTemple', 'ashFields'];
const SettingNames = ['Crimson Dusk', 'Bamboo Grove', 'Blood Moon', 'Frozen Pass', 'Storm Bridge', 'Burning Village', 'Sakura Temple', 'Ash Fields'];
const settingOf = (stage) => (Math.max(1, stage) - 1) % 8;

/** How a setting is painted (Art.swift's Look). */
function lookOf(setting) {
  const L = (top, horizon, sun, sunSize, sunHeight, far, near, ground, weather, landmark, accent) =>
    ({ top, horizon, sun, sunSize, sunHeight, far, near, ground, weather, landmark, accent });
  switch (setting) {
    case 0: return L(rgb(0.16, 0.02, 0.06), rgb(1.0, 0.42, 0.16), rgb(1.0, 0.86, 0.55), 0.34, 0.36,
      rgb(0.62, 0.16, 0.12), rgb(0.26, 0.04, 0.05), rgb(0.06, 0.015, 0.02), 'embers', 'torii', rgb(1.0, 0.45, 0.2));
    case 1: return L(rgb(0.02, 0.08, 0.07), rgb(0.62, 0.86, 0.52), rgb(0.93, 1.0, 0.85), 0.28, 0.48,
      rgb(0.24, 0.46, 0.30), rgb(0.06, 0.16, 0.10), rgb(0.02, 0.05, 0.035), 'leaves', 'bamboo', rgb(0.55, 0.95, 0.55));
    case 2: return L(rgb(0.03, 0.0, 0.02), rgb(0.66, 0.08, 0.10), rgb(1.0, 0.24, 0.16), 0.42, 0.44,
      rgb(0.30, 0.03, 0.05), rgb(0.13, 0.01, 0.03), rgb(0.04, 0.0, 0.01), 'ash', 'pagoda', rgb(1.0, 0.22, 0.22));
    case 3: return L(rgb(0.04, 0.07, 0.16), rgb(0.74, 0.85, 0.97), rgb(1, 1, 1), 0.26, 0.5,
      rgb(0.46, 0.56, 0.72), rgb(0.20, 0.26, 0.38), rgb(0.05, 0.06, 0.09), 'snow', 'pines', rgb(0.6, 0.85, 1.0));
    case 4: return L(rgb(0.03, 0.04, 0.07), rgb(0.42, 0.50, 0.62), rgb(0.82, 0.88, 0.97), 0.22, 0.52,
      rgb(0.20, 0.24, 0.32), rgb(0.08, 0.10, 0.14), rgb(0.03, 0.035, 0.05), 'rain', 'bridge', rgb(0.6, 0.8, 1.0));
    case 5: return L(rgb(0.12, 0.03, 0.0), rgb(1.0, 0.60, 0.12), rgb(1.0, 0.93, 0.6), 0.30, 0.30,
      rgb(0.62, 0.22, 0.05), rgb(0.22, 0.06, 0.02), rgb(0.07, 0.02, 0.0), 'embers', 'village', rgb(1.0, 0.6, 0.15));
    case 6: return L(rgb(0.16, 0.04, 0.16), rgb(1.0, 0.66, 0.74), rgb(1.0, 0.94, 0.95), 0.30, 0.42,
      rgb(0.64, 0.32, 0.46), rgb(0.30, 0.10, 0.22), rgb(0.07, 0.02, 0.05), 'petals', 'temple', rgb(1.0, 0.55, 0.75));
    default: return L(rgb(0.07, 0.07, 0.08), rgb(0.76, 0.70, 0.62), rgb(0.98, 0.92, 0.80), 0.30, 0.45,
      rgb(0.42, 0.39, 0.36), rgb(0.18, 0.16, 0.15), rgb(0.05, 0.045, 0.04), 'ash', 'banners', rgb(0.95, 0.82, 0.6));
  }
}

/** Two tints, `over` laid on `under`, as the one tint that draws the same (Art.layered). */
function layered(under, over) {
  const a = clamp(under.amount, 0, 1), b = clamp(over.amount, 0, 1);
  const both = 1 - (1 - a) * (1 - b);
  if (both <= 1e-4) return { color: over.color, amount: 0 };
  const u = a * (1 - b) / both, o = b / both;
  return { color: rgb(under.color.r * u + over.color.r * o, under.color.g * u + over.color.g * o, under.color.b * u + over.color.b * o), amount: both };
}

/** How a setting lights the figures in it (Art.swift's Ambient). */
class Ambient {
  constructor(shade, amount, light, ghost) { this.shade = shade; this.amount = amount; this.light = light; this.ghost = ghost; }
  get rest() { return { color: this.shade, amount: this.amount }; }
  with(color, amount) { return layered(this.rest, { color, amount }); }
  static of(look) {
    const dark = look.ground.mix(look.near, 0.4);
    return new Ambient(dark, 0.16, look.sun.mix(RGB.white, 0.55), look.ground.mix(look.near, 0.2).scaled(0.8));
  }
}
Ambient.plain = new Ambient(Palette.silhouette, 0, RGB.white, Palette.silhouette);

/** How much blood a blow spills (Carnage.swift's Gore). */
class Gore {
  constructor(level) { this.level = level; }
  static of(stage, bloodlust, on = true) {
    if (!on) return Gore.none;
    if (bloodlust) return new Gore(Gore.peak);
    const s = Math.max(1, stage);
    if (s <= 10) return new Gore(0.4 + 0.6 * (s - 1) / 9);
    if (s <= 20) return new Gore(1 + 0.3 * (s - 10) / 10);
    return new Gore(1.3 + 0.2 * Math.min(1, (s - 20) / 20));
  }
  get on() { return this.level > 0; }
  count(n) { return !this.on || n <= 0 ? 0 : Math.max(1, Math.round(n * this.level)); }
  get size() { return 0.8 + 0.2 * this.level; }
  get force() { return 0.85 + 0.15 * this.level; }
  get flow() { return 0.3 + 0.7 * this.level; }
  get span() { return 0.6 + 0.4 * this.level; }
  get pool() { return 0.65 + 0.35 * this.level; }
  chance(p) { return Math.min(1, p * this.level); }
  get severs() { return this.on ? Math.min(1, 0.45 + 0.55 * this.level) : 0; }
  get tears() { return clamp(this.level - 1, 0, 1) * 0.5; }
}
Gore.none = new Gore(0);
Gore.full = new Gore(1);
Gore.peak = 2;

/** The core's Tuning, as the scene needs it (the core's own `tuning` overrides these once it is loaded). */
const Tuning = {
  step: 1 / 120, edge: 1.08, reach: 0.35, bloodlustReach: 0.42, bloodlust: 20, body: 0.05, figure: 0.312,
  cooldown: 0.075, stumble: 0.34, archerRange: 0.64, arrowSpeed: 0.78, deflectSpeed: 2.2, leap: 0.42, landing: 0.23,
  firstSpawn: 1.5, parried: 0.3, guardRise: 0.24, quickBlow: 0.3, dartWindup: 0.32, dartPace: 5.0, dartTell: 0.3,
  bearerWait: 0.8, bearerDarts: 3, bearerStay: 8.0, spring: 0.3, gourdFlight: 1.0, catchWindow: 0.2, gourdLanding: 0.15,
  parryWindow: 0.3, bruteStagger: 0.7, gourdPoints: 500, senNoSen: 0.15, shardsPerHeart: 3,
};

/** The kinds of foe, as the scene needs them (RoninCore's Kind). */
const Kinds = ['grunt', 'runner', 'brute', 'dancer', 'archer', 'warlord'];
const KindInfo = {
  grunt: { title: 'Ashigaru', width: 0.085, range: 0.28, damage: 1 },
  runner: { title: 'Runner', width: 0.075, range: 0.13, damage: 1 },
  brute: { title: 'Brute', width: 0.11, range: 0.2, damage: 2 },
  dancer: { title: 'Blade Dancer', width: 0.085, range: 0.14, damage: 1 },
  archer: { title: 'Archer', width: 0.085, range: 0.12, damage: 1 },
  warlord: { title: 'Warlord', width: 0.12, range: 0.2, damage: 2 },
};

/** The figures' builds, as the scene needs them (RoninArt's Build and gaits). */
const Builds = {
  hero: { height: 1, eyes: null, accent: Palette.blood, stride: 0.8, pixels: 172 },
  grunt: { height: 0.95, eyes: rgb(1, 0.22, 0.12), accent: rgb(0.75, 0.12, 0.1), stride: 0.86, pixels: 118 },
  runner: { height: 0.9, eyes: rgb(1, 0.6, 0.12), accent: rgb(1, 0.5, 0.1), stride: 1.4, pixels: 118 },
  brute: { height: 1.22, eyes: rgb(1, 0.2, 0.1), accent: rgb(0.72, 0.32, 1.0), stride: 0.8, pixels: 118 },
  dancer: { height: 0.97, eyes: rgb(0.3, 0.95, 1.0), accent: rgb(0.25, 0.9, 1.0), stride: 0.95, pixels: 118 },
  archer: { height: 0.96, eyes: rgb(0.6, 1.0, 0.3), accent: rgb(0.5, 0.9, 0.3), stride: 0.74, pixels: 118 },
  warlord: { height: 1.3, eyes: rgb(1, 0.78, 0.2), accent: Palette.gold, stride: 0.84, pixels: 118 },
};

/** Frame counts (RoninArt's Frame). */
const FrameCounts = {
  walk: 12, foeIdle: 6, heroIdle: 8, iai: 6, cut: 9, recover: 6, chain: 5, shuffle: 4, windedCycles: 3, winded: 8,
  reels: 2, reel: 4, flourish: 7, windup: 4, strike: 3, hurt: 3, fall: 5, clash: 2, retreat: 4, struckVariants: 4,
};
const Cuts = ['kesa', 'gyaku', 'shomen', 'dou', 'tsuki', 'sune', 'nukitsuke'];

/** Figure canvas: 2.5 x 1.74 figure heights, the feet at (1.25, 0.1). */
const FigureCanvas = { width: 2.5, height: 1.74, feetX: 1.25, feetY: 0.1 };
FigureCanvas.anchorX = FigureCanvas.feetX / FigureCanvas.width;
FigureCanvas.anchorY = FigureCanvas.feetY / FigureCanvas.height;
const RETREAT_STEP = 0.14;

/** 1,234,567 */
function grouped(n) {
  const digits = String(Math.trunc(n));
  let out = '';
  for (let k = 0; k < digits.length; k++) {
    if (k > 0 && (digits.length - k) % 3 === 0 && digits[k - 1] !== '-') out += ',';
    out += digits[k];
  }
  return out;
}

/** A score short enough for the pill: 12,345, then 123K, then 1.2M. */
function brief(n) {
  if (n < 100000) return grouped(n);
  if (n < 10000000) return `${Math.floor(n / 1000)}K`;
  return `${(n / 1000000).toFixed(1)}M`;
}

/** Ranks (RoninCore's Rank). */
const Rank = {
  ladder: [[0, 'Wanderer'], [40, 'Swordsman'], [120, 'Ronin'], [300, 'Duelist'], [600, 'Blademaster'],
    [1500, 'Kensei'], [4000, 'Sword Saint'], [10000, 'Demon Blade'], [25000, 'Legend']],
  weight(mode) { return [1, 1, 1.25, 1.5][Modes.indexOf(mode)] ?? 1; },
  merit(kills, byMode) {
    let extra = 0;
    for (const [m, n] of Object.entries(byMode || {})) extra += Math.max(0, n) * (Rank.weight(m) - 1);
    return kills + Math.trunc(extra);
  },
  title(merit) { let t = Rank.ladder[0][1]; for (const [k, name] of Rank.ladder) if (k <= merit) t = name; return t; },
  next(merit) { return Rank.ladder.find(([k]) => k > merit) || null; },
  kills(from, to, mode) { return Math.ceil(Math.max(0, to - from) / Rank.weight(mode)); },
};

const Modes = ['shoshin', 'bushido', 'shura', 'oni'];
const ModeInfo = {
  shoshin: { title: 'Shoshin', gist: 'easy', hearts: 7, seal: '初' },
  bushido: { title: 'Bushidō', gist: 'normal', hearts: 5, seal: '武' },
  shura: { title: 'Shura', gist: 'hard', hearts: 4, seal: '修' },
  oni: { title: 'Oni', gist: 'insane', hearts: 3, seal: '鬼' },
};

/** Which kind a stage brings in for the first time (Difficulty.introduces). */
function introduces(stage) {
  return { 2: 'runner', 3: 'brute', 4: 'archer', 5: 'warlord', 6: 'dancer' }[stage] || null;
}

/** Local storage that never throws (a private window, blocked site data, a sandboxed viewer). */
const Store = {
  get(key) { try { return window.localStorage.getItem('ronin.' + key); } catch { return null; } },
  set(key, value) { try { window.localStorage.setItem('ronin.' + key, value); } catch { /* not kept */ } },
  remove(key) { try { window.localStorage.removeItem('ronin.' + key); } catch { /* not kept */ } },
  bool(key, fallback) { const v = Store.get(key); return v === null ? fallback : v === '1'; },
  setBool(key, v) { Store.set(key, v ? '1' : '0'); },
};
