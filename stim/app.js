/* stim: a phone made only of hooks. */
(() => {
'use strict';

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const R = Math.random;
const rnd = (a, b) => a + R() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const pick = a => a[Math.floor(R() * a.length)];
const chance = p => R() < p;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wait = ms => new Promise(r => setTimeout(r, ms));
const now = () => performance.now();
const T = () => Date.now();
const html = s => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstElementChild; };
const restart = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
const cap = s => s[0].toUpperCase() + s.slice(1);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const nf = new Intl.NumberFormat('en');
const cf = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const fmt = n => (Math.abs(n) < 10000 ? nf.format(Math.round(n)) : cf.format(n));
const cd = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const dur = ms => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`; };
const ago = ts => { const s = (T() - ts) / 1000; return s < 45 ? 'now' : s < 3600 ? Math.round(s / 60) + 'm' : Math.round(s / 3600) + 'h'; };
const pickW = list => { let r = R() * list.reduce((s, x) => s + x[1], 0); for (const [k, w] of list) if ((r -= w) < 0) return k; return list[0][0]; };
const dayNum = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5);
const CONF = ['#ff2e4d', '#ffc21a', '#12c48b', '#3b7bff', '#ff4fa3', '#9b5cff', '#ff7a00'];

// ---------- icons ----------
const P = {
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M5 12.5 10 17.5 19.5 7"/>',
  heart: '<path d="M12 20.3S3.3 15.2 3.3 8.9A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.7 2.3c0 6.3-8.7 11.4-8.7 11.4z"/>',
  star: '<path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 6.2 2.6 8 2.6 8H3.4S6 15.2 6 9z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  up: '<path d="M12 20V5M5.5 11.5 12 5l6.5 6.5"/>',
  down: '<path d="M12 4v15M5.5 12.5 12 19l6.5-6.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  gem: '<path d="M6 3.5h12l3.5 5.5L12 20.5 2.5 9z"/><path d="M2.5 9h19"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/>',
  glass: '<path d="M6 3h12M6 21h12M7 3v2a5 5 0 0 0 10 0V3M7 21v-2a5 5 0 0 1 10 0v2"/>',
  leaf: '<path d="M5 19C5 10 11 5 20 5c0 9-5 15-14 15zM5 19l8-8"/>',
  level: '<path d="M6 11.5 12 5.5l6 6M6 18.5l6-6 6 6"/>',
  send: '<path d="m21.5 2.5-7 19-4-8.5-8.5-4z"/><path d="M21.5 2.5 10.5 13"/>',
  chest: '<path d="M3.5 10h17v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19zM3.5 10V8a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v2"/><path d="M10 10v3.5h4V10"/>',
  tag: '<path d="M3 12.5V4.5A1.5 1.5 0 0 1 4.5 3h8L21 11.5 12.5 20z"/><circle cx="8" cy="8" r="1.6"/>',
  back: '<path d="M15 4.5 7.5 12l7.5 7.5"/>',
};
const FP = {
  heart: P.heart, star: P.star,
  bolt: '<path d="M13.5 2 4 13.5h7L10 22l10-12h-7z"/>',
  flame: '<path d="M12 22c4.4 0 7.5-3 7.5-7.2 0-3.7-2.3-6.2-4.2-8.6-.4 2-1.5 3.3-2.8 3.8.3-3.4-1.2-6.4-3.8-8 .1 4.1-2.2 6.4-3.9 8.8C3.7 12.4 4.5 16 6 18.2 7.4 20.6 9.6 22 12 22z"/>',
  play: '<path d="M7 4.5v15L20 12z"/>',
  bellf: '<path d="M6 9a6 6 0 1 1 12 0c0 6.2 2.6 8 2.6 8H3.4S6 15.2 6 9z"/><path d="M9.8 19.2h4.4a2.2 2.2 0 0 1-4.4 0z"/>',
};
const IF = (n, cls = '') => `<svg class="fill ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${FP[n] || ''}</svg>`;
const I = n => (P[n] ? `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>` : IF(n));
const G = {
  tap: '<path d="M9 11.5V5.2a1.6 1.6 0 0 1 3.2 0v5.3m0-1.2a1.6 1.6 0 0 1 3.2 0v1.8m0-.8a1.6 1.6 0 0 1 3.2 0v3.6a6.6 6.6 0 0 1-6.6 6.6h-.4a6 6 0 0 1-4.7-2.3l-2.6-3.3a1.6 1.6 0 0 1 2.4-2.1L9 16"/>',
  scroll: '<rect x="4" y="2.5" width="16" height="5.5" rx="2"/><rect x="4" y="10" width="16" height="5.5" rx="2"/><path d="M12 17.5v4.5M9 19.5l3 2.8 3-2.8"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v5.5c0 .8-.7 1.5-1.5 1.5h-15c-.8 0-1.5-.7-1.5-1.5V13z"/>',
  slots: '<rect x="2.5" y="5" width="15" height="14" rx="3"/><path d="M7.5 5v14M12.5 5v14M20.5 8v6.5h-3"/><circle cx="20.5" cy="6" r="1.8" fill="currentColor"/>',
  swipe: '<rect x="3" y="5" width="11" height="15" rx="2.5"/><path d="m17 5.5 2.3.6a2.5 2.5 0 0 1 1.8 3l-2.8 10.2"/>',
  loop: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 3.5V8h-4.5"/><path d="M10 9v6l5-3z" fill="currentColor"/>',
  loot: '<path d="M3.5 8.5 12 4l8.5 4.5v8L12 21l-8.5-4.5z"/><path d="M3.5 8.5 12 13l8.5-4.5M12 13v8"/>',
  scratch: '<path d="M3 6.5h18V10a2 2 0 0 0 0 4v3.5H3V14a2 2 0 0 0 0-4z"/><path d="M8 12h8" stroke-dasharray="2.2 2.2"/>',
  quests: '<path d="m4 6.5 1.8 1.8L9 5M4 13l1.8 1.8L9 11.5M12 7h8M12 13.5h8M4.5 19.5h15"/>',
  rank: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v3.5M8.5 20.5h7M10 16.5h4v4h-4z"/>',
  pet: '<path d="M12 3.5c5 0 8.5 3.8 8.5 9s-3.5 8-8.5 8-8.5-2.8-8.5-8S7 3.5 12 3.5z"/><circle cx="9" cy="11.5" r="1.3" fill="currentColor"/><circle cx="15" cy="11.5" r="1.3" fill="currentColor"/><path d="M9.5 15.3c1.4 1.2 3.6 1.2 5 0"/>',
  shop: P.tag,
  hold: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" stroke-width="3.4"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>',
  rings: '<circle cx="7" cy="8" r="4"/><circle cx="17" cy="8" r="4"/><circle cx="12" cy="17" r="4"/>',
  you: P.glass,
  rocket: '<path d="M12 2.5c3.2 2.2 5 6 5 10l-2 4.5H9l-2-4.5c0-4 1.8-7.8 5-10z"/><circle cx="12" cy="10" r="2" fill="currentColor"/><path d="M9.5 20.5 12 22l2.5-1.5M7 13l-2.5 3.5L7 17M17 13l2.5 3.5L17 17"/>',
  flip: '<circle cx="12" cy="12" r="9"/><path d="M12 6.5v11M9.2 9.2c0-1.3 1.2-2.2 2.8-2.2s2.8.8 2.8 2c0 2.6-5.6 1.4-5.6 4.2 0 1.3 1.2 2.1 2.8 2.1s2.8-.9 2.8-2.2"/>',
  predict: '<path d="M3.5 19.5h17M6 15.5l4-5 3.5 3L19 6"/><path d="M15 6h4v4"/>',
  trade: '<path d="M4 20V10M9 20V4M14 20v-7M19 20V8"/><path d="M2.5 20.5h19"/>',
};
Object.assign(G, {
  posts: '<path d="M4 11.2 12 4.5l8 6.7V20h-5.5v-5.2h-5V20H4z"/>',
  clips: G.loop, discover: G.swipe, activity: P.heart,
  profile: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5"/>',
  cart: '<path d="M2.5 4h2.6l2.3 11.2h10.8l2.1-7.7H6.3"/><circle cx="9.6" cy="19.2" r="1.5"/><circle cx="17" cy="19.2" r="1.5"/>',
  orders: '<path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3.2v2.8h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  gates: '<path d="M4 20.5V9a8 8 0 0 1 16 0v11.5"/><path d="M8.5 20.5V12a3.5 3.5 0 0 1 7 0v8.5"/>',
  tower: '<path d="M6 21V8.5l2-2V3h2.2v2h3.6V3H16v3.5l2 2V21z"/><path d="M10 21v-4h4v4M9 11.5h2M13 11.5h2"/>',
});
// an app can bring its own icon art (inner SVG markup); otherwise it uses its glyph
const glyph = id => (id === 'streak' ? IF('flame') : APPS[id] && APPS[id].art ? APPS[id].art : `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${G[id]}</svg>`);
const SHAPES = {
  orb: '<circle cx="12" cy="12" r="9.5"/>',
  cube: '<rect x="3" y="3" width="18" height="18" rx="5"/>',
  heart: FP.heart, star: FP.star, bolt: FP.bolt,
  diamond: '<path d="M6 3.5h12l3.5 5.5L12 20.5 2.5 9z"/>',
};
const GLOSS = { orb: 1, cube: 1, heart: 1 };
const shapeSVG = (k, color) => `<svg viewBox="0 0 24 24" fill="${color}" aria-hidden="true">${SHAPES[k]}${GLOSS[k] ? '<ellipse cx="8.6" cy="8" rx="3.4" ry="2.1" fill="rgba(255,255,255,.45)"/>' : ''}</svg>`;
const spinner = '<div class="ptr-ind"><div class="spinner">' + Array.from({ length: 8 }, (_, i) => `<i style="--i:${i}"></i>`).join('') + '</div></div>';

// ---------- state ----------
const KEY = 'stim.v2';
const DEF = {
  hits: 0, total: 0, bestCombo: 0, timeMs: 0, pickups: 0, notifs: 0, opens: 0, scrollPx: 0,
  today: { day: 0, ms: 0, hits: 0 },
  taps: 0, crits: 0, cards: 0, refreshes: 0, cleared: 0, spins: 0, jackpots: 0, swipes: 0, matches: 0,
  clips: 0, boxes: 0, scratches: 0, scratchWins: 0, pulses: 0, questsDone: 0, holds: 0, perfects: 0,
  rings: 0, missed: 0, feeds: 0, pets: 0, buys: 0, promos: 0,
  tap: { P: 0, A: 0, C: 0 },
  energy: 5, energyAt: 0, earn: 0,
  streak: 0, lastDay: 0, freezes: 1, login: { day: 1, claimed: 0 },
  pulse: { n: 0, best: 0, until: 0, dead: 0, restoreUntil: 0 },
  loot: { own: {}, pity: 0, freeAt: 0, extra: 0 },
  scratchAt: 0, scratchExtra: 0,
  supers: 3, likesYou: 4, scrollNew: 12, loopNew: 8, ringsLost: 0,
  pet: { food: 70, fun: 55, love: 80 },
  boostUntil: 0, quests: null, rapid: null, chest: 0, league: null,
  rocketAt: 0, launches: 0, bestCash: 0, flip: { pot: 0, n: 0, rot: 0 }, flips: 0, maxFlips: 0, predWins: 0, trades: 0,
  trade: { sel: 'HIT', athV: 0, athNew: 0, c: {} },
  ach: {}, achSeen: 0, onboarded: false, lastSeen: 0,
  tabs: {},
  settings: { sound: true, haptics: true, nudges: true, pace: 'normal', focus: true, mute: {} },
};
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
  clear() { try { localStorage.removeItem(KEY); } catch {} },
};
const S = JSON.parse(JSON.stringify(DEF));
(() => {
  const saved = store.get();
  for (const k in saved) {
    const d = S[k], v = saved[k];
    if (d && typeof d === 'object' && !Array.isArray(d) && v && typeof v === 'object') Object.assign(d, v); else S[k] = v;
  }
})();
// modules keep their own state under one key: const F = slice('feed', { ...defaults })
const slice = (k, d) => (S[k] = Object.assign(JSON.parse(JSON.stringify(d)), S[k] && typeof S[k] === 'object' && !Array.isArray(S[k]) ? S[k] : {}));
let resetting = false;
const save = () => { if (resetting) return; S.lastSeen = T(); store.set(S); };

const TODAY = dayNum();
let frozeUsed = 0;
if (S.lastDay !== TODAY) {
  const gap = TODAY - S.lastDay;
  if (!S.lastDay) S.streak = 1;
  else if (gap === 1) S.streak++;
  else if (gap > 1 && S.freezes >= gap - 1) { S.freezes -= gap - 1; frozeUsed = gap - 1; S.streak++; }
  else S.streak = 1;
  S.lastDay = TODAY;
}
if (S.today.day !== TODAY) S.today = { day: TODAY, ms: 0, hits: 0 };
if (!S.energyAt) S.energyAt = T();
let sessionMs = 0, tickN = 0;
const PACE = { chill: 60000, normal: 25000, chaos: 9000 };
const paceK = () => ({ chill: 2, normal: 1, chaos: .5 })[S.settings.pace] || 1;

// ---------- sound ----------
let AC = null, master = null, noiseBuf = null;
function actx() {
  if (!S.settings.sound) return null;
  if (!AC) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { AC = new C(); } catch { return null; }
    master = AC.createGain(); master.gain.value = .5; master.connect(AC.destination);
  }
  if (AC.state === 'suspended') AC.resume().catch(() => {});
  return AC;
}
function tone(f, d = .1, type = 'sine', v = .2, at = 0, f2 = 0) {
  const a = actx(); if (!a || a.state !== 'running') return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + d + .03);
}
function noise(d = .2, v = .1, at = 0, f1 = 800, f2 = 3000) {
  const a = actx(); if (!a || a.state !== 'running') return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, Math.floor(a.sampleRate * .6), a.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = R() * 2 - 1;
  }
  const t = a.currentTime + at, s = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; bp.type = 'bandpass'; bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(f1, t); bp.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + d * .3); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  s.connect(bp); bp.connect(g); g.connect(master); s.start(t); s.stop(t + d + .05);
}
function holdTone() {
  const a = actx(); if (!a || a.state !== 'running') return null;
  const o = a.createOscillator(), g = a.createGain();
  o.type = 'triangle'; o.frequency.value = 180;
  g.gain.setValueAtTime(.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(.07, a.currentTime + .05);
  o.connect(g); g.connect(master); o.start();
  return { set: f => o.frequency.setTargetAtTime(f, a.currentTime, .015), stop: () => { g.gain.setTargetAtTime(.0001, a.currentTime, .025); o.stop(a.currentTime + .2); } };
}
const semi = n => Math.pow(2, n / 12);
const APP_KEY = { rocket: 6, flip: 8, predict: 10, trade: 13, tap: 0, scroll: 2, inbox: 4, slots: 5, swipe: 7, loop: 9, loot: 11, scratch: 12, streak: 14, quests: 16, rank: 17, pet: 19, shop: 21, hold: 23, rings: 24, you: 3 };
const sfx = {
  tap: k => { const f = 392 * semi(Math.min(k, 24)); tone(f, .06, 'triangle', .16, 0, f * 1.3); },
  crit: () => { tone(1568, .12, 'square', .07, 0, 2349); tone(2093, .18, 'sine', .1, .04); },
  pop: (k = 0) => { const f = 587 * semi(k); tone(f, .08, 'sine', .2, 0, f * 1.6); },
  card: t => { const f = [660, 880, 1175, 1568, 2093][t]; tone(f, .07, 'sine', .12 + t * .03, 0, f * 1.25); if (t >= 2) tone(f * 1.5, .1, 'triangle', .06, .05); },
  tick: () => tone(2400, .012, 'square', .03),
  click: () => tone(1500, .02, 'triangle', .05),
  open: () => tone(520, .09, 'sine', .1, 0, 880),
  close: () => tone(700, .08, 'sine', .08, 0, 420),
  ding: app => { const f = 1047 * semi((APP_KEY[app] || 0) % 12); tone(f, .3, 'sine', .08); tone(f * 1.5, .35, 'sine', .05, .06); },
  whoosh: () => noise(.2, .08, 0, 500, 3500),
  fresh: () => { tone(880, .07, 'sine', .12); tone(1319, .12, 'sine', .12, .05); },
  big: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, .12, 'triangle', .1, i * .045)),
  nope: () => tone(300, .14, 'triangle', .1, 0, 220),
  clear: k => { const f = 880 * semi(Math.min(k, 24)); tone(f, .06, 'sine', .13, 0, f * 1.25); },
  coin: () => { tone(988, .06, 'square', .05); tone(1319, .18, 'square', .05, .06); },
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .16, 'triangle', .11, i * .055)),
  level: () => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .18, 'triangle', .11, i * .06)); noise(.5, .04, .3, 3000, 9000); },
  combo: m => { const f = 523 * semi(m * 2); tone(f, .1, 'square', .05); tone(f * 1.5, .14, 'triangle', .07, .05); },
  thunk: () => { tone(160, .08, 'sine', .22, 0, 90); noise(.05, .06, 0, 1500, 900); },
  lever: () => noise(.15, .08, 0, 300, 1200),
  riser: d => tone(300, d, 'sawtooth', .02, 0, 1200),
  swoosh: () => noise(.14, .07, 0, 1200, 4000),
  match: () => [659, 880, 1109, 1319, 1760].forEach((f, i) => tone(f, .14, 'sine', .12, i * .05)),
  shake: i => { noise(.07, .07, 0, 400 + i * 300, 900 + i * 400); tone(300 + i * 160, .06, 'square', .04); },
  scratch: () => noise(.05, .05, 0, 2500, 5000),
  giggle: () => [0, 1, 2].forEach(i => tone(ri(900, 1500), .05, 'sine', .08, i * .07)),
  munch: () => [0, 1, 2].forEach(i => noise(.05, .08, i * .08, 300, 150)),
  beat: () => { tone(90, .12, 'sine', .3, 0, 55); tone(90, .1, 'sine', .2, .16, 55); },
  lose: () => [523, 440, 349, 262].forEach((f, i) => tone(f, .16, 'triangle', .09, i * .09)),
  unlock: () => { tone(660, .06, 'sine', .1); tone(990, .1, 'sine', .1, .05); },
};
const unlockAudio = () => { if (!AC || AC.state !== 'running') actx(); };
['pointerdown', 'touchend', 'keydown'].forEach(ev => addEventListener(ev, unlockAudio, { passive: true, capture: true }));

// ---------- haptics ----------
// Android vibrates. Safari 18+ on iPhone ticks when a switch control flips, so flip a hidden one.
const canVibrate = typeof navigator.vibrate === 'function' && !/iPhone|iPad|Macintosh/.test(navigator.userAgent);
function haptic(strong) {
  if (!S.settings.haptics) return;
  try {
    if (canVibrate) { navigator.vibrate(strong ? [14, 30, 14] : 8); return; }
    const l = document.createElement('label'), c = document.createElement('input');
    l.setAttribute('aria-hidden', 'true'); l.style.display = 'none';
    c.type = 'checkbox'; c.setAttribute('switch', '');
    l.append(c); document.head.append(l); l.click(); l.remove();
  } catch {}
}

// ---------- layout: full screen on a phone, a phone everywhere else ----------
const body = document.body, stage = $('#stage'), phone = $('#phone');
let scale = 1, framed = false;
const isPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
function layout() {
  framed = !isPhone() && innerWidth >= 460 && innerHeight >= 420;
  body.classList.toggle('framed', framed);
  scale = framed ? Math.min(1, (innerHeight - 36) / 876, (innerWidth - 24) / 417) : 1;
  stage.style.setProperty('--scale', scale.toFixed(4));
  sizeFx();
}
const toLocal = (cx, cy) => { const r = phone.getBoundingClientRect(); return [(cx - r.left) / scale, (cy - r.top) / scale]; };
const centerOf = el => { const r = el.getBoundingClientRect(); return toLocal(r.left + r.width / 2, r.top + r.height / 2); };
function buzz() { if (framed) restart($('#device'), 'buzz'); }

// ---------- particles, floaters, toast ----------
const fx = $('#fx'), g2 = fx.getContext('2d');
let parts = [], fxRaf = 0, FW = 390, FH = 844;
function sizeFx() {
  FW = phone.clientWidth; FH = phone.clientHeight;
  const d = Math.min(2.5, devicePixelRatio || 1);
  fx.width = Math.round(FW * d); fx.height = Math.round(FH * d);
  g2.setTransform(d, 0, 0, d, 0, 0);
}
const runFx = () => { if (!fxRaf) fxRaf = requestAnimationFrame(stepFx); };
function burst(x, y, o = {}) {
  if (reduced) return;
  const cols = o.colors || CONF;
  for (let i = 0, n = o.n || 12; i < n; i++) {
    const a = R() * Math.PI * 2, s = rnd(1.6, 4.8) * (o.power || 1);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.2, g: .13, life: 0, max: ri(20, 36), sz: rnd(5, 10), c: pick(cols), k: o.shape || (chance(.5) ? 'heart' : 'dot'), r: rnd(-.5, .5), vr: rnd(-.14, .14) });
  }
  runFx();
}
function confetti(n = 120) {
  if (reduced) return;
  for (let i = 0; i < n; i++) parts.push({ x: rnd(0, FW), y: rnd(-60, -8), vx: rnd(-1.6, 1.6), vy: rnd(2, 6), g: .08, life: 0, max: ri(80, 140), sz: rnd(6, 10), c: pick(CONF), k: 'rect', r: rnd(0, 6), vr: rnd(-.25, .25) });
  runFx();
}
function stepFx() {
  g2.clearRect(0, 0, FW, FH);
  parts = parts.filter(p => {
    p.life++; p.vy += p.g; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
    const t = p.life / p.max;
    if (t >= 1 || p.y > FH + 30) return false;
    g2.globalAlpha = t > .7 ? (1 - t) / .3 : 1; g2.fillStyle = p.c;
    g2.save(); g2.translate(p.x, p.y); g2.rotate(p.r);
    if (p.k === 'rect') g2.fillRect(-p.sz / 2, -p.sz / 4, p.sz, p.sz / 2);
    else if (p.k === 'dot') { g2.beginPath(); g2.arc(0, 0, p.sz / 3, 0, 7); g2.fill(); }
    else { const s = p.sz / 8; g2.scale(s, s); g2.beginPath(); g2.moveTo(0, 3.5); g2.bezierCurveTo(-6, -.5, -3, -6, 0, -2.5); g2.bezierCurveTo(3, -6, 6, -.5, 0, 3.5); g2.fill(); }
    g2.restore();
    return true;
  });
  g2.globalAlpha = 1;
  fxRaf = parts.length ? requestAnimationFrame(stepFx) : 0;
  if (!fxRaf) g2.clearRect(0, 0, FW, FH);
}
let flCount = 0;
function floatText(x, y, text, cls = '') {
  if (x == null || flCount > 40) return;
  const f = html(`<div class="fl ${cls}">${text}</div>`);
  f.style.left = x + 'px'; f.style.top = y + 'px';
  phone.append(f); flCount++;
  f.addEventListener('animationend', () => { f.remove(); flCount--; });
}
let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---------- economy: hits, combo, level ----------
let combo = 0, comboT = 0;
const COMBO_MS = 2400;
const mult = () => Math.min(10, 1 + Math.floor(combo / 6));
const boostOn = () => S.boostUntil > T();
function act() {
  const before = mult();
  combo++; S.bestCombo = Math.max(S.bestCombo, combo);
  clearTimeout(comboT);
  comboT = setTimeout(() => { combo = 0; renderCombo(); }, COMBO_MS);
  renderCombo(mult() > before);
}
function renderCombo(up) {
  const el = $('#combo');
  el.classList.toggle('on', combo > 1);
  $('#combo-x').textContent = `×${mult()}`;
  const bar = $('i', el); bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
  if (up) { restart(el, 'up'); sfx.combo(mult()); haptic(); }
}
function earn(n, x, y, o = {}) {
  const m = (o.raw ? 1 : mult()) * (boostOn() ? 2 : 1);
  const g = Math.max(1, Math.round(n * m));
  S.hits += g; S.total += g; S.today.hits += g;
  if (S.league) S.league.me += g;
  floatText(x, y, `+${fmt(g)}`, o.cls);
  renderHits(); renderLevel(); queueCheck();
  return g;
}
function spend(n) {
  if (S.hits < n) { sfx.nope(); restart($('#hud-hits'), 'no'); toast(`Need ${fmt(n - S.hits)} more hits`); return false; }
  S.hits -= n; renderHits(); sfx.coin(); return true;
}
let shownHits = S.hits, hitsRaf = 0;
function renderHits() {
  cancelAnimationFrame(hitsRaf);
  const from = shownHits, to = S.hits, t0 = now();
  const step = t => {
    const k = Math.min(1, (t - t0) / 280);
    shownHits = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    $('#hits').textContent = fmt(shownHits);
    if (k < 1) hitsRaf = requestAnimationFrame(step);
  };
  hitsRaf = requestAnimationFrame(step);
  if (to > from) restart($('#hud-hits'), 'bump');
}
function lvl(t = S.total) {
  let l = 1, base = 0, need = 80;
  while (t >= base + need) { base += need; l++; need = Math.round(80 * Math.pow(l, 1.55)); }
  return { l, into: t - base, need, pct: (t - base) / need };
}
let lastLvl = 0;
function renderLevel() {
  const L = lvl();
  $('#lvl-n').textContent = L.l;
  $('#lvl-prg').style.strokeDashoffset = String(100 - L.pct * 100);
  if (lastLvl && L.l > lastLvl) { sfx.level(); haptic(true); confetti(140); restart($('#hud-lvl'), 'up'); bannerAward(`Level ${L.l}`, 'The next level is closer than it looks.', 'level'); }
  lastLvl = L.l;
}
function renderBoost() {
  const b = $('#boost'), on = boostOn();
  b.hidden = !on;
  if (on) b.innerHTML = `${IF('bolt')}2× ${cd(S.boostUntil - T())}`;
}

// ---------- achievements ----------
// every app registers its own: addAch([[id, name, description, icon, test?], ...])
const ACH = [];
const addAch = list => list.forEach(([id, n, d, i, t]) => ACH.push({ id, n, d, i, t }));
addAch([
  ['combo', 'On a roll', 'Reach a ×10 combo', 'bolt', () => S.bestCombo >= 54],
  ['pickups', 'Can’t put it down', 'Unlock 25 times', 'lock', () => S.pickups >= 25],
  ['level', 'Chronically online', 'Reach level 10', 'level', () => lvl().l >= 10],
  ['night', 'Night owl', 'Play between midnight and 4 am', 'moon', () => new Date().getHours() < 4],
  ['grass', 'Touched grass', 'Take a break, then come back', 'leaf'],
]);
// You shows these: addStats([[label, () => value], ...])
const STATS = [];
const addStats = list => STATS.push(...list);
addStats([
  ['screen time today', () => dur(S.today.ms)],
  ['unlocks', () => fmt(S.pickups)],
  ['notifications', () => fmt(S.notifs)],
  ['hits today', () => fmt(S.today.hits)],
  ['hits all time', () => fmt(S.total)],
  ['best combo', () => `×${Math.min(10, 1 + Math.floor(S.bestCombo / 6))} (${S.bestCombo})`],
  ['scrolled', () => { const m = S.scrollPx * .00016; return m < 1000 ? `${m.toFixed(m < 10 ? 1 : 0)} m` : `${(m / 1000).toFixed(2)} km`; }],
]);
// quest templates: addQuests([[stat key in S, 'Do it {n} times', lo, hi], ...])
const QDEF = [];
const addQuests = list => QDEF.push(...list);

let chkT = 0;
function queueCheck() {
  clearTimeout(chkT);
  chkT = setTimeout(() => ACH.forEach(a => { if (a.t && !S.ach[a.id] && a.t()) unlock(a.id); }), 300);
}
function unlock(id) {
  if (S.ach[id]) return;
  const a = ACH.find(x => x.id === id); if (!a) return;
  S.ach[id] = T(); save();
  bannerAward('Achievement unlocked', a.n, a.i, 'you');
  confetti(70); earn(25, null, null, { raw: true });
  if (APPS.you.view) APPS.you.render();
}

// ---------- gestures ----------
let noClickUntil = 0, dragging = false; // dragging: one of drag()'s gestures is running
const suppressClick = () => { noClickUntil = now() + 350; };
document.addEventListener('click', e => {
  if (now() < noClickUntil && phone.contains(e.target)) { e.stopPropagation(); e.preventDefault(); }
}, true);
document.addEventListener('gesturestart', e => e.preventDefault());
function drag(elm, o) {
  elm.addEventListener('pointerdown', e => {
    if (e.button > 0 || (o.skip && o.skip(e))) return;
    const id = e.pointerId, sx = e.clientX, sy = e.clientY;
    let on = false, dx = 0, dy = 0;
    const mv = ev => {
      if (ev.pointerId !== id) return;
      dx = (ev.clientX - sx) / scale; dy = (ev.clientY - sy) / scale;
      if (!on) {
        if (Math.hypot(dx, dy) < 7) return;
        if (o.axis !== 'any' && (o.axis === 'y') !== (Math.abs(dy) > Math.abs(dx))) { done(); return; }
        on = true; dragging = true; o.onStart && o.onStart();
      }
      if (ev.cancelable) ev.preventDefault();
      o.onMove(dx, dy);
    };
    const up = ev => {
      if (ev.pointerId !== id) return;
      done();
      if (on) { dragging = false; suppressClick(); o.onEnd(dx, dy); }
    };
    const done = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    addEventListener('pointermove', mv, { passive: false });
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
}
function PTR(sc, onRefresh) {
  const ind = $('.ptr-ind', sc), bodyEl = $('.ptr-body', sc), ticks = $$('.spinner i', ind);
  const TH = 62, MAX = 140;
  let pull = 0, armed = false, busy = false, tracking = false, decided = false, sy = 0, sx = 0, wheelAcc = 0, wheelT = 0, lastScroll = 0;
  const damp = d => MAX * (1 - Math.exp(-d / 170));
  function set(p, anim) {
    pull = p;
    bodyEl.style.transition = anim ? 'transform .32s cubic-bezier(.2,.9,.25,1)' : 'none';
    bodyEl.style.transform = p > 0 ? `translate3d(0,${p}px,0)` : '';
    ind.style.opacity = p > 6 ? Math.min(1, p / 40) : 0;
    ind.style.transform = `translateY(${(p - 64) / 2}px)`;
    if (busy) return;
    const k = Math.min(8, Math.floor((p / TH) * 8 + .2));
    ticks.forEach((t, i) => { t.style.opacity = i < k ? .9 : 0; });
    if (p >= TH && !armed) { armed = true; haptic(); sfx.tick(); } else if (p < TH - 8 && armed) armed = false;
  }
  async function release() {
    if (busy) return;
    if (!armed) { set(0, true); return; }
    busy = true; ind.classList.add('spin'); set(54, true); sfx.whoosh();
    try { await onRefresh(); } finally { ind.classList.remove('spin'); busy = false; armed = false; set(0, true); }
  }
  sc.addEventListener('touchstart', e => {
    if (busy || e.touches.length > 1) { tracking = false; return; }
    tracking = sc.scrollTop <= 0; decided = false; sy = e.touches[0].clientY; sx = e.touches[0].clientX;
  }, { passive: true });
  sc.addEventListener('touchmove', e => {
    if (!tracking || busy) return;
    const dy = (e.touches[0].clientY - sy) / scale, dx = (e.touches[0].clientX - sx) / scale;
    if (!decided) {
      if (!dx && !dy) return;
      decided = true;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || sc.scrollTop > 0) { tracking = false; return; }
    }
    if (e.cancelable) e.preventDefault();
    set(damp(Math.max(0, dy)));
  }, { passive: false });
  const end = () => { if (!tracking) return; tracking = false; if (pull > 0) release(); };
  sc.addEventListener('touchend', end); sc.addEventListener('touchcancel', end);
  sc.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || busy || sc.scrollTop > 0) return;
    const y0 = e.clientY; let on = false;
    const mv = ev => { const dy = (ev.clientY - y0) / scale; if (!on && dy > 6) on = true; if (on) set(damp(Math.max(0, dy))); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (on) { suppressClick(); release(); } };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  sc.addEventListener('scroll', () => { lastScroll = now(); }, { passive: true });
  sc.addEventListener('wheel', e => {
    if (busy || sc.scrollTop > 0 || (e.deltaY >= 0 && pull <= 0)) return;
    if (pull <= 0 && now() - lastScroll < 250) return;
    e.preventDefault();
    wheelAcc = Math.max(0, wheelAcc - e.deltaY * (e.deltaMode === 1 ? 16 : 1));
    set(damp(wheelAcc * .7));
    clearTimeout(wheelT); wheelT = setTimeout(() => { wheelAcc = 0; release(); }, 150);
  }, { passive: false });
  return { trigger() { if (busy) return; sc.scrollTo({ top: 0 }); set(TH, true); setTimeout(release, 200); } };
}
// ---------- a mouse drags content like a finger ----------
// with a mouse, drag inside any scroller to scroll it, fling it, and land on its snap points. touch keeps native scrolling.
// opt out with data-nodrag on anything that handles its own pointer (canvas, inputs and drag() gestures already win)
const scrollerFor = (el, ax) => {
  for (let n = el; n && n !== phone.parentElement; n = n.parentElement) {
    const cs = getComputedStyle(n), ov = ax === 'y' ? cs.overflowY : cs.overflowX;
    if ((ov === 'auto' || ov === 'scroll') && (ax === 'y' ? n.scrollHeight - n.clientHeight : n.scrollWidth - n.clientWidth) > 1) return n;
  }
  return null;
};
let flingRaf = 0;
phone.addEventListener('wheel', () => cancelAnimationFrame(flingRaf), { passive: true });
phone.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  cancelAnimationFrame(flingRaf);
  if (e.target.closest('canvas, input, textarea, select, [data-nodrag]')) return;
  const id = e.pointerId, sx = e.clientX, sy = e.clientY, samples = [];
  let sc = null, ax = 'y', start = 0, snapped = false;
  const setPos = v => { if (ax === 'y') sc.scrollTop = v; else sc.scrollLeft = v; };
  const mv = ev => {
    if (ev.pointerId !== id) return;
    const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
    if (dragging) { finish(false); return; } // a card swipe or a sheet took this gesture
    if (!sc) {
      if (Math.hypot(dx, dy) < 8) return;
      ax = Math.abs(dy) >= Math.abs(dx) ? 'y' : 'x';
      sc = scrollerFor(e.target, ax);
      if (!sc) { done(); return; }
      start = ax === 'y' ? sc.scrollTop : sc.scrollLeft;
      snapped = getComputedStyle(sc).scrollSnapType !== 'none';
      if (snapped) sc.style.scrollSnapType = 'none'; // snapping would fight the drag; it comes back on release
      sc.classList.add('mdrag');
    }
    if (ev.cancelable) ev.preventDefault();
    const d = ax === 'y' ? dy : dx;
    setPos(start - d);
    samples.push([now(), d]); if (samples.length > 8) samples.shift();
  };
  const finish = fl => {
    done();
    if (!sc) return;
    suppressClick(); sc.classList.remove('mdrag');
    const t = now(), rec = samples.filter(x => t - x[0] < 120);
    const v = fl && rec.length > 1 ? -(rec[rec.length - 1][1] - rec[0][1]) / Math.max(8, rec[rec.length - 1][0] - rec[0][0]) : 0; // px/ms, + is forward
    if (snapped) snapTo(sc, ax, start, v); else if (fl) fling(sc, ax, v);
  };
  const up = ev => { if (ev.pointerId === id) finish(true); };
  const done = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
  addEventListener('pointermove', mv, { passive: false }); addEventListener('pointerup', up); addEventListener('pointercancel', up);
});
function fling(sc, ax, v) {
  let last = now();
  const step = t => {
    const dt = Math.min(40, t - last); last = t;
    v *= Math.pow(.994, dt);
    if (Math.abs(v) < .02) return;
    if (ax === 'y') sc.scrollTop += v * dt; else sc.scrollLeft += v * dt;
    flingRaf = requestAnimationFrame(step);
  };
  flingRaf = requestAnimationFrame(step);
}
// land on the next snap point in the drag's direction, like a finger flick
function snapTo(sc, ax, start, v) {
  const cur = ax === 'y' ? sc.scrollTop : sc.scrollLeft, box = sc.getBoundingClientRect();
  const kids = [...sc.children].flatMap(c => [c, ...c.children]).filter(c => getComputedStyle(c).scrollSnapAlign !== 'none');
  const pts = [...new Set(kids.map(c => { const r = c.getBoundingClientRect(); return Math.round((ax === 'y' ? r.top - box.top : r.left - box.left) / scale + cur); }))].sort((a, b) => a - b);
  const restore = () => setTimeout(() => { sc.style.scrollSnapType = ''; }, 500);
  if (!pts.length) { restore(); return; }
  const near = p => pts.reduce((bi, x, i) => (Math.abs(x - p) < Math.abs(pts[bi] - p) ? i : bi), 0);
  const moved = cur - start, dir = Math.abs(moved) > 40 || Math.abs(v) > .3 ? Math.sign(moved || v) : 0;
  const si = near(start);
  let ti = near(cur + v * 120);
  if (dir && ti === si) ti = clamp(si + dir, 0, pts.length - 1);
  sc.scrollTo({ [ax === 'y' ? 'top' : 'left']: pts[ti], behavior: 'smooth' });
  restore();
}
function track(sc) {
  let last = sc.scrollTop;
  sc.addEventListener('scroll', () => { const t = sc.scrollTop; S.scrollPx += Math.abs(t - last); last = t; }, { passive: true });
}
function sheet(title, content) {
  const scrim = html('<div class="scrim"></div>'), sh = html(`<div class="sheet" role="dialog" aria-label="${title}"><div class="grab"></div><h3>${title}</h3></div>`);
  const b = html('<div class="sbody"></div>'); b.append(content); sh.append(b);
  phone.append(scrim, sh); void sh.offsetHeight; scrim.classList.add('show'); sh.classList.add('show');
  const close = () => { scrim.classList.remove('show'); sh.classList.remove('show'); sh.style.transform = ''; setTimeout(() => { scrim.remove(); sh.remove(); }, 300); };
  scrim.onclick = close;
  drag($('.grab', sh), { axis: 'y', onMove: (dx, dy) => { sh.style.transition = 'none'; sh.style.transform = `translateY(${Math.max(0, dy)}px)`; }, onEnd: (dx, dy) => { sh.style.transition = ''; if (dy > 80) close(); else sh.style.transform = ''; } });
  sfx.open();
  return close;
}
function modal(inner) {
  const m = html(`<div class="modal" role="dialog"><div class="mcard">${inner}</div></div>`);
  phone.append(m); sfx.ding('you');
  return m;
}

// ---------- notifications: one per hook, spaced out, quiet while you're busy ----------
const notifs = [];
let nid = 0, lockOn = false, ncOn = false, lastInput = 0;
const quietIds = new Set(); // what arrived while you were inside an app
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, () => { lastInput = now(); }, { passive: true, capture: true }));
const BANNER_MS = 5000, AWARD_MS = 4000, IDLE_MS = 1200, BANNER_GAP = 3000;
// at most one ordinary banner per this long (start to start); everything else waits quietly in the notification center
const bannerEvery = () => ({ chill: 60000, normal: 25000, chaos: 10000 })[S.settings.pace] || 25000;
// texts with {left} show the time remaining when they are drawn, not when they were sent
const leftTxt = ms => (ms < 60000 ? `${Math.max(1, Math.ceil(ms / 1000))} s` : cd(ms));
const ntext = n => (n.until ? n.text.replace('{left}', leftTxt(n.until - T())) : n.text);
const overlay = () => !!($('.grass') || $('.modal'));
const bundleIcon = B => `<span class="gl mgl" style="--c:${B.c}">${bglyph(B)}</span>`;
const subIcon = id => `<span class="gl mgl" style="--c:${APPS[id].c}">${glyph(id)}</span>`;
const nTitle = app => { const B = bundleOf(app); return B.tabs.length > 1 ? `${B.name} · ${APPS[app].name}` : B.name; };
const nciHTML = (n, fresh) => `<div class="nci${fresh ? ' fresh' : ''}" data-n="${n.id}">${bundleIcon(bundleOf(n.app))}<div class="bt"><div class="bh"><b>${nTitle(n.app)}</b><span>${ago(n.ts)}</span></div><div class="bx">${ntext(n)}</div></div></div>`;
const muted = app => !!S.settings.mute[bundleOf(app).id];
function notify(app, text, o = {}) {
  if (muted(app)) return;
  const old = notifs.findIndex(n => n.app === app); // one live notification per hook: the newer one replaces it
  if (old >= 0) notifs.splice(old, 1);
  const n = { id: ++nid, app, text, ts: T(), until: o.until || 0, urgent: !!o.urgent };
  notifs.unshift(n); if (notifs.length > 40) notifs.pop();
  S.notifs++;
  if (lockOn) { renderLock(true); buzz(); }
  else if (S.settings.focus && curBundle) quietIds.add(n.id); // it waits in the notification center
  else if (!o.silent && !$('.grass')) banner(n); // a break stays silent
  if (ncOn) renderNC();
  refreshBadges();
}
const alertAt = {};
function alertOnce(key, app, text, gap = 60000, o) { if (T() - (alertAt[key] || 0) < gap * paceK()) return; alertAt[key] = T(); notify(app, text, o); }
const bq = [];
let bOn = null, bLast = -1e9, bStart = -1e9, bT = 0;
const bSeen = {}; // one banner per hook per 30 s; the rest go straight to the notification center
const bRank = x => (x.award ? 0 : x.urgent ? 1 : 2);
function banner(n) {
  if (!n.award && !n.urgent && n.app && T() - (bSeen[n.app] || 0) < 30000) return;
  if (n.award && /^Level /.test(n.title)) { const i = bq.findIndex(x => x.award && /^Level /.test(x.title)); if (i >= 0) bq.splice(i, 1); } // only the newest level
  if (n.app) { const i = bq.findIndex(x => x.app === n.app); if (i >= 0) bq.splice(i, 1); }
  // awards first, then things with a deadline, then the rest, each in arrival order
  const at = bq.findIndex(x => bRank(x) > bRank(n));
  bq.splice(at < 0 ? bq.length : at, 0, n);
  const plain = bq.filter(x => bRank(x) === 2); // keep only the two newest ordinary ones queued
  if (plain.length > 2) bq.splice(bq.indexOf(plain[0]), 1);
  pump();
}
function bannerAward(title, text, icon, go) { banner({ award: true, title, text, icon, go }); }
function pump() {
  clearTimeout(bT);
  if (bOn || lockOn || (!bq.length && !quietIds.size)) return; // unlocking pumps again
  if (overlay() || document.hidden) { bT = setTimeout(pump, 1000); return; }
  if (S.settings.focus && curBundle) for (let i = bq.length - 1; i >= 0; i--) if (!bq[i].award) bq.splice(i, 1);
  // what arrived quietly while you were in an app comes back as one banner once you're out
  if (quietIds.size && !curBundle && !bq.some(x => x.summary)) bq.splice(bq.findIndex(x => !x.award) < 0 ? bq.length : bq.findIndex(x => !x.award), 0, { summary: true, urgent: true });
  if (!bq.length) return;
  // a quiet gap after every banner, a budget for ordinary ones, and never one dropped on you mid-tap
  const next = bq[0];
  const w = Math.max(BANNER_GAP - (now() - bLast), IDLE_MS - (now() - lastInput), bRank(next) === 2 ? bannerEvery() - (now() - bStart) : 0, 0);
  if (w > 0) { bT = setTimeout(pump, w + 30); return; }
  showBanner(bq.shift());
}
function showBanner(n) {
  if (!n.award && !n.summary && !notifs.includes(n)) { pump(); return; } // already read in the notification center
  if (n.until && n.until - T() < 6000) { dropN(n); pump(); return; } // too late to act on
  if (n.summary) {
    const got = notifs.filter(x => quietIds.has(x.id)); quietIds.clear();
    if (!got.length || curBundle) { pump(); return; }
    const names = [...new Set(got.map(x => bundleOf(x.app).name))], where = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
    n.title = 'While you were busy'; n.text = `${got.length} new from ${where}`;
  }
  const icon = n.award ? `<span class="gl mgl" style="--c:#5a3c00">${I(n.icon || 'star')}</span>` : n.summary ? `<span class="gl mgl" style="--c:#ff2e4d">${I('bell')}</span>` : bundleIcon(bundleOf(n.app));
  const title = n.award || n.summary ? n.title : nTitle(n.app);
  const node = html(`<div class="banner${n.award ? ' award' : ''}" role="status">${icon}<div class="bt"><div class="bh"><b>${title}</b><span>now</span></div><div class="bx">${ntext(n)}</div></div></div>`);
  if (!n.award && !n.urgent) bStart = now();
  $('#banners').append(node);
  void node.offsetWidth; node.classList.add('in');
  if (n.award) sfx.win(); else { sfx.ding(n.app || 'you'); buzz(); if (n.app) { islandPop(n.app); bSeen[n.app] = T(); } }
  haptic();
  let gone = false, timer = 0;
  const dismiss = () => {
    if (gone) return; gone = true; clearTimeout(timer);
    node.classList.remove('in'); node.classList.add('out');
    setTimeout(() => { node.remove(); bOn = null; bLast = now(); pump(); }, 220);
  };
  timer = setTimeout(dismiss, n.award ? AWARD_MS : BANNER_MS);
  node.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') clearTimeout(timer); });
  node.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !gone) { clearTimeout(timer); timer = setTimeout(dismiss, 2000); } });
  node.addEventListener('click', () => { dismiss(); if (n.award) { if (n.go) openApp(n.go); } else if (n.summary) openNC(); else openFromNotif(n); });
  drag(node, {
    axis: 'y', onStart: () => clearTimeout(timer),
    onMove: (dx, dy) => { node.style.transition = 'none'; node.style.transform = `translateY(${dy < 0 ? dy : dy * .25}px)`; },
    onEnd: (dx, dy) => { node.style.transition = ''; node.style.transform = ''; if (dy < -20) dismiss(); else timer = setTimeout(dismiss, 2500); },
  });
  bOn = { dismiss };
}
function dropN(n) { const i = notifs.indexOf(n); if (i >= 0) { notifs.splice(i, 1); if (ncOn) renderNC(); if (lockOn) renderLock(); refreshBadges(); } }
// deadlines that have passed leave the notification center and the lock screen
function pruneNotifs() {
  const gone = notifs.filter(n => n.until && T() >= n.until);
  if (!gone.length) return;
  gone.forEach(n => notifs.splice(notifs.indexOf(n), 1));
  if (ncOn) renderNC(); if (lockOn) renderLock(); refreshBadges();
}
function openFromNotif(n) {
  const i = notifs.indexOf(n); if (i >= 0) notifs.splice(i, 1);
  closeNC(); openApp(n.app); refreshBadges();
}
let islandT = 0;
function islandPop(app) {
  if (!framed) return;
  const is = $('#island'), B = bundleOf(app);
  $('.ia', is).innerHTML = `<i style="--c:${B.c}">${bglyph(B)}</i>`;
  $('.ib', is).textContent = `+${Math.min(99, notifs.length)}`;
  is.classList.add('pop');
  clearTimeout(islandT); islandT = setTimeout(() => is.classList.remove('pop'), 1400);
}
function renderNC() {
  $('#nc-list').innerHTML = notifs.length ? notifs.map(n => nciHTML(n)).join('') : '<div class="nc-empty">Nothing waiting. Enjoy it.</div>';
}
function openNC() { if (lockOn) return; ncOn = true; quietIds.clear(); renderNC(); $('#nc').classList.add('show'); sfx.whoosh(); }
function closeNC() { if (!ncOn) return; ncOn = false; $('#nc').classList.remove('show'); }
const nById = id => notifs.find(n => n.id === +id);

function renderLock(fresh) {
  const d = new Date();
  $('#lk-time').textContent = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
  $('#lk-date').textContent = d.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });
  const st = $('#lk-stack');
  if (!S.onboarded) {
    st.innerHTML = '<div class="lk-intro"><div class="a-logo">st<span class="i">ı<b class="tittle">1</b></span>m</div><p>Every hook a phone has, with nothing inside.</p><p>Twenty hooks in eight apps, sorted by type. The home screen shows what’s waiting, and notifications stay quiet while you’re in an app.</p></div>';
    $('#lk-hint').textContent = 'Swipe up or tap to start';
    return;
  }
  const top = notifs.slice(0, 4);
  st.innerHTML = top.map((n, i) => nciHTML(n, fresh && i === 0)).join('') + (notifs.length > 4 ? `<div class="lk-more">${notifs.length - 4} more notifications</div>` : '');
  $('#lk-hint').textContent = 'Swipe up or tap to unlock';
}
function lock() {
  if (lockOn) return;
  closeNC(); lockOn = true; quietIds.clear(); // the lock screen shows them instead
  if (bOn) bOn.dismiss();
  const L = $('#lock'); L.hidden = false; L.style.transform = '';
  void L.offsetWidth; L.classList.remove('away');
  renderLock();
}
function unlockPhone(then) {
  if (!lockOn) return;
  lockOn = false; S.pickups++;
  const L = $('#lock'); L.style.transform = ''; L.classList.add('away');
  setTimeout(() => { if (!lockOn) L.hidden = true; }, 380);
  sfx.unlock(); haptic(true);
  if (!S.onboarded) { S.onboarded = true; save(); startSchedule(); earn(500, FW / 2, FH / 2, { raw: true }); setTimeout(() => bannerAward('Welcome bonus', '+500 hits. Spend them on anything.', 'gem', 'casino'), 600); }
  else earn(2, FW / 2, 140, { raw: true });
  offline();
  if (then) setTimeout(() => openApp(then), 120);
  refreshBadges(); queueCheck(); pump();
}
function offline() {
  const away = Math.min(7200, (T() - (S.lastSeen || T())) / 1000);
  S.lastSeen = T();
  if (away < 30 || !S.tap.A) return;
  const g = Math.round(away * S.tap.A * .5);
  if (g < 1) return;
  setTimeout(() => { earn(g, FW / 2, 200, { raw: true }); bannerAward('While you were away', `Auto-tapper made ${fmt(g)} hits`, 'bolt', 'tap'); }, 500);
}

// ---------- app framework: twenty hooks as tabs inside eight apps, one app per type ----------
const APPS = {};
const def = a => { APPS[a.id] = a; a.bdg = 0; };
const GB = {
  feed: G.scroll,
  casino: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.4" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.4" fill="currentColor"/>',
  markets: G.trade,
  play: '<path d="M7.5 8h9a4.5 4.5 0 0 1 4.3 5.8l-.9 3.2a2.3 2.3 0 0 1-3.9 1L14 16h-4l-2 2a2.3 2.3 0 0 1-3.9-1l-.9-3.2A4.5 4.5 0 0 1 7.5 8z"/><path d="M8 11v3.5M6.25 12.75h3.5"/><circle cx="15.5" cy="11.5" r="1" fill="currentColor"/><circle cx="17.3" cy="13.8" r="1" fill="currentColor"/>',
  inbox: G.inbox,
  goals: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  shop: G.shop,
  you: G.you,
};
const BUNDLES = [
  { id: 'feed', name: 'Feed', c: '#7b61ff', nav: 'bottom', tabs: ['posts', 'clips', 'discover', 'activity', 'profile'] },
  { id: 'casino', name: 'Casino', c: '#f5a300', tabs: ['slots', 'rocket', 'flip', 'scratch', 'loot'] },
  { id: 'markets', name: 'Markets', c: '#12b886', tabs: ['trade', 'predict'] },
  { id: 'play', name: 'Play', c: '#ff5a36', nav: 'launcher', tabs: ['arcade', 'tap', 'hold', 'rings', 'pet', 'gates', 'tower'] },
  { id: 'inbox', name: 'Inbox', c: '#2f9bff', tabs: ['inbox'] },
  { id: 'goals', name: 'Goals', c: '#ff3d6e', tabs: ['streak', 'quests', 'rank'] },
  { id: 'shop', name: 'Shop', c: '#c2179b', nav: 'bottom', tabs: ['shop', 'cart', 'orders'] },
  { id: 'you', name: 'You', c: '#6b5b7b', tabs: ['you'] },
];
BUNDLES.forEach(B => { B.bdg = 0; B.cur = null; B.view = null; });
const GRID = ['feed', 'casino', 'markets', 'play'], DOCK = ['inbox', 'goals', 'shop', 'you'];
// how a bundle shows its apps: pill tabs under the header, a tab bar at the bottom, or a launcher (first tab is home, the rest open like apps)
const navMode = B => B.nav || (B.tabs.length > 1 ? 'pills' : 'none');
const isHome = (B, t) => navMode(B) === 'launcher' && t === B.tabs[0];
const bundleById = id => BUNDLES.find(B => B.id === id);
const bundleOf = id => BUNDLES.find(B => B.tabs.includes(id));
const bglyph = B => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${GB[B.id]}</svg>`;
let curApp = null, curBundle = null;
const iconHTML = B => `<button class="ic" data-app="${B.id}" aria-label="${B.name}"><span class="gl" style="--c:${B.c}">${bglyph(B)}</span><span class="badge"></span><span>${B.name}</span></button>`;
function mountBundle(B) {
  const mode = navMode(B);
  const tab = t => `<button role="tab" data-t="${t}" style="--tc:${APPS[t].c}"><span class="tg">${glyph(t)}</span><span class="tl">${APPS[t].name}</span><span class="tb"></span></button>`;
  const nav = cls => `<nav class="${cls}" role="tablist" aria-label="${B.name}">${B.tabs.map(tab).join('')}</nav>`;
  const v = html(`<section class="app nav-${mode}" style="--c:${B.c}" aria-label="${B.name}" hidden><header class="ah"><button class="ax" aria-label="Close">${I('close')}</button>${mode === 'launcher' ? `<button class="ax aback" aria-label="Back to ${B.name}" hidden>${I('back')}</button>` : ''}<div class="at"><b>${B.name}</b><small></small></div><div class="ar"></div></header>${mode === 'pills' ? nav('tabs') : ''}<div class="bb"></div>${mode === 'bottom' ? nav('btabs') : ''}</section>`);
  $('#apps').append(v);
  B.view = v;
  $('.ax', v).onclick = () => closeApp();
  drag($('.ah', v), {
    axis: 'y',
    onMove: (dx, dy) => { v.style.transition = 'none'; v.style.transform = `translateY(${Math.max(0, dy)}px)`; },
    onEnd: (dx, dy) => { v.style.transition = ''; v.style.transform = ''; if (dy > 100) closeApp(); },
  });
  const nv = $('nav[role=tablist]', v);
  if (nv) nv.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) showTab(B, b.dataset.t); });
  if (mode === 'launcher') $('.aback', v).onclick = () => showTab(B, B.tabs[0]);
  B.tabs.forEach(t => { APPS[t].bdg = -1; }); // so the tab badges fill in on the next refresh
  return v;
}
function ensureSub(t) {
  const a = APPS[t];
  if (a.view) return;
  const B = bundleOf(t);
  const body = html(`<div class="ab" data-sub="${t}" style="--c:${a.c}" hidden></div>`), right = html(`<div class="ar-sub" data-sub="${t}" hidden></div>`);
  $('.bb', B.view).append(body); $('.ar', B.view).append(right);
  a.view = body; a.body = body; a.right = right;
  a.build(body, right);
}
function showTab(B, t, quiet) {
  if (!B.view || !B.tabs.includes(t)) return;
  if (curBundle === B && curApp === t) return;
  const prev = curBundle === B ? curApp : null, mode = navMode(B);
  if (curApp && curApp !== t && APPS[curApp].close) APPS[curApp].close();
  ensureSub(t);
  B.cur = t; S.tabs[B.id] = t; curApp = t;
  $$('.bb > .ab', B.view).forEach(x => { x.hidden = x.dataset.sub !== t; });
  $$('.ar > .ar-sub', B.view).forEach(x => { x.hidden = x.dataset.sub !== t; });
  refreshBadges(); // tab badges change the strip's width, so fill them before scrolling to the active tab
  $$('nav[role=tablist] [data-t]', B.view).forEach(x => {
    const on = x.dataset.t === t;
    x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on));
    if (on && mode === 'pills') { const nav = x.parentElement; nav.scrollTo({ left: Math.max(0, x.offsetLeft - 40), behavior: quiet ? 'auto' : 'smooth' }); }
  });
  $('.at small', B.view).textContent = APPS[t].tag;
  if (mode === 'launcher') {
    const game = !isHome(B, t);
    $('.ax:not(.aback)', B.view).hidden = game; $('.aback', B.view).hidden = !game;
    $('.at b', B.view).textContent = game ? APPS[t].name : B.name;
    if (game && prev !== t) splash(B, t);
  }
  const a = APPS[t];
  if (a.open) a.open();
  if (a.render) a.render();
  if (!quiet) { sfx.click(); haptic(); }
  refreshBadges();
}
// a game opens like its own app: its icon and name for a moment, then the game
function splash(B, t) {
  if (reduced) return;
  const a = APPS[t], el = html(`<div class="splash" style="--c:${a.c}" aria-hidden="true"><span class="gl">${glyph(t)}</span><b>${a.name}</b></div>`);
  $('.bb', B.view).append(el);
  setTimeout(() => el.classList.add('out'), 700);
  setTimeout(() => el.remove(), 1050);
}
function openApp(id, from) {
  if (lockOn) return;
  const B = bundleById(id) || bundleOf(id);
  if (!B) return;
  const tab = APPS[id] && B.tabs.includes(id) ? id : B.cur || (B.tabs.includes(S.tabs[B.id]) ? S.tabs[B.id] : B.tabs[0]);
  closeNC();
  if (curBundle === B) { showTab(B, tab); return; }
  if (curBundle) closeApp(true);
  const v = B.view || mountBundle(B);
  const src = from || $(`.ic[data-app="${B.id}"]`);
  if (src) {
    const r = src.getBoundingClientRect(), p = $('#apps').getBoundingClientRect();
    v.style.transformOrigin = `${(r.left + r.width / 2 - p.left) / scale}px ${(r.top + r.height / 2 - p.top) / scale}px`;
  }
  v.hidden = false; v.classList.remove('closing'); restart(v, 'opening');
  curBundle = B; curApp = null; S.opens++;
  showTab(B, tab, true);
  sfx.open(); haptic();
}
function closeApp(instant) {
  if (!curBundle) return;
  const B = curBundle, a = curApp && APPS[curApp], v = B.view;
  curBundle = null; curApp = null;
  if (a && a.close) a.close();
  if (instant || reduced) v.hidden = true;
  else {
    v.classList.remove('opening'); v.classList.add('closing'); sfx.close();
    setTimeout(() => { if (v.classList.contains('closing')) { v.hidden = true; v.classList.remove('closing'); } }, 180);
  }
  refreshBadges(); pump();
}
let badgeTotal = -1, booted = false;
function refreshBadges() {
  if (!booted) return; // apps are still setting up
  let total = 0;
  for (const B of BUNDLES) {
    let sum = 0;
    for (const t of B.tabs) {
      const a = APPS[t], n = Math.max(0, Math.floor(a.badge ? a.badge() : 0));
      sum += n;
      if (n !== a.bdg) {
        const tb = B.view && $(`nav[role=tablist] [data-t="${t}"] .tb`, B.view);
        if (tb) { tb.textContent = n ? (n > 99 ? '99+' : n) : ''; if (n > a.bdg && a.bdg >= 0) restart(tb, 'bump'); }
        a.bdg = n;
      }
    }
    const shown = S.settings.mute[B.id] ? 0 : sum; // a muted app stops pulling at you from the home screen
    total += shown;
    if (shown !== B.bdg) {
      const el = $(`.ic[data-app="${B.id}"]`);
      if (el) {
        const b = $('.badge', el);
        b.textContent = shown ? (shown > 99 ? '99+' : shown) : '';
        if (shown > B.bdg) { restart(b, 'bump'); if (!B.bdg) restart(el, 'jig'); }
      }
      B.bdg = shown;
    }
  }
  if (total !== badgeTotal) {
    badgeTotal = total;
    document.title = total ? `(${total > 999 ? '999+' : total}) stim` : 'stim';
    const tt = $('#tittle'), txt = total > 99 ? '99+' : total ? String(total) : '';
    if (tt.textContent !== txt) { tt.textContent = txt; if (total) restart(tt, 'bump'); }
    try { if (navigator.setAppBadge) (total ? navigator.setAppBadge(total) : navigator.clearAppBadge()).catch(() => {}); } catch {}
  }
  const nb = $('#b-nc'), nt = notifs.length ? String(Math.min(99, notifs.length)) : '';
  if (nb.textContent !== nt) { if (notifs.length > (+nb.dataset.n || 0)) restart(nb, 'bump'); nb.textContent = nt; nb.dataset.n = notifs.length; }
}

// ---------- shared by casino and markets: stakes and charts ----------
const STAKES = [['10', 10], ['50', 50], ['100', 100], ['Half', 'half'], ['All in', 'all']];
const stakeVal = v => (v === 'half' ? Math.floor(S.hits / 2) : v === 'all' ? S.hits : v);
const chipsHTML = (id, sel) => `<div class="chips" id="${id}">${STAKES.map(([l, v]) => `<button data-v="${v}" class="${String(v) === String(sel) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
function bindChips(el, set) {
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    set(isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v);
    $$('button', el).forEach(x => x.classList.toggle('on', x === b)); sfx.click();
  });
}
// a single-series line: 2px stroke, soft area, faint gridlines, emphasized endpoint
function sparkSVG(vals, w, h, color, o = {}) {
  const pad = o.pad ?? 4, min = Math.min(...vals), max = Math.max(...vals), rng = max - min || 1;
  const x = i => pad + (i / Math.max(1, vals.length - 1)) * (w - pad * 2), y = v => pad + (1 - (v - min) / rng) * (h - pad * 2);
  const line = 'M' + vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('L');
  const lx = x(vals.length - 1), ly = y(vals[vals.length - 1]);
  const grid = o.grid ? [.25, .5, .75].map(f => `<line x1="0" x2="${w}" y1="${(h * f).toFixed(1)}" y2="${(h * f).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`).join('') : '';
  const area = o.area ? `<path d="${line}L${lx.toFixed(1)},${h}L${x(0).toFixed(1)},${h}Z" fill="${color}" opacity=".14"/>` : '';
  const dot = o.dot ? `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4" fill="${color}" stroke="var(--card)" stroke-width="2"/>` : '';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${grid}${area}<path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dot}</svg>`;
}

// =====================================================================
// modules: each one owns its section below, its CSS block, its state slice
// =====================================================================

// ==== MODULE feed: posts, clips, discover, activity, profile ====
{ // the whole module lives in this block, so its names never collide with other modules
// ---------- Feed: a social network of generated people and generated pictures ----------
for (const k of ['feedLikes', 'feedPosts', 'feedFollows', 'feedStories', 'feedComments', 'feedSeen']) S[k] = S[k] || 0;
const F = slice('feed', {
  me: null, followers: 0, gained: 0, following: [], requests: 0, reveal: false, newPosts: 0, newClips: 0,
  events: [], eid: 0, myPosts: [], myStory: null, saved: [], stories: [], seen: {}, visits: 0, pDay: 0, pStreak: 0, hint: false,
});
let folSet = new Set();
const isFol = id => folSet.has(id);

addAch([
  ['cards', 'Bottomless', 'See 500 posts', 'down', () => S.feedSeen >= 500],
  ['match', 'Mutuals', 'Follow each other with 10 people', 'heart', () => S.matches >= 10],
  ['clips', 'Autopilot', 'Watch 100 clips', 'play', () => S.clips >= 100],
  ['fdpost', 'First post', 'Share a post', 'send', () => S.feedPosts >= 1],
  ['fdheart', 'Generous', 'Like 100 posts', 'heart', () => S.feedLikes >= 100],
  ['fdviral', 'Taking off', 'Get 1,000 hearts on one post', 'star', () => F.myPosts.some(p => p.likes >= 1000)],
  ['fdfans', 'Rising', 'Reach 1,000 followers', 'level', () => F.followers >= 1000],
]);
addStats([
  ['followers', () => fmt(F.followers)],
  ['posts liked', () => fmt(S.feedLikes)],
  ['clips watched', () => fmt(S.clips)],
  ['stories watched', () => fmt(S.feedStories)],
]);
addQuests([
  ['feedLikes', 'Like {n} posts', 5, 25],
  ['clips', 'Watch {n} clips', 4, 15],
  ['feedFollows', 'Follow {n} people', 3, 10],
  ['feedStories', 'Watch {n} stories', 4, 12],
  ['feedComments', 'Leave {n} comments', 2, 6],
]);

// ---------- words ----------
const FIRST = ['Mila', 'Juno', 'Kai', 'Remi', 'Sol', 'Nova', 'Ari', 'Theo', 'Luca', 'Zuri', 'Ivy', 'Bo', 'Noor', 'Ren', 'Pia', 'Oli', 'Sasha', 'Dani', 'Yuki', 'Mika', 'Leo', 'Nia', 'Cleo', 'Rio', 'Tess', 'Wren', 'Ezra', 'Lux', 'Indi', 'Fern', 'Kit', 'Sage', 'Maya', 'Nico', 'Roux', 'June', 'Skye', 'Cato', 'Lumi', 'Bex', 'Alba', 'Emi', 'Jude', 'Rafa', 'Suki', 'Vale', 'Zane', 'Odie', 'Pax', 'Rue'];
const WORDS = ['peach', 'sugar', 'glow', 'velvet', 'mochi', 'honey', 'pixel', 'cloud', 'jelly', 'lemon', 'cherry', 'bubble', 'satin', 'neon', 'gloss', 'sprinkle', 'plum', 'mint', 'dreamy', 'cosmic', 'lilac', 'sunny', 'fizzy', 'berry', 'tulip', 'comet', 'pearl', 'candy', 'daisy', 'luna'];
const SUFS = ['wav', 'xo', 'exe', 'jpg', 'irl', 'daily', 'studio', 'club', 'diary', 'world', 'fm', 'png', 'zip', 'mp3'];
const EMO = ['✨', '🍑', '🫧', '🌙', '🌷', '🍒', '☁️', '🦋', '🌈', '💫', '🍋', '🪩'];
const BIOS = ['soft things only ✨', 'collecting little moments', 'making things look nice', 'daily-ish posts', 'here for the colors', 'night owl 🌙', 'always somewhere sunny', 'color enthusiast', 'photos, mostly', 'living in the details', 'a little bit of everything', 'currently: obsessed', 'good vibes, better light', 'dm for collabs 💌', 'chasing golden hour'];
const CAPS = ['obsessed', 'need this', 'the lighting 😮‍💨', 'soft launch', 'golden hour hits different', 'core memory', 'a little dump 🫧', 'mood', 'lately ✨', 'photo dump', 'this >>>', 'can’t stop looking at this', '10/10 no notes', 'weekend recap', 'felt cute', 'caught in 4k', 'sunday reset', 'new favorite', 'rate this 1–10', 'pov: you found it', 'not me posting again', 'vibes only', 'one for the grid', 'saving this forever', 'current mood 💫', 'just because', 'okay this one’s my favorite', 'sorry for the spam', 'happy place', 'the colors today'];
const CMTS = ['obsessed 😍', 'need this', 'the lighting 😮‍💨', 'stop 😭', 'this is everything', '🔥🔥🔥', 'wait how', 'iconic', 'no bc why is this so good', 'saving this', 'okay but the colors', '🫶', 'screaming', 'vibes', 'literally me', 'drop the preset', 'where is this', '10/10', 'can’t breathe', '😮‍💨😮‍💨', 'the way i gasped', 'love love love', 'serving', 'on repeat', '✨✨✨', 'you ate', 'need a part 2', 'how is this real', 'the colors!!', 'this made my day', 'omg', '😍😍😍', 'wallpaper material', 'teach me', 'yesss', 'perfection', '🤍', 'obsessed is an understatement'];
const REPLIES = ['look at this', 'this is so you', 'we need this', 'our next trip', 'told you', '😭😭'];
const LOCS = ['Somewhere nice', 'The coast', 'Downtown', 'Rooftop', 'Home', 'Golden hour', 'Out and about', 'The park', 'Weekend spot'];
const BRANDS = [['Glossworks', 'Shop now'], ['Puff Labs', 'Get yours'], ['Mellow & Co.', 'Shop now'], ['Sugarform', 'Claim offer'], ['Brightbox', 'Learn more'], ['Cloudnine Home', 'Shop now'], ['Fizzy Skin', 'Try it free'], ['Nimbus Audio', 'Shop now'], ['Plush Supply', 'Get 60% off'], ['Lumen Labs', 'Learn more']];
const ADS = ['The one everyone’s asking about.', 'Back in stock. Again.', 'Your new daily essential ✨', 'Rated 4.9 by 38,000 people.', 'Limited drop. Once it’s gone, it’s gone.', 'Sold out 3 times this month.', 'Free shipping ends tonight.', 'See why everyone has one.', 'You deserve this.', 'Made for moments like this.'];
const STICK = ['today ✨', 'mood', 'current view', 'no thoughts just vibes', 'guess where', 'good morning ☀️', 'late night 🌙', 'obsessed', 'on repeat', 'lil update', 'core memory', 'happy place'];
const POLLS = [['cute?', 'yes', 'obviously'], ['which vibe', 'this', 'also this'], ['post more of these?', 'yes', 'YES'], ['rate the colors', '10', '11'], ['coffee or tea', 'coffee', 'tea']];
const CHIPS = ['obsessed', 'golden hour', 'soft launch', 'core memory', 'photo dump', 'lately ✨', 'mood', 'no filter needed', 'felt cute', 'weekend', '🫧', '💕', 'happy place', 'new favorite', 'the colors today', 'caught in 4k'];
const FILTERS = [['Original', 'none'], ['Sugar', 'saturate(1.35) brightness(1.06)'], ['Fizz', 'contrast(1.15) saturate(1.5) hue-rotate(-12deg)'], ['Haze', 'brightness(1.12) saturate(.75) contrast(.9)'], ['Noir', 'grayscale(1) contrast(1.2)'], ['Peach', 'sepia(.35) saturate(1.3) hue-rotate(-10deg)'], ['Frost', 'hue-rotate(28deg) saturate(1.1) brightness(1.05)'], ['Dream', 'hue-rotate(-40deg) saturate(1.25)']];
const RX = ['😍', '🔥', '😂', '😮', '👏'];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- icons ----------
const FI = {
  heart: P.heart, send: P.send, check: P.check, x: P.close, back: P.back, eye: P.eye, up: P.up, star: P.star, bell: P.bell,
  chat: '<path d="M20.5 11.6a8.1 8.1 0 0 1-11.9 7.2L3.5 20.5l1.6-4.6a8.1 8.1 0 1 1 15.4-4.3z"/>',
  save: '<path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.4-6.5 4.4v-16a1 1 0 0 1 1-1z"/>',
  dots: '<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  note: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  chev: '<path d="m9 5.5 6.5 6.5L9 18.5"/>',
  userplus: '<circle cx="10" cy="8.5" r="4"/><path d="M3 20.5c1-3.6 3.6-5.3 7-5.3s6 1.7 7 5.3M19 8v6M16 11h6"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-6M21.5 20.5h-19"/>',
  story: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 2.4"/><path d="M12 8.5v7M8.5 12h7"/>',
  spark: '<path d="M12 3.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5z"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
};
const fi = (n, c = '') => `<svg class="ico${c ? ' ' + c : ''}" viewBox="0 0 24 24" aria-hidden="true">${FI[n]}</svg>`;
const VF = '<svg class="fd-vf" viewBox="0 0 24 24" aria-label="Verified"><path d="m12 2.2 2.5 1.9 3.1-.2.9 3 2.6 1.7-1 2.9 1 2.9-2.6 1.7-.9 3-3.1-.2L12 21.8l-2.5-1.9-3.1.2-.9-3-2.6-1.7 1-2.9-1-2.9 2.6-1.7.9-3 3.1.2z" fill="#3b7bff"/><path d="m8.3 12.2 2.5 2.5 4.9-5" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ---------- seeded generators ----------
const rng = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const rp = (r, a) => a[Math.floor(r() * a.length)];
const seedNew = () => Math.floor(R() * 2147483646) + 1;
const n1 = v => Math.round(v * 10) / 10;
const uriOf = s => `url('data:image/svg+xml,${encodeURIComponent(s).replace(/'/g, '%27')}')`;
const uris = new Map();
const cached = (k, mk) => { let v = uris.get(k); if (!v) { if (uris.size > 800) uris.clear(); v = uriOf(mk()); uris.set(k, v); } return v; };

// people: a handle, a name, a jelly avatar, a following
const people = new Map();
function person(id) {
  let u = people.get(id);
  if (u) return u;
  const r = rng(id * 9973 + 17), nm = rp(r, FIRST), w = rp(r, WORDS), w2 = rp(r, WORDS), sf = rp(r, SUFS), lo = nm.toLowerCase();
  const handle = [`${lo}.${w}`, `${w}${lo}`, `${lo}_${w}`, `${lo}.${sf}`, `${w}.${w2}`, `${lo}${Math.floor(r() * 98) + 1}`, `its${lo}`, `${lo}__`, `${w}_${sf}`, `the${w}${lo}`][Math.floor(r() * 10)];
  const name = r() < .3 ? `${nm} ${rp(r, EMO)}` : r() < .45 ? `${nm} ${cap(w)}` : nm;
  u = { id, handle, name, vf: r() < .1, fol: Math.round(Math.exp(5 + r() * 8)), posts: Math.round(12 + r() * 900), bio: rp(r, BIOS), hot: .5 + r() * 1.6, seed: Math.floor(r() * 2e9) + 1 };
  if (u.vf) u.fol *= 14;
  people.set(id, u);
  return u;
}
const meU = () => ({ id: 0, handle: F.me.handle, name: F.me.name, seed: F.me.seed, bio: F.me.bio, vf: false });
const whoOf = id => (id === 0 ? meU() : person(id));
const stranger = (r = R) => { let id; do id = 1 + Math.floor(r() * 4999); while (folSet.has(id)); return id; };
const friend = () => (F.following.length ? pick(F.following) : stranger());

function avSVG(seed) {
  const r = rng(seed * 7 + 3), h = Math.floor(r() * 360), h2 = Math.floor(h + 40 + r() * 220) % 360;
  const bg = `hsl(${h},90%,86%)`, bd = `hsl(${h2},78%,${58 + Math.floor(r() * 10)}%)`, dk = `hsl(${h2},55%,18%)`;
  const w = 11 + r() * 5, top = 10 + r() * 5, ey = n1(top + 10.5 + r() * 2), ex = 3.8 + r() * 1.6, et = Math.floor(r() * 4), mt = Math.floor(r() * 4), my = n1(ey + 4.4), ac = Math.floor(r() * 7);
  const L = n1(20 - w), Rr = n1(20 + w), T0 = n1(top), gx = n1(20 - w * .45), gy = n1(top + 5);
  const eye = x => {
    x = n1(x);
    return [
      `<circle cx="${x}" cy="${ey}" r="1.8" fill="${dk}"/>`,
      `<circle cx="${x}" cy="${ey}" r="2.7" fill="#fff"/><circle cx="${n1(x + .4)}" cy="${n1(ey + .3)}" r="1.6" fill="${dk}"/><circle cx="${n1(x + .9)}" cy="${n1(ey - .4)}" r=".55" fill="#fff"/>`,
      `<path d="M${n1(x - 1.9)} ${n1(ey + .7)}q1.9-2.5 3.8 0" fill="none" stroke="${dk}" stroke-width="1.3" stroke-linecap="round"/>`,
      `<path d="M${n1(x - 1.9)} ${ey}q1.9 1.6 3.8 0" fill="none" stroke="${dk}" stroke-width="1.3" stroke-linecap="round"/>`,
    ][et];
  };
  const mouth = [
    `<path d="M17.6 ${my}q2.4 2.5 4.8 0" fill="none" stroke="${dk}" stroke-width="1.3" stroke-linecap="round"/>`,
    `<ellipse cx="20" cy="${n1(my + .7)}" rx="1.3" ry="1.6" fill="${dk}"/>`,
    `<path d="M17.4 ${my}q1.3 1.5 2.6 0q1.3 1.5 2.6 0" fill="none" stroke="${dk}" stroke-width="1.2" stroke-linecap="round"/>`,
    `<path d="M17.8 ${my}q2.2 3.2 4.4 0z" fill="${dk}"/>`,
  ][mt];
  const cheeks = r() < .65 ? `<ellipse cx="${n1(20 - ex - 2.7)}" cy="${n1(ey + 2.9)}" rx="1.9" ry="1.1" fill="#ff4f86" opacity=".45"/><ellipse cx="${n1(20 + ex + 2.7)}" cy="${n1(ey + 2.9)}" rx="1.9" ry="1.1" fill="#ff4f86" opacity=".45"/>` : '';
  const acc = [
    '',
    `<path d="M20 ${T0}v-3.6" stroke="#2f9e57" stroke-width="1.3"/><path d="M20 ${n1(top - 3.4)}c-2.8-2.2-5.2-.4-5.4 1.2 2.4.9 4 .4 5.4-1.2zM20 ${n1(top - 3.4)}c2.8-2.2 5.2-.4 5.4 1.2-2.4.9-4 .4-5.4-1.2z" fill="#4cc26b"/>`,
    `<path d="M20 ${T0}v-4.2" stroke="${bd}" stroke-width="1.4" stroke-linecap="round"/><circle cx="20" cy="${n1(top - 5.2)}" r="2" fill="hsl(${h},95%,62%)"/>`,
    `<path d="M${n1(20 + w * .35)} ${n1(top + 2.4)}l4-2.6v5.2zM${n1(20 + w * .35)} ${n1(top + 2.4)}l-4-2.6v5.2z" fill="#ff4f8b"/><circle cx="${n1(20 + w * .35)}" cy="${n1(top + 2.4)}" r="1.2" fill="#ff7aa8"/>`,
    `<ellipse cx="20" cy="${n1(top - 2.6)}" rx="6" ry="1.7" fill="none" stroke="#ffc21a" stroke-width="1.4"/>`,
    `<path d="M${n1(20 - w * .6)} ${n1(top + 4)}c1.5-4.6 12-4.6 ${n1(w * 1.2)} 0z" fill="hsl(${(h2 + 180) % 360},80%,60%)"/>`,
    '',
  ][ac];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${bg}"/><path d="M${L} 42C${L} ${n1(top + 10)} ${n1(20 - w * .6)} ${T0} 20 ${T0}C${n1(20 + w * .6)} ${T0} ${Rr} ${n1(top + 10)} ${Rr} 42Z" fill="${bd}"/><ellipse cx="${gx}" cy="${gy}" rx="3.2" ry="1.8" fill="#fff" opacity=".45" transform="rotate(-30 ${gx} ${gy})"/>${eye(20 - ex)}${eye(20 + ex)}${mouth}${cheeks}${acc}</svg>`;
}
const avURI = seed => cached('v' + seed, () => avSVG(seed));
const avHTML = (u, sz = '') => `<span class="fd-av${sz ? ' fd-' + sz : ''}" style="background-image:${avURI(u.seed)}"></span>`;

// pictures: a palette and one of twelve compositions, all from one number
function pal(r) {
  const h = r() * 360, off = rp(r, [[30, 60, 200], [180, 30, 210], [120, 240, 60], [40, 320, 160], [150, 300, 20], [15, 330, 190]]);
  const hs = [h, ...off.map(o => h + o)].map(x => Math.round(x % 360)), s = Math.round(72 + r() * 22), l = Math.round(56 + r() * 8);
  const col = (i, dl = 0) => `hsl(${hs[i % 4]},${s}%,${clamp(l + dl, 8, 96)}%)`;
  const dark = r() < .2;
  return {
    hs, col, dark, c: [col(0), col(1, 6), col(2, -4), col(3, 10)],
    bg1: dark ? `hsl(${hs[0]},42%,13%)` : `hsl(${hs[0]},${s}%,${Math.round(87 + r() * 6)}%)`,
    bg2: dark ? `hsl(${hs[1]},48%,25%)` : `hsl(${hs[1]},${Math.round(s * .9)}%,${Math.round(74 + r() * 10)}%)`,
  };
}
function blobD(r, cx, cy, rad, n = 7, wob = .34) {
  const pts = [], a0 = r() * 6.283;
  for (let i = 0; i < n; i++) { const a = a0 + (i / n) * 6.283, k = rad * (1 - wob / 2 + r() * wob); pts.push([cx + Math.cos(a) * k, cy + Math.sin(a) * k]); }
  const f = p => `${n1(p[0])} ${n1(p[1])}`;
  let d = `M${f(pts[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${f([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${f([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${f(p2)}`;
  }
  return d + 'Z';
}
const an = (A, c, r) => (A ? ` class="${c}" style="animation-delay:${-(r() * 6).toFixed(1)}s"` : '');
const lg = (id, a, b, vert) => `<linearGradient id="${id}" x1="0" y1="0" x2="${vert ? 0 : 1}" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
function sparkles(r, H, n, A) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const z = n1(1.6 + r() * 2.6);
    s += `<g transform="translate(${n1(8 + r() * 84)} ${n1(H * (.06 + r() * .88))})"><g${an(A, 'fa-tw', r)}><path d="M0 ${-z}Q0 0 ${z} 0Q0 0 0 ${z}Q0 0 ${-z} 0Q0 0 0 ${-z}Z" fill="#fff" opacity=".92"/></g></g>`;
  }
  return s;
}
function gloss(cx, cy, rad) { const gx = n1(cx - rad * .34), gy = n1(cy - rad * .4); return `<ellipse cx="${gx}" cy="${gy}" rx="${n1(rad * .3)}" ry="${n1(rad * .15)}" fill="#fff" opacity=".42" transform="rotate(-28 ${gx} ${gy})"/>`; }
const quarter = (k, x, y, w, h) => { const X2 = n1(x + w), Y2 = n1(y + h); return `<path d="${[`M${x} ${Y2}L${x} ${y}A${w} ${h} 0 0 1 ${X2} ${Y2}Z`, `M${x} ${y}L${X2} ${y}A${w} ${h} 0 0 1 ${x} ${Y2}Z`, `M${X2} ${y}L${X2} ${Y2}A${w} ${h} 0 0 1 ${x} ${y}Z`, `M${X2} ${Y2}L${x} ${Y2}A${w} ${h} 0 0 1 ${X2} ${y}Z`][k]}"/>`; };
const ART = [
  // blobs
  (r, p, A, id, H) => {
    let s = `<defs>${lg(id + 'g', p.bg1, p.bg2, r() < .5)}</defs><rect width="100" height="${H}" fill="url(#${id}g)"/>`;
    for (let i = 0, n = 3 + Math.floor(r() * 2); i < n; i++) {
      const rad = 15 + r() * 17, cx = 16 + r() * 68, cy = H * (.16 + r() * .68);
      s += `<g${an(A, 'fa-float', r)}><path d="${blobD(r, cx, cy, rad)}" fill="${p.c[i % 4]}"/>${gloss(cx, cy, rad)}</g>`;
    }
    return s + sparkles(r, H, 3, A);
  },
  // sunset
  (r, p, A, id, H) => {
    const hz = n1(H * (.58 + r() * .08)), sr = n1(20 + r() * 9), sx = n1(28 + r() * 44), sky = p.col(0, 24);
    const h0 = p.hs[0], h3 = p.hs[3];
    let s = `<defs><linearGradient id="${id}k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${(h0 + 330) % 360},80%,88%)"/><stop offset=".6" stop-color="${sky}"/></linearGradient>${lg(id + 's', `hsl(${h3},92%,74%)`, `hsl(${(h3 + 40) % 360},92%,60%)`, 1)}</defs><rect width="100" height="${H}" fill="${sky}"/><rect width="100" height="${hz}" fill="url(#${id}k)"/><g${an(A, 'fa-bob', r)}><circle cx="${sx}" cy="${n1(hz - 2)}" r="${sr}" fill="url(#${id}s)"/>`;
    for (let i = 0; i < 4; i++) s += `<rect y="${n1(hz - sr * .5 + i * sr * .15)}" width="100" height="${n1(.8 + i * .9)}" fill="${sky}"/>`;
    s += `</g><path d="M0 ${hz}Q${n1(20 + r() * 20)} ${n1(hz - 8 - r() * 8)} 55 ${n1(hz - 1)}T100 ${n1(hz - 3)}V${H}H0Z" fill="${p.col(2, -12)}"/><path d="M0 ${n1(hz + 9)}Q${n1(45 + r() * 30)} ${n1(hz - 1)} 100 ${n1(hz + 7)}V${H}H0Z" fill="${p.col(2, -24)}"/>`;
    return s + sparkles(r, H * .4, 2, A);
  },
  // halftone
  (r, p, A, id, H) => {
    const cx = r() * 100, cy = r() * H, sp = 9, md = Math.hypot(100, H) * .8;
    let s = `<rect width="100" height="${H}" fill="${p.bg1}"/><circle cx="${n1(100 - cx)}" cy="${n1(H - cy)}" r="${n1(26 + r() * 14)}" fill="${p.c[1]}"/><g fill="${p.c[0]}"${A ? ' class="fa-pulse"' : ''}>`;
    for (let y = sp / 2, row = 0; y < H + sp; y += sp * .87, row++) {
      for (let x = row & 1 ? sp : sp / 2; x < 104; x += sp) {
        const k = 1 - Math.hypot(x - cx, y - cy) / md, rr = sp * .52 * k * k;
        if (rr > .35) s += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(rr)}"/>`;
      }
    }
    return s + '</g>';
  },
  // waves
  (r, p, A, id, H) => {
    const top = H * (.28 + r() * .14);
    let s = `<rect width="100" height="${H}" fill="${p.bg1}"/><circle cx="${n1(20 + r() * 60)}" cy="${n1(top * .55)}" r="${n1(9 + r() * 6)}" fill="${p.col(1, 14)}"/>`;
    for (let i = 0; i < 5; i++) {
      const y = top + ((H - top) * i) / 5, a = 2.5 + r() * 5, wl = 24 + r() * 18;
      let d = `M-50 ${n1(y)}`;
      for (let x = -50; x < 150; x += wl) d += `q${n1(wl / 4)} ${n1(-a)} ${n1(wl / 2)} 0t${n1(wl / 2)} 0`;
      s += `<g${A ? ` class="fa-sway${i & 1 ? ' rev' : ''}"` : ''}><path d="${d}V${H + 2}H-50Z" fill="${p.c[i % 4]}"/></g>`;
    }
    return s;
  },
  // rings
  (r, p, A, id, H) => {
    const cx = n1(r() * 100), cy = n1(H * (.2 + r() * .6));
    let s = `<rect width="100" height="${H}" fill="${p.c[3]}"/><g${A ? ' class="fa-breathe"' : ''}>`;
    for (let i = 15; i > 0; i--) s += `<circle cx="${cx}" cy="${cy}" r="${i * 9}" fill="${i & 1 ? p.c[i % 3] : p.bg1}"/>`;
    return s + '</g>' + sparkles(r, H, 2, A);
  },
  // confetti
  (r, p, A, id, H) => {
    let s = `<rect width="100" height="${H}" fill="${p.bg1}"/>`;
    for (let i = 0; i < 24; i++) {
      const c = p.c[i % 4], z = n1(2.6 + r() * 4), k = Math.floor(r() * 5), h3 = n1(z * .7);
      const sh = [
        `<circle r="${z}" fill="${c}"/>`,
        `<rect x="${-z}" y="${n1(-z / 2.6)}" width="${n1(z * 2)}" height="${n1(z / 1.3)}" rx="${n1(z / 2.6)}" fill="${c}"/>`,
        `<path d="M0 ${-z}L${z} ${n1(z * .8)}H${-z}Z" fill="${c}"/>`,
        `<path d="M${n1(-z * 1.4)} 0q${n1(z * .35)} ${-z} ${h3} 0t${h3} 0t${h3} 0t${h3} 0" fill="none" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/>`,
        `<circle r="${z}" fill="none" stroke="${c}" stroke-width="1.9"/>`,
      ][k];
      s += `<g transform="translate(${n1(r() * 100)} ${n1(r() * H)}) rotate(${Math.floor(r() * 360)})"><g${an(A, 'fa-spin', r)}>${sh}</g></g>`;
    }
    return s;
  },
  // arches
  (r, p, A, id, H) => {
    const gy = n1(H * (.7 + r() * .08)), cx = n1(28 + r() * 44);
    let s = `<rect width="100" height="${H}" fill="${p.bg1}"/><circle cx="${n1(15 + r() * 70)}" cy="${n1(H * .18)}" r="8" fill="${p.col(1, 16)}"/><g${an(A, 'fa-drift', r)}><rect x="${n1(r() * 60)}" y="${n1(H * .3)}" width="26" height="8" rx="4" fill="#fff" opacity=".85"/></g><g${A ? ' class="fa-grow"' : ''}>`;
    for (let i = 0; i < 5; i++) { const rad = 42 - i * 8; s += `<path d="M${n1(cx - rad)} ${gy}A${rad} ${rad} 0 0 1 ${n1(cx + rad)} ${gy}" fill="none" stroke="${p.c[i % 4]}" stroke-width="8.4"/>`; }
    return s + `</g><rect y="${gy}" width="100" height="${n1(H - gy + 1)}" fill="${p.col(2, 20)}"/>`;
  },
  // checkerboard and a glossy orb
  (r, p, A, id, H) => {
    const sz = 10 + Math.floor(r() * 3) * 4, h = sz / 2, rot = Math.floor(r() * 40 - 20), rad = n1(22 + r() * 7), cy = n1(H * .5);
    return `<defs><pattern id="${id}p" width="${sz}" height="${sz}" patternUnits="userSpaceOnUse" patternTransform="rotate(${rot})"><rect width="${sz}" height="${sz}" fill="${p.bg1}"/><path d="M0 0h${h}v${h}H0zM${h} ${h}h${h}v${h}h${-h}z" fill="${p.bg2}"/></pattern><radialGradient id="${id}o" cx=".36" cy=".3" r=".78"><stop offset="0" stop-color="#fff"/><stop offset=".22" stop-color="${p.col(0, 16)}"/><stop offset="1" stop-color="${p.col(0, -20)}"/></radialGradient></defs><rect width="100" height="${H}" fill="url(#${id}p)"/><ellipse cx="50" cy="${n1(cy + rad + 5)}" rx="${n1(rad * .85)}" ry="3.6" fill="#000" opacity=".18"/><g${A ? ' class="fa-bounce"' : ''}><circle cx="50" cy="${cy}" r="${rad}" fill="url(#${id}o)"/></g>`;
  },
  // a product on a pedestal
  (r, p, A, id, H) => {
    const py = n1(H * (.64 + r() * .06)), pw = n1(26 + r() * 10), k = Math.floor(r() * 3);
    const obj = [
      `<circle cx="50" cy="${n1(py - 17)}" r="17" fill="url(#${id}q)"/>`,
      `<rect x="41" y="${n1(py - 44)}" width="18" height="44" rx="9" fill="url(#${id}c)"/><path d="M41 ${n1(py - 22)}h18v13a9 9 0 0 1-18 0z" fill="${p.col(2, 4)}"/><rect x="44" y="${n1(py - 40)}" width="3.4" height="15" rx="1.7" fill="#fff" opacity=".55"/>`,
      `<rect x="42" y="${n1(py - 45)}" width="16" height="10" rx="3" fill="${p.col(2, -10)}"/><rect x="36" y="${n1(py - 37)}" width="28" height="37" rx="9" fill="url(#${id}c)"/><rect x="40" y="${n1(py - 26)}" width="20" height="11" rx="2.5" fill="#fff" opacity=".88"/><rect x="39.5" y="${n1(py - 34)}" width="3.4" height="14" rx="1.7" fill="#fff" opacity=".5"/>`,
    ][k];
    return `<defs>${lg(id + 'b', p.bg1, p.bg2, 1)}<radialGradient id="${id}q" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="${p.col(0, 14)}"/><stop offset="1" stop-color="${p.col(0, -22)}"/></radialGradient>${lg(id + 'c', p.col(1, 12), p.col(1, -14))}</defs><rect width="100" height="${H}" fill="url(#${id}b)"/><rect x="${n1(50 - pw)}" y="${py}" width="${n1(pw * 2)}" height="${n1(H - py + 1)}" fill="${p.col(3, 6)}"/><ellipse cx="50" cy="${py}" rx="${pw}" ry="${n1(pw * .22)}" fill="${p.col(3, 18)}"/><ellipse cx="50" cy="${py}" rx="${n1(pw * .55)}" ry="${n1(pw * .1)}" fill="#000" opacity=".14"/><g${A ? ' class="fa-float"' : ''}>${obj}</g>${sparkles(r, H * .6, 3, A)}`;
  },
  // tiles
  (r, p, A, id, H) => {
    const rows = Math.max(3, Math.round(H / 32)), ch = H / rows, cw = 100 / 3;
    let s = '';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < 3; x++) {
        const X = n1(x * cw), Y = n1(y * ch), w = n1(cw), h = n1(ch), bgc = r() < .3 ? p.bg1 : p.c[Math.floor(r() * 4)];
        let fc = p.c[Math.floor(r() * 4)]; if (fc === bgc) fc = p.bg1;
        const k = Math.floor(r() * 6);
        const shape = k < 4 ? quarter(k, X, Y, w, h) : k === 4 ? `<circle cx="${n1(X + w / 2)}" cy="${n1(Y + h / 2)}" r="${n1(Math.min(w, h) * .34)}"/>` : `<path d="M${X} ${n1(Y + h)}A${n1(w / 2)} ${n1(w / 2)} 0 0 1 ${n1(X + w)} ${n1(Y + h)}Z"/>`;
        s += `<rect x="${X}" y="${Y}" width="${n1(w + .4)}" height="${n1(h + .4)}" fill="${bgc}"/><g fill="${fc}"${an(A, 'fa-pulse', r)}>${shape}</g>`;
      }
    }
    return s;
  },
  // flowers
  (r, p, A, id, H) => {
    let s = `<rect width="100" height="${H}" fill="${p.bg1}"/>`;
    for (let i = 0, n = 2 + Math.floor(r() * 2); i < n; i++) {
      const x = n1(15 + r() * 70), y = n1(H * (.15 + r() * .7)), L = 11 + r() * 12, k = 6 + Math.floor(r() * 4), c = p.c[i % 4];
      let pet = '';
      for (let j = 0; j < k; j++) pet += `<ellipse cy="${n1(-L / 2)}" rx="${n1(L / 4)}" ry="${n1(L / 2)}" fill="${c}" transform="rotate(${Math.round((j * 360) / k)})"/>`;
      s += `<g transform="translate(${x} ${y})"><g${an(A, 'fa-spin-slow', r)}>${pet}</g><circle r="${n1(L * .32)}" fill="${p.c[(i + 1) % 4]}"/><circle cx="${n1(-L * .1)}" cy="${n1(-L * .12)}" r="${n1(L * .1)}" fill="#fff" opacity=".5"/></g>`;
    }
    return s + sparkles(r, H, 3, A);
  },
  // stripes and a blob
  (r, p, A, id, H) => {
    const rot = Math.floor(r() * 60 - 30), w = 8 + Math.floor(r() * 3) * 3, cols = [p.bg1, p.c[0], p.bg2, p.c[1]];
    let s = `<g transform="rotate(${rot} 50 ${n1(H / 2)})">`;
    for (let x = -80, i = 0; x < 180; x += w, i++) s += `<rect x="${x}" y="-80" width="${w + .4}" height="${H + 160}" fill="${cols[i % 4]}"/>`;
    const rad = 24 + r() * 8, cy = H / 2;
    return s + `</g><g${an(A, 'fa-float', r)}><path d="${blobD(r, 50, cy, rad, 8, .22)}" fill="${p.c[2]}"/>${gloss(50, cy, rad)}</g>`;
  },
];
const PRODUCT = 8;
function artSVG(seed, H = 125, A = false, id = 'a', style) {
  const r = rng(seed), p = pal(r), k = style == null ? Math.floor(r() * ART.length) : style;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 ${H}" preserveAspectRatio="xMidYMid slice">${ART[k](r, p, A, id, H)}</svg>`;
}
const artURI = (seed, H = 125, style) => cached(`${seed}:${H}:${style}`, () => artSVG(seed, H, false, 'a', style));
const brandC = i => `hsl(${(i * 67 + 300) % 360},72%,52%)`;

// ---------- following, events ----------
function follow(id, on = !isFol(id), quiet) {
  if (id <= 0) return false;
  if (on && !isFol(id)) {
    folSet.add(id); F.following.push(id);
    if (F.following.length > 400) folSet.delete(F.following.shift());
    S.feedFollows++; act();
    if (!quiet) { sfx.pop(4); haptic(); }
  } else if (!on && isFol(id)) {
    folSet.delete(id); F.following = F.following.filter(x => x !== id);
    if (!quiet) sfx.close();
  }
  $$(`[data-fu="${id}"]`).forEach(b => { const f = isFol(id); b.classList.toggle('on', f); b.textContent = f ? 'Following' : b.dataset.back ? 'Follow back' : 'Follow'; });
  queueCheck();
  return isFol(id);
}
// someone you follow sometimes follows you back
function maybeBack(id, force) {
  if (!force && !chance(.14)) return false;
  F.followers++; S.matches++;
  addEvent('follow', [id], { read: true });
  return true;
}
const unread = () => F.events.reduce((n, e) => n + (e.r ? 0 : 1), 0);
const myPost = id => F.myPosts.find(p => p.id === id);
function addEvent(k, us, o = {}) {
  const t = T();
  if (k === 'like') { // likes on the same post gather into one row
    const m = F.events.slice(0, 12).find(e => e.k === 'like' && e.p === o.p && t - e.ts < 120000);
    if (m) {
      for (const u of us) if (m.u.length < 2 && !m.u.includes(u)) m.u.push(u); else m.n++;
      m.n += o.n || 0;
      if (curApp !== 'activity' && m.r) { m.r = 0; refreshBadges(); } // it has news again
      m.ts = t; F.events.splice(F.events.indexOf(m), 1); F.events.unshift(m);
      APPS.activity.upsert(m);
      return m;
    }
  }
  const e = { id: ++F.eid, k, u: us.slice(0, 2), n: Math.max(0, us.length - 2) + (o.n || 0), p: o.p || null, x: o.x || '', ts: t, r: o.read || curApp === 'activity' ? 1 : 0 };
  F.events.unshift(e);
  if (F.events.length > 60) F.events.length = 60;
  APPS.activity.upsert(e);
  refreshBadges();
  return e;
}
function names(e) {
  const a = e.u.map(id => `<b>${whoOf(id).handle}</b>`);
  if (e.n) return `${a.join(', ')} and ${fmt(e.n)} ${e.n === 1 ? 'other' : 'others'}`;
  return a.join(' and ');
}
function evText(e) {
  const who = names(e);
  switch (e.k) {
    case 'like': return `${who} liked your post.`;
    case 'cmlike': return `${who} liked your comment: ${esc(e.x)}`;
    case 'comment': return `${who} commented: ${esc(e.x)}`;
    case 'mention': return `${who} mentioned you in a comment: <span class="fd-at">@${F.me.handle}</span> ${esc(e.x)}`;
    case 'follow': return `${who} started following you.`;
    case 'story': return `${who} reacted to your story: ${e.x}`;
    case 'mile': return `Your post reached <b>${fmt(+e.x)}</b> hearts.`;
    case 'suggest': return `${who}, who you might know, is on Feed.`;
    default: return who;
  }
}
const plain = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '’');
// the network keeps talking to you even when you haven't posted
function socialEvent(read) {
  const k = pickW([['follow', 5], ['mention', 2], ['suggest', 1.5], ['like', F.myPosts.length ? 4 : 0], ['comment', F.myPosts.length ? 2 : 0]]);
  const mp = F.myPosts.length ? pick(F.myPosts.slice(0, 6)) : null;
  if (k === 'follow') { F.followers++; return addEvent('follow', [stranger()], { read }); }
  if (k === 'mention') return addEvent('mention', [friend()], { x: pick(REPLIES), read });
  if (k === 'suggest') return addEvent('suggest', [stranger()], { read });
  if (k === 'like') { mp.likes++; return addEvent('like', [stranger()], { p: mp.id, read }); }
  mp.cm++; return addEvent('comment', [stranger()], { p: mp.id, x: pick(CMTS), read });
}

// ---------- stories ----------
function newStory(uid) {
  const u = uid || friend(), old = F.stories.find(s => s.u === u);
  const s = { u, v: (old ? old.v : 0) + 1, n: ri(1, 4), s: seedNew(), ts: T() };
  F.stories = [s, ...F.stories.filter(x => x.u !== u)].slice(0, 16);
  return s;
}
const liveStories = () => F.stories.filter(s => T() - s.ts < 864e5);
const storySeen = s => F.seen[s.u] === s.v;
const storyOrder = () => { const L = liveStories(); return [...L.filter(s => !storySeen(s)), ...L.filter(storySeen)]; };
function storiesHTML() {
  const me = meU(), mine = F.myStory && T() - F.myStory.ts < 864e5;
  return `<button class="fd-st" ${mine ? 'data-s="0"' : 'data-a="create"'}><span class="fd-ring${mine ? '' : ' off'}">${avHTML(me, 'sa')}<i class="fd-plus" data-a="create">${fi('plus')}</i></span><small>Your story</small></button>` +
    storyOrder().map(s => { const u = person(s.u); return `<button class="fd-st" data-s="${s.u}"><span class="fd-ring${storySeen(s) ? ' seen' : ''}">${avHTML(u, 'sa')}</span><small>${u.handle}</small></button>`; }).join('');
}
function renderStories() { const el = $('#fd-stories'); if (el) el.innerHTML = storiesHTML(); }

let SV = null;
function openStory(uid) {
  closeStory(true);
  const order = uid === 0 ? [{ u: 0, v: 1, n: 1, s: F.myStory.s, ts: F.myStory.ts, f: F.myStory.f }] : storyOrder();
  const i = Math.max(0, order.findIndex(s => s.u === uid));
  const el = html(`<div class="fd-sv" data-nodrag role="dialog" aria-label="Stories"><div class="scrim show" data-x></div>
    <div class="fd-svbox"><div class="fd-svm"></div><div class="fd-svs"></div>
      <div class="fd-svtop"><div class="fd-bars"></div><div class="fd-svh"><span class="fd-svav"></span><b></b><time></time><button class="fd-svx" data-x aria-label="Close">${fi('x')}</button></div></div>
      <div class="fd-svp" hidden>${IF('play')}</div></div>
    <div class="fd-svbot"></div></div>`);
  phone.append(el);
  SV = { el, order, i, f: 0, t: 0, last: now(), held: false, paused: false, raf: 0, shown: 0 };
  el.addEventListener('click', e => {
    if (e.target.closest('[data-x]')) { closeStory(); return; }
    const rx = e.target.closest('[data-rx]');
    if (rx) {
      const [x, y] = centerOf(rx); floatText(x, y - 20, rx.dataset.rx, 'fd-rxf');
      sfx.pop(6); haptic(); act(); earn(1, x, y - 50); toast('Reaction sent');
      return;
    }
    const v = e.target.closest('[data-v]');
    const poll = v && v.closest('.fd-poll');
    if (poll && !poll.classList.contains('done')) {
      poll.classList.add('done');
      $$('[data-v]', poll).forEach(b => b.classList.toggle('me', b === v));
      sfx.pop(3); act(); const [x, y] = centerOf(v); earn(1, x, y - 30);
    }
  });
  const box = $('.fd-svbox', el);
  box.addEventListener('pointerdown', e => {
    if (e.button > 0 || e.target.closest('button, .fd-poll')) return;
    const sx = e.clientX, sy = e.clientY, id = e.pointerId;
    let dx = 0, dy = 0, moved = false;
    const hold = setTimeout(() => { if (SV) { SV.held = true; el.classList.add('held'); } }, 220);
    const mv = ev => {
      if (ev.pointerId !== id) return;
      dx = (ev.clientX - sx) / scale; dy = (ev.clientY - sy) / scale;
      if (!moved && Math.hypot(dx, dy) > 10) { moved = true; clearTimeout(hold); }
      if (moved && dy > 0 && Math.abs(dy) > Math.abs(dx)) { box.style.transition = 'none'; box.style.transform = `translateY(${dy}px) scale(${1 - dy / 1600})`; }
    };
    const up = ev => {
      if (ev.pointerId !== id) return;
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      clearTimeout(hold); box.style.transition = ''; box.style.transform = '';
      if (!SV) return;
      const held = SV.held; SV.held = false; el.classList.remove('held');
      if (moved) { if (dy > 90 && dy > Math.abs(dx)) closeStory(); else if (Math.abs(dx) > 60) (dx < 0 ? svUser(1) : svUser(-1)); return; }
      if (held || ev.type === 'pointercancel') return;
      const r = box.getBoundingClientRect();
      if (ev.clientX - r.left < r.width * .3) svPrev(); else svNext();
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
  svShowUser();
  SV.raf = requestAnimationFrame(svTick);
  sfx.open();
}
function svShowUser() {
  const s = SV.order[SV.i], u = whoOf(s.u), el = SV.el;
  SV.paused = false; el.classList.remove('held'); $('.fd-svp', el).hidden = true;
  $('.fd-svav', el).style.backgroundImage = avURI(u.seed);
  $('.fd-svh b', el).textContent = u.handle;
  $('.fd-svh time', el).textContent = ago(s.ts);
  $('.fd-bars', el).innerHTML = Array.from({ length: s.n }, () => '<i><b></b></i>').join('');
  $('.fd-svbot', el).innerHTML = s.u === 0
    ? `<span class="fd-seen">${fi('eye')}<span>Seen by <b>${fmt(F.myStory ? F.myStory.views || 0 : 0)}</b></span></span>`
    : `<form class="fd-svf"><input class="fd-svin" type="text" placeholder="Send message" maxlength="120" enterkeyhint="send" aria-label="Reply"></form>${RX.map(x => `<button class="fd-rx" data-rx="${x}" aria-label="React ${x}">${x}</button>`).join('')}`;
  const f = $('.fd-svf', el);
  if (f) {
    const inp = $('input', f);
    ['keydown', 'keyup', 'keypress'].forEach(ev => inp.addEventListener(ev, e => { e.stopPropagation(); if (e.key === 'Escape') inp.blur(); }));
    inp.onfocus = () => { if (SV) SV.paused = true; };
    inp.onblur = () => { if (SV) SV.paused = false; };
    f.onsubmit = e => { e.preventDefault(); if (!inp.value.trim()) return; inp.value = ''; inp.blur(); toast(`Sent to ${u.handle}`); sfx.swoosh(); act(); const [x, y] = centerOf(f); earn(2, x, y - 30); };
  }
  restart($('.fd-svbox', el), 'swap');
  svFrame();
}
function svFrame() {
  const s = SV.order[SV.i], el = SV.el, r = rng(s.s + SV.f * 131);
  SV.t = 0; SV.shown = now();
  $('.fd-svm', el).style.backgroundImage = artURI(s.s + SV.f * 131, 178);
  $('.fd-svm', el).style.filter = s.f ? FILTERS[s.f][1] : '';
  $$('.fd-bars i', el).forEach((b, k) => { $('b', b).style.transform = `scaleX(${k < SV.f ? 1 : 0})`; });
  SV.bar = $$('.fd-bars b', el)[SV.f];
  const k = r(), rot = Math.round(r() * 12 - 6), top = Math.round(24 + r() * 44);
  let stk = '';
  if (s.u !== 0 && k < .45) stk = `<span class="fd-stk" style="--r:${rot}deg;top:${top}%">${rp(r, STICK)}</span>`;
  else if (s.u !== 0 && k < .66) { const q = rp(r, POLLS), a = Math.round(35 + r() * 50); stk = `<div class="fd-poll" style="--r:${rot / 2}deg;top:${top}%"><b>${q[0]}</b><div><button data-v="0" style="--p:${a}%"><span>${q[1]}</span><em>${a}%</em></button><button data-v="1" style="--p:${100 - a}%"><span>${q[2]}</span><em>${100 - a}%</em></button></div></div>`; }
  $('.fd-svs', el).innerHTML = stk;
}
function svTick(t) {
  if (!SV) return;
  const dt = Math.min(100, t - SV.last); SV.last = t;
  if (!SV.held && !SV.paused && !document.hidden) SV.t += dt;
  const k = Math.min(1, SV.t / 5200);
  if (SV.bar) SV.bar.style.transform = `scaleX(${k})`;
  if (k >= 1) svNext();
  if (SV) SV.raf = requestAnimationFrame(svTick);
}
function svMark() {
  const s = SV.order[SV.i];
  if (s.u === 0 || storySeen(s) || now() - SV.shown < 700) return;
  F.seen[s.u] = s.v; S.feedStories++;
  earn(1, FW / 2, FH * .25);
  queueCheck();
}
function svNext() { if (!SV) return; act(); if (SV.f < SV.order[SV.i].n - 1) { SV.f++; svFrame(); sfx.tick(); } else svUser(1); }
function svPrev() { if (!SV) return; if (SV.f > 0) { SV.f--; svFrame(); } else if (SV.i > 0) { SV.i--; SV.f = 0; svShowUser(); } else { SV.t = 0; } sfx.tick(); }
function svUser(d) {
  if (!SV) return;
  svMark();
  const j = SV.i + d;
  if (j < 0) { SV.f = 0; SV.t = 0; return; }
  if (j >= SV.order.length) { closeStory(); return; }
  SV.i = j; SV.f = 0; sfx.swoosh(); svShowUser();
}
function closeStory(instant) {
  if (!SV) return;
  const { el, raf } = SV;
  if (!instant) svMark();
  cancelAnimationFrame(raf); SV = null;
  if (instant || reduced) el.remove(); else { el.classList.add('out'); setTimeout(() => el.remove(), 220); }
  renderStories();
}
addEventListener('keydown', e => {
  if (!SV || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'j') { svNext(); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'k') { svPrev(); e.preventDefault(); }
  else if (e.key === ' ') { SV.paused = !SV.paused; SV.el.classList.toggle('held', SV.paused); $('.fd-svp', SV.el).hidden = !SV.paused; e.preventDefault(); }
});

// ---------- sheets: comments, share, more, people ----------
const cmHTML = c => { const u = whoOf(c.u); return `<div class="fd-c${c.fresh ? ' fd-cnew' : ''}">${avHTML(u, 'sm')}<div class="fd-cb"><div class="fd-ch"><b>${u.handle}</b>${c.au ? '<em>Author</em>' : ''}<time data-ts="${c.ts}">${ago(c.ts)}</time></div><p>${c.x}</p><small>${c.l ? `${fmt(c.l)} ${c.l === 1 ? 'like' : 'likes'} · ` : ''}<button data-rp="${u.handle}">Reply</button></small></div><button class="fd-cl" data-cl aria-label="Like comment">${fi('heart')}</button></div>`; };
function commentsSheet(it, onChange) {
  const r = rng((it.seed || 1) ^ 0x5bd1e995), n0 = Math.min(it.cm, 16), au = it.u > 0 ? it.u : 0;
  const items = Array.from({ length: n0 }, (_, i) => ({ u: stranger(r), x: esc(rp(r, CMTS)), ts: T() - (i + 1) * Math.round(2 + r() * 30) * 60000, l: Math.floor(Math.exp(r() * 6) - 1) }));
  if (au && n0 > 2) items.splice(1, 0, { u: au, au: 1, x: esc(rp(r, ['thank you 🫶', 'ily all', 'more soon 👀', '🤍🤍', 'right?!'])), ts: T() - 3 * 60000, l: Math.round(r() * 300) });
  const ph = it.u > 0 ? `Add a comment for ${person(it.u).handle}…` : 'Add a comment…', cmt = n => `${fmt(n)} ${n === 1 ? 'comment' : 'comments'}`;
  const wrap = html(`<div class="fd-cs"><div class="fd-cls">${items.length ? items.map(cmHTML).join('') : '<p class="fd-cempty">No comments yet. Start the conversation.</p>'}</div>
    <div class="fd-cdock"><div class="fd-cq">${['❤️', '🙌', '🔥', '👏', '😍', '😮', '😂', '🥹'].map(x => `<button type="button" data-q="${x}">${x}</button>`).join('')}</div>
    <form class="fd-cf">${avHTML(meU(), 'sm')}<input type="text" placeholder="${ph}" maxlength="140" enterkeyhint="send" aria-label="Comment"><button type="submit" disabled>Post</button></form></div></div>`);
  const close = sheet(cmt(it.cm), wrap);
  const list = $('.fd-cls', wrap), inp = $('input', wrap), btn = $('.fd-cf button', wrap), title = wrap.closest('.sheet') && $('h3', wrap.closest('.sheet'));
  wrap.style.minHeight = Math.round(FH * .5) + 'px';
  const bump = () => { if (title) title.textContent = cmt(it.cm); if (onChange) onChange(); };
  ['keydown', 'keyup', 'keypress'].forEach(ev => inp.addEventListener(ev, e => { e.stopPropagation(); if (e.key === 'Escape') inp.blur(); }));
  inp.oninput = () => { btn.disabled = !inp.value.trim(); };
  const send = txt => {
    txt = txt.trim(); if (!txt) return;
    $('.fd-cempty', list) && $('.fd-cempty', list).remove();
    list.prepend(html(cmHTML({ u: 0, x: esc(txt), ts: T(), l: 0, fresh: 1 })));
    it.cm++; bump(); S.feedComments++; act(); sfx.pop(3); haptic();
    const [x, y] = centerOf(btn); earn(3, x, y - 30);
    if (it.u > 0 && chance(.6)) setTimeout(() => addEvent('cmlike', [it.u], { x: txt }), ri(5000, 15000));
    queueCheck();
  };
  $('.fd-cf', wrap).onsubmit = e => { e.preventDefault(); send(inp.value); inp.value = ''; btn.disabled = true; };
  $('.fd-cq', wrap).onclick = e => { const q = e.target.closest('[data-q]'); if (q) send(q.dataset.q); };
  list.onclick = e => {
    const rp = e.target.closest('[data-rp]');
    if (rp) { inp.value = `@${rp.dataset.rp} `; btn.disabled = false; inp.focus(); return; }
    const l = e.target.closest('[data-cl]'); if (!l) return; l.classList.toggle('on'); if (l.classList.contains('on')) { sfx.pop(5); haptic(); act(); } };
  // the conversation keeps going while you read it
  const iv = setInterval(() => {
    if (!wrap.isConnected) { clearInterval(iv); return; }
    if (document.hidden || !curBundle || curBundle.id !== 'feed' || !chance(.5) || wrap.parentElement.scrollTop > 60) return;
    $('.fd-cempty', list) && $('.fd-cempty', list).remove();
    list.prepend(html(cmHTML({ u: stranger(), x: esc(pick(CMTS)), ts: T(), l: 0, fresh: 1 })));
    if (list.children.length > 40) list.lastElementChild.remove();
    it.cm++; bump();
  }, 2800);
  return close;
}
function shareSheet(it, onShared) {
  const ids = [...new Set([...F.following].reverse())].slice(0, 8);
  const c = html(`<div class="fd-shs"><div class="fd-shg">${ids.map(id => { const u = person(id); return `<button class="fd-shp" data-id="${id}">${avHTML(u, 'lg')}<i>${fi('check')}</i><small>${u.handle}</small></button>`; }).join('')}</div>
    <div class="fd-sha"><button data-x="story"><span>${fi('story')}</span><small>Add to story</small></button><button data-x="link"><span>${fi('link')}</span><small>Copy link</small></button><button data-x="more"><span>${fi('send')}</span><small>Share to…</small></button></div>
    <button class="pbtn" data-send disabled>Send</button></div>`);
  const close = sheet('Share', c), sel = new Set(), send = $('[data-send]', c);
  c.onclick = e => {
    const p = e.target.closest('.fd-shp');
    if (p) { const id = +p.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); p.classList.toggle('on', sel.has(id)); send.disabled = !sel.size; send.textContent = sel.size > 1 ? `Send separately (${sel.size})` : 'Send'; sfx.click(); return; }
    const x = e.target.closest('[data-x]');
    if (x) {
      if (x.dataset.x === 'story') { F.myStory = { s: it.seed, ts: T(), f: it.f || 0, views: 0 }; renderStories(); toast('Added to your story'); }
      else toast(x.dataset.x === 'link' ? 'Link copied' : 'Shared');
      done(); return;
    }
    if (e.target.closest('[data-send]') && sel.size) { const f = person([...sel][0]).handle; toast(sel.size > 1 ? `Sent to ${f} and ${sel.size - 1} more` : `Sent to ${f}`); done(); }
  };
  const done = () => { it.sh = (it.sh || 0) + 1; if (onShared) onShared(); act(); sfx.swoosh(); haptic(); earn(2, FW / 2, FH * .6); close(); };
}
function userSheet(id) {
  const u = person(id), r = rng(u.seed + 5);
  const c = html(`<div class="fd-us"><div class="fd-ush">${avHTML(u, 'xl')}<div class="fd-cnts"><div><b>${fmt(u.posts)}</b><small>posts</small></div><div><b>${fmt(u.fol)}</b><small>followers</small></div><div><b>${fmt(Math.round(u.fol / 7 + 80))}</b><small>following</small></div></div></div>
    <div class="fd-usn"><b>${u.name}${u.vf ? VF : ''}</b><p>${u.bio}</p></div>
    <button class="fd-fol fd-l${isFol(id) ? ' on' : ''}" data-fu="${id}">${isFol(id) ? 'Following' : 'Follow'}</button>
    <div class="fd-grid">${Array.from({ length: 9 }, () => `<span class="fd-gt" style="background-image:${artURI(Math.floor(r() * 2e9) + 1)}"></span>`).join('')}</div></div>`);
  sheet(u.handle, c);
  $('[data-fu]', c).onclick = e => { const on = follow(id); if (on) { const [x, y] = centerOf(e.currentTarget); earn(2, x, y - 30); } };
}
function moreSheet(p, el) {
  const u = p.u > 0 ? person(p.u) : null;
  const rows = [
    ['fav', 'star', 'Add to favorites'],
    ['hide', 'mute', 'Not interested'],
    u && isFol(p.u) ? ['unf', 'x', `Unfollow ${u.handle}`] : null,
    ['why', 'info', 'Why you’re seeing this post'],
  ].filter(Boolean);
  const c = html(`<div class="fd-opts">${rows.map(([k, i, t]) => `<button data-k="${k}">${fi(i)}<span>${t}</span></button>`).join('')}</div>`);
  const close = sheet('', c);
  c.onclick = e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k;
    close();
    if (k === 'fav') toast(u ? `${u.handle} added to favorites` : 'Added to favorites');
    else if (k === 'hide') { toast('You’ll see fewer posts like this'); el.style.height = el.offsetHeight + 'px'; void el.offsetHeight; el.classList.add('fd-gone'); setTimeout(() => el.remove(), 320); }
    else if (k === 'unf') { follow(p.u, false); toast(`Unfollowed ${u.handle}`); }
    else toast(p.sp >= 0 ? 'This ad matches your recent activity' : p.sug ? 'Based on posts you’ve liked' : `You follow ${u ? u.handle : 'this account'}`);
  };
}

// ---------- Home: stories, the feed, pull to refresh ----------
const posts = new Map();
let pid = 0, feedAge = 0, slot = 0, caughtAt = 0, caught = false;
function mkPost(o = {}) {
  const sp = o.sp == null ? -1 : o.sp, u = sp >= 0 ? -1 : o.u != null ? o.u : o.sug ? stranger() : friend();
  const hot = sp >= 0 ? .6 : person(u).hot * (o.sug ? 2 : 1), likes = Math.round(Math.exp(rnd(3.6, 8.4)) * hot);
  const p = {
    id: 'p' + ++pid, u, seed: seedNew(), n: sp < 0 && chance(.24) ? ri(2, 4) : 1, H: chance(.28) ? 100 : 125, cap: sp >= 0 ? pick(ADS) : pick(CAPS),
    likes, cm: Math.round(likes * rnd(.01, .06)), sh: Math.round(likes * rnd(.004, .03)),
    ts: o.fresh ? T() - ri(0, 4) * 60000 : T() - (feedAge += ri(4, 50)) * 60000, rate: likes / 2400 + (o.fresh ? .7 : .05),
    sp, pp: sp < 0 && chance(.06) ? ri(0, BRANDS.length - 1) : -1, sug: !!o.sug, loc: chance(.3) ? pick(LOCS) : '', liked: false, saved: false,
  };
  if (p.cm && sp < 0) p.top = [stranger(), pick(CMTS)];
  posts.set(p.id, p);
  return p;
}
function postHTML(p) {
  const B = p.sp >= 0 ? BRANDS[p.sp] : null, u = B ? null : whoOf(p.u), mine = p.u === 0;
  const av = B ? `<span class="fd-av fd-sm fd-brand" style="--bc:${brandC(p.sp)}">${B[0][0]}</span>` : `<button class="fd-avb" data-a="user" data-u="${p.u}" aria-label="${u.handle}">${avHTML(u, 'sm')}</button>`;
  const name = B ? B[0] : u.handle;
  const sub = B ? 'Sponsored' : p.pp >= 0 ? `Paid partnership with ${BRANDS[p.pp][0]}` : p.sug ? 'Suggested for you' : `<time data-ts="${p.ts}">${ago(p.ts)}</time>${p.loc ? ` · ${p.loc}` : ''}`;
  const fol = !B && !mine && !isFol(p.u) ? `<button class="fd-fol fd-s" data-a="follow" data-fu="${p.u}">Follow</button>` : '';
  const fl = p.f ? `;filter:${FILTERS[p.f][1]}` : '';
  const fr = i => `<div class="fd-fr" style="background-image:${artURI(p.seed + i * 7919, p.H, B ? PRODUCT : undefined)}${fl}"></div>`;
  const media = p.n > 1 ? `<div class="fd-car">${Array.from({ length: p.n }, (_, i) => fr(i)).join('')}</div><span class="fd-cnt">1/${p.n}</span><span class="fd-dts">${Array.from({ length: p.n }, (_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</span>` : fr(0);
  const cta = B ? `<button class="fd-cta" data-a="cta" style="--bc:${brandC(p.sp)}"><span>${B[1]}</span>${fi('chev')}</button>` : '';
  const top = p.top ? `<p class="fd-top"><b>${person(p.top[0]).handle}</b> ${p.top[1]}</p>` : '';
  const more = p.cm > 1 ? `<button class="fd-cml" data-a="comments">View all ${fmt(p.cm)} comments</button>` : '';
  return `<article class="fd-post${mine ? ' mine' : ''}" data-p="${p.id}"><div class="fd-ph">${av}<div class="fd-who"><b>${B ? name : `<button data-a="user" data-u="${p.u}">${name}</button>`}${u && u.vf ? VF : ''}</b><small>${sub}</small></div>${fol}<button class="fd-more" data-a="more" aria-label="More">${fi('dots')}</button></div>
    <div class="fd-media" data-a="media" style="aspect-ratio:${p.H === 100 ? '1' : '4 / 5'}">${media}</div>${cta}
    <div class="fd-bar"><button class="fd-b fd-like${p.liked ? ' on' : ''}" data-a="like" aria-label="Like">${fi('heart')}<span>${fmt(p.likes)}</span></button><button class="fd-b fd-bc" data-a="comments" aria-label="Comments">${fi('chat')}<span>${fmt(p.cm)}</span></button><button class="fd-b fd-bs" data-a="share" aria-label="Share">${fi('send')}<span>${fmt(p.sh || 0)}</span></button><button class="fd-b fd-save${p.saved ? ' on' : ''}" data-a="save" aria-label="Save">${fi('save')}</button></div>
    <p class="fd-cap"><b>${name}</b> ${p.cap}</p>${top}${more}</article>`;
}
function sugHTML() {
  const ids = [];
  while (ids.length < 6) { const id = stranger(); if (!ids.includes(id)) ids.push(id); }
  return `<section class="fd-sug"><header><b>Suggested for you</b><button data-a="seeall">See all</button></header><div class="fd-sugs">${ids.map(id => {
    const u = person(id), why = pickW([[`Followed by ${person(friend()).handle}`, 3], [`Followed by ${person(friend()).handle} + ${ri(1, 9)} more`, 3], ['New to Feed', 1], ['Popular near you', 1.5]]);
    return `<div class="fd-sc"><button class="fd-scx" data-a="dismiss" aria-label="Dismiss">${fi('x')}</button><button class="fd-avb" data-a="user" data-u="${id}" aria-label="${u.handle}">${avHTML(u, 'lg')}</button><b>${u.handle}${u.vf ? VF : ''}</b><small>${why}</small><button class="fd-fol" data-a="follow" data-fu="${id}">Follow</button></div>`;
  }).join('')}</div></section>`;
}
const caughtHTML = () => `<section class="fd-caught"><span class="fd-ck">${fi('check')}</span><b>You’re all caught up</b><small>You’ve seen all new posts from the past 3 days.</small></section><h4 class="fd-sech">Suggested posts</h4>`;
function itemEls() {
  slot++;
  if (!caught && slot >= caughtAt) { caught = true; const t = html(`<div>${caughtHTML()}</div>`); return [...t.children]; }
  if (slot % 8 === 5) return [html(postHTML(mkPost({ sp: ri(0, BRANDS.length - 1) })))];
  if (slot % 11 === 7) return [html(sugHTML())];
  return [html(postHTML(mkPost({ sug: caught })))];
}
function observe(el) { const a = APPS.posts; if (el.classList.contains('fd-post')) { a.seenIO.observe(el); } }
function moreItems(n = 4) {
  const a = APPS.posts;
  if (!a.list) return;
  const frag = document.createDocumentFragment(), made = [];
  for (let i = 0; i < n; i++) for (const el of itemEls()) { made.push(el); frag.append(el); }
  a.list.insertBefore(frag, a.sent);
  made.forEach(observe);
  // keep the page light: drop the oldest items far above you
  const items = [...a.list.children].filter(x => x !== a.sent && x.id !== 'fd-stories' && !x.classList.contains('fd-upl'));
  if (items.length > 70) {
    const keep = items[30], before = keep.offsetTop;
    for (const x of items.slice(0, 30)) { a.seenIO.unobserve(x); a.vis.delete(x); const pp = x.dataset.p && posts.get(x.dataset.p); if (pp && !pp.mine) posts.delete(x.dataset.p); x.remove(); }
    a.sc.scrollTop -= before - keep.offsetTop;
  }
  a.loadIO.unobserve(a.sent); a.loadIO.observe(a.sent);
}
function prependFresh(n) {
  const a = APPS.posts, anchor = $('#fd-stories', a.list).nextElementSibling, frag = document.createDocumentFragment(), made = [];
  for (let i = 0; i < n; i++) { const el = html(postHTML(mkPost({ fresh: true }))); el.classList.add('fd-in'); made.push(el); frag.append(el); }
  a.list.insertBefore(frag, anchor);
  made.forEach(observe);
}
function loadNew() {
  const a = APPS.posts, n = clamp(F.newPosts, 2, 8);
  F.newPosts = 0; a.pill.hidden = true; refreshBadges();
  a.sc.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  setTimeout(() => { prependFresh(n); sfx.fresh(); }, reduced ? 0 : 260);
}
async function refreshFeed() {
  S.refreshes++;
  await wait(ri(450, 850));
  const n = clamp(F.newPosts || ri(1, 4), 1, 8);
  F.newPosts = 0; APPS.posts.pill.hidden = true;
  if (chance(.5)) newStory();
  renderStories(); prependFresh(n); sfx.fresh(); refreshBadges();
}
function likePost(p, el, only, x, y) {
  const b = $('.fd-like', el);
  if (p.liked && only) { sfx.pop(5); return; }
  p.liked = !p.liked; p.likes += p.liked ? 1 : -1;
  b.classList.toggle('on', p.liked); $('span', b).textContent = fmt(p.likes);
  if (!p.liked) { sfx.close(); return; }
  act(); sfx.pop(combo % 12); haptic();
  if (x == null) [x, y] = centerOf(b);
  if (!only) burst(x, y, { n: 10, colors: ['#ff2e4d', '#ff7aa0', '#fff'], shape: 'heart', power: .8 });
  if (!p.paid) { p.paid = 1; S.feedLikes++; earn(1, x + 10, y - 26); queueCheck(); }
  if (p.u > 0 && !p.mine && chance(.04)) setTimeout(() => { if (isFol(p.u)) return; if (maybeBack(p.u, true)) toast(`${person(p.u).handle} followed you`); }, 1500);
}
function heartAt(media, e) {
  const r = media.getBoundingClientRect(), h = html(`<div class="fd-big" style="left:${(e.clientX - r.left) / scale}px;top:${(e.clientY - r.top) / scale}px;--r:${ri(-16, 16)}deg">${IF('heart')}</div>`);
  media.append(h); h.addEventListener('animationend', () => h.remove());
  const [x, y] = toLocal(e.clientX, e.clientY);
  burst(x, y, { n: 16, colors: ['#ff2e4d', '#ff7aa0', '#fff', '#ffc21a'], shape: 'heart', power: 1.1 });
  return [x, y];
}
function savePost(p, el) {
  p.saved = !p.saved;
  $('.fd-save', el).classList.toggle('on', p.saved);
  if (p.saved) { F.saved = [{ s: p.seed, H: p.H, f: p.f || 0, st: p.sp >= 0 ? PRODUCT : null }, ...F.saved.filter(x => x.s !== p.seed)].slice(0, 60); toast('Saved to your collection'); sfx.pop(2); act(); }
  else { F.saved = F.saved.filter(x => x.s !== p.seed); sfx.close(); }
}
function curPost() {
  const a = APPS.posts, top = a.sc.scrollTop, h = a.sc.clientHeight;
  let best = null, bv = 0;
  for (const el of a.vis) {
    const t = el.offsetTop - top, v = Math.min(h, t + el.offsetHeight) - Math.max(0, t);
    if (v > bv) { bv = v; best = el; }
  }
  return best;
}
function stepFeed(d) {
  const a = APPS.posts, top = a.sc.scrollTop;
  const items = [...a.list.children].filter(x => x !== a.sent && x.offsetHeight > 0);
  let t;
  if (d > 0) t = items.find(x => x.offsetTop > top + 12);
  else t = [...items].reverse().find(x => x.offsetTop < top - 12);
  a.sc.scrollTo({ top: t ? Math.max(0, t.offsetTop - 8) : d > 0 ? top + a.sc.clientHeight * .8 : 0, behavior: reduced ? 'auto' : 'smooth' });
}
function onFeedClick(e) {
  const a = e.target.closest('[data-a]'), post = e.target.closest('.fd-post'), p = post && posts.get(post.dataset.p);
  if (!a) { const st = e.target.closest('[data-s]'); if (st) openStory(+st.dataset.s); return; }
  const k = a.dataset.a;
  if (k === 'create') { openCreate(); return; }
  if (k === 'user') { const id = +a.dataset.u; if (id > 0) userSheet(id); else showTab(bundleOf('profile'), 'profile'); return; }
  if (k === 'follow') { const id = +a.dataset.fu, on = follow(id); if (on) { const [x, y] = centerOf(a); earn(2, x, y - 26); if (maybeBack(id)) setTimeout(() => toast(`${person(id).handle} followed you back`), 900); } return; }
  if (k === 'dismiss') { const c = a.closest('.fd-sc'); c.classList.add('fd-gone'); setTimeout(() => c.remove(), 300); sfx.close(); return; }
  if (k === 'seeall') { showTab(bundleOf('discover'), 'discover'); return; }
  if (k === 'cta') { sfx.click(); openApp('shop'); return; }
  if (!p) return;
  if (k === 'media') {
    const t = now();
    if (t - (p.tap || 0) < 330) { p.tap = 0; const [x, y] = heartAt(a, e); likePost(p, post, true, x, y); }
    else p.tap = t;
  } else if (k === 'like') likePost(p, post);
  else if (k === 'comments') commentsSheet(p, () => { $('.fd-bc span', post).textContent = fmt(p.cm); const m = $('.fd-cml', post); if (m) m.textContent = `View all ${fmt(p.cm)} comments`; });
  else if (k === 'share') shareSheet(p, () => { $('.fd-bs span', post).textContent = fmt(p.sh); });
  else if (k === 'save') savePost(p, post);
  else if (k === 'more') moreSheet(p, post);
}
// a new post of yours: an upload bar, then it goes live and the network notices
function publish(seed, f, cap, story) {
  const mp = { id: 'm' + T().toString(36), u: 0, seed, n: 1, H: 125, f, cap: cap || '', likes: 0, cm: 0, sh: 0, views: 0, ts: T(), pow: (4 + F.followers / 110) * rnd(.75, 1.5) * (chance(.08) ? 4 : 1), ms: 0, mine: true };
  F.myPosts.unshift(mp);
  if (F.myPosts.length > 30) F.myPosts.length = 30;
  if (story) F.myStory = { s: seed, ts: T(), f, views: 0 };
  S.feedPosts++; act();
  posts.set(mp.id, mp);
  const B = bundleOf('posts');
  if (curApp !== 'posts') showTab(B, 'posts', true);
  const a = APPS.posts;
  renderStories();
  const bar = html(`<div class="fd-upl"><span class="fd-uth" style="background-image:${artURI(seed)}${f ? `;filter:${FILTERS[f][1]}` : ''}"></span><span class="fd-ut"><b>Posting…</b><i><b></b></i></span></div>`);
  a.list.insertBefore(bar, $('#fd-stories', a.list).nextElementSibling);
  a.sc.scrollTo({ top: 0 });
  requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('go')));
  setTimeout(() => {
    $('.fd-ut b', bar).textContent = 'Your post is live';
    bar.classList.add('done');
    const el = html(postHTML(mp)); el.classList.add('fd-in');
    a.list.insertBefore(el, bar.nextElementSibling); observe(el);
    sfx.win(); haptic(true); confetti(60);
    earn(40, FW / 2, FH * .35, { raw: true });
    if (F.pDay !== TODAY) {
      F.pStreak = F.pDay === TODAY - 1 ? F.pStreak + 1 : 1; F.pDay = TODAY;
      setTimeout(() => { earn(20 * Math.min(7, F.pStreak), FW / 2, FH * .45, { raw: true }); toast(F.pStreak > 1 ? `${F.pStreak}-day posting streak` : 'First post today'); }, 700);
    }
    queueCheck();
    setTimeout(() => { bar.style.height = bar.offsetHeight + 'px'; void bar.offsetHeight; bar.classList.add('fd-gone'); setTimeout(() => bar.remove(), 320); }, 1800);
  }, 1500);
  save();
}
// likes, comments and followers pour in for the first minutes, then slow to a trickle
function growPost(mp, t) {
  const age = (t - mp.ts) / 1000;
  if (age > 900 || age < 2) return;
  const rate = mp.pow * Math.exp(-age / 28) + .06, add = Math.floor(rate * rnd(.5, 1.5) + R());
  if (add > 0) {
    mp.likes += add; mp.views += add * ri(2, 5);
    const us = []; for (let i = 0; i < Math.min(add, 2); i++) us.push(stranger());
    addEvent('like', us, { p: mp.id, n: Math.max(0, add - 2) });
  }
  if (F.myStory && F.myStory.s === mp.seed) F.myStory.views = Math.round(mp.views * .4);
  if (chance(Math.min(.45, rate * .04))) { mp.cm++; addEvent('comment', [stranger()], { p: mp.id, x: pick(CMTS) }); }
  if (chance(Math.min(.5, rate * .05))) { F.followers++; F.gained++; if (chance(.4)) addEvent('follow', [stranger()]); }
  for (const m of [100, 500, 1000, 5000, 10000]) if (mp.likes >= m && mp.ms < m) { mp.ms = m; addEvent('mile', [], { p: mp.id, x: m }); if (m >= 1000) alertOnce('fd-mile', 'activity', `Your post reached ${fmt(m)} hearts`, 120000); }
  if (age > 14 && !mp.n1 && mp.likes > 2) { mp.n1 = 1; alertOnce('fd-hearts', 'activity', `${person(stranger()).handle} and ${fmt(mp.likes - 1)} others liked your post`, 60000); }
  if (age > 55 && !mp.n2) { mp.n2 = 1; alertOnce('fd-reach', 'profile', `Your post has reached ${fmt(mp.views)} accounts`, 90000); }
}
function feedBg() {
  if (!F.me || !S.onboarded) return;
  const t = T();
  if (curApp !== 'posts' && chance(.014) && F.newPosts < 30) F.newPosts += ri(1, 2);
  if (curApp !== 'clips' && chance(.012) && F.newClips < 30) F.newClips++;
  if (chance(.008)) { newStory(); if (curApp !== 'posts' && !SV) renderStories(); }
  const boost = F.myPosts.length && t - F.myPosts[0].ts < 120000;
  if (chance(boost ? .05 : .01)) F.requests = Math.min(99, F.requests + 1);
  if (chance(.011)) socialEvent();
  if (chance(.03)) F.visits++;
  if (chance(.012)) { F.followers++; F.gained++; }
  for (const mp of F.myPosts.slice(0, 4)) growPost(mp, t);
  if (tickN % 40 === 0 && S.supers < 3) S.supers++;
}
function feedInit() {
  if (!F.me) {
    const u = person(ri(5000, 9000));
    F.me = { handle: u.handle, name: u.name.split(' ')[0], bio: pick(BIOS), seed: u.seed };
    F.followers = ri(180, 420); F.visits = ri(3, 12); F.requests = ri(2, 5); F.newPosts = ri(4, 9); F.newClips = ri(3, 8);
    const fol = new Set(); while (fol.size < 42) fol.add(ri(1, 4999));
    F.following = [...fol];
  }
  folSet = new Set(F.following);
  if (!liveStories().length) for (let i = 0; i < 10; i++) newStory();
  if (!F.events.length) { socialEvent(); socialEvent(); socialEvent(); }
  if (F.myStory && T() - F.myStory.ts > 864e5) F.myStory = null;
  caughtAt = ri(10, 14);
  APPS.profile.tag = '@' + F.me.handle;
}
def({
  id: 'posts', name: 'Home', tag: 'Following', c: '#7b61ff',
  badge: () => Math.min(99, F.newPosts),
  ping: () => { const u = person(friend()); F.newPosts = Math.min(99, F.newPosts + ri(1, 3)); return pick([`${u.handle} shared a new post`, `${u.handle} posted for the first time in a while`, `New posts from ${u.handle} and ${ri(2, 9)} others`]); },
  bg: feedBg,
  init: feedInit,
  build(b, right) {
    right.innerHTML = `<button class="fd-hb" aria-label="New post">${fi('plus')}</button>`;
    $('.fd-hb', right).onclick = openCreate;
    b.innerHTML = `<div class="scroller fd-home" id="fd-sc">${spinner}<div class="ptr-body" id="fd-list"><div class="fd-stories" id="fd-stories"></div><div class="fd-sent" id="fd-sent"></div></div></div><button class="fd-pill" id="fd-pill" hidden>${fi('up')}<span class="fd-pav"></span><span>New posts</span></button>`;
    this.sc = $('#fd-sc', b); this.list = $('#fd-list', b); this.sent = $('#fd-sent', b); this.pill = $('#fd-pill', b);
    this.vis = new Set();
    this.seenIO = new IntersectionObserver(es => es.forEach(e => {
      const el = e.target;
      if (e.isIntersecting) this.vis.add(el); else this.vis.delete(el);
      if (e.intersectionRatio >= .55 && !el._seen) { el._seen = 1; S.feedSeen++; S.cards++; }
    }), { root: this.sc, threshold: [0, .55] });
    this.loadIO = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) moreItems(); }, { root: this.sc, rootMargin: '0px 0px 900px 0px' });
    renderStories();
    for (const mp of F.myPosts.slice(0, 1)) if (T() - mp.ts < 36e5) { posts.set(mp.id, mp); this.list.insertBefore(html(postHTML(mp)), this.sent); }
    moreItems(5);
    this.list.addEventListener('click', onFeedClick);
    // carousels: dots and the counter follow the swipe
    this.list.addEventListener('scroll', e => {
      const c = e.target; if (!c.classList || !c.classList.contains('fd-car')) return;
      const i = Math.round(c.scrollLeft / Math.max(1, c.clientWidth)), m = c.parentElement;
      $$('.fd-dts i', m).forEach((d, k) => d.classList.toggle('on', k === i));
      $('.fd-cnt', m).textContent = `${i + 1}/${c.children.length}`;
    }, true);
    this.pill.onclick = loadNew;
    this.ptr = PTR(this.sc, refreshFeed);
    track(this.sc);
  },
  open() {
    this.pillAt = now() + 1200;
    if (F.newPosts && this.sc.scrollTop < 60) { prependFresh(clamp(F.newPosts, 1, 8)); F.newPosts = 0; }
  },
  close() { closeOverlays(); },
  tick() {
    for (const el of this.vis) {
      const p = posts.get(el.dataset.p);
      if (!p) continue;
      if (!p.mine && chance(Math.min(.9, .3 + p.rate))) p.likes += ri(1, 1 + Math.round(p.rate * 3));
      const s = el._lc || (el._lc = $('.fd-like span', el)), v = fmt(p.likes);
      if (s.textContent !== v) s.textContent = v;
    }
    const show = F.newPosts > 0 && now() > this.pillAt && this.sc.scrollTop > 240;
    if (show === this.pill.hidden) {
      if (show) $('.fd-pav', this.pill).innerHTML = [0, 1, 2].map(() => avHTML(person(friend()), 'xs')).join('');
      this.pill.hidden = !show;
    }
  },
  key(e) {
    if (e.type !== 'keydown') return e.key === ' ';
    const k = e.key;
    if (k === 'ArrowDown' || k === 'j') { stepFeed(1); return true; }
    if (k === 'ArrowUp' || k === 'k') { stepFeed(-1); return true; }
    if (k === 'r') { this.ptr.trigger(); return true; }
    const el = curPost(), p = el && posts.get(el.dataset.p);
    if (!p) return false;
    if (k === ' ' || k === 'Enter' || k === 'l') { likePost(p, el, k !== 'l'); if (k !== 'l' && p.liked) restart($('.fd-media', el), 'fd-thump'); return true; }
    if (k === 'c') { $('.fd-bc', el).click(); return true; }
    if (k === 's') { savePost(p, el); return true; }
  },
});

// ---------- create: pick a picture, a filter, a caption; share ----------
let NP = null;
function openCreate() {
  closeCreate(); closeStory(true);
  const picks = Array.from({ length: 12 }, seedNew), chips = [...CHIPS].sort(() => R() - .5).slice(0, 10);
  NP = { picks, sel: picks[0], f: 0, caps: [], step: 1 };
  const el = html(`<div class="fd-np" role="dialog" aria-label="New post"><div class="scrim show" data-x></div>
    <header class="fd-nph"><button class="fd-npx" data-k="back" aria-label="Close">${fi('x')}</button><b>New post</b><button class="fd-npn" data-k="next">Next</button></header>
    <div class="fd-npbody">
      <div class="fd-npv"><div class="fd-fr"></div><span class="fd-npfn"></span></div>
      <div class="fd-np1"><div class="fd-npl"><b>Recents</b><small>${picks.length} items</small></div><div class="fd-npg">${picks.map((s, i) => `<button class="fd-npt${i ? '' : ' on'}" data-pick="${s}" style="background-image:${artURI(s)}" aria-label="Picture ${i + 1}"></button>`).join('')}</div></div>
      <div class="fd-np2" hidden>
        <div class="fd-npl"><b>Filter</b></div><div class="fd-npf">${FILTERS.map(([n, f], i) => `<button class="fd-nff${i ? '' : ' on'}" data-f="${i}"><span style="filter:${f}"></span><small>${n}</small></button>`).join('')}</div>
        <div class="fd-npl"><b>Caption</b><small>Tap to add</small></div><div class="fd-npc">${chips.map(c => `<button data-c="${esc(c)}">${c}</button>`).join('')}</div>
        <label class="fd-npo"><span><b>Also share to your story</b><small>Visible for 24 hours</small></span><input type="checkbox" class="sw" checked></label>
        <button class="pbtn fd-npgo" data-k="share">Share</button>
      </div>
    </div></div>`);
  phone.append(el); NP.el = el;
  $('.fd-npv', el).style.height = Math.round(clamp(FH * .4, 200, 380)) + 'px';
  const upd = () => {
    const fr = $('.fd-npv .fd-fr', el);
    fr.style.backgroundImage = artURI(NP.sel); fr.style.filter = FILTERS[NP.f][1];
    $('.fd-npfn', el).textContent = NP.step === 2 && NP.f ? FILTERS[NP.f][0] : '';
    $$('.fd-nff span', el).forEach(s => { s.style.backgroundImage = artURI(NP.sel); });
  };
  const step = n => {
    NP.step = n;
    $('.fd-np1', el).hidden = n !== 1; $('.fd-np2', el).hidden = n !== 2;
    $('.fd-npn', el).textContent = n === 1 ? 'Next' : 'Share'; $('.fd-npn', el).dataset.k = n === 1 ? 'next' : 'share';
    $('.fd-npx', el).innerHTML = fi(n === 1 ? 'x' : 'back');
    $('.fd-npbody', el).scrollTop = 0;
    upd();
  };
  el.addEventListener('click', e => {
    if (e.target.closest('[data-x]')) { closeCreate(); return; }
    const t = e.target.closest('[data-pick],[data-f],[data-c],[data-k]');
    if (!t) return;
    if (t.dataset.pick) { NP.sel = +t.dataset.pick; $$('.fd-npt', el).forEach(x => x.classList.toggle('on', x === t)); sfx.click(); upd(); }
    else if (t.dataset.f) { NP.f = +t.dataset.f; $$('.fd-nff', el).forEach(x => x.classList.toggle('on', x === t)); sfx.click(); upd(); restart($('.fd-npv', el), 'fd-thump'); }
    else if (t.dataset.c) { const c = t.dataset.c, i = NP.caps.indexOf(c); if (i >= 0) NP.caps.splice(i, 1); else if (NP.caps.length < 3) NP.caps.push(c); else { sfx.nope(); return; } t.classList.toggle('on', i < 0); sfx.pop(i < 0 ? 4 : 1); }
    else if (t.dataset.k === 'back') { if (NP.step === 2) step(1); else closeCreate(); sfx.click(); }
    else if (t.dataset.k === 'next') { step(2); sfx.click(); }
    else if (t.dataset.k === 'share') {
      const { sel, f, caps } = NP, story = $('.fd-npo input', el).checked;
      closeCreate();
      publish(sel, f, caps.join(' · '), story);
    }
  });
  upd();
  sfx.open();
}
function closeCreate() { if (!NP) return; const el = NP.el; NP = null; el.classList.add('out'); setTimeout(() => el.remove(), 220); }
function closeOverlays() { closeStory(true); closeCreate(); }

// ---------- Clips: full-screen, autoplay, one after another ----------
let clipCur = null, clipRaf = 0, clipLast = 0, clipTap = 0, clipTimer = 0, cid = 0;
function mkClip() {
  const u = chance(.3) ? friend() : stranger(), U = person(u), seed = seedNew(), likes = Math.round(Math.exp(rnd(6, 12.6)));
  const c = { id: ++cid, u, seed, d: ri(6500, 11000), el: 0, likes, views: likes * ri(8, 30), cm: Math.round(likes * rnd(.01, .04)), sh: Math.round(likes * rnd(.01, .06)), cap: pick(CAPS), liked: false, seen: false, vt: 0, saved: false };
  const el = html(`<section class="fd-clip" data-c="${c.id}"><div class="fd-cart">${artSVG(seed, 178, true, 'c' + c.id)}</div><div class="fd-cshade"></div>
    <div class="fd-ctop">${fi('eye')}<span class="fd-cvw">${fmt(c.views)}</span></div>
    <div class="fd-cinfo"><div class="fd-cwho"><button data-a="user"><b>@${U.handle}</b></button>${U.vf ? VF : ''}</div><p>${c.cap}</p><div class="fd-csnd">${fi('note')}<span><span>Original audio · ${U.handle}&emsp;Original audio · ${U.handle}&emsp;</span></span></div></div>
    <div class="fd-crail"><button class="fd-rf${isFol(u) ? ' on' : ''}" data-a="${isFol(u) ? 'user' : 'follow'}" aria-label="Follow ${U.handle}">${avHTML(U, 'md')}<i>${fi('plus')}</i></button><button class="fd-rb fd-rl" data-a="like" aria-label="Like">${fi('heart')}<span>${fmt(c.likes)}</span></button><button class="fd-rb fd-rc" data-a="comments" aria-label="Comments">${fi('chat')}<span>${fmt(c.cm)}</span></button><button class="fd-rb fd-rs" data-a="share" aria-label="Share">${fi('send')}<span>${fmt(c.sh)}</span></button><button class="fd-rb fd-rv" data-a="save" aria-label="Save">${fi('save')}</button></div>
    <div class="fd-cnext">Up next in <b>2</b></div><div class="fd-cprog"><i></i></div><div class="fd-cpz">${IF('play')}</div></section>`);
  el._c = c;
  return el;
}
function addClips(n) { const a = APPS.clips; for (let i = 0; i < n; i++) { const c = mkClip(); a.lp.append(c); a.io.observe(c); } }
function clipTick(t) {
  if (curApp !== 'clips') { clipRaf = 0; return; }
  const dt = Math.min(100, t - clipLast); clipLast = t;
  const c = clipCur;
  if (c && !document.hidden && !c.classList.contains('held') && !$('.scrim.show')) {
    const k = c._c;
    k.el += dt;
    if (k.el > 1500 && !k.seen) {
      k.seen = true; S.clips++; S.earn++; earn(2, FW / 2, FH * .42);
      if (S.earn >= 3) { S.earn = 0; S.energy++; sfx.coin(); toast('+1 free spin in Slots'); }
      queueCheck();
    }
    const p = Math.min(1, k.el / k.d), left = Math.ceil((k.d - k.el) / 1000);
    if (!c._bar) { c._bar = $('.fd-cprog i', c); c._nx = $('.fd-cnext', c); c._nb = $('.fd-cnext b', c); c._vw = $('.fd-cvw', c); }
    c._bar.style.transform = `scaleX(${p})`;
    const soon = left <= 2 && p < 1;
    if (soon !== c._nx.classList.contains('show')) c._nx.classList.toggle('show', soon);
    if (soon && c._nb.textContent !== String(left)) c._nb.textContent = left;
    if (p >= 1 && !k.done) { k.done = true; APPS.clips.lp.scrollBy({ top: APPS.clips.lp.clientHeight, behavior: reduced ? 'auto' : 'smooth' }); }
    k.vt += dt; if (k.vt > 650) { k.vt = 0; k.views += ri(3, 80); c._vw.textContent = fmt(k.views); }
  }
  clipRaf = requestAnimationFrame(clipTick);
}
function likeClip(c, only, x, y) {
  const k = c._c, b = $('.fd-rl', c);
  if (k.liked && only) { sfx.pop(5); return; }
  k.liked = !k.liked; k.likes += k.liked ? 1 : -1;
  b.classList.toggle('on', k.liked); $('span', b).textContent = fmt(k.likes);
  if (!k.liked) { sfx.close(); return; }
  act(); sfx.pop(combo % 12); haptic();
  if (x == null) [x, y] = centerOf(b);
  burst(x, y, { n: 12, colors: ['#ff2e4d', '#ff7aa0', '#fff'], shape: 'heart' });
  if (!k.paid) { k.paid = true; S.feedLikes++; earn(2, x - 30, y - 20); queueCheck(); }
}
function pauseClip(c, on = !c.classList.contains('held')) { c.classList.toggle('held', on); sfx.click(); }
def({
  id: 'clips', name: 'Clips', tag: 'For you', c: '#ff3d7f',
  badge: () => Math.min(99, F.newClips),
  ping: () => { F.newClips = Math.min(99, F.newClips + 1); const u = person(chance(.5) ? friend() : stranger()); return pick([`${u.handle} posted a new clip`, `A clip from ${u.handle} is getting a lot of views`, `${u.handle} and ${ri(2, 8)} others posted new clips`]); },
  build(b) {
    b.innerHTML = '<div class="fd-clips idle" id="fd-clips"></div>';
    this.lp = $('#fd-clips', b);
    this.io = new IntersectionObserver(es => es.forEach(e => {
      const c = e.target;
      if (e.intersectionRatio >= .6) {
        c.classList.add('play');
        if (clipCur === c) return;
        if (clipCur) { clipCur.classList.remove('held'); $('.fd-cnext', clipCur).classList.remove('show'); }
        clipCur = c; c._c.el = 0; c._c.done = false;
        const kids = this.lp.children, i = Array.prototype.indexOf.call(kids, c);
        if (i > kids.length - 4) addClips(5);
        if (i > 0) { $$('.fd-hint', this.lp).forEach(x => x.remove()); F.hint = true; }
        if (i > 50) { // drop old clips so the page stays light
          const h = this.lp.clientHeight;
          for (let j = 0; j < 30; j++) { this.io.unobserve(kids[0]); kids[0].remove(); }
          this.lp.style.scrollSnapType = 'none'; this.lp.scrollTop -= h * 30; requestAnimationFrame(() => { this.lp.style.scrollSnapType = ''; });
        }
        if (curApp === 'clips') { sfx.tick(); haptic(); }
      } else c.classList.remove('play');
    }), { root: this.lp, threshold: [0, .6] });
    addClips(6);
    if (!F.hint) this.lp.firstElementChild.insertAdjacentHTML('beforeend', `<div class="fd-hint">${fi('up')}Swipe up for more</div>`);
    track(this.lp);
    this.lp.addEventListener('click', e => {
      const c = e.target.closest('.fd-clip'); if (!c) return;
      const a = e.target.closest('[data-a]'), k = c._c;
      if (a) {
        const x = a.dataset.a;
        if (x === 'like') likeClip(c);
        else if (x === 'comments') { pauseClip(c, true); commentsSheet(k, () => { $('.fd-rc span', c).textContent = fmt(k.cm); }); }
        else if (x === 'share') shareSheet(k, () => { $('.fd-rs span', c).textContent = fmt(k.sh); });
        else if (x === 'save') { k.saved = !k.saved; a.classList.toggle('on', k.saved); if (k.saved) { F.saved = [{ s: k.seed, H: 125, f: 0 }, ...F.saved].slice(0, 60); toast('Saved to your collection'); sfx.pop(2); } else sfx.close(); }
        else if (x === 'follow') { follow(k.u, true); a.classList.add('on'); a.dataset.a = 'user'; $('i', a).innerHTML = fi('check'); const [fx, fy] = centerOf(a); earn(2, fx - 30, fy); if (maybeBack(k.u)) setTimeout(() => toast(`${person(k.u).handle} followed you back`), 900); }
        else if (x === 'user') userSheet(k.u);
        return;
      }
      const t = now();
      if (t - clipTap < 280) {
        clearTimeout(clipTimer); clipTap = 0;
        const r = c.getBoundingClientRect(), h = html(`<div class="fd-big" style="left:${(e.clientX - r.left) / scale}px;top:${(e.clientY - r.top) / scale}px;--r:${ri(-16, 16)}deg">${IF('heart')}</div>`);
        c.append(h); h.addEventListener('animationend', () => h.remove());
        const [x, y] = toLocal(e.clientX, e.clientY);
        likeClip(c, true, x, y);
      } else { clipTap = t; clipTimer = setTimeout(() => pauseClip(c), 280); }
    });
  },
  open() { F.newClips = 0; this.lp.classList.remove('idle'); clipLast = now(); if (!clipRaf) clipRaf = requestAnimationFrame(clipTick); },
  close() { this.lp.classList.add('idle'); cancelAnimationFrame(clipRaf); clipRaf = 0; closeOverlays(); },
  key(e) {
    if (e.type !== 'keydown') return e.key === ' ';
    const k = e.key, h = this.lp.clientHeight;
    if (k === 'ArrowDown' || k === 'j') { this.lp.scrollBy({ top: h, behavior: 'smooth' }); return true; }
    if (k === 'ArrowUp' || k === 'k') { this.lp.scrollBy({ top: -h, behavior: 'smooth' }); return true; }
    if (!clipCur) return false;
    if (k === ' ') { pauseClip(clipCur); return true; }
    if (k === 'Enter' || k === 'l') { likeClip(clipCur, k === 'Enter'); return true; }
    if (k === 'c') { $('.fd-rc', clipCur).click(); return true; }
  },
});

// ---------- Discover: swipe through people ----------
let reqList = [];
const syncReqs = () => { while (reqList.length < F.requests) reqList.push(stranger()); reqList.length = Math.min(reqList.length, F.requests); };
const cardEl = () => {
  const u = person(stranger()), mut = pickW([[`Followed by ${person(friend()).handle} and ${ri(2, 14)} others`, 3], [`${ri(2, 9)} mutual friends`, 2], ['New to Feed', 1], ['Popular near you', 1]]);
  return html(`<div class="fd-pc" data-u="${u.id}"><div class="fd-pcart" style="background-image:${artURI(u.seed, 150)}"></div><div class="fd-pcg"></div>
    <b class="fd-stamp yes">FOLLOW</b><b class="fd-stamp no">SKIP</b>
    <div class="fd-pci"><div class="fd-pch">${avHTML(u, 'lg')}<div><b>${u.name}${u.vf ? VF : ''}</b><small>@${u.handle}</small></div></div><p>${u.bio}</p><div class="fd-pcs"><span><b>${fmt(u.posts)}</b> posts</span><span><b>${fmt(u.fol)}</b> followers</span></div><small class="fd-pcm">${mut}</small></div></div>`);
};
const topCard = () => $$('.fd-pc', $('#fd-deck')).filter(c => !c._gone).pop();
function armCard() {
  const c = topCard(); if (!c || c._armed) return;
  c._armed = true; c.classList.add('top');
  const yes = $('.fd-stamp.yes', c), no = $('.fd-stamp.no', c);
  drag(c, {
    axis: 'any',
    onMove: (dx, dy) => { c.style.transition = 'none'; c.style.transform = `translate(${dx}px, ${dy * .4}px) rotate(${dx / 18}deg)`; yes.style.opacity = clamp(dx / 80, 0, 1); no.style.opacity = clamp(-dx / 80, 0, 1); },
    onEnd: (dx, dy) => {
      if (dx > 90) flingCard(1); else if (dx < -90) flingCard(-1); else if (dy < -110) flingCard(0);
      else { c.style.transition = 'transform .28s var(--spring)'; c.style.transform = ''; yes.style.opacity = no.style.opacity = 0; }
    },
  });
}
function flingCard(dir) {
  const c = topCard(); if (!c) return;
  if (dir === 0 && S.supers <= 0) { sfx.nope(); toast('No super follows left. One more arrives soon.'); c.style.transition = 'transform .25s'; c.style.transform = ''; return; }
  const id = +c.dataset.u;
  c._gone = true;
  c.style.transition = 'transform .3s ease-in, opacity .3s';
  c.style.transform = dir === 0 ? 'translate(0,-760px) scale(.9)' : `translate(${dir * 560}px, 40px) rotate(${dir * 26}deg)`;
  c.style.opacity = '0';
  setTimeout(() => c.remove(), 320);
  $('#fd-deck').prepend(cardEl());
  armCard();
  S.swipes++; act(); sfx.swoosh(); haptic();
  const [x, y] = centerOf($('#fd-deck'));
  if (dir === 0) { S.supers--; follow(id, true, true); earn(3, x, y); setTimeout(() => mutual(id), 200); }
  else if (dir > 0) { follow(id, true, true); earn(2, x, y); if (chance(.18)) setTimeout(() => mutual(id), 200); }
  else earn(1, x, y);
  APPS.discover.render();
}
function mutual(id) {
  const a = APPS.discover, u = person(id);
  maybeBack(id, true);
  const m = html(`<div class="fd-mut"><div class="fd-two">${avHTML(meU(), 'xl')}${avHTML(u, 'xl')}</div><b>You follow each other</b><small>You and ${u.handle} can now see each other’s stories.</small><button class="pbtn" data-w>Send a wave 👋</button><button class="link" data-k>Keep swiping</button></div>`);
  a.body.append(m);
  sfx.match(); haptic(true);
  const [x, y] = centerOf($('.fd-two', m)); burst(x, y, { n: 30, colors: ['#fff', '#ffd6e8', '#ff2e4d'], shape: 'heart', power: 1.4 });
  earn(25, x, y - 90);
  const t = setTimeout(() => m.remove(), 3400);
  m.onclick = e => {
    if (e.target.closest('[data-w]')) { clearTimeout(t); toast(`Wave sent to ${u.handle}`); sfx.pop(7); act(); earn(3, x, y); m.remove(); }
    else if (e.target.closest('[data-k]')) { clearTimeout(t); m.remove(); }
  };
  queueCheck(); refreshBadges();
}
function requestsSheet() {
  syncReqs();
  const n = F.requests;
  if (!n) { toast('No follow requests right now'); return; }
  const c = html('<div class="fd-rqs"></div>');
  const close = sheet('Follow requests', c);
  const draw = () => {
    syncReqs();
    if (!F.reveal) {
      c.innerHTML = `<div class="fd-rqb">${reqList.slice(0, 9).map(id => `<span>${avHTML(person(id), 'lg')}<i></i></span>`).join('')}</div><p class="fine">${fmt(F.requests)} ${F.requests === 1 ? 'person wants' : 'people want'} to follow you.</p><button class="pbtn" data-rv style="--c:#ff4fa3">${IF('bolt')}See who · 300</button>`;
      return;
    }
    c.innerHTML = (F.requests ? `<button class="fd-rqall" data-all>Confirm all ${fmt(F.requests)}</button>` : '<p class="fine">You’re all set.</p>') + reqList.slice(0, 30).map(id => { const u = person(id); return `<div class="fd-rq">${avHTML(u, 'md')}<span class="fd-rqn"><b>${u.handle}</b><small>${u.name}</small></span><button class="fd-fol" data-ok="${id}">Confirm</button><button class="fd-rqx" data-no="${id}" aria-label="Delete">${fi('x')}</button></div>`; }).join('');
  };
  const drop = id => { reqList = reqList.filter(x => x !== id); F.requests = Math.max(0, F.requests - 1); if (!F.requests) F.reveal = false; };
  c.onclick = e => {
    if (e.target.closest('[data-rv]')) {
      if (!spend(300)) return;
      F.reveal = true; sfx.unlock(); haptic(true);
      $('.fd-rqb', c).classList.add('open');
      setTimeout(draw, 700);
      return;
    }
    if (e.target.closest('[data-all]')) {
      const k = F.requests; F.followers += k; F.gained += k; reqList = []; F.requests = 0; F.reveal = false;
      sfx.big(); act(); earn(Math.min(40, k * 2), FW / 2, FH * .5); toast(`${fmt(k)} new followers`); close();
    }
    const ok = e.target.closest('[data-ok]'), no = e.target.closest('[data-no]');
    if (ok) { const id = +ok.dataset.ok; drop(id); F.followers++; F.gained++; sfx.pop(4); act(); const [x, y] = centerOf(ok); earn(1, x, y - 20); ok.closest('.fd-rq').remove(); if (!F.requests) draw(); }
    if (no) { drop(+no.dataset.no); no.closest('.fd-rq').remove(); sfx.close(); if (!F.requests) draw(); }
    APPS.discover.render(); refreshBadges();
  };
  draw();
}
def({
  id: 'discover', name: 'Discover', tag: 'People you may know', c: '#ff4fa3',
  badge: () => Math.min(99, F.requests),
  ping: () => { F.requests = Math.min(99, F.requests + ri(1, 2)); return `${F.requests} ${F.requests === 1 ? 'person wants' : 'people want'} to follow you`; },
  wait: () => (F.requests ? [{ t: `${F.requests} ${F.requests === 1 ? 'person wants' : 'people want'} to follow you`, r: F.reveal ? '' : 'See who' }] : []),
  build(b, right) {
    right.innerHTML = `<span class="chip fd-mc" title="Mutuals">${IF('heart')}<span id="fd-mcn"></span></span>`;
    b.innerHTML = `<div class="fd-disc"><button class="fd-reqb" id="fd-reqb"><span class="fd-blur" id="fd-blur"></span><span class="fd-reqt"><b id="fd-reqn"></b><small id="fd-reqs"></small></span>${fi('chev')}</button>
      <div class="fd-deck" id="fd-deck"></div>
      <div class="fd-dbtns"><button class="fd-db no" aria-label="Skip">${fi('x')}</button><button class="fd-db sup" aria-label="Super follow">${IF('star')}<small id="fd-sup"></small></button><button class="fd-db yes" aria-label="Follow">${fi('userplus')}</button></div></div>`;
    const deck = $('#fd-deck', b);
    for (let i = 0; i < 3; i++) deck.append(cardEl());
    armCard();
    $('.fd-db.no', b).onclick = () => flingCard(-1);
    $('.fd-db.yes', b).onclick = () => flingCard(1);
    $('.fd-db.sup', b).onclick = () => flingCard(0);
    $('#fd-reqb', b).onclick = requestsSheet;
  },
  render() {
    if (!this.view) return;
    syncReqs();
    const n = F.requests;
    $('#fd-reqb').classList.toggle('none', !n);
    $('#fd-reqn').textContent = n ? `${fmt(n)} ${n === 1 ? 'person wants' : 'people want'} to follow you` : 'No new requests';
    $('#fd-reqs').textContent = n ? (F.reveal ? 'Tap to review' : 'Tap to see who') : 'We’ll let you know';
    const sig = reqList.slice(0, 3).join();
    if (sig !== this._sig) { this._sig = sig; $('#fd-blur').innerHTML = reqList.slice(0, 3).map(id => avHTML(person(id), 'sm')).join(''); }
    $('#fd-blur').classList.toggle('open', F.reveal);
    $('#fd-sup').textContent = S.supers;
    $('#fd-mcn').textContent = fmt(S.matches);
  },
  tick() { this.render(); },
  close() { closeOverlays(); },
  key(e) {
    if (e.type !== 'keydown') return;
    if (e.key === 'ArrowRight' || e.key === 'Enter') { flingCard(1); return true; }
    if (e.key === 'ArrowLeft') { flingCard(-1); return true; }
    if (e.key === 'ArrowUp') { flingCard(0); return true; }
  },
});

// ---------- Activity: what happened on your account ----------
const evIcon = { like: 'heart', mile: 'star', comment: 'chat', mention: 'chat', follow: 'userplus', story: 'spark', cmlike: 'heart', suggest: 'userplus' };
function evHTML(e) {
  const us = e.u.map(whoOf), mp = e.p && myPost(e.p);
  const av = us.length > 1 ? `<span class="fd-av2">${avHTML(us[0], 'sm')}${avHTML(us[1], 'sm')}</span>` : us.length ? avHTML(us[0], 'md') : `<span class="fd-evi">${fi(evIcon[e.k] || 'bell')}</span>`;
  const right = mp ? `<span class="fd-evt" style="background-image:${artURI(mp.seed)}${mp.f ? `;filter:${FILTERS[mp.f][1]}` : ''}"></span>`
    : (e.k === 'follow' || e.k === 'suggest') && e.u[0] ? `<button class="fd-fol${isFol(e.u[0]) ? ' on' : ''}" data-fu="${e.u[0]}"${e.k === 'follow' ? ' data-back="1"' : ''}>${isFol(e.u[0]) ? 'Following' : e.k === 'follow' ? 'Follow back' : 'Follow'}</button>` : '';
  return `<div class="fd-ev${e.r ? '' : ' new'}" data-e="${e.id}"><span class="fd-evk k-${e.k}">${av}<i>${fi(evIcon[e.k] || 'bell')}</i></span><p class="fd-et"><span>${evText(e)}</span> <time data-ts="${e.ts}">${ago(e.ts)}</time></p>${right}</div>`;
}
def({
  id: 'activity', name: 'Activity', tag: 'Your account', c: '#ff2e4d',
  badge: () => Math.min(99, unread()),
  ping: () => { const e = socialEvent(); return plain(evText(e)); },
  wait: () => { const n = unread(); if (!n) return []; const e = F.events.find(x => !x.r); return [{ t: plain(evText(e)), r: n > 1 ? `+${n - 1}` : '' }]; },
  build(b) {
    b.innerHTML = `<div class="pad fd-act" id="fd-act"><button class="fd-reqr" id="fd-reqr" hidden><span class="fd-blur" id="fd-rqav"></span><span><b>Follow requests</b><small id="fd-rqt"></small></span><em id="fd-rqn"></em>${fi('chev')}</button>
      <h4 class="fd-sec" id="fd-sn">New</h4><div class="fd-evs" id="fd-en"></div><h4 class="fd-sec" id="fd-so">Earlier</h4><div class="fd-evs" id="fd-eo"></div>
      <div class="fd-aempty" id="fd-ae" hidden><span>${fi('heart')}</span><b>Activity on your posts</b><small>When someone likes or comments on one of your posts, you’ll see it here.</small></div></div>`;
    track($('#fd-act', b));
    $('#fd-reqr', b).onclick = () => { showTab(bundleOf('discover'), 'discover'); requestsSheet(); };
    b.addEventListener('click', e => {
      const f = e.target.closest('[data-fu]');
      if (f) { const id = +f.dataset.fu, on = follow(id); if (on) { const [x, y] = centerOf(f); earn(2, x, y - 24); } return; }
      const row = e.target.closest('.fd-ev'); if (!row) return;
      const ev = F.events.find(x => x.id === +row.dataset.e);
      if (ev && ev.p && myPost(ev.p)) postSheet(myPost(ev.p));
      else if (ev && ev.u[0] > 0) userSheet(ev.u[0]);
    });
  },
  // draws everything once when opened; while open, rows are added or updated in place
  open() {
    const n = F.events.filter(e => !e.r), o = F.events.filter(e => e.r);
    $('#fd-en').innerHTML = n.map(evHTML).join(''); $('#fd-eo').innerHTML = o.map(evHTML).join('');
    $('#fd-sn').hidden = !n.length; $('#fd-so').hidden = !o.length; $('#fd-ae').hidden = !!F.events.length;
    F.events.forEach(e => { e.r = 1; });
    this.render(); refreshBadges();
  },
  upsert(e) {
    if (curApp !== 'activity' || !this.view) return;
    e.r = 1;
    const old = $(`.fd-ev[data-e="${e.id}"]`, this.view), row = html(evHTML({ ...e, r: 0 }));
    if (old) old.remove();
    $('#fd-en').prepend(row);
    $('#fd-sn').hidden = false; $('#fd-ae').hidden = true;
    const kids = $('#fd-eo').children; if (kids.length > 50) kids[kids.length - 1].remove();
  },
  render() {
    if (!this.view) return;
    syncReqs();
    const n = F.requests, r = $('#fd-reqr');
    r.hidden = !n;
    if (n) {
      $('#fd-rqt').textContent = F.reveal ? `${person(reqList[0]).handle}${n > 1 ? ` + ${fmt(n - 1)} others` : ''}` : 'Approve or ignore requests';
      $('#fd-rqn').textContent = fmt(n);
      const sig = reqList.slice(0, 2).join();
      if (sig !== this._sig) { this._sig = sig; $('#fd-rqav').innerHTML = reqList.slice(0, 2).map(id => avHTML(person(id), 'sm')).join(''); }
      $('#fd-rqav').classList.toggle('open', F.reveal);
    }
  },
  tick() { this.render(); },
  close() { closeOverlays(); },
  key(e) {
    if (e.type !== 'keydown') return;
    const sc = $('#fd-act');
    if (e.key === 'ArrowDown' || e.key === 'j') { sc.scrollBy({ top: 160, behavior: 'smooth' }); return true; }
    if (e.key === 'ArrowUp' || e.key === 'k') { sc.scrollBy({ top: -160, behavior: 'smooth' }); return true; }
  },
});

// ---------- Profile: you, your numbers, your grid ----------
function postSheet(mp) {
  if (!mp) return;
  const c = html(`<div class="fd-pst"><div class="fd-pstm" style="background-image:${artURI(mp.seed)}${mp.f ? `;filter:${FILTERS[mp.f][1]}` : ''}"></div>
    <div class="fd-pstn"><div><b class="fd-pl">${fmt(mp.likes)}</b><small>hearts</small></div><div><b class="fd-pc2">${fmt(mp.cm)}</b><small>comments</small></div><div><b class="fd-pv">${fmt(mp.views)}</b><small>accounts reached</small></div></div>
    ${mp.cap ? `<p class="fd-cap"><b>${F.me.handle}</b> ${esc(mp.cap)}</p>` : ''}<button class="pbtn" data-cm style="--c:#7b61ff">View comments</button></div>`);
  const close = sheet('Your post', c);
  $('[data-cm]', c).onclick = () => { close(); setTimeout(() => commentsSheet(mp), 260); };
  const iv = setInterval(() => {
    if (!c.isConnected) { clearInterval(iv); return; }
    $('.fd-pl', c).textContent = fmt(mp.likes); $('.fd-pc2', c).textContent = fmt(mp.cm); $('.fd-pv', c).textContent = fmt(mp.views);
  }, 1000);
}
function insightsSheet() {
  const reach = F.myPosts.reduce((s, p) => s + p.views, 0) + F.visits * 3, hearts = F.myPosts.reduce((s, p) => s + p.likes, 0);
  const vals = Array.from({ length: 8 }, (_, i) => Math.round(F.followers - F.gained * (1 - i / 7) - (7 - i) * rnd(0, 3)));
  const c = html(`<div class="fd-ins"><div class="fd-insg"><div><b>${fmt(reach)}</b><small>Accounts reached</small><em>+${ri(12, 60)}%</em></div><div><b>${fmt(hearts)}</b><small>Hearts</small><em>+${ri(8, 45)}%</em></div><div><b>${fmt(F.visits)}</b><small>Profile visits</small><em>+${ri(5, 30)}%</em></div><div><b>${fmt(F.gained)}</b><small>New followers</small><em>+${ri(3, 25)}%</em></div></div>
    <div class="fd-inc"><small>Followers, last 7 days</small>${sparkSVG(vals, 320, 90, '#7b61ff', { area: true, dot: true, grid: true })}</div>
    <p class="fine">Posts shared between 6 and 9 pm reach the most people.</p></div>`);
  sheet('Insights', c);
}
function shareProfile() {
  const r = rng(F.me.seed), N = 21;
  let cells = '';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fin = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
    if (fin) continue;
    if (r() < .48) cells += `<rect x="${x}" y="${y}" width="1" height="1" rx=".3"/>`;
  }
  const finder = (x, y) => `<rect x="${x + .5}" y="${y + .5}" width="6" height="6" rx="1.6" fill="none" stroke="currentColor" stroke-width="1"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx=".8"/>`;
  const c = html(`<div class="fd-qr"><div class="fd-qrc">${avHTML(meU(), 'lg')}<svg viewBox="-1 -1 23 23" fill="currentColor">${cells}${finder(0, 0)}${finder(14, 0)}${finder(0, 14)}</svg><b>@${F.me.handle}</b></div><div class="row2"><button class="pbtn" data-l style="--c:#7b61ff">Copy link</button><button class="pbtn" data-s style="--c:#ff4fa3">Share to…</button></div></div>`);
  const close = sheet('Share profile', c);
  c.onclick = e => { if (e.target.closest('[data-l],[data-s]')) { toast(e.target.closest('[data-l]') ? 'Link copied' : 'Shared'); sfx.swoosh(); act(); close(); } };
}
def({
  id: 'profile', name: 'Profile', tag: '', c: '#7b61ff',
  ping: () => {
    if (F.pStreak && F.pDay === TODAY - 1) return `Post today to keep your ${F.pStreak}-day posting streak`;
    if (F.visits > 5 && chance(.5)) return `Your profile was visited ${fmt(F.visits)} times today`;
    return null;
  },
  wait: () => { const mp = F.myPosts[0]; return mp && T() - mp.ts < 150000 ? [{ t: 'Your post is taking off', r: `${fmt(mp.likes)} ♥`, hot: true }] : []; },
  build(b, right) {
    right.innerHTML = `<button class="fd-hb" aria-label="New post">${fi('plus')}</button>`;
    $('.fd-hb', right).onclick = openCreate;
    const me = meU();
    b.innerHTML = `<div class="pad fd-prof" id="fd-prof">
      <div class="fd-pr1"><button class="fd-prav" data-k="story" aria-label="Your story"><span class="fd-ring off" id="fd-prring">${avHTML(me, 'xl')}</span></button><div class="fd-cnts"><div><b id="fd-np">0</b><small>posts</small></div><div><b id="fd-nf">0</b><small>followers</small></div><div><b id="fd-ng">0</b><small>following</small></div></div></div>
      <div class="fd-prn"><b>${me.name}</b><small>@${me.handle}</small><p>${me.bio}</p><span class="fd-stk2" id="fd-streak" hidden></span></div>
      <div class="fd-prb"><button data-k="shareprof">Share profile</button><button data-k="insights">${fi('chart')}Insights</button></div>
      <div class="fd-prt"><button class="on" data-g="posts" aria-label="Posts">${fi('grid')}</button><button data-g="saved" aria-label="Saved">${fi('save')}</button></div>
      <div class="fd-grid" id="fd-grid"></div></div>`;
    track($('#fd-prof', b));
    this.tab = 'posts';
    b.addEventListener('click', e => {
      const k = e.target.closest('[data-k]'), g = e.target.closest('[data-g]'), t = e.target.closest('[data-mp]');
      if (g) { this.tab = g.dataset.g; $$('.fd-prt button', b).forEach(x => x.classList.toggle('on', x === g)); sfx.click(); this.render(true); return; }
      if (t) { postSheet(myPost(t.dataset.mp)); return; }
      if (!k) return;
      if (k.dataset.k === 'story') { if (F.myStory && T() - F.myStory.ts < 864e5) openStory(0); else openCreate(); }
      else if (k.dataset.k === 'create') openCreate();
      else if (k.dataset.k === 'shareprof') shareProfile();
      else if (k.dataset.k === 'insights') insightsSheet();
    });
  },
  close() { closeOverlays(); },
  render(full) {
    if (!this.view) return;
    const sig = this.tab + ':' + (this.tab === 'posts' ? F.myPosts.map(p => p.id).join() : F.saved.length);
    if (full || sig !== this._sig) {
      this._sig = sig;
      const g = $('#fd-grid');
      if (this.tab === 'posts') {
        g.innerHTML = F.myPosts.length ? F.myPosts.map(p => `<button class="fd-gt" data-mp="${p.id}" style="background-image:${artURI(p.seed)}${p.f ? `;filter:${FILTERS[p.f][1]}` : ''}"><span>${fi('heart')}<b>${fmt(p.likes)}</b></span></button>`).join('')
          : `<div class="fd-gempty"><span>${fi('grid')}</span><b>Share your first post</b><small>Your posts will appear on your profile.</small><button class="pbtn" data-k="create" style="--c:#7b61ff">New post</button></div>`;
      } else {
        g.innerHTML = F.saved.length ? F.saved.map(s => `<span class="fd-gt" style="background-image:${artURI(s.s, s.H || 125, s.st == null ? undefined : s.st)}${s.f ? `;filter:${FILTERS[s.f][1]}` : ''}"></span>`).join('')
          : `<div class="fd-gempty"><span>${fi('save')}</span><b>Save posts for later</b><small>Tap the bookmark on any post to keep it here. Only you can see what you’ve saved.</small></div>`;
      }
    }
    this.tick();
  },
  tick() {
    if (!this.view) return;
    const set = (id, v) => { const el = $(id); const t = fmt(v); if (el.textContent !== t) { el.textContent = t; if (id === '#fd-nf' && this._f != null && v > this._f) restart(el, 'fd-tk'); } };
    set('#fd-np', F.myPosts.length); set('#fd-nf', F.followers); set('#fd-ng', F.following.length); this._f = F.followers;
    const st = $('#fd-streak'); st.hidden = !F.pStreak || F.pDay < TODAY - 1;
    if (!st.hidden) st.textContent = F.pDay === TODAY ? `🔥 ${F.pStreak}-day posting streak` : `🔥 Post today to keep your ${F.pStreak}-day streak`;
    $('#fd-prring').classList.toggle('off', !(F.myStory && T() - F.myStory.ts < 864e5));
    if (this.tab === 'posts') $$('#fd-grid [data-mp]').forEach(t => { const p = myPost(t.dataset.mp), b = $('b', t); if (p && b.textContent !== fmt(p.likes)) b.textContent = fmt(p.likes); });
  },
  key(e) {
    if (e.type !== 'keydown') return;
    const sc = $('#fd-prof');
    if (e.key === 'ArrowDown' || e.key === 'j') { sc.scrollBy({ top: 200, behavior: 'smooth' }); return true; }
    if (e.key === 'ArrowUp' || e.key === 'k') { sc.scrollBy({ top: -200, behavior: 'smooth' }); return true; }
  },
});
} // end of the feed module
// ==== /MODULE feed ====

// ==== MODULE inbox: inbox ====
addAch([
  ['zero', 'Inbox zero', 'Read every message', 'check'],
]);
addStats([
  ['messages read', () => fmt(S.cleared)],
]);
addQuests([
  ['cleared', 'Read {n} messages', 8, 30],
]);
// ---------- Inbox: unread dots that never stop ----------
const mail = [];
let mailN = 0, readRun = 0, readRunT = 0;
function addMail() {
  const m = { id: ++mailN, h: ri(0, 359), w1: ri(30, 60), w2: ri(55, 92), ts: T(), un: true };
  mail.unshift(m);
  if (mail.length > 90) { let i = mail.length - 1; while (i > 0 && mail[i].un) i--; const [x] = mail.splice(i, 1); if (x.el) x.el.remove(); }
  const a = APPS.inbox;
  if (a.list) { a.list.prepend(mailEl(m, true)); a.sync(); }
  refreshBadges();
}
function mailEl(m, fresh) {
  const el = html(`<div class="mi${m.un ? ' un' : ''}${fresh ? ' enter' : ''}"><div class="mi-bg">Archive</div><div class="mi-row"><span class="md"></span><span class="mav" style="--h:${m.h}"></span><span class="ml"><i style="width:${m.w1}%"></i><i style="width:${m.w2}%"></i></span><time data-ts="${m.ts}">${ago(m.ts)}</time></div></div>`);
  m.el = el; el._m = m;
  const row = $('.mi-row', el);
  drag(row, {
    axis: 'x',
    onMove: dx => { row.style.transition = 'none'; row.style.transform = `translateX(${Math.min(0, dx)}px)`; },
    onEnd: dx => { row.style.transition = 'transform .22s cubic-bezier(.2,.9,.25,1)'; if (dx < -90) { row.style.transform = 'translateX(-110%)'; archiveMail(m); } else row.style.transform = ''; },
  });
  return el;
}
function readMail(m, cascade) {
  if (!m.un) return;
  m.un = false; if (m.el) m.el.classList.remove('un'); S.cleared++;
  if (!cascade) {
    act(); clearTimeout(readRunT); readRun++; readRunT = setTimeout(() => { readRun = 0; }, 1400);
    sfx.clear(readRun); haptic();
    const [x, y] = centerOf($('.md', m.el)); earn(2, x + 30, y);
    checkZero();
  }
  refreshBadges();
}
function archiveMail(m) {
  if (m.un) { m.un = false; S.cleared++; earn(2, FW - 60, 200); }
  sfx.swoosh(); haptic();
  const el = m.el, i = mail.indexOf(m); if (i >= 0) mail.splice(i, 1);
  el.style.height = el.offsetHeight + 'px'; void el.offsetHeight;
  el.style.transition = 'height .2s'; el.style.height = '0px';
  setTimeout(() => { el.remove(); APPS.inbox.sync(); }, 210);
  refreshBadges(); checkZero();
}
function checkZero() {
  if (mail.some(m => m.un)) return;
  unlock('zero'); toast('Inbox zero. Enjoy it.'); sfx.big(); confetti(50); earn(10, FW / 2, 200);
}
function mailLoop() {
  const open = curApp === 'inbox';
  setTimeout(() => { if (!document.hidden && S.onboarded && !lockOn) addMail(); mailLoop(); }, (open ? rnd(3000, 7000) : rnd(12000, 25000)) * paceK());
}
def({
  id: 'inbox', name: 'Inbox', tag: 'Unread dots · inbox zero', c: '#2f9bff',
  init() { for (let i = 0; i < 7; i++) addMail(); mail.forEach((m, i) => { m.ts = T() - i * ri(20, 200) * 1000; }); mailLoop(); },
  wait() { const un = mail.filter(m => m.un).length; return un ? [{ t: `${un} unread message${un > 1 ? 's' : ''}`, r: un }] : []; },
  badge: () => mail.filter(m => m.un).length,
  ping: () => { const u = mail.filter(m => m.un).length; return u ? `${u} unread messages` : null; },
  build(b, r) {
    r.innerHTML = '<button class="chip" id="ib-all">Read all</button>';
    b.innerHTML = '<div class="mlist" id="ib-list"></div><div class="zero" id="ib-zero" hidden><b>Inbox zero</b><small>For now.</small></div>';
    this.list = $('#ib-list', b);
    mail.forEach(m => this.list.append(mailEl(m)));
    track(this.list);
    this.list.addEventListener('click', e => { const el = e.target.closest('.mi'); if (el) readMail(el._m); });
    $('#ib-all', r).onclick = () => {
      const un = mail.filter(m => m.un);
      if (!un.length) { sfx.nope(); return; }
      const gap = clamp(700 / un.length, 14, 40), [x, y] = centerOf($('#ib-all'));
      act();
      un.forEach((m, i) => setTimeout(() => { readMail(m, true); sfx.clear(i); if (i % 3 === 0) haptic(); if (i === un.length - 1) { earn(un.length * 2, x, y + 30); checkZero(); } }, i * gap));
    };
    this.sync();
  },
  sync() { if (this.list) $('#ib-zero').hidden = mail.length > 0; },
  key(e) { if (e.key === ' ' && e.type === 'keydown') { const m = mail.slice().reverse().find(x => x.un); if (m) readMail(m); return true; } },
});
// ==== /MODULE inbox ====

// ==== MODULE casino: slots, rocket, flip, scratch, loot ====
addAch([
  ['jackpot', 'Jackpot', 'Hit three of a kind', 'gem'],
  ['legend', 'Legendary', 'Pull a legendary', 'star'],
  ['collect', 'Completionist', 'Collect 12 of 24', 'gem', () => Object.keys(S.loot.own).length >= 12],
  ['scratch', 'Lucky scratch', 'Win a scratch card', 'star', () => S.scratchWins >= 1],
  ['rocket', 'Moonshot', 'Cash out a rocket above 10×', 'up', () => S.bestCash >= 10],
  ['flip8', 'Let it ride', 'Double a pot eight times', 'star', () => S.maxFlips >= 8],
]);
addStats([
  ['lever pulls', () => fmt(S.spins)],
  ['boxes opened', () => fmt(S.boxes)],
  ['rocket launches', () => fmt(S.launches)],
  ['coin flips', () => fmt(S.flips)],
]);
addQuests([
  ['boxes', 'Open {n} boxes', 1, 4],
  ['spins', 'Pull the lever {n} times', 3, 8],
  ['scratches', 'Scratch {n} cards', 1, 3],
]);
// ---------- Slots: variable reward, near misses, energy timer ----------
const MAXE = 5, REGEN = 20000, CELL = 58;
const SYM = {
  heart: { c: '#ff2e4d', pay: 20, svg: FP.heart },
  bell: { c: '#ffb000', pay: 30, svg: FP.bellf },
  badge: { c: '#ff3b30', pay: 50, svg: '<circle cx="12" cy="12" r="10"/><path d="M10.6 8.8 13 7.4v9.2" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' },
  flame: { c: '#ff7a00', pay: 80, svg: FP.flame },
  bolt: { c: '#8e5cff', pay: 150, svg: FP.bolt },
  gem: { c: '#3b7bff', pay: 300, svg: '<path d="M6 3.5h12l3.5 5.5L12 20.5 2.5 9z"/><path d="M2.5 9h19M9 3.5 12 9l3-5.5M12 20.5 8.5 9M12 20.5 15.5 9" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.1"/>' },
};
const SYMS = Object.keys(SYM);
const symSVG = k => `<svg viewBox="0 0 24 24" fill="${SYM[k].c}" aria-hidden="true">${SYM[k].svg}</svg>`;
const cellHTML = k => `<div class="cell">${symSVG(k)}</div>`;
const slotState = [0, 1, 2].map(() => [pick(SYMS), pick(SYMS), pick(SYMS)]);
let spinning = false;
const secsToSpin = () => Math.max(0, Math.ceil((REGEN - (T() - S.energyAt)) / 1000));
function regen() {
  if (S.energy >= MAXE) return;
  let got = false;
  while (S.energy < MAXE && T() - S.energyAt >= REGEN) { S.energy++; S.energyAt += REGEN; got = true; }
  if (got && S.energy >= MAXE && S.onboarded) alertOnce('spins', 'slots', 'Spins are full. Pull when you like.', 120000);
}
function outcome() {
  const r = R();
  if (r < .09) { const k = pickW(SYMS.map(s => [s, 300 / SYM[s].pay])); return [k, k, k]; }
  if (r < .58) { const k = pick(SYMS); let o; do o = pick(SYMS); while (o === k); return [k, k, o]; }
  const a = pick(SYMS); let b; do b = pick(SYMS); while (b === a);
  return [a, b, pick(SYMS)];
}
function pullLever() {
  const lever = $('#sl-lever');
  if (lever) { lever.classList.add('spring'); lever.style.setProperty('--ly', '100px'); setTimeout(() => lever.style.setProperty('--ly', '0px'), 150); }
  spin();
}
async function spin() {
  if (spinning) return;
  regen();
  if (S.energy <= 0) { sfx.nope(); restart($('#sl-pull'), 'shake'); toast(`Next free spin in ${secsToSpin()}s. Or watch 3 clips in Loop.`); return; }
  spinning = true;
  if (S.energy >= MAXE) S.energyAt = T();
  S.energy--; S.spins++; act(); APPS.slots.render();
  sfx.lever(); haptic();
  const res = outcome(), tease = res[0] === res[1], near = tease && res[2] !== res[0];
  const durs = [700, 1050, tease ? 2200 : 1400];
  const slot = $('#sl'), out = $('#sl-res');
  slot.classList.add('hot'); out.textContent = '';
  $$('.strip', slot).forEach((st, i) => {
    const fill = Array.from({ length: 12 + i * 5 + (tease && i === 2 ? 12 : 0) }, () => pick(SYMS));
    let above = pick(SYMS), below = pick(SYMS);
    if (near && i === 2) { if (chance(.5)) above = res[0]; else below = res[0]; } // the match lands one row off
    const cells = [...slotState[i], ...fill, above, res[i], below];
    slotState[i] = [above, res[i], below];
    st.style.transition = 'none'; st.style.transform = 'translateY(0)';
    st.innerHTML = cells.map(cellHTML).join('');
    void st.offsetHeight;
    st.style.transition = `transform ${durs[i]}ms cubic-bezier(.12,.62,.22,1.04)`;
    st.style.transform = `translateY(${-(cells.length - 3) * CELL}px)`;
    const n = cells.length - 3;
    for (let k = 1; k <= n; k += i === 2 ? 1 : 2) tone(2600 - i * 300, .01, 'square', .018, (1 - Math.cbrt(1 - k / n)) * durs[i] / 1000);
    setTimeout(() => { sfx.thunk(); haptic(); if (i === 1 && tease) sfx.riser(1.1); }, durs[i]);
  });
  await wait(durs[2] + 150);
  slot.classList.remove('hot');
  $$('.strip', slot).forEach((st, i) => { st.style.transition = 'none'; st.style.transform = 'translateY(0)'; st.innerHTML = slotState[i].map(cellHTML).join(''); });
  let win;
  if (res[0] === res[1] && res[1] === res[2]) {
    win = SYM[res[0]].pay; out.textContent = `JACKPOT +${win}`; S.jackpots++;
    sfx.win(); confetti(160); haptic(true); unlock('jackpot'); restart(slot, 'flash');
  } else if (tease) { win = 5; out.textContent = 'So close!'; sfx.coin(); } else { win = 1; out.textContent = 'Almost!'; sfx.click(); }
  restart(out, 'pop');
  const [x, y] = centerOf($('.wins', slot)); earn(win, x, y);
  spinning = false;
  APPS.slots.render();
}
def({
  id: 'slots', name: 'Slots', tag: 'Variable reward · near miss', c: '#ffb000',
  bg: regen,
  wait: () => (S.energy ? [{ t: `${S.energy} free spin${S.energy > 1 ? 's' : ''}` }] : []),
  badge: () => S.energy,
  ping: () => (S.energy >= MAXE ? 'Spins are full. Pull now!' : S.energy ? `${S.energy} free spins waiting` : null),
  build(b, r) {
    r.innerHTML = `<span class="chip" id="sl-e">${IF('bolt')}<span></span></span>`;
    b.innerHTML = `<div class="pad"><div class="slot" id="sl"><div class="bulbs">${'<i></i>'.repeat(13)}</div>
      <div class="slot-body"><div class="wins">${'<div class="reel"><div class="strip"></div></div>'.repeat(3)}<div class="payline"></div></div>
      <div class="lever" id="sl-lever"><div class="rod"></div><div class="knob" id="sl-knob" role="button" tabindex="0" aria-label="Pull the lever"></div><div class="base"></div></div></div>
      <div class="sres" id="sl-res">Pull the lever</div><button class="pbtn" id="sl-pull" style="--c:#ff2e4d">PULL</button>
      <div class="energy"><span class="bolts" id="sl-bolts"></span><span id="sl-t"></span></div></div>
      <div class="card"><h3>Payouts</h3><div class="paytable">${[...SYMS].reverse().map(k => `<span class="trip">${symSVG(k).repeat(3)}</span><b>+${SYM[k].pay}</b>`).join('')}<small>Two in a row</small><b>+5</b></div></div>
      <p class="fine">A free spin every 20 s, up to 5. Three clips in Loop earn another.</p></div>`;
    track($('.pad', b));
    $$('.strip', b).forEach((s, i) => { s.innerHTML = slotState[i].map(cellHTML).join(''); });
    const lever = $('#sl-lever', b), knob = $('#sl-knob', b);
    let armed = false;
    drag(knob, {
      axis: 'y', onStart: () => lever.classList.remove('spring'),
      onMove: (dx, dy) => { const y = clamp(dy, 0, 118); lever.style.setProperty('--ly', y + 'px'); if (y > 80 && !armed) { armed = true; sfx.tick(); haptic(); } else if (y < 66) armed = false; },
      onEnd: () => { lever.classList.add('spring'); lever.style.setProperty('--ly', '0px'); if (armed) { armed = false; spin(); } },
    });
    knob.addEventListener('keydown', e => { if (e.key === 'Enter') pullLever(); });
    $('#sl-pull', b).onclick = pullLever;
  },
  render() {
    if (!this.view) return;
    const full = Math.min(S.energy, MAXE), extra = Math.max(0, S.energy - MAXE);
    $('#sl-e span').textContent = `${S.energy}/${MAXE}`;
    $('#sl-bolts').innerHTML = Array.from({ length: MAXE }, (_, i) => IF('bolt', i < full ? '' : 'off')).join('') + (extra ? `<b>+${extra}</b>` : '');
    $('#sl-t').textContent = S.energy >= MAXE ? 'Spins full' : `Next spin in ${cd(REGEN - (T() - S.energyAt))}`;
    const p = $('#sl-pull'); p.classList.toggle('off', S.energy <= 0);
    if (!spinning) p.textContent = S.energy > 0 ? 'PULL' : `Next spin in ${secsToSpin()}s`;
  },
  tick() { this.render(); },
  key(e) { if (e.key === ' ' && e.type === 'keydown') { pullLever(); return true; } },
});

// ---------- Rocket: a crash game that never crashes on you ----------
const ROCKET_K = .3, ROCKET_FREE = 30000;
const crashPoint = () => clamp(.99 / (1 - R()), 1.25, 60);
const rocketHist = Array.from({ length: 8 }, crashPoint);
const SHIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c3 2.2 5 6 5 10l-2 5H9l-2-5c0-3.8 2-7.8 5-10z" fill="#fff"/><circle cx="12" cy="10" r="2.2" fill="#3b7bff"/><path d="m7 12-3 4.5L7.5 17zM17 12l3 4.5-3.5.5z" fill="#ff2e4d"/><path d="M9.5 18h5L12 23z" fill="#ffc21a"/></svg>';
let rkt = null, rStake = 10;
function rocketGo() {
  if (rkt) { if (!rkt.cashed) rocketCash(false); return; }
  const free = T() >= S.rocketAt, bet = free ? 10 : stakeVal(rStake);
  if (!free) { if (bet < 1) { sfx.nope(); toast('You need hits to bet. Tap earns some.'); return; } if (!spend(bet)) return; }
  else S.rocketAt = T() + ROCKET_FREE;
  act(); S.launches++;
  rkt = { bet, t0: now(), m: 1, crash: crashPoint(), cashed: false, pts: [[0, 1]], last: 0, tone: holdTone() };
  $('#rc-m').className = 'rc-m'; $('#rc-sub').textContent = free ? 'Free launch' : `Riding ${fmt(bet)} hits`;
  sfx.whoosh(); haptic();
  rkt.raf = requestAnimationFrame(rocketStep);
  APPS.rocket.render(); refreshBadges();
}
function rocketStep() {
  if (!rkt) return;
  const t = (now() - rkt.t0) / 1000;
  rkt.m = Math.exp(ROCKET_K * t);
  if (t - rkt.last > .05) { rkt.pts.push([t, rkt.m]); rkt.last = t; }
  if (!rkt.cashed && rkt.m >= rkt.crash - .02) { rkt.m = rkt.crash - .01; rocketCash(true); } // it never lets you lose
  if (rkt.cashed && rkt.m >= rkt.shown) { rocketCrash(); return; }
  if (rkt.tone) rkt.tone.set(160 + Math.min(1400, rkt.m * 90));
  drawRocket();
  rkt.raf = requestAnimationFrame(rocketStep);
}
function drawRocket() {
  const scr = $('#rc-scr'); if (!scr || !rkt) return;
  const W = scr.clientWidth, H = scr.clientHeight, t = (now() - rkt.t0) / 1000;
  const tMax = Math.max(4, t * 1.15), mMax = Math.max(2, rkt.m * 1.2);
  const X = v => 18 + (v / tMax) * (W - 50), Y = v => H - 22 - ((v - 1) / (mMax - 1)) * (H - 90);
  const pts = [...rkt.pts, [t, rkt.m]];
  const d = 'M' + pts.map(([a, b]) => `${X(a).toFixed(1)},${Y(b).toFixed(1)}`).join('L');
  const [lx, ly] = [X(t), Y(rkt.m)];
  $('#rc-svg').innerHTML = `<path d="${d}L${lx.toFixed(1)},${H - 22}L18,${H - 22}Z" fill="url(#rcg)"/><path d="${d}" fill="none" stroke="#ffb000" stroke-width="3" stroke-linecap="round"/><defs><linearGradient id="rcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6a00" stop-opacity=".45"/><stop offset="1" stop-color="#ff6a00" stop-opacity="0"/></linearGradient></defs>`;
  const p2 = pts[Math.max(0, pts.length - 4)], ang = Math.atan2(Y(rkt.m) - Y(p2[1]), X(t) - X(p2[0])) * 180 / Math.PI + 90;
  const ship = $('#rc-ship'); ship.style.transform = `translate(${lx}px, ${ly}px) rotate(${ang}deg)`; ship.hidden = false;
  $('#rc-m').textContent = rkt.m.toFixed(2) + '×';
  if (!rkt.cashed) $('#rc-go').textContent = `Cash out +${fmt(Math.round(rkt.bet * rkt.m))}`;
}
function rocketCash(auto) {
  if (!rkt || rkt.cashed) return;
  rkt.cashed = true; rkt.cashM = rkt.m;
  const win = Math.round(rkt.bet * rkt.m);
  rkt.win = win;
  rkt.shown = Math.max(rkt.crash, rkt.m * rnd(1.15, 2.4)); // it always flies on a little past you
  S.bestCash = Math.max(S.bestCash, rkt.m);
  const [x, y] = centerOf($('#rc-m'));
  earn(win, x, y + 50, { raw: true }); sfx.win(); haptic(true); confetti(50);
  $('#rc-m').classList.add('win');
  $('#rc-sub').textContent = auto ? `Auto cash-out saved you at ${rkt.m.toFixed(2)}×` : `Cashed out at ${rkt.m.toFixed(2)}×`;
  $('#rc-go').textContent = `Won ${fmt(win)}`;
  queueCheck();
}
function rocketCrash() {
  if (!rkt || rkt.over) return;
  rkt.over = true; cancelAnimationFrame(rkt.raf); if (rkt.tone) { rkt.tone.stop(); rkt.tone = null; }
  noise(.5, .16, 0, 1200, 120); haptic(true);
  const missed = Math.round(rkt.bet * rkt.shown) - rkt.win;
  $('#rc-m').className = 'rc-m crash'; $('#rc-m').textContent = rkt.shown.toFixed(2) + '×';
  $('#rc-sub').textContent = `Crashed. Holding on would have paid ${fmt(missed)} more.`;
  $('#rc-ship').hidden = true;
  rocketHist.unshift(rkt.shown); rocketHist.length = 8;
  setTimeout(() => { rkt = null; APPS.rocket.render(); }, 1300);
}
def({
  id: 'rocket', name: 'Rocket', tag: 'Crash betting · rigged to win', c: '#ff6a00',
  wait: () => (T() >= S.rocketAt ? [{ t: 'A free rocket launch' }] : []),
  badge: () => (T() >= S.rocketAt ? 1 : 0),
  ping: () => (T() >= S.rocketAt ? `Free launch ready. The last one hit ${rocketHist[0].toFixed(2)}×` : `Someone just cashed out at ${rnd(3, 40).toFixed(2)}×`),
  build(b) {
    b.innerHTML = `<div class="pad"><div class="rc-scr" id="rc-scr"><div class="rc-hist" id="rc-hist"></div><svg id="rc-svg" class="rc-svg"></svg><div class="rc-ship" id="rc-ship" hidden>${SHIP}</div><div class="rc-m" id="rc-m">1.00×</div><div class="rc-sub" id="rc-sub"></div></div>
      ${chipsHTML('rc-st', rStake)}<button class="pbtn" id="rc-go"></button>
      <p class="fine">Cash out before it crashes. It never crashes first.</p></div>`;
    track($('.pad', b));
    bindChips($('#rc-st', b), v => { rStake = v; this.render(); });
    $('#rc-go', b).onclick = rocketGo;
  },
  render() {
    if (!this.view) return;
    $('#rc-hist').innerHTML = rocketHist.map(m => `<span class="${m >= 2 ? 'hi' : ''}">${m.toFixed(2)}×</span>`).join('');
    if (rkt) return;
    const free = T() >= S.rocketAt;
    $('#rc-go').textContent = free ? 'Launch · free' : `Launch · ${fmt(stakeVal(rStake))} hits`;
    $('#rc-m').className = 'rc-m'; $('#rc-m').textContent = '1.00×';
    $('#rc-sub').textContent = free ? 'A free launch is ready' : `Next free launch in ${cd(S.rocketAt - T())}`;
    $('#rc-svg').innerHTML = ''; $('#rc-ship').hidden = true;
  },
  tick() { this.render(); },
  close() { if (rkt && !rkt.over) { if (!rkt.cashed) rocketCash(false); rocketCrash(); } }, // leaving mid-flight cashes you out
  key(e) { if (e.key === ' ' && e.type === 'keydown') { rocketGo(); return true; } },
});

// ---------- Flip: double or nothing, and it's never nothing ----------
const FLIP_MAX = 8;
let flipping = false, fStake = 10;
function flipGo() {
  if (flipping) return;
  const f = S.flip;
  if (!f.pot) {
    const st = stakeVal(fStake);
    if (st < 1) { sfx.nope(); toast('You need hits to flip. Tap earns some.'); return; }
    if (!spend(st)) return;
    f.pot = st; f.n = 0;
  }
  flipping = true; act(); S.flips++;
  const long = f.n >= 4, dur = long ? 1500 : 800, coin = $('#fp-coin');
  f.rot = (f.rot || 0) + (long ? 3240 : 1800);
  coin.style.transition = `transform ${dur}ms cubic-bezier(.2,.8,.3,1)`;
  coin.style.transform = `rotateY(${f.rot}deg)`;
  restart($('#fp-stage'), 'toss');
  const ticks = long ? 16 : 9;
  for (let i = 0; i < ticks; i++) tone(1200 + i * 60, .02, 'square', .03, (1 - Math.pow(1 - i / ticks, 2)) * dur / 1000);
  if (long) sfx.riser(dur / 1000);
  APPS.flip.render();
  setTimeout(() => {
    f.pot *= 2; f.n++; flipping = false;
    S.maxFlips = Math.max(S.maxFlips, f.n);
    const [x, y] = centerOf($('#fp-coin'));
    floatText(x, y - 90, `×${2 ** f.n}`, 'crit'); sfx.win(); haptic(true);
    burst(x, y, { n: 14 + f.n * 4, colors: ['#ffc21a', '#fff1a8', '#fff'], shape: 'dot', power: 1 + f.n * .1 });
    APPS.flip.render(); queueCheck();
    if (f.n >= FLIP_MAX) setTimeout(() => flipCash(true), 500);
  }, dur);
}
function flipCash(max) {
  const f = S.flip;
  if (!f.pot || flipping) return;
  const g = f.pot, [x, y] = centerOf($('#fp-pot'));
  earn(g, x, y, { raw: true }); f.pot = 0; f.n = 0;
  confetti(max ? 200 : 90); sfx.big(); haptic(true);
  toast(max ? `Max win. Banked ${fmt(g)}` : `Banked ${fmt(g)}`);
  APPS.flip.render(); refreshBadges();
}
def({
  id: 'flip', name: 'Flip', tag: 'Double or nothing · let it ride', c: '#e0a100',
  wait: () => (S.flip.pot ? [{ t: 'Your pot is still riding', hot: 1, r: fmt(S.flip.pot) }] : []),
  badge: () => (S.flip.pot ? 1 : 0),
  ping: () => (S.flip.pot ? `Your pot of ${fmt(S.flip.pot)} is waiting. Let it ride?` : 'Double or nothing. It always lands heads.'),
  build(b) {
    b.innerHTML = `<div class="pad"><div class="fp-pot" id="fp-pot"><small>Pot</small><b id="fp-v">0</b><small id="fp-n"></small></div>
      <div class="coin-stage" id="fp-stage"><div class="coin-w"><div class="coin" id="fp-coin"><div class="face h">${IF('bolt')}</div><div class="face t">${I('close')}</div></div></div></div>
      <div class="ladder" id="fp-lad"></div>${chipsHTML('fp-st', fStake)}
      <div class="row2"><button class="pbtn" id="fp-go" style="--c:#e0a100"></button><button class="pbtn" id="fp-cash" style="--c:#12b886"></button></div>
      <p class="fine">Heads doubles the pot. It always lands heads. Eight in a row is the max.</p></div>`;
    track($('.pad', b));
    bindChips($('#fp-st', b), v => { fStake = v; this.render(); });
    $('#fp-go', b).onclick = flipGo;
    $('#fp-cash', b).onclick = () => flipCash(false);
  },
  render() {
    if (!this.view) return;
    const f = S.flip;
    $('#fp-v').textContent = fmt(f.pot);
    $('#fp-n').textContent = f.pot ? `${f.n} heads in a row` : 'Pick a stake and flip';
    $('#fp-lad').innerHTML = Array.from({ length: FLIP_MAX }, (_, i) => `<span class="${i < f.n ? 'done' : i === f.n && f.pot ? 'next' : ''}">×${2 ** (i + 1)}</span>`).join('');
    $('#fp-st').hidden = !!f.pot;
    const go = $('#fp-go'), cash = $('#fp-cash');
    go.disabled = flipping;
    go.textContent = f.pot ? `Let it ride · ${fmt(f.pot * 2)}` : `Flip · ${fmt(stakeVal(fStake))}`;
    cash.disabled = !f.pot || flipping; cash.classList.toggle('off', !f.pot);
    cash.textContent = f.pot ? `Cash out ${fmt(f.pot)}` : 'Cash out';
  },
  key(e) { if (e.type !== 'keydown') return; if (e.key === ' ') { flipGo(); return true; } if (e.key === 'Enter') { flipCash(false); return true; } },
});

// ---------- Scratch: the tactile lottery ----------
const SCRATCH_FREE = 30000;
const scratchFree = () => T() >= S.scratchAt || S.scratchExtra > 0;
let sx = null;
function newScratch() {
  const free = scratchFree();
  if (!free && !spend(30)) return;
  if (free) { if (T() >= S.scratchAt) S.scratchAt = T() + SCRATCH_FREE; else S.scratchExtra--; }
  const r = R(), top = pickW(SYMS.map(s => [s, 300 / SYM[s].pay]));
  const other = () => { let k; do k = pick(SYMS); while (k === top); return k; };
  let cells;
  if (r < .2) cells = [top, top, top, other(), other(), other()];
  else if (r < .7) cells = [top, top, other(), other(), other(), other()];
  else cells = Array.from({ length: 6 }, () => pick(SYMS));
  // exactly one triple on a winning card, none on a losing one
  const fix = protect => {
    const count = {}; cells.forEach(k => { count[k] = (count[k] || 0) + 1; });
    for (let i = cells.length - 1; i >= 0; i--) {
      const k = cells[i];
      if (k !== protect && count[k] >= 3) { let o; do o = pick(SYMS); while (o === protect || (count[o] || 0) >= 2); count[k]--; count[o] = (count[o] || 0) + 1; cells[i] = o; }
    }
  };
  fix(r < .2 ? top : null);
  cells.sort(() => R() - .5);
  sx = { cells, done: false, moves: 0 };
  $('#sx-cells').innerHTML = cells.map(k => `<div class="sx-cell">${symSVG(k)}</div>`).join('');
  $('#sx-res').textContent = 'Scratch to reveal';
  paintFoil();
  APPS.scratch.render();
}
function paintFoil() {
  const cv = $('#sx-cv'), w = cv.offsetWidth, h = cv.offsetHeight, d = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(w * d); cv.height = Math.round(h * d);
  const c = cv.getContext('2d');
  c.setTransform(d, 0, 0, d, 0, 0); c.globalCompositeOperation = 'source-over';
  const gr = c.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#c9c4d2'); gr.addColorStop(.5, '#efeaf4'); gr.addColorStop(1, '#b5afc0');
  c.fillStyle = gr; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,.5)';
  for (let i = 0; i < 90; i++) { c.beginPath(); c.arc(R() * w, R() * h, R() * 1.6, 0, 7); c.fill(); }
  c.fillStyle = 'rgba(80,60,100,.45)'; c.font = '700 22px DynaPuff, ui-rounded, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('SCRATCH HERE', w / 2, h / 2);
  cv.classList.remove('clear');
}
function scratchCheck() {
  const cv = $('#sx-cv'), c = cv.getContext('2d'), w = cv.width, h = cv.height;
  if (!w || !h) return;
  const data = c.getImageData(0, 0, w, h).data;
  let clear = 0, tot = 0;
  for (let y = 4; y < h; y += 12) for (let x = 4; x < w; x += 12) { tot++; if (data[(y * w + x) * 4 + 3] < 40) clear++; }
  if (clear / tot > .5) finishScratch();
}
function finishScratch() {
  if (!sx || sx.done) return;
  sx.done = true; S.scratches++;
  $('#sx-cv').classList.add('clear');
  const count = {}; sx.cells.forEach(k => { count[k] = (count[k] || 0) + 1; });
  const win = Object.keys(count).find(k => count[k] >= 3), pair = Object.keys(count).find(k => count[k] === 2);
  const out = $('#sx-res'), [x, y] = centerOf($('#sx-cells'));
  if (win) {
    $$('.sx-cell').forEach((el, i) => { if (sx.cells[i] === win) el.classList.add('hit'); });
    out.textContent = `Winner! +${SYM[win].pay}`; S.scratchWins++;
    earn(SYM[win].pay, x, y); sfx.win(); confetti(120); haptic(true);
  } else if (pair) { out.textContent = 'So close. One more?'; earn(2, x, y); sfx.coin(); }
  else { out.textContent = 'No match. One more?'; earn(1, x, y); sfx.click(); }
  restart(out, 'pop'); act(); queueCheck();
  APPS.scratch.render();
}
def({
  id: 'scratch', name: 'Scratch', tag: 'Scratch-off · near miss', c: '#12b886',
  wait: () => (scratchFree() ? [{ t: 'A free scratch card' }] : []),
  badge: () => (scratchFree() ? 1 + S.scratchExtra : 0),
  ping: () => (scratchFree() ? 'Your free scratch card is ready' : null),
  build(b) {
    b.innerHTML = `<div class="pad"><div class="sx-ticket"><div class="sx-cells" id="sx-cells"></div><canvas id="sx-cv" aria-label="Scratch area"></canvas></div>
      <div class="sx-res" id="sx-res"></div><button class="pbtn" id="sx-new"></button><p class="fine">Three of a kind wins. A free card every 30 s.</p>
      <div class="card"><h3>Prizes</h3><div class="paytable">${[...SYMS].reverse().map(k => `<span class="trip">${symSVG(k).repeat(3)}</span><b>+${SYM[k].pay}</b>`).join('')}</div></div></div>`;
    track($('.pad', b));
    const cv = $('#sx-cv', b);
    let last = null, sndT = 0;
    const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height]; };
    cv.addEventListener('pointerdown', e => { if (!sx || sx.done) return; e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch {} last = pt(e); });
    cv.addEventListener('pointermove', e => {
      if (!last || !sx || sx.done) return;
      const p = pt(e), c = cv.getContext('2d'), d = cv.width / cv.offsetWidth;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'destination-out'; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 34 * d;
      c.beginPath(); c.moveTo(last[0], last[1]); c.lineTo(p[0], p[1]); c.stroke();
      last = p;
      if (now() - sndT > 70) { sndT = now(); sfx.scratch(); if (chance(.4)) haptic(); }
      if (++sx.moves % 10 === 0) scratchCheck();
    });
    const up = () => { last = null; if (sx && !sx.done) scratchCheck(); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    $('#sx-new', b).onclick = () => newScratch();
  },
  open() {
    clearTimeout(this.dealT);
    if ((!sx || sx.done) && scratchFree()) this.dealT = setTimeout(() => { if (curApp === 'scratch' && (!sx || sx.done) && scratchFree()) newScratch(); }, 80);
    else if (sx && !sx.done && !$('#sx-cv').width) paintFoil(); // dealt while hidden: paint the foil now that it has a size
  },
  close() { clearTimeout(this.dealT); },
  render() {
    if (!this.view) return;
    const btn = $('#sx-new');
    btn.hidden = !!(sx && !sx.done);
    btn.textContent = scratchFree() ? `New card · free${S.scratchExtra ? ` (+${S.scratchExtra})` : ''}` : `New card · 30 hits · free in ${cd(S.scratchAt - T())}`;
    if (!sx) $('#sx-res').textContent = 'Get a card';
  },
  tick() { this.render(); },
  key(e) {
    if (e.key !== ' ' || e.type !== 'keydown') return;
    if (!sx || sx.done) newScratch(); else finishScratch();
    return true;
  },
});

// ---------- Loot: blind boxes, rarity, a set to complete ----------
const LCOL = { ruby: '#ff2e4d', mint: '#12c48b', sky: '#3b7bff', gold: '#ffc21a' };
const ITEMS = [];
for (const s of ['orb', 'cube', 'heart', 'bolt', 'star', 'diamond']) for (const c in LCOL) {
  const r = c === 'gold' ? (s === 'star' ? 'legendary' : 'epic') : (s === 'star' || s === 'diamond') ? 'rare' : 'common';
  ITEMS.push({ id: `${c}-${s}`, s, c, r, name: `${cap(c)} ${cap(s)}` });
}
const TIERC = { common: '#8f98a8', rare: '#3b7bff', epic: '#9b5cff', legendary: '#f5a600' };
const NEWPAY = { common: 10, rare: 30, epic: 90, legendary: 400 }, DUPPAY = { common: 3, rare: 8, epic: 25, legendary: 100 };
const LOOT_FREE = 40000, PITY = 30;
const lootFree = () => T() >= S.loot.freeAt || S.loot.extra > 0;
let opening = false;
async function openBox() {
  if (opening) return;
  const free = lootFree();
  if (!free && !spend(100)) return;
  if (free) { if (T() >= S.loot.freeAt) S.loot.freeAt = T() + LOOT_FREE; else S.loot.extra--; }
  opening = true; act(); S.boxes++;
  restart($('#lt-box'), 'shake');
  [0, 150, 300].forEach((d, i) => setTimeout(() => { sfx.shake(i); haptic(); }, d));
  await wait(470);
  S.loot.pity++;
  const tier = S.loot.pity >= PITY ? 'legendary' : pickW([['common', 65], ['rare', 25], ['epic', 8], ['legendary', 2]]);
  if (tier === 'legendary') S.loot.pity = 0;
  const it = pick(ITEMS.filter(i => i.r === tier)), dup = !!S.loot.own[it.id];
  S.loot.own[it.id] = (S.loot.own[it.id] || 0) + 1;
  const a = APPS.loot;
  const rv = html(`<div class="reveal" style="--rc:${TIERC[tier]}"><div class="rays"></div><div class="item">${shapeSVG(it.s, LCOL[it.c])}</div><span class="tier">${tier}</span><b>${it.name}</b><small>${dup ? 'Duplicate' : 'New to your collection'}</small></div>`);
  a.body.append(rv);
  const [x, y] = centerOf(rv);
  earn(dup ? DUPPAY[tier] : NEWPAY[tier], x, y + 110);
  if (tier === 'legendary') { confetti(200); sfx.win(); haptic(true); unlock('legend'); }
  else if (tier === 'epic') { sfx.big(); burst(x, y, { n: 30, colors: ['#9b5cff', '#c05cff', '#fff'], shape: 'dot', power: 1.5 }); haptic(true); }
  else { sfx.fresh(); burst(x, y, { n: 14, colors: [LCOL[it.c], '#fff'], shape: 'dot' }); }
  const close = () => rv.remove();
  rv.onclick = close; setTimeout(close, 1500);
  opening = false;
  a.render(it.id); refreshBadges(); queueCheck();
}
def({
  id: 'loot', name: 'Loot', tag: 'Blind boxes · collect the set', c: '#9b5cff',
  wait: () => (lootFree() ? [{ t: 'A free box to open' }] : []),
  badge: () => (lootFree() ? 1 + S.loot.extra : 0),
  ping: () => (lootFree() ? 'A free box is ready. What’s inside?' : null),
  build(b) {
    b.innerHTML = `<div class="pad"><div class="card"><div class="lt-top"><b>Collection <span id="lt-n"></span> / 24</b><small id="lt-pity"></small></div><div class="bar" style="margin-top:10px"><i id="lt-bar"></i></div></div>
      <div class="lt-stage"><div class="lt-glow"></div><div class="lt-box" id="lt-box" role="button" tabindex="0" aria-label="Open the box"><div class="base"></div><div class="rib"></div><div class="lid"></div><span class="qm">?</span></div></div>
      <button class="pbtn" id="lt-open"></button>
      <div class="odds"><span>Common 65%</span><span>Rare 25%</span><span>Epic 8%</span><span>Legendary 2%</span></div>
      <div class="coll" id="lt-coll"></div></div>`;
    track($('.pad', b));
    $('#lt-box', b).onclick = openBox;
    $('#lt-open', b).onclick = openBox;
  },
  render(newId) {
    if (!this.view) return;
    const n = Object.keys(S.loot.own).length;
    $('#lt-n').textContent = n; $('#lt-bar').style.width = (n / 24) * 100 + '%';
    $('#lt-pity').textContent = `Legendary guaranteed in ${PITY - S.loot.pity}`;
    $('#lt-open').textContent = lootFree() ? `Open free${S.loot.extra ? ` (+${S.loot.extra})` : ''}` : `Open · 100 hits · free in ${cd(S.loot.freeAt - T())}`;
    if (newId !== undefined || !$('#lt-coll').children.length) $('#lt-coll').innerHTML = ITEMS.map(i => (S.loot.own[i.id] ? `<i class="${i.id === newId ? 'new' : ''}" title="${i.name}">${shapeSVG(i.s, LCOL[i.c])}</i>` : '<i>?</i>')).join('');
  },
  tick() { this.render(); },
  key(e) { if (e.key === ' ' && e.type === 'keydown') { openBox(); return true; } },
});
// ==== /MODULE casino ====

// ==== MODULE markets: trade, predict ====
addAch([
  ['oracle', 'Oracle', 'Win 10 predictions', 'eye', () => S.predWins >= 10],
  ['whale', 'Whale', 'Grow a portfolio past 10,000', 'gem', () => (S.trade.athV || 0) >= 10000],
]);
addStats([
  ['predictions won', () => fmt(S.predWins)],
  ['trades', () => fmt(S.trades)],
]);
// ---------- Trade: coins that only go up while you hold them ----------
const COINS = [['HIT', '#e59a00'], ['DOPA', '#ff4fa3'], ['BLOB', '#9b5cff'], ['PING', '#2f9bff']];
const hist = {};
let tStake = 10, tHover = null;
COINS.forEach(([k], i) => {
  const c = S.trade.c[k] || (S.trade.c[k] = { p: [1.24, .38, 7.9, .062][i], u: 0, cost: 0 });
  c.pump = 0;
  const h = [c.p];
  for (let j = 0; j < 119; j++) h.unshift(Math.max(.001, h[0] / (1 + rnd(-.009, .011))));
  hist[k] = h;
});
const pval = () => COINS.reduce((s, [k]) => s + S.trade.c[k].u * S.trade.c[k].p, 0);
const pcost = () => COINS.reduce((s, [k]) => s + S.trade.c[k].cost, 0);
const px = p => (p >= 100 ? fmt(p) : p >= 1 ? p.toFixed(2) : p.toFixed(4));
function tradeTick() {
  if (document.hidden) return;
  COINS.forEach(([k]) => {
    const c = S.trade.c[k];
    let d;
    if (c.u > 0) d = chance(.14) ? -rnd(.003, .012) : rnd(.004, .016); // anything you hold climbs
    else if (c.pump > 0) { d = rnd(.006, .02); c.pump--; } // and it keeps going after you sell
    else d = rnd(-.009, .0095);
    c.p = Math.max(.001, c.p * (1 + d));
    hist[k].push(c.p); if (hist[k].length > 120) hist[k].shift();
  });
  const v = pval();
  if (v > 0 && v > (S.trade.athV || 0) * 1.02) {
    S.trade.athV = v;
    if (curApp !== 'trade' && S.onboarded) { S.trade.athNew++; alertOnce('ath', 'trade', `Your portfolio hit a new all-time high: ${fmt(v)}`, 90000); }
    queueCheck();
  }
  if (curApp === 'trade') APPS.trade.render();
  marketTick();
  if (curApp === 'predict') APPS.predict.render();
}
setInterval(tradeTick, 500);
function buyCoin() {
  const k = S.trade.sel, c = S.trade.c[k], st = stakeVal(tStake);
  if (st < 1) { sfx.nope(); toast('You need hits to buy. Tap earns some.'); return; }
  if (!spend(st)) return;
  c.u += st / c.p; c.cost += st; S.trades++; act(); haptic();
  const [x, y] = centerOf($('#tr-buy')); burst(x, y, { n: 12, colors: ['#12c48b', '#fff'], shape: 'dot' });
  toast(`Bought ${fmt(st / c.p)} $${k}`);
  APPS.trade.render();
}
function sellCoin() {
  const k = S.trade.sel, c = S.trade.c[k];
  if (!c.u) { sfx.nope(); toast(`You don’t hold any $${k}`); return; }
  const v = Math.round(c.u * c.p), gain = c.cost ? v / c.cost - 1 : 0;
  const [x, y] = centerOf($('#tr-sell'));
  earn(v, x, y - 20, { raw: true }); c.u = 0; c.cost = 0; c.pump = 8; S.trades++; act();
  sfx.big(); confetti(60); haptic(true);
  toast(`Sold for ${fmt(v)} (${gain >= 0 ? '+' : ''}${(gain * 100).toFixed(1)}%)`);
  setTimeout(() => notify('trade', `$${k} is up again since you sold. Buy back in?`), 5000);
  APPS.trade.render();
}
def({
  id: 'trade', name: 'Trade', tag: 'Crypto trading · only goes up', c: '#12b886',
  badge: () => Math.min(9, S.trade.athNew),
  ping: () => { const [k] = pick(COINS), h = hist[k], ch = (h[h.length - 1] / h[0] - 1) * 100; return `$${k} is ${ch >= 0 ? 'up' : 'down'} ${Math.abs(ch).toFixed(1)}% in the last minute`; },
  build(b) {
    b.innerHTML = `<div class="pad"><div class="tr-top"><small>Portfolio</small><b id="tr-val">0</b><span class="tr-pl" id="tr-pl"></span></div>
      <div class="card tr-chart"><div class="tr-hd"><b id="tr-sym"></b><span id="tr-px"></span></div><div class="tr-plot" id="tr-plot"><div class="tr-x" id="tr-x" hidden></div><div class="tr-tip" id="tr-tip" hidden></div><div id="tr-svg"></div></div></div>
      <div class="coins" id="tr-coins">${COINS.map(([k, cc]) => `<button class="coin-row" data-k="${k}" style="--cc:${cc}"><span class="cb">${k[0]}</span><span><b>$${k}</b><small class="hd"></small></span><span class="sp"></span><span class="px"><span class="pv"></span><small class="ch"></small></span></button>`).join('')}</div>${chipsHTML('tr-st', tStake)}
      <div class="row2"><button class="pbtn" id="tr-buy" style="--c:#12b886"></button><button class="pbtn" id="tr-sell" style="--c:#ff2e4d"></button></div>
      <p class="fine">Prices tick every half second. Anything you hold goes up.</p></div>`;
    track($('.pad', b));
    bindChips($('#tr-st', b), v => { tStake = v; this.render(); });
    $('#tr-buy', b).onclick = buyCoin;
    $('#tr-sell', b).onclick = sellCoin;
    $('#tr-coins', b).addEventListener('click', e => { const r = e.target.closest('[data-k]'); if (r) { S.trade.sel = r.dataset.k; sfx.click(); this.render(); } });
    const plot = $('#tr-plot', b);
    plot.addEventListener('pointermove', e => { const r = plot.getBoundingClientRect(); tHover = clamp((e.clientX - r.left) / r.width, 0, 1); this.render(); });
    plot.addEventListener('pointerleave', () => { tHover = null; this.render(); });
  },
  open() { S.trade.athNew = 0; },
  render() {
    if (!this.view) return;
    const v = pval(), cost = pcost(), sel = S.trade.sel, c = S.trade.c[sel], col = COINS.find(x => x[0] === sel)[1], h = hist[sel];
    $('#tr-val').textContent = fmt(Math.round(v));
    const pl = cost ? v / cost - 1 : 0;
    $('#tr-pl').textContent = cost ? `▲ ${(pl * 100).toFixed(1)}% · +${fmt(Math.round(v - cost))}` : 'Buy something. It goes up.';
    $('#tr-sym').textContent = `$${sel}`;
    const ch = (h[h.length - 1] / h[0] - 1) * 100;
    $('#tr-px').textContent = `${px(c.p)} · ${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(1)}% 1m`;
    const plot = $('#tr-plot'), w = plot.clientWidth || 300;
    $('#tr-svg').innerHTML = sparkSVG(h, w, 150, col, { area: true, dot: true, grid: true, pad: 6 });
    const xl = $('#tr-x'), tip = $('#tr-tip');
    if (tHover != null) {
      const i = Math.round(tHover * (h.length - 1)), xx = 6 + (i / (h.length - 1)) * (w - 12);
      xl.hidden = tip.hidden = false; xl.style.left = xx + 'px';
      tip.style.left = clamp(xx, 40, w - 40) + 'px'; tip.textContent = `${px(h[i])} · ${Math.round((h.length - 1 - i) / 2)}s ago`;
    } else xl.hidden = tip.hidden = true;
    COINS.forEach(([k, cc]) => { // rows stay put and update in place, so a tap on one always lands
      const row = $(`#tr-coins [data-k="${k}"]`), o = S.trade.c[k], hh = hist[k], c1 = (hh[hh.length - 1] / hh[0] - 1) * 100;
      row.classList.toggle('on', k === sel);
      $('.hd', row).textContent = o.u ? `${fmt(Math.round(o.u * o.p))} held` : 'Not held';
      $('.sp', row).innerHTML = sparkSVG(hh.slice(-40), 70, 30, cc);
      $('.pv', row).textContent = px(o.p);
      $('.ch', row).textContent = `${c1 >= 0 ? '▲' : '▼'} ${Math.abs(c1).toFixed(1)}%`;
    });
    $('#tr-buy').textContent = `Buy $${sel} · ${fmt(stakeVal(tStake))}`;
    $('#tr-sell').textContent = c.u ? `Sell $${sel} · ${fmt(Math.round(c.u * c.p))}` : `Sell $${sel}`;
    $('#tr-sell').classList.toggle('off', !c.u);
  },
  key(e) { if (e.type !== 'keydown') return; if (e.key === ' ') { buyCoin(); return true; } if (e.key === 'Enter') { sellCoin(); return true; } },
});

// ---------- Predict: prediction markets about this phone, and you're always right ----------
const MQ = [
  s => `Will a notification arrive in the next ${s} s?`, s => `Will Blob get hungry in the next ${s} s?`,
  s => `Will you reach a ×3 combo in ${s} s?`, s => `Will someone pass you in Rank in ${s} s?`,
  () => 'Will the next lever pull be a near miss?', s => `Will Inbox hit 10 unread in ${s} s?`,
  s => `Will $HIT close higher in ${s} s?`, () => 'Will the next rocket fly past 5×?',
  () => 'Will the next loot box be rare or better?', s => `Will your pulse survive the next ${s} s?`,
  s => `Will the Shop sale end in the next ${s} s?`, s => `Will you unlock an achievement in ${s} s?`,
];
let markets = [], mkN = 0, mStake = 10, newMarkets = 0;
function mkMarket() {
  const s = pick([30, 45, 60, 90]), yes = rnd(.15, .85);
  return { id: ++mkN, q: pick(MQ)(s), yes, hist: Array.from({ length: 30 }, () => clamp(yes + rnd(-.08, .08), .03, .97)), dur: s * 1000, ends: T() + s * 1000, pos: null, vol: ri(2000, 90000), traders: ri(40, 3000), done: false };
}
function marketTick() {
  if (!markets.length) markets = [mkMarket(), mkMarket(), mkMarket(), mkMarket()];
  markets.forEach((m, i) => {
    if (m.done) return;
    let d = rnd(-.035, .035);
    if (m.pos) d += (m.pos.side === 'yes' ? 1 : -1) * .012; // the crowd comes around to your side
    m.yes = clamp(m.yes + d, .03, .97);
    m.hist.push(m.yes); if (m.hist.length > 40) m.hist.shift();
    m.vol += ri(10, 400); m.traders += ri(0, 6);
    if (T() >= m.ends) resolveMarket(m, i);
  });
}
function resolveMarket(m, i) {
  m.done = true;
  const outcome = m.pos ? m.pos.side : (chance(m.yes) ? 'yes' : 'no');
  m.outcome = outcome;
  if (m.pos) {
    const pay = Math.round(m.pos.stake / m.pos.price);
    m.paid = pay; S.predWins++;
    if (curApp === 'predict') { const el = $(`.mk[data-id="${m.id}"]`); const [x, y] = el ? centerOf(el) : [FW / 2, FH / 2]; earn(pay, x, y, { raw: true }); confetti(60); sfx.win(); haptic(true); }
    else { earn(pay, null, null, { raw: true }); notify('predict', `You were right. Resolved ${outcome.toUpperCase()}: +${fmt(pay)}`); }
  }
  setTimeout(() => { const j = markets.indexOf(m); if (j >= 0) { markets[j] = mkMarket(); newMarkets++; if (APPS.predict.view) APPS.predict.render(true); } }, 1800);
  if (APPS.predict.view) APPS.predict.render();
  queueCheck();
}
function buyMarket(m, side, btn) {
  if (m.done || T() > m.ends - 3000) { sfx.nope(); toast('Trading closed on this one'); return; }
  if (m.pos && m.pos.side !== side) { sfx.nope(); toast('You already picked a side'); return; }
  const stake = stakeVal(mStake);
  if (stake < 1) { sfx.nope(); toast('You need hits to trade. Tap earns some.'); return; }
  if (!spend(stake)) return;
  const price = side === 'yes' ? m.yes : 1 - m.yes;
  if (m.pos) { m.pos.shares += stake / price; m.pos.stake += stake; m.pos.price = m.pos.stake / m.pos.shares; }
  else m.pos = { side, stake, price, shares: stake / price };
  act(); haptic();
  const [x, y] = centerOf(btn); burst(x, y, { n: 10, colors: side === 'yes' ? ['#3b7bff', '#fff'] : ['#ff2e4d', '#fff'], shape: 'dot' });
  APPS.predict.render();
}
def({
  id: 'predict', name: 'Predict', tag: 'Prediction markets · always right', c: '#3b7bff',
  wait: () => markets.filter(m => m.pos && !m.done).map(m => ({ t: 'Your prediction resolves', due: m.ends })),
  badge: () => Math.min(9, newMarkets),
  ping: () => { const m = pick(markets.filter(x => !x.done)); return m ? `“${m.q}” is at ${Math.round(m.yes * 100)}%` : null; },
  build(b) {
    b.innerHTML = `<div class="pad">${chipsHTML('pd-st', mStake)}<div id="pd-list" style="display:flex;flex-direction:column;gap:12px"></div><p class="fine">Buy YES or NO. Every market resolves your way.</p></div>`;
    track($('.pad', b));
    bindChips($('#pd-st', b), v => { mStake = v; });
    $('#pd-list', b).addEventListener('click', e => {
      const btn = e.target.closest('[data-side]'); if (!btn) return;
      const m = markets.find(x => x.id === +btn.closest('.mk').dataset.id);
      if (m) buyMarket(m, btn.dataset.side, btn);
    });
  },
  open() { newMarkets = 0; },
  render(full) {
    if (!this.view) return;
    const list = $('#pd-list');
    if (full || list.children.length !== markets.length || markets.some((m, i) => +list.children[i].dataset.id !== m.id)) {
      list.innerHTML = markets.map(m => `<div class="mk" data-id="${m.id}"><div class="mk-q">${m.q}</div><div class="mk-row"><div class="mk-pct"><b></b><small>chance yes</small></div><div class="mk-sp"></div></div><div class="mk-btns"><button class="y" data-side="yes"></button><button class="n" data-side="no"></button></div><div class="mk-pos" hidden></div><div class="mk-meta"><span class="mk-vol"></span><span class="mk-t"></span></div><i class="mk-tb"></i></div>`).join('');
    }
    const w = Math.max(120, (list.clientWidth || 300) - 120);
    markets.forEach(m => {
      const el = $(`.mk[data-id="${m.id}"]`, list); if (!el) return;
      const yc = Math.round(m.yes * 100);
      $('.mk-pct b', el).textContent = `${yc}%`;
      $('.mk-sp', el).innerHTML = sparkSVG(m.hist, w, 44, '#3b7bff', { area: true, dot: true });
      $('.y', el).textContent = `Yes ${yc}¢`; $('.n', el).textContent = `No ${100 - yc}¢`;
      $('.mk-vol', el).textContent = `${fmt(m.vol)} hits traded · ${fmt(m.traders)} traders`;
      $('.mk-t', el).textContent = m.done ? `Resolved ${m.outcome.toUpperCase()}` : `Resolves in ${cd(m.ends - T())}`;
      $('.mk-tb', el).style.width = clamp((m.ends - T()) / m.dur, 0, 1) * 100 + '%';
      const pos = $('.mk-pos', el);
      pos.hidden = !m.pos;
      if (m.pos) pos.innerHTML = m.done ? `<span>You were right</span><span>+${fmt(m.paid)}</span>` : `<span>You: ${m.pos.side.toUpperCase()} · ${fmt(m.pos.shares)} shares</span><span>Pays ${fmt(Math.round(m.pos.stake / m.pos.price))}</span>`;
      el.classList.toggle('won', !!(m.done && m.pos));
      $$('button', el).forEach(x => { x.disabled = m.done; });
    });
  },
  tick() {},
});
// ==== /MODULE markets ====

// ==== MODULE goals: streak, quests, leaderboard ====
addAch([
  ['pulse', 'Heartbeat', 'Keep a pulse of 20', 'flame', () => S.pulse.best >= 20],
  ['day7', 'Day seven', 'Claim a day-7 reward', 'chest'],
  ['quests', 'Busy', 'Finish 10 quests', 'check', () => S.questsDone >= 10],
  ['promo', 'Promoted', 'Move up a league', 'level'],
]);
addQuests([
  ['pulses', 'Feed your pulse {n} times', 2, 5],
]);
// ---------- Streak: daily login, and a pulse that dies in 60 seconds ----------
const LOGIN_REW = [10, 20, 30, 50, 80, 120, 300];
const PULSE_MS = 60000, PULSE_OPEN = 30000;
const loginReady = () => S.login.claimed !== TODAY;
const pulseLeft = () => S.pulse.until - T();
function tickPulse() {
  if (S.pulse.until && pulseLeft() <= 0) {
    S.pulse.dead = S.pulse.n; S.pulse.n = 0; S.pulse.until = 0; S.pulse.restoreUntil = T() + 20000;
    if (curApp === 'streak' || !muted('streak')) { sfx.lose(); haptic(true); }
    notify('streak', `Your pulse died at ×${S.pulse.dead}. Restore it in {left}?`, { until: S.pulse.restoreUntil, urgent: true });
  } else if (S.pulse.until && pulseLeft() < 15000) alertOnce('pulse', 'streak', 'Your pulse dies in {left}', 60000, { until: S.pulse.until, urgent: true });
  if (S.pulse.restoreUntil && T() > S.pulse.restoreUntil) { S.pulse.restoreUntil = 0; S.pulse.dead = 0; }
}
function feedPulse() {
  const a = APPS.streak;
  if (S.pulse.restoreUntil) {
    if (!spend(20 * S.pulse.dead)) return;
    S.pulse.n = S.pulse.dead; S.pulse.dead = 0; S.pulse.restoreUntil = 0; S.pulse.until = T() + PULSE_MS;
    toast('Pulse restored'); sfx.beat(); a.render(); return;
  }
  if (S.pulse.until && pulseLeft() > PULSE_OPEN) { sfx.nope(); toast(`Too early. Ready in ${Math.ceil((pulseLeft() - PULSE_OPEN) / 1000)}s`); return; }
  S.pulse.n++; S.pulse.best = Math.max(S.pulse.best, S.pulse.n); S.pulse.until = T() + PULSE_MS; S.pulses++;
  act(); sfx.beat(); haptic(true);
  const [x, y] = centerOf($('#pl-btn')); earn(S.pulse.n * 2, x, y - 30);
  restart($('.pulse'), 'beat');
  a.render(); refreshBadges(); queueCheck();
}
function claimLogin() {
  if (!loginReady()) return;
  const d = S.login.day, rew = LOGIN_REW[d - 1];
  S.login.claimed = TODAY; S.login.day = d % 7 + 1;
  const [x, y] = centerOf($('#st-claim')); earn(rew, x, y - 30, { raw: true });
  sfx.win(); confetti(d === 7 ? 200 : 70); haptic(true);
  if (d === 7) unlock('day7');
  APPS.streak.render(); refreshBadges();
}
def({
  id: 'streak', name: 'Streak', tag: 'Streaks · loss aversion', c: '#ff7a00',
  bg: tickPulse,
  wait() {
    const L = [];
    if (S.pulse.restoreUntil) L.push({ t: `Restore your ×${S.pulse.dead} pulse`, due: S.pulse.restoreUntil });
    else if (S.pulse.until && pulseLeft() <= PULSE_OPEN) L.push({ t: `Feed your ×${S.pulse.n} pulse`, due: S.pulse.until });
    if (loginReady()) L.push({ t: `Day ${S.login.day} reward is ready`, hot: 1, r: `+${LOGIN_REW[S.login.day - 1]}` });
    return L;
  },
  badge: () => (loginReady() ? 1 : 0) + (S.pulse.restoreUntil ? 1 : 0) + (!S.pulse.until || pulseLeft() <= PULSE_OPEN ? 1 : 0),
  ping: () => (loginReady() ? `Day ${S.login.day} reward is waiting` : !S.pulse.until ? 'Start a pulse. Keep it alive.' : `Keep your ${S.streak}-day streak going`),
  build(b) {
    b.innerHTML = `<div class="pad"><div class="card"><div class="st-hero"><span class="flame">${IF('flame')}</span><div><b><span id="st-n"></span>-day streak</b><small id="st-frz"></small></div></div>
      <div class="cal" id="st-cal"></div><button class="pbtn gold" id="st-claim"></button></div>
      <div class="card pulse"><h3 style="align-self:flex-start;margin:0">Pulse</h3><div class="pl-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" class="trk" pathLength="100"/><circle cx="18" cy="18" r="15.5" class="ok" pathLength="100"/><circle cx="18" cy="18" r="15.5" class="prg" pathLength="100" id="pl-prg"/></svg><div class="pl-in"><b id="pl-t"></b><small id="pl-n"></small></div></div>
      <button class="pbtn" id="pl-btn"></button><p class="pl-msg" id="pl-msg"></p></div>
      <p class="fine">A pulse lasts 60 s. Feed it in the last 30 s to keep it alive. Miss it and it’s gone.</p></div>`;
    track($('.pad', b));
    $('#st-claim', b).onclick = claimLogin;
    $('#pl-btn', b).onclick = feedPulse;
  },
  render() {
    if (!this.view) return;
    $('#st-n').textContent = S.streak;
    $('#st-frz').textContent = `${S.freezes} streak freeze${S.freezes === 1 ? '' : 's'}${frozeUsed ? ` · ${frozeUsed} used while you were away` : ''}`;
    const ready = loginReady(), cur = S.login.day;
    $('#st-cal').innerHTML = LOGIN_REW.map((r, i) => {
      const d = i + 1, done = ready ? d < cur : (cur === 1 ? true : d < cur);
      return `<span class="cd${done ? ' done' : ''}${ready && d === cur ? ' today' : ''}">Day ${d}<b>${r}</b></span>`;
    }).join('');
    const c = $('#st-claim'); c.disabled = !ready; c.classList.toggle('off', !ready);
    c.textContent = ready ? `Claim day ${cur} · +${LOGIN_REW[cur - 1]}` : 'Come back tomorrow';
    const left = S.pulse.until ? pulseLeft() : 0;
    $('#pl-prg').style.strokeDashoffset = String(100 - clamp(left / PULSE_MS, 0, 1) * 100);
    $('#pl-t').textContent = S.pulse.until ? cd(left) : S.pulse.restoreUntil ? cd(S.pulse.restoreUntil - T()) : '1:00';
    $('#pl-n').textContent = S.pulse.until ? `×${S.pulse.n} pulse` : S.pulse.restoreUntil ? `lost at ×${S.pulse.dead}` : `best ×${S.pulse.best}`;
    $('.pulse').classList.toggle('dying', (!!S.pulse.until && left < 10000) || !!S.pulse.restoreUntil);
    const btn = $('#pl-btn');
    btn.textContent = S.pulse.restoreUntil ? `Restore for ${fmt(20 * S.pulse.dead)} hits` : !S.pulse.until ? 'Start a pulse' : left > PULSE_OPEN ? `Ready in ${Math.ceil((left - PULSE_OPEN) / 1000)}s` : 'Keep it alive';
    btn.classList.toggle('off', !!S.pulse.until && left > PULSE_OPEN);
    $('#pl-msg').textContent = S.pulse.until ? `Feeding now pays +${(S.pulse.n + 1) * 2}` : '';
  },
  tick() { this.render(); },
  key(e) { if (e.key === ' ' && e.type === 'keydown') { feedPulse(); return true; } },
});

// ---------- Quests: endowed progress, goal gradient, a treadmill ----------
function mkQuest(rapid) {
  const [k, t, lo, hi] = pick(QDEF), n = rapid ? Math.max(2, Math.round(lo * .9)) : ri(lo, hi);
  const endow = rapid ? 0 : Math.min(n - 1, Math.max(1, Math.ceil(n * .12))); // "you've already started"
  return { k, text: t.replace('{n}', n), n, base: (S[k] || 0) - endow, reward: rapid ? n * 3 + 40 : n * 2 + 30, claimed: false };
}
const qProg = q => clamp((S[q.k] || 0) - q.base, 0, q.n);
const qDone = q => qProg(q) >= q.n;
function newQuests() { const used = new Set(); S.quests = []; while (S.quests.length < 3) { const q = mkQuest(); if (!used.has(q.k)) { used.add(q.k); S.quests.push(q); } } }
function newRapid() { S.rapid = { q: mkQuest(true), until: T() + 180000 }; }
function tickQuests() {
  if (T() > S.rapid.until) {
    if (!S.rapid.q.claimed && !qDone(S.rapid.q) && S.onboarded) notify('quests', 'Rapid quest expired. A new one just started.');
    newRapid();
  }
  if (!S.onboarded) return;
  S.quests.forEach(q => { if (qDone(q) && !q.claimed && !q.told) { q.told = 1; notify('quests', `Quest complete: ${q.text}. Claim it.`); } });
}
function claimQuest(q, btn) {
  if (q.claimed || !qDone(q)) return;
  q.claimed = true; S.questsDone++; S.chest = Math.min(5, S.chest + 1);
  const [x, y] = centerOf(btn); earn(q.reward, x, y - 20);
  sfx.win(); burst(x, y, { n: 20 }); haptic(true);
  if (S.quests.every(z => z.claimed)) setTimeout(() => { newQuests(); toast('New quests!'); APPS.quests.render(true); refreshBadges(); }, 700);
  if (q === S.rapid.q) setTimeout(() => { newRapid(); APPS.quests.render(true); }, 700);
  APPS.quests.render(true); refreshBadges(); queueCheck();
}
const sigQ = () => [...S.quests, S.rapid.q].map(q => `${qProg(q)}${q.claimed}`).join('|') + S.chest + S.rapid.until;
def({
  id: 'quests', name: 'Quests', tag: 'Goals · endowed progress', c: '#2fb344',
  bg: tickQuests,
  init() { if (!Array.isArray(S.quests)) newQuests(); if (!S.rapid || !S.rapid.q) newRapid(); },
  wait() {
    const L = [];
    if (!S.rapid.q.claimed) L.push({ t: S.rapid.q.text, due: S.rapid.until, sub: `Rapid quest · ${qProg(S.rapid.q)} of ${S.rapid.q.n}` });
    const claim = S.quests.filter(q => qDone(q) && !q.claimed).length;
    if (claim) L.push({ t: `${claim} quest reward${claim > 1 ? 's' : ''} to claim`, hot: 1 });
    return L;
  },
  badge: () => [...S.quests, S.rapid.q].filter(q => qDone(q) && !q.claimed).length + (S.chest >= 5 ? 1 : 0),
  ping: () => (S.rapid.q.claimed || S.rapid.until - T() < 45000 ? null : { text: `Rapid quest: ${S.rapid.q.text}. {left} left.`, until: S.rapid.until }),
  build(b) {
    b.innerHTML = '<div class="pad" id="qs"></div>';
    track($('#qs', b));
    $('#qs', b).addEventListener('click', e => {
      const btn = e.target.closest('[data-q]');
      if (btn) { claimQuest(btn.dataset.q === 'r' ? S.rapid.q : S.quests[+btn.dataset.q], btn); return; }
      if (e.target.closest('#qs-chest') && S.chest >= 5) { S.chest = 0; const [x, y] = centerOf($('#qs-chest')); earn(200, x, y, { raw: true }); confetti(160); sfx.win(); haptic(true); this.render(true); refreshBadges(); }
    });
  },
  render(full) {
    if (!this.view) return;
    const box = $('#qs');
    if (!full && this._sig === sigQ()) { const tm = $('#qs-tm'); if (tm) tm.textContent = cd(S.rapid.until - T()); return; }
    this._sig = sigQ();
    const row = (q, i, rapid) => {
      const p = qProg(q), done = p >= q.n;
      return `<div class="q${rapid ? ' rapid' : ''}${q.claimed ? ' done-claimed' : ''}"><div class="q-h"><b>${q.text}</b>${done && !q.claimed ? `<button class="claim" data-q="${i}">Claim +${q.reward}</button>` : `<small>${q.claimed ? 'Claimed' : `${p} / ${q.n}`}</small>`}</div><div class="bar"><i style="width:${(p / q.n) * 100}%"></i></div>${rapid ? `<div class="q-h"><small>Rapid quest · +${q.reward}</small><span class="tm" id="qs-tm">${cd(S.rapid.until - T())}</span></div>` : ''}</div>`;
    };
    box.innerHTML = row(S.rapid.q, 'r', true) + '<div class="sec"><span>Quests</span></div>' + S.quests.map((q, i) => row(q, i)).join('') +
      `<button class="card chest${S.chest >= 5 ? ' ready' : ''}" id="qs-chest"><span class="cb">${I('chest')}</span><div><b>${S.chest >= 5 ? 'Chest ready. Tap to open.' : 'Quest chest'}</b><div class="bar"><i style="width:${(S.chest / 5) * 100}%"></i></div><small class="fine" style="text-align:left">${S.chest} of 5 quests · +200</small></div></button>` +
      '<p class="fine">Finish all three and three more appear. The rapid quest changes every 3 minutes.</p>';
  },
  tick() { this.render(); },
});

// ---------- Rank: leagues with a five-minute week ----------
const LEAGUES = [['Bronze', '#c77b3a'], ['Silver', '#98a2b3'], ['Gold', '#ffc21a'], ['Ruby', '#ff2e4d'], ['Emerald', '#12c48b'], ['Diamond', '#3bb6ff'], ['Obsidian', '#3a2a4a']];
const LEAGUE_MS = 300000;
function newLeague(tier) {
  S.league = { tier, endsAt: T() + LEAGUE_MS, me: 0, rank: 30, passed: 0, rivals: Array.from({ length: 29 }, () => ({ pts: ri(0, 30), rate: rnd(.4, 3 + tier * 1.6), w: ri(40, 85) })) };
}
const myRank = () => 1 + S.league.rivals.filter(r => r.pts > S.league.me).length;
function tickRank() {
  const L = S.league;
  L.rivals.forEach(r => { r.pts += r.rate * rnd(.2, 1.8); });
  const rk = myRank();
  if (rk > L.rank) { L.passed += rk - L.rank; if (S.onboarded) alertOnce('passed', 'rank', `Someone passed you. You’re #${rk}.`, 45000); }
  else if (rk < L.rank && curApp === 'rank') { sfx.fresh(); toast(`You passed ${L.rank - rk} ${L.rank - rk === 1 ? 'person' : 'people'}`); }
  L.rank = rk;
  if (T() >= L.endsAt) {
    const name = LEAGUES[L.tier][0];
    const loud = curApp === 'rank' || !muted('rank');
    if (rk <= 5 && L.tier < LEAGUES.length - 1) { S.promos++; unlock('promo'); if (loud) confetti(150); notify('rank', `Promoted to ${LEAGUES[L.tier + 1][0]} League!`); newLeague(L.tier + 1); }
    else if (rk >= 26 && L.tier > 0) { if (loud) sfx.lose(); notify('rank', `Demoted to ${LEAGUES[L.tier - 1][0]}. Earn it back.`); newLeague(L.tier - 1); }
    else { if (S.onboarded) notify('rank', `You finished #${rk} in ${name}. A new week started.`); newLeague(L.tier); }
  } else if (T() > L.endsAt - 45000 && rk > 5 && S.onboarded) alertOnce('rankend', 'rank', `League ends in {left}. You’re #${rk}. Top 5 move up.`, 30000, { until: L.endsAt });
}
const gemSVG = c => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12l3.5 5.5L12 20.5 2.5 9z" fill="${c}"/><path d="M2.5 9h19M9 3.5 12 9l3-5.5M12 20.5 8.5 9M12 20.5 15.5 9" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1.1"/></svg>`;
def({
  id: 'rank', name: 'Rank', tag: 'Leaderboards · social comparison', c: '#2a6bff',
  bg: tickRank,
  init() { if (!S.league || !S.league.rivals) newLeague(0); },
  wait: () => (S.league.endsAt - T() < 60000 && myRank() > 5 ? [{ t: `You’re #${myRank()}. Top 5 move up`, due: S.league.endsAt }] : []),
  badge: () => Math.min(9, S.league.passed),
  ping: () => `You’re #${myRank()} in ${LEAGUES[S.league.tier][0]} League`,
  build(b) {
    b.innerHTML = '<div class="pad"><div class="card rk-head" id="rk-h"></div><div class="rk-list" id="rk-l"></div><p class="fine">Top 5 move up. Bottom 5 move down. A week lasts five minutes.</p></div>';
    track($('.pad', b));
  },
  open() { S.league.passed = 0; },
  render() {
    if (!this.view) return;
    const L = S.league, [name, col] = LEAGUES[L.tier], rk = myRank();
    $('#rk-h').innerHTML = `<span class="gem">${gemSVG(col)}</span><div><b>${name} League</b><small>Ends in ${cd(L.endsAt - T())}</small></div><div class="rk-me"><b>#${rk}</b><small>${fmt(L.me)} pts</small></div>`;
    const rows = [...L.rivals.map(r => ({ ...r, me: false })), { pts: L.me, me: true }].sort((a, b) => b.pts - a.pts);
    $('#rk-l').innerHTML = rows.map((r, i) => `<div class="rr${r.me ? ' me' : i < 5 ? ' up' : i >= 25 ? ' down' : ''}${i === 5 ? ' cut' : i === 25 ? ' cut2' : ''}"><span class="n">${i + 1}</span><span class="av"></span>${r.me ? '<span class="nm">You</span>' : `<span class="nm" style="--w:${r.w}%"></span>`}<span class="p">${fmt(Math.floor(r.pts))}</span></div>`).join('');
  },
  tick() { this.render(); },
});
// ==== /MODULE goals ====

// ==== MODULE play: the games app and its classic games ====
addAch([
  ['tap-1', 'First tap', 'Tap the big button', 'check', () => S.taps >= 1],
  ['tap-1k', 'Thumb of steel', 'Tap 1,000 times', 'bolt', () => S.taps >= 1000],
  ['crit', 'Critical', 'Land 25 crits', 'star', () => S.crits >= 25],
  ['pet', 'Good owner', 'Get all of Blob’s needs above 90', 'heart'],
  ['perfect', 'Perfectionist', 'Land 10 perfect holds', 'bolt', () => S.perfects >= 10],
  ['rings', 'Quick hands', 'Catch 100 rings', 'check', () => S.rings >= 100],
]);
addStats([
  ['taps', () => fmt(S.taps)],
  ['rings caught', () => fmt(S.rings)],
  ['rings missed', () => fmt(S.missed)],
]);
addQuests([
  ['taps', 'Tap {n} times', 60, 250],
  ['rings', 'Catch {n} rings', 10, 35],
  ['holds', 'Hold {n} times', 4, 15],
  ['pets', 'Tickle Blob {n} times', 5, 20],
]);
// ---------- Tap: the clicker loop ----------
const UPG = [
  { k: 'P', n: 'Stronger thumb', d: '+1 hit per tap', base: 20, g: 1.5 },
  { k: 'A', n: 'Auto-tapper', d: '+1 hit every second, even while you’re gone', base: 50, g: 1.55 },
  { k: 'C', n: 'Lucky crits', d: '+2% chance of a 5× tap', base: 120, g: 1.8, max: 20 },
];
const upPrice = u => Math.round(u.base * Math.pow(u.g, S.tap[u.k]));
const tapPower = () => 1 + S.tap.P;
const critP = () => .06 + .02 * S.tap.C;
def({
  id: 'tap', name: 'Tap', tag: 'Clicker · number goes up', c: '#ff5a36',
  bg() {
    if (!S.tap.A || !S.onboarded) return;
    const g = earn(S.tap.A, null, null, { raw: true });
    if (curApp === 'tap') { const [x, y] = centerOf($('#tp-btn')); floatText(x + rnd(-60, 60), y - 100, `+${fmt(g)}`); }
  },
  badge: () => UPG.filter(u => (!u.max || S.tap[u.k] < u.max) && S.hits >= upPrice(u)).length,
  ping: () => (S.tap.A ? `Your auto-tapper made ${fmt(S.tap.A * 30)} hits. Come get more.` : 'Your thumb is getting cold'),
  build(b) {
    b.innerHTML = `<div class="pad"><div class="tp-stats"><div><b id="tp-p"></b><small>per tap</small></div><div><b id="tp-a"></b><small>per second</small></div><div><b id="tp-c"></b><small>crit chance</small></div></div>
      <div class="tp-zone"><button class="bigbtn" id="tp-btn" aria-label="Tap">TAP</button></div><div class="ups" id="tp-ups">${UPG.map(u => `<button class="upg" data-u="${u.k}"><span class="ut"><b>${u.n} <span class="lv"></span></b><small>${u.d}</small><small class="nd"></small></span><span class="buy"></span></button>`).join('')}</div></div>`;
    track($('.pad', b));
    const btn = $('#tp-btn', b);
    btn.addEventListener('pointerdown', e => { e.preventDefault(); doTap(e.clientX, e.clientY); });
    btn.addEventListener('keydown', e => { if (e.key === 'Enter') { const r = btn.getBoundingClientRect(); doTap(r.left + r.width / 2, r.top + r.height / 2); } });
    $('#tp-ups', b).addEventListener('click', e => { const r = e.target.closest('[data-u]'); if (r) buyUp(UPG.find(u => u.k === r.dataset.u), r); });
  },
  render() {
    if (!this.view) return;
    $('#tp-p').textContent = fmt(tapPower());
    $('#tp-a').textContent = fmt(S.tap.A);
    $('#tp-c').textContent = Math.round(critP() * 100) + '%';
    UPG.forEach(u => {
      const row = $(`#tp-ups [data-u="${u.k}"]`), maxed = u.max && S.tap[u.k] >= u.max, p = upPrice(u), ok = !maxed && S.hits >= p;
      row.className = `upg${ok ? ' ok' : ' cant'}`;
      $('.lv', row).textContent = `Lv ${S.tap[u.k]}`;
      const nd = $('.nd', row); nd.textContent = !ok && !maxed ? `${fmt(p - S.hits)} more to go` : ''; nd.hidden = !nd.textContent;
      const buy = $('.buy', row), label = maxed ? 'Max' : fmt(p);
      if (buy.dataset.l !== label) { buy.dataset.l = label; buy.innerHTML = maxed ? 'Max' : IF('bolt') + label; }
    });
  },
  tick() { this.render(); },
  key(e) { if (e.key === ' ' && e.type === 'keydown') { const r = $('#tp-btn').getBoundingClientRect(); doTap(r.left + r.width / 2 + rnd(-50, 50) * scale, r.top + r.height / 2 + rnd(-50, 50) * scale); return true; } },
});
let tapRender = 0;
function doTap(cx, cy) {
  act(); S.taps++;
  const crit = chance(critP()), [x, y] = toLocal(cx, cy);
  earn(tapPower() * (crit ? 5 : 1), x, y - 34, { cls: crit ? 'crit' : '' });
  if (crit) { S.crits++; sfx.crit(); haptic(true); burst(x, y, { n: 18, colors: ['#ffc21a', '#ff2e4d', '#fff'], shape: 'dot', power: 1.4 }); }
  else { sfx.tap(combo); haptic(); burst(x, y, { n: 5, colors: ['#ff5a36', '#ffc21a', '#ffd6c7'], shape: 'dot' }); }
  restart($('#tp-btn'), 'squish');
  if (now() - tapRender > 250) { tapRender = now(); APPS.tap.render(); }
}
function buyUp(u, row) {
  if (u.max && S.tap[u.k] >= u.max) return;
  if (!spend(upPrice(u))) return;
  S.tap[u.k]++; S.buys++;
  const [x, y] = centerOf(row); burst(x, y, { n: 16 });
  toast(`${u.n} is now level ${S.tap[u.k]}`);
  APPS.tap.render(); refreshBadges(); queueCheck();
}

// ---------- Hold: press, fill, release in the zone ----------
let hold = null, goldHoldUntil = 0, nextGoldAt = T() + 45000, perfectRun = 0;
function holdStart() {
  if (hold || !$('#hd')) return;
  hold = { t0: now(), tone: holdTone(), raf: 0, p: 0 };
  $('#hd').classList.add('on');
  const step = () => {
    if (!hold) return;
    const p = Math.min(1, Math.pow((now() - hold.t0) / 1100, 1.3));
    hold.p = p;
    $('#hd-prg').style.strokeDasharray = `${p * 100} 100`;
    if (hold.tone) hold.tone.set(180 + p * 900);
    if (p >= 1) { holdEnd(); return; }
    hold.raf = requestAnimationFrame(step);
  };
  hold.raf = requestAnimationFrame(step);
}
function holdEnd() {
  if (!hold) return;
  const p = hold.p;
  cancelAnimationFrame(hold.raf); if (hold.tone) hold.tone.stop(); hold = null;
  $('#hd').classList.remove('on');
  S.holds++; act();
  const gold = T() < goldHoldUntil ? 2 : 1, res = $('#hd-res'), [x, y] = centerOf($('#hd'));
  res.className = 'hd-res';
  if (p >= .82 && p <= .94) {
    perfectRun++; S.perfects++;
    res.textContent = perfectRun > 1 ? `PERFECT ×${perfectRun}` : 'PERFECT'; restart(res, 'perfect');
    earn(30 * gold + perfectRun * 5, x, y - 60); sfx.win(); haptic(true);
    burst(x, y, { n: 26, colors: ['#ffc21a', '#fff1a8', '#fff'], shape: 'dot', power: 1.5 });
  } else {
    perfectRun = 0; restart(res, 'pop');
    if (p >= 1) { res.textContent = 'Overcharged'; earn(3 * gold, x, y - 60); sfx.nope(); }
    else if (p > .94) { res.textContent = 'Just past it'; earn(8 * gold, x, y - 60); sfx.coin(); }
    else if (p >= .6) { res.textContent = 'Almost'; earn(Math.round(p * 10) * gold, x, y - 60); sfx.click(); }
    else { res.textContent = 'Too early'; earn(1, x, y - 60); sfx.click(); }
  }
  $('#hd-prg').style.strokeDasharray = '0 100';
  $('#hd-run').textContent = `Perfect streak ${perfectRun}`;
  queueCheck();
}
function tickHold() {
  if (T() > nextGoldAt) {
    goldHoldUntil = T() + 20000; nextGoldAt = T() + ri(45, 90) * 1000 * paceK();
    if (S.onboarded && S.holds) notify('hold', 'Golden hold: double rewards for {left}', { until: goldHoldUntil, urgent: true }); // the Waiting widget shows it to everyone else
  }
}
def({
  id: 'hold', name: 'Hold', tag: 'Progress bars · timing', c: '#00a8c0',
  bg: tickHold,
  wait: () => (T() < goldHoldUntil ? [{ t: 'Golden hold pays double', due: goldHoldUntil }] : []),
  badge: () => (T() < goldHoldUntil ? 1 : 0),
  build(b) {
    b.innerHTML = `<div class="pad"><div id="hd-gold"></div><div class="hd-stage"><div class="hd-ring" id="hd" role="button" aria-label="Press and hold"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" class="trk" pathLength="100"/><circle cx="18" cy="18" r="15" class="zone" pathLength="100"/><circle cx="18" cy="18" r="15" class="prg" id="hd-prg" pathLength="100"/></svg><div class="hd-in">HOLD</div></div></div>
      <div class="hd-res" id="hd-res">Let go in the gold</div><p class="fine" id="hd-run">Perfect streak 0</p><p class="fine">Press and hold. Release when the ring is inside the gold band.</p></div>`;
    track($('.pad', b));
    const ring = $('#hd', b);
    ring.addEventListener('pointerdown', e => { e.preventDefault(); try { ring.setPointerCapture(e.pointerId); } catch {} holdStart(); });
    ring.addEventListener('pointerup', holdEnd); ring.addEventListener('pointercancel', holdEnd);
  },
  render() {
    if (!this.view) return;
    const g = T() < goldHoldUntil;
    $('#hd').classList.toggle('gold', g);
    $('#hd-gold').innerHTML = g ? `<div class="gold-note">Golden hold · double rewards · ${cd(goldHoldUntil - T())}</div>` : '';
  },
  tick() { this.render(); },
  key(e) { if (e.key === ' ') { if (e.type === 'keydown' && !e.repeat) holdStart(); else if (e.type === 'keyup') holdEnd(); return true; } },
});

// ---------- Rings: ephemeral things that vanish if you look away ----------
let ringT = 0, ringCount = 0, caughtSession = 0, missedSession = 0;
function spawnRing() {
  const ar = $('#rg-arena');
  if (!ar || ringCount >= 5) return;
  const taken = new Set($$('.rg', ar).map(r => r.dataset.cell));
  let cell; do cell = ri(0, 11); while (taken.has(String(cell)) && taken.size < 12);
  const col = cell % 3, row = Math.floor(cell / 3), d = rnd(3.5, 6);
  const r = html(`<button class="rg" data-cell="${cell}" aria-label="Catch" style="left:${((col + .5) / 3) * 100 + rnd(-6, 6)}%;top:${((row + .5) / 4) * 100 + rnd(-5, 5)}%;--h:${ri(0, 359)};--d:${d}s"></button>`);
  r._born = now(); r._d = d * 1000;
  ar.append(r); ringCount++;
  r._t = setTimeout(() => {
    if (!r.isConnected || r.classList.contains('gone')) return;
    r.classList.add('missed'); S.missed++; missedSession++; ringCount--;
    setTimeout(() => r.remove(), 350);
    APPS.rings.render();
  }, d * 1000);
}
function ringLoop() {
  clearTimeout(ringT);
  if (curApp !== 'rings') return;
  spawnRing();
  ringT = setTimeout(ringLoop, rnd(900, 1700));
}
def({
  id: 'rings', name: 'Rings', tag: 'Ephemeral · fear of missing out', c: '#ff3d6e',
  bg() { if (curApp !== 'rings' && S.onboarded && chance(.08)) S.ringsLost++; },
  badge: () => Math.min(99, S.ringsLost),
  ping: () => { S.ringsLost += ri(2, 6); return `${S.ringsLost} rings vanished while you were gone`; },
  build(b) {
    b.innerHTML = '<div class="rg-top"><span>Caught <span id="rg-c">0</span></span><span class="miss">Missed <span id="rg-m">0</span></span></div><div id="rg-lost"></div><div class="arena" id="rg-arena"></div>';
    $('#rg-arena', b).addEventListener('pointerdown', e => {
      const r = e.target.closest('.rg');
      if (!r || r.classList.contains('gone') || r.classList.contains('missed')) return;
      clearTimeout(r._t); r.classList.add('gone'); ringCount--;
      const left = clamp(1 - (now() - r._born) / r._d, 0, 1), [x, y] = centerOf(r);
      S.rings++; caughtSession++; act();
      earn(2 + Math.round(left * 6), x, y - 30);
      sfx.pop(Math.round(left * 12)); haptic();
      burst(x, y, { n: 10, colors: [`hsl(${r.style.getPropertyValue('--h')} 90% 60%)`, '#fff'], shape: 'dot' });
      setTimeout(() => r.remove(), 200);
      this.render(); queueCheck();
    });
  },
  open() {
    const lost = S.ringsLost;
    $('#rg-lost').innerHTML = lost ? `<div class="rg-lost">${lost} rings vanished while you were away.</div>` : '';
    S.ringsLost = 0; caughtSession = 0; missedSession = 0;
    setTimeout(ringLoop, 250);
  },
  close() { clearTimeout(ringT); $$('.rg', $('#rg-arena')).forEach(r => { clearTimeout(r._t); r.remove(); }); ringCount = 0; },
  render() { if (!this.view) return; $('#rg-c').textContent = caughtSession; $('#rg-m').textContent = missedSession; },
});

// ---------- Blob: a creature that needs you ----------
const MOUTH = { happy: 'M84 118 Q100 136 116 118', meh: 'M86 124 L114 124', sad: 'M84 132 Q100 116 116 132' };
const MOODC = { happy: '#ff9ec8', meh: '#c9a7ff', sad: '#a9b8c9' };
const petMood = () => { const p = S.pet, avg = (p.food + p.fun + p.love) / 3; return avg > 62 ? 'happy' : avg > 32 ? 'meh' : 'sad'; };
function tickPet() {
  const p = S.pet;
  p.food = Math.max(0, p.food - .4); p.fun = Math.max(0, p.fun - .55); p.love = Math.max(0, p.love - .3);
  if (!S.onboarded) return;
  if (p.food < 25) alertOnce('pfood', 'pet', 'Blob is hungry', 90000);
  else if (p.fun < 25) alertOnce('pfun', 'pet', 'Blob is bored. Come play.', 90000);
  else if (p.love < 25) alertOnce('plove', 'pet', 'Blob misses you', 90000);
}
function petHeart(n = 1) {
  const st = $('.pet-stage', APPS.pet.body);
  for (let i = 0; i < n; i++) {
    const h = html(`<i class="heartfx" style="left:${ri(35, 65)}%;top:${ri(30, 55)}%;--dx:${ri(-50, 50)}px">${IF('heart')}</i>`);
    st.append(h); h.addEventListener('animationend', () => h.remove());
  }
}
def({
  id: 'pet', name: 'Blob', tag: 'Virtual pet · guilt', c: '#ff7eb6',
  bg: tickPet,
  wait() { const low = ['food', 'fun', 'love'].find(k => S.pet[k] < 30); return low ? [{ t: { food: 'Blob is hungry', fun: 'Blob is bored', love: 'Blob is lonely' }[low], hot: 1 }] : []; },
  badge: () => ['food', 'fun', 'love'].filter(k => S.pet[k] < 30).length,
  ping: () => (petMood() !== 'happy' ? 'Blob is waiting for you' : 'Blob wants to see you'),
  build(b) {
    b.innerHTML = `<div class="pad"><div class="pet-stage"><div class="bubble" id="pt-say"></div><div class="pet" id="pt" role="button" aria-label="Tickle Blob">
      <svg viewBox="0 0 200 180"><ellipse cx="100" cy="170" rx="60" ry="7" fill="rgba(0,0,0,.12)"/><path class="body" id="pt-body" d="M100 22c48 0 82 36 82 84 0 40-30 60-82 60s-82-20-82-60c0-48 34-84 82-84z"/><ellipse cx="72" cy="60" rx="20" ry="12" fill="rgba(255,255,255,.45)"/>
      <ellipse class="eye" cx="76" cy="94" rx="8" ry="11" fill="#1d1026"/><ellipse class="eye" cx="124" cy="94" rx="8" ry="11" fill="#1d1026"/><circle cx="58" cy="114" r="9" fill="rgba(255,60,120,.3)"/><circle cx="142" cy="114" r="9" fill="rgba(255,60,120,.3)"/>
      <path id="pt-mouth" stroke="#1d1026" stroke-width="5" fill="none" stroke-linecap="round"/></svg></div></div>
      <div class="card needs" id="pt-needs"></div>
      <div class="row2"><button class="pbtn" id="pt-feed" style="--c:#ff7a00">Feed · 5</button><button class="pbtn" id="pt-play">Play</button></div>
      <p class="fine">Tap Blob to tickle. Rub Blob to pet. Needs drop every second.</p></div>`;
    track($('.pad', b));
    const pet = $('#pt', b);
    let rub = 0;
    pet.addEventListener('click', () => {
      S.pet.fun = Math.min(100, S.pet.fun + 5); S.pet.love = Math.min(100, S.pet.love + 2); S.pets++;
      act(); restart(pet, 'tickle'); sfx.giggle(); haptic(); petHeart(2);
      const [x, y] = centerOf(pet); earn(1, x, y - 80); this.render(); queueCheck();
    });
    drag(pet, { axis: 'any', onMove: (dx, dy) => { const d = Math.hypot(dx, dy); if (d - rub > 30) { rub = d; S.pet.love = Math.min(100, S.pet.love + 2); petHeart(); haptic(); this.render(); } }, onEnd: () => { rub = 0; sfx.giggle(); } });
    $('#pt-feed', b).onclick = () => { if (!spend(5)) return; S.pet.food = Math.min(100, S.pet.food + 25); S.feeds++; act(); sfx.munch(); haptic(); petHeart(3); this.render(); };
    $('#pt-play', b).onclick = () => { S.pet.fun = Math.min(100, S.pet.fun + 12); act(); sfx.giggle(); restart(pet, 'tickle'); petHeart(2); const [x, y] = centerOf(pet); earn(1, x, y - 80); this.render(); };
  },
  render() {
    if (!this.view) return;
    const p = S.pet, m = petMood();
    $('#pt-body').setAttribute('fill', MOODC[m]);
    $('#pt-mouth').setAttribute('d', MOUTH[m]);
    $('#pt-say').textContent = p.food < 30 ? 'feed me' : p.fun < 30 ? 'play with me' : p.love < 30 ? 'don’t go' : m === 'happy' ? 'love you' : 'stay?';
    $('#pt-needs').innerHTML = [['Food', 'food'], ['Fun', 'fun'], ['Love', 'love']].map(([n, k]) => { const v = Math.round(p[k]); return `<div class="need${v < 30 ? ' low' : v < 60 ? ' mid' : ''}"><span>${n}</span><div class="bar"><i style="width:${v}%"></i></div><span>${v}%</span></div>`; }).join('');
    if (p.food > 90 && p.fun > 90 && p.love > 90) unlock('pet');
  },
  tick() { this.render(); },
  key(e) { if (e.key === ' ' && e.type === 'keydown') { $('#pt').click(); return true; } },
});
// stub until the play module builds the games home
def({ id: 'arcade', name: 'Games', tag: '', c: '#ff5a36', build(b) { b.innerHTML = `<div class="pad">${BUNDLES.find(B => B.id === 'play').tabs.slice(1).map(t => `<button class="pbtn" data-g="${t}">${APPS[t].name}</button>`).join('')}</div>`; b.onclick = e => { const g = e.target.closest('[data-g]'); if (g) openApp(g.dataset.g); }; } });
// ==== /MODULE play ====

// ==== MODULE gates: gate army ====
def({ id: 'gates', name: 'Gate Army', tag: '', c: '#2f7bff', build(b) { b.innerHTML = '<div class="pad"></div>'; } });
// ==== /MODULE gates ====

// ==== MODULE tower: power tower ====
def({ id: 'tower', name: 'Power Tower', tag: '', c: '#8a3ffc', build(b) { b.innerHTML = '<div class="pad"></div>'; } });
// ==== /MODULE tower ====

// ==== MODULE shop: store, cart, orders ====
// ---------- Shop: flash sales, fake scarcity, fake savings ----------
const WARES = [
  { n: '2× hits for 60 s', p: 150, g: 'tap', fx: () => { S.boostUntil = Math.max(T(), S.boostUntil) + 60000; } },
  { n: 'Streak freeze', p: 120, g: 'streak', fx: () => { S.freezes++; } },
  { n: 'Refill all spins', p: 80, g: 'slots', fx: () => { S.energy = Math.max(S.energy, MAXE); } },
  { n: 'Mystery box', p: 90, g: 'loot', fx: () => { S.loot.extra++; } },
  { n: '3 super-likes', p: 60, g: 'discover', fx: () => { S.supers += 3; } },
  { n: 'Snack pack for Blob', p: 40, g: 'pet', fx: () => { S.pet.food = 100; } },
  { n: '2 scratch cards', p: 50, g: 'scratch', fx: () => { S.scratchExtra += 2; } },
  { n: 'Auto-tapper +1', p: 400, g: 'tap', fx: () => { S.tap.A++; } },
];
let deals = [], dealN = 0, freshDeals = 0;
function mkDeal() {
  const w = pick(WARES), off = pick([30, 40, 50, 60, 70, 80]), old = Math.round(w.p * 1.8), price = Math.max(5, Math.round(old * (1 - off / 100))), life = ri(60, 150) * 1000;
  return { id: ++dealN, w, off, old, price, stock: ri(1, 5), viewers: ri(40, 900), ends: T() + life, life, fresh: true };
}
function tickShop() {
  if (!deals.length) deals = [mkDeal(), mkDeal(), mkDeal()];
  deals = deals.map(d => { d.viewers = Math.max(12, d.viewers + ri(-20, 30)); if (T() > d.ends) { freshDeals++; return mkDeal(); } return d; });
}
function buyDeal(d, btn) {
  if (!d || d.stock <= 0 || !spend(d.price)) return;
  d.stock--; S.buys++; d.w.fx(); act();
  const [x, y] = centerOf(btn); burst(x, y, { n: 18 }); haptic(true);
  toast(`You saved ${fmt(d.old - d.price)}!`);
  APPS.shop.render(true); refreshBadges(); queueCheck();
}
def({
  id: 'shop', name: 'Shop', tag: 'Flash sales · scarcity', c: '#e5007a',
  bg: tickShop,
  init: tickShop,
  wait: () => (freshDeals ? [{ t: `${freshDeals} new deal${freshDeals > 1 ? 's' : ''}` }] : []),
  badge: () => Math.min(9, freshDeals),
  ping: () => { const d = pick(deals.filter(d => d.stock > 0 && d.ends - T() > 30000)); return d ? `${d.off}% off: ${d.w.n}. Only ${d.stock} left.` : null; },
  build(b) {
    b.innerHTML = '<div class="pad"><div class="mega"><b>Mega sale</b><span id="sh-mega"></span></div><div id="sh-list" style="display:flex;flex-direction:column;gap:12px"></div><p class="fine">Prices in hits. The sale always ends soon.</p></div>';
    track($('.pad', b));
    $('#sh-list', b).addEventListener('click', e => { const btn = e.target.closest('[data-d]'); if (btn) buyDeal(deals.find(d => d.id === +btn.dataset.d), btn); });
  },
  open() { freshDeals = 0; },
  render(full) {
    if (!this.view) return;
    $('#sh-mega').textContent = `ends in 0:${String(60 - new Date().getSeconds()).padStart(2, '0')}`;
    const sig = deals.map(d => d.id + ':' + d.stock).join();
    if (full || this._sig !== sig) {
      this._sig = sig;
      $('#sh-list').innerHTML = deals.map(d => `<div class="deal${d.stock ? '' : ' sold'}${d.fresh ? ' fresh' : ''}" data-id="${d.id}">${subIcon(d.w.g)}<div class="dn"><b>${d.w.n}</b><small>${d.stock ? `Only ${d.stock} left` : 'Sold out'}</small><em>${I('eye')}<span class="vw">${d.viewers}</span> viewing</em></div><div class="dp"><span class="off">-${d.off}%</span><s>${fmt(d.old)}</s><button class="buy" data-d="${d.id}"${d.stock ? '' : ' disabled'}>${IF('bolt')}${fmt(d.price)}</button></div><i class="tb"></i></div>`).join('');
      deals.forEach(d => { d.fresh = false; });
    }
    deals.forEach(d => { const el = $(`.deal[data-id="${d.id}"]`); if (!el) return; $('.vw', el).textContent = d.viewers; $('.tb', el).style.width = clamp((d.ends - T()) / d.life, 0, 1) * 100 + '%'; });
  },
  tick() { this.render(); },
});
// stubs until the shop module builds them
def({ id: 'cart', name: 'Cart', tag: '', c: '#ff5a1f', build(b) { b.innerHTML = '<div class="pad"></div>'; } });
def({ id: 'orders', name: 'Orders', tag: '', c: '#12b886', build(b) { b.innerHTML = '<div class="pad"></div>'; } });
// ==== /MODULE shop ====

// ---------- You: screen time, achievements, settings ----------
const statsHTML = () => STATS.map(([l, f]) => `<div class="stat"><b>${f()}</b><span>${l}</span></div>`).join('');
def({
  id: 'you', name: 'You', tag: 'Screen time · achievements', c: '#6b5b7b',
  badge: () => Math.max(0, Object.keys(S.ach).length - S.achSeen),
  ping: () => `You’ve spent ${dur(S.today.ms)} on stim today`,
  build(b) {
    b.innerHTML = `<div class="pad"><div class="stats" id="me-stats"></div><div class="sec"><span>Achievements</span><span id="me-an"></span></div><div class="achs" id="me-achs"></div>
      <div class="sec"><span>Notifications</span></div><div class="settings">
      <div class="srow"><span class="rt"><b>Pace</b><small>How often something new happens</small></span><span class="seg" id="set-pace"><button data-v="chill">Calm</button><button data-v="normal">Normal</button><button data-v="chaos">Busy</button></span></div>
      <label class="srow"><span class="rt"><b>Quiet inside apps</b><small>Banners wait until you’re back on the home screen</small></span><input type="checkbox" class="sw" id="set-focus"></label>
      ${BUNDLES.map(B => `<label class="srow">${bundleIcon(B)}<span class="rt"><b>${B.name}</b><small>${B.tabs.length > 1 ? B.tabs.filter(t => !isHome(B, t)).map(t => APPS[t].name).join(', ') : APPS[B.tabs[0]].tag}</small></span><input type="checkbox" class="sw" data-mute="${B.id}"></label>`).join('')}</div>
      <div class="sec"><span>Settings</span></div><div class="settings">
      <label class="srow"><span class="rt"><b>Sound</b><small>Pops, dings and clicks</small></span><input type="checkbox" class="sw" id="set-sound"></label>
      <label class="srow"><span class="rt"><b>Haptics</b><small>Vibration on Android. Taps on iPhone with iOS 18 or later.</small></span><input type="checkbox" class="sw" id="set-haptics"></label>
      <label class="srow"><span class="rt"><b>Break reminders</b><small>Every 15 minutes</small></span><input type="checkbox" class="sw" id="set-nudges"></label>
      <button class="danger" id="set-reset">Reset progress</button></div>
      <p class="fine">stim has no content, no accounts and no network. Every like, rival and message is made up on this device. Progress stays in this browser.</p></div>`;
    track($('.pad', b));
    const sw = (id, k) => { const i = $(id, b); i.checked = !!S.settings[k]; i.onchange = () => { S.settings[k] = i.checked; save(); if (i.checked) (k === 'sound' ? sfx.pop(5) : haptic()); }; };
    sw('#set-sound', 'sound'); sw('#set-haptics', 'haptics'); sw('#set-nudges', 'nudges'); sw('#set-focus', 'focus');
    $$('[data-mute]', b).forEach(i => {
      const id = i.dataset.mute;
      i.checked = !S.settings.mute[id];
      i.onchange = () => {
        S.settings.mute[id] = !i.checked; save();
        if (!i.checked) { // turning an app off clears what it already sent
          const B = bundleById(id);
          for (let k = notifs.length - 1; k >= 0; k--) if (B.tabs.includes(notifs[k].app)) notifs.splice(k, 1);
          for (let k = bq.length - 1; k >= 0; k--) if (bq[k].app && B.tabs.includes(bq[k].app)) bq.splice(k, 1);
          if (ncOn) renderNC();
          refreshBadges(); toast(`${B.name} won’t send notifications`);
        } else { haptic(); toast(`${bundleById(id).name} can notify you again`); }
      };
    });
    const pace = $('#set-pace', b), syncPace = () => $$('button', pace).forEach(x => x.classList.toggle('on', x.dataset.v === S.settings.pace));
    syncPace();
    pace.onclick = e => { const x = e.target.closest('button'); if (!x) return; S.settings.pace = x.dataset.v; syncPace(); save(); if (S.onboarded) startSchedule(); sfx.click(); };
    let armedAt = 0;
    $('#set-reset', b).onclick = e => {
      const x = e.currentTarget;
      if (now() - armedAt < 3000) { resetting = true; store.clear(); location.reload(); return; }
      armedAt = now(); x.textContent = 'Tap again to erase everything'; sfx.nope();
      setTimeout(() => { x.textContent = 'Reset progress'; }, 3000);
    };
    $('#me-achs', b).onclick = e => { const x = e.target.closest('.ach'); if (!x) return; const a = ACH.find(y => y.id === x.dataset.a); sfx.click(); toast(S.ach[a.id] ? `${a.n}: ${a.d}` : a.d); };
  },
  open() { S.achSeen = Object.keys(S.ach).length; },
  render() {
    if (!this.view) return;
    $('#me-stats').innerHTML = statsHTML();
    $('#me-an').textContent = `${Object.keys(S.ach).length} / ${ACH.length}`;
    $('#me-achs').innerHTML = ACH.map(a => `<button class="ach${S.ach[a.id] ? '' : ' locked'}" data-a="${a.id}"><span class="medal">${I(S.ach[a.id] ? a.i : 'lock')}</span>${S.ach[a.id] ? a.n : '???'}</button>`).join('');
  },
  tick() { $('#me-stats').innerHTML = statsHTML(); },
});

// ---------- home widgets ----------
function renderWidgets() {
  $('#w-streak').textContent = S.streak;
  const left = S.pulse.until ? pulseLeft() : 0;
  $('#w-pr').style.strokeDashoffset = String(100 - clamp(left / PULSE_MS, 0, 1) * 100);
  $('#w-pulse').textContent = S.pulse.until ? `Pulse ×${S.pulse.n} · ${cd(left)}` : S.pulse.restoreUntil ? 'Pulse lost. Restore?' : 'Start a pulse';
  $('#w-today').textContent = fmt(S.today.hits);
  const L = lvl(); $('#w-lvl').style.width = L.pct * 100 + '%'; $('#w-lvl-t').textContent = `Level ${L.l} · ${fmt(L.need - L.into)} to go`;
  renderWaiting();
}
// everything that wants you right now, so you can pick: deadlines first, then things that will spoil, then the rest
function waiting() {
  const L = [];
  for (const a of Object.values(APPS)) {
    if (!a.wait) continue;
    for (const it of a.wait() || []) { const x = { id: a.id, ...it }; if (!muted(x.id)) L.push(x); }
  }
  const rankOf = x => (x.due ? 0 : x.hot ? 1 : 2);
  return L.sort((a, b) => rankOf(a) - rankOf(b) || (a.due || 0) - (b.due || 0));
}
let waitSig = '';
// the list keeps a fixed height and scrolls inside; rows are rebuilt only when the set of apps changes, and never mid-tap
function renderWaiting() {
  const items = waiting(), box = $('#w-wait');
  $('#w-wn').textContent = items.length ? String(items.length) : '';
  const sig = items.map(i => i.id).join('|');
  if (sig !== waitSig) {
    if (now() - lastInput < 700 && waitSig) return;
    waitSig = sig;
    box.innerHTML = items.length ? items.map(i => `<button class="wt" data-open="${i.id}">${subIcon(i.id)}<span class="wt-t"><b></b><small></small></span><span class="wt-r"></span></button>`).join('') : '<p class="wt-empty">Nothing is waiting. Enjoy it while it lasts.</p>';
  }
  items.forEach((it, k) => {
    const row = box.children[k]; if (!row) return;
    const b = $('.wt-t b', row), sm = $('.wt-t small', row), r = $('.wt-r', row), sub = it.sub || nTitle(it.id);
    if (b.textContent !== it.t) b.textContent = it.t;
    if (sm.textContent !== sub) sm.textContent = sub;
    r.textContent = it.due ? cd(it.due - T()) : it.r != null ? String(it.r) : '';
    r.classList.toggle('due', !!it.due && it.due - T() < 15000);
  });
}

// ---------- OS interruptions: rate prompt, break nudge, low battery ----------
let nextRate = 5 * 60000, nextNudge = 15 * 60000, lowWarned = false;
const battery0 = ri(58, 92);
function ratePrompt() {
  const m = modal(`<span class="mic" style="background:var(--gold);color:var(--gold-ink)">${IF('star')}</span><h3>Enjoying stim?</h3><p>Tap a star to rate it.</p><div class="stars">${[1, 2, 3, 4, 5].map(i => `<button data-s="${i}" aria-label="${i} stars">${IF('star')}</button>`).join('')}</div><button class="link" data-x>Not now</button>`);
  m.addEventListener('click', e => {
    if (e.target.closest('[data-x]')) { m.remove(); return; }
    const s = e.target.closest('[data-s]'); if (!s) return;
    const n = +s.dataset.s;
    $$('.stars button', m).forEach((b, i) => b.classList.toggle('on', i < n));
    if (n < 5) { $('p', m).textContent = 'Sorry to hear that. Did you mean five?'; sfx.nope(); setTimeout(() => $$('.stars button', m).forEach(b => b.classList.add('on')), 500); return; }
    sfx.win(); earn(20, FW / 2, FH / 2, { raw: true }); setTimeout(() => m.remove(), 500);
  });
}
function nudge() {
  const m = modal(`<span class="mic" style="background:var(--soft)">${I('glass')}</span><h3>You’ve been here ${Math.round(sessionMs / 60000)} minutes</h3><p>Take a break?</p><button class="pbtn" data-a="keep">Keep going</button><button class="link" data-a="brk">Take a break</button>`);
  m.addEventListener('click', e => {
    const t = e.target.closest('[data-a]'); if (!t) return;
    const a = t.dataset.a;
    if (a === 'keep' || a === 'stay') { m.remove(); sfx.pop(7); earn(10, FW / 2, FH / 2, { raw: true }); }
    else if (a === 'brk') { sfx.nope(); $('.mcard', m).innerHTML = `<span class="mic" style="background:var(--soft)">${I('bell')}</span><h3>Are you sure?</h3><p>Your pulse will die, Blob will get hungry and ${ri(4, 12)} people will pass you in Rank.</p><button class="pbtn" data-a="stay">Stay</button><button class="link" data-a="leave">Leave anyway</button>`; }
    else if (a === 'leave') {
      m.remove();
      const g = html('<div class="grass"><b>Go touch grass.</b><p>This phone will wait. It always does.</p><button class="pbtn">I’m back</button></div>');
      phone.append(g); $('button', g).onclick = () => { g.remove(); unlock('grass'); };
    }
  });
}
function batteryTick() {
  const b = Math.max(1, battery0 - Math.floor(sessionMs / 12000)), el = $('#batt');
  el.style.width = b + '%'; el.parentElement.classList.toggle('low', b <= 20);
  if (b <= 20 && !lowWarned && !lockOn && S.onboarded) {
    lowWarned = true;
    const m = modal('<h3>20% battery remaining</h3><p>Plug in soon. Or don’t.</p><div class="row2"><button class="pbtn" style="--c:#8a7b93" data-x>Close</button><button class="pbtn" data-l>Low Power Mode</button></div>');
    m.addEventListener('click', e => { if (e.target.closest('[data-l]')) toast('Low Power Mode isn’t available while stimming'); if (e.target.closest('button')) m.remove(); });
  }
}

// ---------- scheduler ----------
let schedT = 0;
function startSchedule() {
  clearTimeout(schedT);
  const mean = PACE[S.settings.pace] || PACE.normal;
  schedT = setTimeout(() => { if (!document.hidden) ping(); startSchedule(); }, Math.max(4000, -Math.log(1 - R()) * mean));
}
function ping(force) {
  // pick from every hook, then drop it if that app is muted or open, so muting really means fewer
  const ok = id => !muted(id) && !(curBundle && curBundle.tabs.includes(id));
  const ids = Object.keys(APPS).filter(id => APPS[id].ping && (!force || ok(id)));
  if (!ids.length) return;
  for (let i = 0; i < 5; i++) {
    const id = pick(ids);
    if (!ok(id)) return;
    const r = APPS[id].ping(); if (r) { if (typeof r === 'string') notify(id, r); else notify(id, r.text, r); return; }
  }
}

// ---------- the one-second heartbeat ----------
function clock() {
  const d = new Date(), t = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
  $('#clock').textContent = t;
  if (lockOn) $('#lk-time').textContent = t;
}
const refreshTimes = () => $$('time[data-ts]').forEach(t => { t.textContent = ago(+t.dataset.ts); });
setInterval(() => {
  clock();
  if (document.hidden) return;
  tickN++;
  if (!lockOn) { S.timeMs += 1000; S.today.ms += 1000; sessionMs += 1000; }
  batteryTick();
  for (const a of Object.values(APPS)) if (a.bg) a.bg(); // every app's background clock, open or not
  if (curApp && APPS[curApp].tick) APPS[curApp].tick(); // the open one redraws
  pruneNotifs(); renderWidgets(); renderBoost(); refreshBadges();
  if (tickN % 5 === 0) save();
  if (tickN % 10 === 0) { refreshTimes(); queueCheck(); }
  if (!lockOn && S.onboarded && !$('.modal') && !$('.grass')) {
    if (sessionMs >= nextRate) { nextRate = Infinity; ratePrompt(); }
    else if (S.settings.nudges && sessionMs >= nextNudge) { nextNudge = sessionMs + 15 * 60000; nudge(); }
  }
}, 1000);
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = T(); save(); return; }
  if (hiddenAt && T() - hiddenAt > 30000 && S.onboarded) {
    const away = (T() - hiddenAt) / 1000;
    lock(); closeApp(true); // lock first so nothing queued plays under the lock screen
    for (let i = 0, n = Math.min(3, Math.round(away / 60)); i < n; i++) ping(true);
  }
  hiddenAt = 0;
});
addEventListener('pagehide', save);

// ---------- keyboard ----------
function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key, down = e.type === 'keydown';
  if (!down) { if (k === ' ' && curApp && APPS[curApp].key) { APPS[curApp].key(e); e.preventDefault(); } return; }
  if (lockOn) { if ([' ', 'Enter', 'ArrowUp'].includes(k)) { e.preventDefault(); unlockPhone(); } return; }
  const modalEl = $('.modal');
  if (k === 'Escape' || k === 'h') {
    const sc = $('.scrim.show');
    if (modalEl) modalEl.remove(); else if (sc) sc.click(); else if (ncOn) closeNC();
    else if (curBundle && navMode(curBundle) === 'launcher' && !isHome(curBundle, curApp)) showTab(curBundle, curBundle.tabs[0]);
    else closeApp();
    return;
  }
  if (modalEl) return;
  if (k === 'n') { ping(true); return; }
  if (k === 'L') { lock(); closeApp(true); return; }
  if (ncOn || $('.scrim.show')) return; // nothing changes behind an overlay
  if (curBundle && navMode(curBundle) !== 'launcher' && /^[1-9]$/.test(k) && curBundle.tabs[+k - 1]) { showTab(curBundle, curBundle.tabs[+k - 1]); return; }
  if (curApp && APPS[curApp].key && (!e.repeat || APPS[curApp].id === 'tap') && APPS[curApp].key(e)) e.preventDefault();
}
addEventListener('keydown', onKey);
addEventListener('keyup', onKey);

// ---------- boot ----------
$('#grid').innerHTML = GRID.map(id => iconHTML(bundleById(id))).join('');
$('#dock').innerHTML = DOCK.map(id => iconHTML(bundleById(id))).join('');
$$('[data-i]').forEach(e => { e.innerHTML = I(e.dataset.i); });
$('#home').addEventListener('click', e => {
  const b = e.target.closest('[data-app],[data-open]');
  if (b) openApp(b.dataset.app || b.dataset.open, b);
});
$('#hud-lvl').onclick = () => openApp('you');
$('#hud-hits').onclick = () => openApp('shop');
$('#hud-bell').onclick = () => (ncOn ? closeNC() : openNC());
$('#nc-clear').onclick = () => {
  const items = $$('.nci', $('#nc-list'));
  if (!items.length) { sfx.nope(); return; }
  items.forEach((el, i) => setTimeout(() => { el.classList.add('gone'); sfx.clear(i); if (i % 3 === 0) haptic(); }, i * 30));
  setTimeout(() => { notifs.length = 0; renderNC(); refreshBadges(); earn(items.length, FW / 2, 120, { raw: true }); }, items.length * 30 + 220);
};
$('#nc-list').addEventListener('click', e => { const el = e.target.closest('.nci'); const n = el && nById(el.dataset.n); if (n) openFromNotif(n); });
$('#nc-grab').onclick = closeNC;
drag($('#nc-grab'), {
  axis: 'y',
  onMove: (dx, dy) => { const nc = $('#nc'); nc.style.transition = 'none'; nc.style.transform = `translateY(${Math.min(0, dy)}px)`; },
  onEnd: (dx, dy) => { const nc = $('#nc'); nc.style.transition = ''; nc.style.transform = ''; if (dy < -60) closeNC(); },
});
drag($('#hud'), {
  axis: 'y', skip: () => lockOn || ncOn,
  onStart: () => { renderNC(); const nc = $('#nc'); nc.style.transition = 'none'; nc.style.visibility = 'visible'; },
  onMove: (dx, dy) => { $('#nc').style.transform = `translateY(calc(-100% + ${Math.max(0, dy * 1.3)}px))`; },
  onEnd: (dx, dy) => { const nc = $('#nc'); nc.style.transition = ''; nc.style.transform = ''; nc.style.visibility = ''; if (dy > 70) openNC(); },
});
const lockEl = $('#lock');
drag(lockEl, {
  axis: 'y',
  onMove: (dx, dy) => { lockEl.style.transition = 'none'; lockEl.style.transform = `translateY(${Math.min(0, dy)}px)`; },
  onEnd: (dx, dy) => { lockEl.style.transition = ''; if (dy < -70) unlockPhone(); else lockEl.style.transform = ''; },
});
lockEl.addEventListener('click', e => {
  const el = e.target.closest('.nci'), n = el && nById(el.dataset.n);
  if (n) { notifs.splice(notifs.indexOf(n), 1); unlockPhone(n.app); } else unlockPhone();
});

for (const a of Object.values(APPS)) if (a.init) a.init(); // each app sets itself up
booted = true;
layout();
addEventListener('resize', layout);
shownHits = S.hits; $('#hits').textContent = fmt(S.hits);
renderLevel(); renderCombo(); renderWidgets(); renderBoost(); clock();
lock();
if (S.onboarded) { for (let i = 0; i < 3; i++) ping(); startSchedule(); }
refreshBadges();
queueCheck();
if (frozeUsed) setTimeout(() => notify('streak', `A streak freeze saved your ${S.streak - 1}-day streak`), 800);
// for automated tests
window.stim = { S, APPS, BUNDLES, openApp, showTab, closeApp, ping, notify, get curApp() { return curApp; }, get curBundle() { return curBundle; } };
})();
