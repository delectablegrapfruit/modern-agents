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
addAch([
  ['cards', 'Bottomless', 'Reveal 500 cards', 'down', () => S.cards >= 500],
  ['match', 'Matchmaker', 'Get 10 matches', 'heart', () => S.matches >= 10],
  ['clips', 'Autopilot', 'Watch 100 clips', 'play', () => S.clips >= 100],
]);
addStats([
  ['cards revealed', () => fmt(S.cards)],
  ['swipes', () => fmt(S.swipes)],
  ['clips watched', () => fmt(S.clips)],
]);
addQuests([
  ['cards', 'Reveal {n} cards', 25, 100],
  ['swipes', 'Swipe {n} cards', 8, 30],
  ['clips', 'Watch {n} clips', 4, 15],
]);
// ---------- Scroll: infinite scroll where every card pays ----------
const TIERS = [['common', 58, 1, 3], ['uncommon', 26, 4, 8], ['rare', 11.5, 12, 25], ['epic', 3.8, 50, 90], ['legendary', .7, 250, 400]];
let hotLeft = 0, cardGate = 0, cardsLoading = false;
function mkCard(fresh) {
  const t = pickW(TIERS.map(([, w], i) => [i, hotLeft > 0 && i >= 2 ? w * 4 : w]));
  if (hotLeft > 0) hotLeft--;
  const [name, , lo, hi] = TIERS[t], v = ri(lo, hi);
  return html(`<div class="rc t${t}${fresh ? ' enter hot' : ''}" data-t="${t}" data-v="${v}"><span class="qm">?</span><span class="v">+${v}</span><small>${name}</small></div>`);
}
function revealCard(c) {
  if (c._r) return;
  c._r = 1; c.classList.add('rev'); APPS.posts.io.unobserve(c);
  const t = +c.dataset.t, v = +c.dataset.v, [x, y] = centerOf(c);
  S.cards++; act();
  earn(v, x + 40, y - 10);
  if (now() - cardGate > 45) { sfx.card(t); cardGate = now(); }
  if (t >= 3) { burst(x, y, { n: 24, colors: t === 4 ? ['#ffc21a', '#fff1a8', '#ff7a00'] : ['#9b5cff', '#c05cff', '#fff'], shape: 'dot', power: 1.3 }); haptic(true); }
  if (t === 4) { confetti(120); sfx.win(); }
}
function moreCards() {
  const a = APPS.posts;
  if (cardsLoading || !a.list) return;
  cardsLoading = true;
  setTimeout(() => {
    const frag = document.createDocumentFragment(), made = [];
    for (let i = 0; i < 12; i++) { const c = mkCard(); made.push(c); frag.append(c); }
    a.list.insertBefore(frag, a.load);
    made.forEach(c => a.io.observe(c));
    const cards = a.list.querySelectorAll('.rc');
    if (cards.length > 260) {
      const h = cards[120].offsetTop - cards[0].offsetTop;
      for (let i = 0; i < 120; i++) { a.io.unobserve(cards[i]); cards[i].remove(); }
      a.sc.scrollTop -= h;
    }
    cardsLoading = false;
    // re-arm the load observer: it reports again if the load row is still near, and stays quiet while the tab is hidden
    a.loadIO.unobserve(a.load); a.loadIO.observe(a.load);
  }, 110);
}
async function refreshScroll() {
  S.refreshes++;
  await wait(ri(260, 620));
  const r = R(), a = APPS.posts;
  if (r < .12) { sfx.nope(); toast('Nothing new. Pull again.'); return; }
  const big = r < .24, n = big ? 16 : ri(5, 9);
  hotLeft = big ? 16 : 4;
  const made = Array.from({ length: n }, () => mkCard(true));
  a.list.prepend(...made); made.forEach(c => a.io.observe(c));
  if (big) { sfx.big(); confetti(70); haptic(true); toast(`Hot refresh: ${n} boosted cards`); } else { sfx.fresh(); toast(`${n} fresh cards`); }
}
def({
  id: 'posts', name: 'Home', tag: 'Infinite scroll · pull to refresh', c: '#7b61ff',
  badge: () => Math.min(99, S.scrollNew),
  ping: () => { S.scrollNew += ri(4, 16); return `${Math.min(99, S.scrollNew)} new cards to reveal`; },
  build(b) {
    b.innerHTML = `<div class="scroller" id="sr-sc">${spinner}<div class="ptr-body" id="sr-list"><div class="loadrow" id="sr-load"></div></div></div>`;
    this.sc = $('#sr-sc', b); this.list = $('#sr-list', b); this.load = $('#sr-load', b);
    this.io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) revealCard(e.target); }), { root: this.sc, threshold: .6 });
    this.loadIO = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) moreCards(); }, { root: this.sc, rootMargin: '0px 0px 700px 0px' });
    this.loadIO.observe(this.load);
    this.ptr = PTR(this.sc, refreshScroll);
    track(this.sc);
  },
  open() { S.scrollNew = 0; },
  key(e) {
    if (e.key === 'ArrowDown' || e.key === 'j') { this.sc.scrollBy({ top: 280, behavior: 'smooth' }); return true; }
    if (e.key === 'ArrowUp' || e.key === 'k') { this.sc.scrollBy({ top: -280, behavior: 'smooth' }); return true; }
    if (e.key === 'r') { this.ptr.trigger(); return true; }
  },
});

// ---------- Swipe: swipe cards with intermittent matches ----------
const SHK = Object.keys(SHAPES);
const mkSwipe = () => html(`<div class="scard" style="--h:${ri(0, 359)}"><div class="shp">${shapeSVG(pick(SHK), 'rgba(255,255,255,.92)')}</div><span class="pct">${ri(61, 99)}% match</span><b class="stamp yes">YES</b><b class="stamp no">NOPE</b></div>`);
const topSwipe = () => $$('.scard', $('#deck')).filter(c => !c._gone).pop();
function armSwipe() {
  const c = topSwipe(); if (!c || c._armed) return;
  c._armed = true; c.classList.add('top');
  const yes = $('.stamp.yes', c), no = $('.stamp.no', c);
  drag(c, {
    axis: 'any',
    onMove: (dx, dy) => { c.style.transition = 'none'; c.style.transform = `translate(${dx}px, ${dy * .5}px) rotate(${dx / 16}deg)`; yes.style.opacity = clamp(dx / 80, 0, 1); no.style.opacity = clamp(-dx / 80, 0, 1); },
    onEnd: (dx, dy) => {
      if (dx > 80) flingSwipe(1); else if (dx < -80) flingSwipe(-1); else if (dy < -100) flingSwipe(0);
      else { c.style.transition = 'transform .25s cubic-bezier(.3,1.6,.5,1)'; c.style.transform = ''; yes.style.opacity = no.style.opacity = 0; }
    },
  });
}
function flingSwipe(dir) {
  const c = topSwipe(); if (!c) return;
  if (dir === 0 && S.supers <= 0) { sfx.nope(); toast('No super-likes left. The Shop has more.'); c.style.transition = 'transform .25s'; c.style.transform = ''; return; }
  c._gone = true;
  c.style.transition = 'transform .28s ease-in, opacity .28s';
  c.style.transform = dir === 0 ? 'translate(0, -720px) scale(.9)' : `translate(${dir * 560}px, 40px) rotate(${dir * 28}deg)`;
  c.style.opacity = '0';
  setTimeout(() => c.remove(), 300);
  $('#deck').prepend(mkSwipe());
  armSwipe();
  S.swipes++; act(); sfx.swoosh(); haptic();
  const [x, y] = centerOf($('#deck'));
  if (dir === 0) { S.supers--; showMatch(); }
  else if (dir > 0) { earn(2, x, y); if (chance(.16)) setTimeout(showMatch, 150); }
  else earn(1, x, y);
  APPS.discover.render();
}
function showMatch() {
  const a = APPS.discover;
  const m = html(`<div class="match"><div class="two"><i style="--h:${ri(0, 359)}"></i><i></i></div><b>It’s a match!</b></div>`);
  a.body.append(m);
  S.matches++; sfx.match(); haptic(true);
  const [x, y] = centerOf(m); burst(x, y, { n: 30, colors: ['#fff', '#ffd6e8', '#ff2e4d'], shape: 'heart', power: 1.4 });
  earn(25, x, y - 90);
  setTimeout(() => m.remove(), 1000);
  queueCheck();
}
def({
  id: 'discover', name: 'Discover', tag: 'Swipe cards · intermittent match', c: '#ff4fa3',
  bg() { if (curApp !== 'discover' && chance(.04)) S.likesYou++; if (S.supers < 3 && tickN % 40 === 0) S.supers++; },
  wait: () => (S.likesYou ? [{ t: `${S.likesYou} people liked you` }] : []),
  badge: () => Math.min(99, S.likesYou),
  ping: () => { S.likesYou += ri(1, 4); return `${S.likesYou} people liked you. See who.`; },
  build(b, r) {
    r.innerHTML = `<span class="chip" style="color:#ff4fa3">${IF('heart')}<span id="sw-m"></span></span>`;
    b.innerHTML = `<button class="sw-lk" id="sw-lk"><span class="blurs">${[0, 1, 2].map(() => `<i style="--h:${ri(0, 359)}"></i>`).join('')}</span><span><b id="sw-lkn"></b><small>See who liked you</small></span></button>
      <div class="deck" id="deck"></div>
      <div class="sw-btns"><button class="sb no" aria-label="Nope">${I('close')}</button><button class="sb sup" aria-label="Super like">${IF('star')}<small id="sw-sup"></small></button><button class="sb yes" aria-label="Like">${IF('heart')}</button></div>`;
    const deck = $('#deck', b);
    for (let i = 0; i < 3; i++) deck.append(mkSwipe());
    armSwipe();
    $('.sb.no', b).onclick = () => flingSwipe(-1);
    $('.sb.yes', b).onclick = () => flingSwipe(1);
    $('.sb.sup', b).onclick = () => flingSwipe(0);
    $('#sw-lk', b).onclick = () => {
      const n = Math.max(1, Math.min(9, S.likesYou));
      const c = html(`<div><div class="blurgrid">${Array.from({ length: n }, () => `<i style="--h:${ri(0, 359)}"></i>`).join('')}</div><p class="fine" style="margin:14px 0">${fmt(S.likesYou)} people liked you.</p><button class="pbtn" style="--c:#ff4fa3">Reveal for 300 hits</button></div>`);
      const close = sheet('Liked you', c);
      $('.pbtn', c).onclick = e => {
        if (!spend(300)) return;
        $('.blurgrid', c).classList.add('open');
        e.currentTarget.remove();
        $('.fine', c).textContent = 'They’re shapes. They were always shapes.';
        S.likesYou = 0; APPS.discover.render(); refreshBadges();
        setTimeout(close, 2200);
      };
    };
  },
  render() {
    if (!this.view) return;
    $('#sw-lkn').textContent = `${fmt(S.likesYou)} people liked you`;
    $('#sw-sup').textContent = S.supers;
    $('#sw-m').textContent = fmt(S.matches);
  },
  key(e) {
    if (e.type !== 'keydown') return;
    if (e.key === 'ArrowRight') { flingSwipe(1); return true; }
    if (e.key === 'ArrowLeft') { flingSwipe(-1); return true; }
    if (e.key === 'ArrowUp') { flingSwipe(0); return true; }
  },
});

// ---------- Loop: autoplay that never asks ----------
let curClip = null, clipRaf = 0, clipLast = 0, clipTap = 0, clipTimer = 0;
function mkClip() {
  const c = html(`<section class="clip" style="--h:${ri(0, 359)};--t:${rnd(.45, 1).toFixed(2)}s"><div class="shp">${shapeSVG(pick(SHK), 'rgba(255,255,255,.9)')}</div>
    <span class="views">${I('eye')}<span class="vw"></span></span>
    <div class="rail"><button class="lk" aria-label="Like">${I('heart')}<span></span></button><button aria-label="Share">${I('send')}<span>${fmt(ri(10, 9000))}</span></button></div>
    <div class="next">Next in <b>2</b></div><div class="prog"><i></i></div></section>`);
  c._c = { d: ri(4000, 7000), el: 0, likes: Math.round(Math.exp(rnd(5, 12))), views: Math.round(Math.exp(rnd(7, 14))), liked: false, seen: false, vt: 0 };
  $('.lk span', c).textContent = fmt(c._c.likes); $('.vw', c).textContent = fmt(c._c.views);
  return c;
}
function addClips(n) {
  const a = APPS.clips;
  for (let i = 0; i < n; i++) { const c = mkClip(); a.lp.append(c); a.io.observe(c); }
}
function clipTick(t) {
  if (curApp !== 'clips') { clipRaf = 0; return; }
  const dt = Math.min(100, t - clipLast); clipLast = t;
  const c = curClip;
  if (c && !document.hidden && !c.classList.contains('held')) {
    const k = c._c;
    k.el += dt;
    if (k.el > 1200 && !k.seen) {
      k.seen = true; S.clips++; S.earn++; earn(2, FW / 2, FH * .45);
      if (S.earn >= 3) { S.earn = 0; S.energy++; sfx.coin(); toast('+1 free spin in Slots'); }
    }
    const p = Math.min(1, k.el / k.d), left = Math.ceil((k.d - k.el) / 1000), nx = $('.next', c);
    $('.prog i', c).style.width = p * 100 + '%';
    if (left <= 2 && p < 1) { nx.classList.add('show'); $('b', nx).textContent = left; } else nx.classList.remove('show');
    if (p >= 1 && !k.done) { k.done = true; APPS.clips.lp.scrollBy({ top: APPS.clips.lp.clientHeight, behavior: 'smooth' }); }
    k.vt += dt; if (k.vt > 500) { k.vt = 0; k.views += ri(3, 60); $('.vw', c).textContent = fmt(k.views); }
  }
  clipRaf = requestAnimationFrame(clipTick);
}
function likeClip(c, only) {
  const k = c._c, b = $('.lk', c);
  if (k.liked && only) { sfx.pop(5); return; }
  k.liked = !k.liked; k.likes += k.liked ? 1 : -1;
  b.classList.toggle('on', k.liked); $('span', b).textContent = fmt(k.likes);
  if (k.liked) { act(); sfx.pop(combo % 12); haptic(); const [x, y] = centerOf(b); burst(x, y, { n: 12, colors: ['#ff2e4d', '#ff7aa0', '#fff'], shape: 'heart' }); if (!k.paid) { k.paid = true; earn(2, x - 30, y - 20); } } else sfx.close();
}
def({
  id: 'clips', name: 'Clips', tag: 'Autoplay · vertical swipe', c: '#2b1a3a',
  badge: () => Math.min(99, S.loopNew),
  ping: () => { S.loopNew += ri(3, 12); return 'New clips picked for you'; },
  build(b) {
    b.innerHTML = '<div class="loops idle" id="lp"></div>';
    this.lp = $('#lp', b);
    this.io = new IntersectionObserver(es => es.forEach(e => {
      const c = e.target;
      if (e.intersectionRatio >= .6) {
        c.classList.add('play');
        if (curClip !== c) {
          if (curClip) { curClip.classList.remove('held'); $('.next', curClip).classList.remove('show'); }
          curClip = c; if (c._c.done) { c._c.done = false; c._c.el = 0; }
          const kids = this.lp.children, i = Array.prototype.indexOf.call(kids, c);
          if (i > kids.length - 4) addClips(5);
          if (i > 0) $$('.swipehint', this.lp).forEach(x => x.remove());
          if (curApp === 'clips') { sfx.tick(); haptic(); }
        }
      } else c.classList.remove('play');
    }), { root: this.lp, threshold: [0, .6] });
    addClips(6);
    this.lp.firstElementChild.insertAdjacentHTML('beforeend', `<div class="swipehint">${I('up')}Swipe up</div>`);
    track(this.lp);
    this.lp.addEventListener('click', e => {
      const c = e.target.closest('.clip'); if (!c) return;
      if (e.target.closest('.lk')) { likeClip(c); return; }
      if (e.target.closest('button')) { sfx.swoosh(); toast('Sent'); return; }
      const t = now();
      if (t - clipTap < 280) {
        clearTimeout(clipTimer); clipTap = 0;
        const r = c.getBoundingClientRect(), h = html(`<div class="big-heart" style="left:${(e.clientX - r.left) / scale}px;top:${(e.clientY - r.top) / scale}px;--r:${ri(-18, 18)}deg">${IF('heart')}</div>`);
        c.append(h); h.addEventListener('animationend', () => h.remove());
        likeClip(c, true);
      } else { clipTap = t; clipTimer = setTimeout(() => { c.classList.toggle('held'); sfx.click(); }, 280); }
    });
  },
  open() { S.loopNew = 0; this.lp.classList.remove('idle'); clipLast = now(); if (!clipRaf) clipRaf = requestAnimationFrame(clipTick); },
  close() { this.lp.classList.add('idle'); },
  key(e) {
    if (e.type !== 'keydown') return;
    if (e.key === 'ArrowDown' || e.key === 'j') { this.lp.scrollBy({ top: this.lp.clientHeight, behavior: 'smooth' }); return true; }
    if (e.key === 'ArrowUp' || e.key === 'k') { this.lp.scrollBy({ top: -this.lp.clientHeight, behavior: 'smooth' }); return true; }
    if (e.key === ' ' && curClip) { curClip.classList.toggle('held'); return true; }
    if (e.key === 'l' && curClip) { likeClip(curClip, true); return true; }
  },
});
// stubs until the feed module builds them
def({ id: 'activity', name: 'Activity', tag: '', c: '#ff4fa3', build(b) { b.innerHTML = '<div class="pad"></div>'; } });
def({ id: 'profile', name: 'Profile', tag: '', c: '#7b61ff', build(b) { b.innerHTML = '<div class="pad"></div>'; } });
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
{
// ---------- Power Tower: absorb weaker monsters, grow, free the princess at the top ----------
// the whole module sits in one block so its names never meet another module's
const MAXL = 5, LIFE_MS = 5 * 60000, TF = 'DynaPuff, ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
const TWS = slice('tower', { lv: 1, best: 1, lives: MAXL, lifeAt: 0, out: 0, maxPow: 0, wins: 0, fails: 0, revives: 0, hints: 0, seen: {} });
if (typeof S.towerRooms !== 'number') S.towerRooms = 0;
if (typeof S.towerWins !== 'number') S.towerWins = 0;
const n0 = n => nf.format(Math.round(n));
addAch([
  ['tw-first', 'Tower down', 'Beat a level of Power Tower', 'level', () => TWS.wins >= 1],
  ['tw-ten', 'Tower climber', 'Reach level 10 in Power Tower', 'up', () => TWS.best >= 10],
  ['tw-1k', 'Four digits', 'Reach 1,000 power in Power Tower', 'bolt', () => TWS.maxPow >= 1000],
  ['tw-hero', 'Hero of the realm', 'Free the princess 25 times', 'heart', () => TWS.wins >= 25],
]);
addStats([
  ['Power Tower level', () => fmt(TWS.lv)],
  ['highest power', () => fmt(TWS.maxPow)],
]);
addQuests([
  ['towerRooms', 'Clear {n} rooms in Power Tower', 8, 24],
  ['towerWins', 'Beat {n} Power Tower levels', 1, 3],
]);

// ---------- levels: seeded, built from a clearing order that works, then shuffled ----------
const mul32 = a => () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
// what a room does to the hero: [power, shields] afterwards, or null if the hero falls there
function step(r, p, s) {
  switch (r.t) {
    case 'e': case 'b': return p > r.v ? [p + r.v, s] : null;
    case 'p': return [p + r.v, s];
    case 'x': return [p * r.v, s];
    case 'h': return [p, s + 1];
    case 't': return s ? [p, s - 1] : p > r.v ? [p - r.v, s] : null;
    case 'd': return s ? [p, s - 1] : [Math.max(1, Math.floor(p / r.v)), s];
    default: return [p, s];
  }
}
// keep only states nothing else beats (more power and at least as many shields)
const keep = (L, q) => {
  for (const a of L) if (a[0] >= q[0] && a[1] >= q[1]) return;
  for (let i = L.length - 1; i >= 0; i--) if (q[0] >= L[i][0] && q[1] >= L[i][1]) L.splice(i, 1);
  L.push(q);
};
// every state reachable by taking the rooms in some order; full: only after all of them
function reach(rooms, starts, full) {
  const n = rooms.length, N = 1 << n, F = new Array(N), out = [];
  F[0] = []; starts.forEach(q => keep(F[0], q));
  for (let m = 0; m < N; m++) {
    const fr = F[m]; if (!fr || !fr.length) continue;
    if (!full) fr.forEach(q => keep(out, q));
    for (let i = 0; i < n; i++) {
      if (m >> i & 1) continue;
      for (const [p, s] of fr) { const q = step(rooms[i], p, s); if (q) keep(F[m | 1 << i] || (F[m | 1 << i] = []), q); }
    }
  }
  return full ? F[N - 1] || [] : out;
}
// the most power the hero can carry to the boss from tower ti on; 0 if a tower on the way can't be cleared
function most(towers, ti, rooms, starts) {
  let sts = starts;
  for (let k = ti; k < towers.length; k++) {
    const rs = k === ti ? rooms : towers[k].rooms.filter(r => r.t !== 'b');
    if (!towers[k].fin) { sts = reach(rs, sts, true); if (!sts.length) return 0; }
    else return reach(rs, sts, false).reduce((m, q) => Math.max(m, q[0]), 0);
  }
  return 0;
}
function genLevel(L) {
  const r = mul32(L * 7919 + 17), ir = (a, b) => a + Math.floor(r() * (b - a + 1));
  const wpick = list => { let x = r() * list.reduce((s, a) => s + a[1], 0); for (const [k, w] of list) if ((x -= w) < 0) return k; return list[0][0]; };
  const pickR = a => a[Math.floor(r() * a.length)];
  for (let tries = 0; ; tries++) {
    const nT = L <= 2 ? 1 : L <= 5 ? 2 : L <= 9 ? 2 + (r() < .5 ? 1 : 0) : L < 16 ? 3 : 3 + (r() < .45 ? 1 : 0);
    const p0 = L === 1 ? 5 : L === 2 ? 6 : ir(5, 8 + Math.min(8, L >> 2));
    let p = p0, s = 0;
    const towers = [];
    for (let k = 0; k < nT; k++) {
      const fin = k === nT - 1, floors = L === 1 ? 3 : L === 2 ? 4 : ir(3, L < 6 ? 4 : 5);
      const cols = L >= 6 && r() < (L >= 10 ? .5 : .3) ? 2 : 1;
      const n = (floors - (fin ? 1 : 0)) * cols, chest = !fin && L >= 2 && r() < .6, rooms = [], used = {};
      // walk a clearing order that works, room by room
      for (let i = 0; i < n; i++) {
        let t;
        if (chest && i === n - 1) t = 'c';
        else {
          const w = [['e', 60]];
          if (L >= 2) w.push(['p', 14]);
          if (L >= 3 && p >= 4) w.push(['t', 11]);
          if (L >= 4 && !used.x && i >= n - 2) w.push(['x', 40]);
          if (L >= 7 && !used.h && i < n - 1) w.push(['h', 6]);
          if (L >= 9 && !used.d && i <= 1 && p >= 6) w.push(['d', 16]);
          t = p < 2 ? 'p' : wpick(w);
        }
        used[t] = 1;
        const rm = { t, v: 1, kind: '' };
        if (t === 'e') rm.v = r() < .3 ? ir(Math.max(1, Math.ceil(p * .6)), p - 1) : ir(Math.max(1, Math.round(p * .15)), Math.max(1, Math.min(p - 1, Math.round(p * .55))));
        else if (t === 'p') rm.v = ir(Math.max(1, Math.round(p * .12)), Math.max(2, Math.round(p * .4)));
        else if (t === 'x') rm.v = L >= 15 && r() < .3 ? 3 : 2;
        else if (t === 't') rm.v = ir(Math.max(1, Math.round(p * .12)), Math.max(1, Math.min(p - 1, Math.round(p * .4))));
        else if (t === 'd') rm.v = 2;
        else if (t === 'c') rm.v = 10 + L * 2 + ir(0, 8);
        const q = step(rm, p, s); p = q[0]; s = q[1];
        rooms.push(rm);
      }
      // then scatter it over the floors
      const cells = [];
      for (let f = 0; f < floors - (fin ? 1 : 0); f++) for (let c = 0; c < cols; c++) cells.push([f, c]);
      for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
      rooms.forEach((rm, i) => { rm.f = cells[i][0]; rm.c = cells[i][1]; });
      const ch = rooms.find(x => x.t === 'c'), topR = ch && rooms.find(x => x.f === floors - 1 && x !== ch);
      if (ch && ch.f !== floors - 1 && topR) { [ch.f, topR.f] = [topR.f, ch.f]; [ch.c, topR.c] = [topR.c, ch.c]; }
      const es = rooms.filter(x => x.t === 'e').sort((a, b) => a.v - b.v);
      es.forEach((e, i) => {
        e.size = .88 + (es.length > 1 ? i / (es.length - 1) : .5) * .26;
        e.kind = e.v < p0 ? pickR(['slime', 'bat', 'slime']) : e.v < p0 * 4 ? pickR(['bat', 'ghost', 'imp']) : pickR(['imp', 'golem', 'ghost']);
      });
      if (fin) rooms.push({ t: 'b', v: 0, f: floors - 1, c: 0, span: cols, kind: 'boss', size: 1 });
      towers.push({ floors, cols, fin, rooms });
    }
    // the boss: beatable with good play, out of reach if you rush
    let into = [[p0, 0]];
    for (let k = 0; k < nT - 1; k++) into = reach(towers[k].rooms, into, true);
    const pin = into.reduce((m, q) => Math.max(m, q[0]), 0), best = most(towers, 0, towers[0].rooms.filter(x => x.t !== 'b'), [[p0, 0]]);
    if ((best < 3 || best > 3e6) && tries < 24) continue;
    const m = L <= 3 ? .7 + r() * .12 : L <= 7 ? .78 + r() * .08 : L <= 14 ? .84 + r() * .06 : .88 + r() * .06;
    let B = Math.floor(best * m);
    if (B <= pin) B = Math.floor(pin + (best - pin) * .6);
    const boss = towers[nT - 1].rooms.find(x => x.t === 'b');
    boss.v = clamp(B, 1, best - 1);
    return { L, p0, towers, boss, best };
  }
}

// ---------- scene state ----------
const DAY = {
  sky: ['#8ccfff', '#c9e6ff', '#ffe3f1'], sun: '#fff1b8', glow: 'rgba(255, 244, 190, .7)', cloud: 'rgba(255, 255, 255, .92)',
  hill: ['#c3e9cf', '#a2dcb4'], dirt: '#e6b284', dirt2: '#d49a68', grass: '#79d38a', grass2: '#5fbf73',
  wall: '#f6ecff', wall2: '#e2d0f7', edge: '#b99be0', room: '#5e4190', room2: '#3d2866', floor: '#c9a8f0', rubble: '#d9c6f0',
  roofs: ['#ff5c7a', '#ffa53a', '#3fb3ff', '#2fcf8f'], stars: 0,
};
const NIGHT = {
  sky: ['#0d0a2b', '#261852', '#47245f'], sun: '#fff4d6', glow: 'rgba(210, 200, 255, .28)', cloud: 'rgba(170, 150, 230, .16)',
  hill: ['#2a2156', '#211947'], dirt: '#4f3544', dirt2: '#40293a', grass: '#2f7a5c', grass2: '#256349',
  wall: '#4b3b6c', wall2: '#3d2f5a', edge: '#6e59a3', room: '#211735', room2: '#150e25', floor: '#6d57a6', rubble: '#5a4a7c',
  roofs: ['#e8456a', '#e8892a', '#2f8fe0', '#23a877'], stars: 1,
};
const KC = { slime: ['#5fd46a', '#35b04c'], bat: ['#a07dff', '#7550e6'], imp: ['#ff6b6b', '#dd3f4f'], ghost: ['#f4f1ff', '#cbc2f2'], golem: ['#a5b7cd', '#7187a2'], boss: ['#8a45ff', '#5d22c7'] };
const MH = { slime: 36, bat: 50, imp: 50, ghost: 46, golem: 40, boss: 70, p: 44, x: 50, h: 44, t: 22, d: 46, c: 32 };
// one tip per thing, the first time a level has it
const TIPS = [
  ['e', 'Drag your hero into a room with a smaller number'],
  ['towers', 'Clear every room to bring a tower down'],
  ['p', 'Potions add to your power'],
  ['t', 'Spikes take power away'],
  ['c', 'Chests are full of hits'],
  ['x', 'Swords multiply your power'],
  ['h', 'A shield blocks the next trap'],
  ['d', 'Curses cut your power in half'],
];
let oel = {}, lev = null, root = null, cv = null, cx = null, sbEl = null, over = null, tipEl = null, hud = null, hintB = null;
let tscale = 1, W = 0, H = 0, DPR = 1, gy = 0, rh = 0, cs = 1, cam = 0, shk = 0, flash = 0, gt = 0, raf = 0, lastT = 0, dark = false, pal = DAY, skyG = null, ptr = null, tipUntil = 0;
const tws = [], tps = [], tfl = [], flies = [];
const st = { p: 0, sh: 0, show: 0, ti: 0, at: null, phase: 'play', snap: null, fatal: null, hover: null, sel: null, hint: null, hintAt: 0, tut: null, moves: 0, revives: 0, hinted: 0, tok: 0, need: 0, revEnd: 0, titleAt: -9e9, meterAt: 0, meterU: .5, mult: 2, cage: 0, prin: null, armedAt: 0 };
const hero = { x: 0, y: 0, dx: 0, rot: 0, flip: 1, sq: 0, hurt: 0, bump: 0, glow: 0, air: 0, ghost: 0, alpha: 1, walk: 0, drag: null };
const curL = () => (lev ? lev.L : TWS.lv);
const hintCost = () => 10 + curL() * 2, refillCost = () => 90, reward = L => 20 + L * 6;
const revCost = () => (20 + curL() * 4) * (1 + st.revives);

// ---------- the clock: tweens run on game time, so they pause when the game is hidden ----------
const anim = (d, fn) => new Promise(res => { tws.push({ t0: gt, d: Math.max(1, d), fn, res }); });
const sleep = d => anim(d, () => {});
const eo = k => 1 - Math.pow(1 - k, 3), ei = k => k * k, eio = k => (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const shake = a => { if (!reduced) shk = Math.max(shk, a); };
const hsc = () => cs * 1.1 * (1 + Math.min(.3, Math.log10(Math.max(1, st.show / (lev ? lev.p0 : 1))) * .16));
const home = k => k * W + Math.round(W * .19);
const floorY = r => r.y + r.h - 9;
const spot = r => r.x + r.w * (r.t === 'b' ? .64 : r.w < 150 ? .69 : .66);
const entryX = r => r.x + r.w * (r.t === 'b' ? .24 : r.w < 150 ? .23 : .27);
const sideTxt = () => { const s = hsc(); return [hero.x + 40 * s, hero.y - 36 * s]; };
const valid = r => !!(lev && r && st.phase === 'play' && lev.towers[st.ti].rooms.includes(r) && !r.done);
function place() {
  const r = st.at;
  if (r) { hero.x = r.x + r.w * (r.t === 'b' ? .3 : .5); hero.y = floorY(r); } else { hero.x = home(st.ti); hero.y = gy; }
  hero.dx = 0;
}
// canvas point to phone point (for hit floaters, which live over the whole phone)
function toPhone(wx, y) { const b = cv.getBoundingClientRect(); return toLocal(b.left + (wx - cam) * b.width / W, b.top + y * b.height / H); }
function loc(e) { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * W / b.width, (e.clientY - b.top) * H / b.height]; }

function setPal() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), m = /^#?([0-9a-f]{6})$/i.exec(v);
  let l = 1;
  if (m) { const n = parseInt(m[1], 16); l = ((n >> 16) * .299 + (n >> 8 & 255) * .587 + (n & 255) * .114) / 255; }
  dark = l < .5; pal = dark ? NIGHT : DAY; skyG = null;
}
function size() {
  if (!cv) return false;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return false; // hidden tabs measure zero
  const d = Math.min(2.5, Math.max(1, devicePixelRatio || 1));
  if (w !== W || h !== H || d !== DPR) { W = w; H = h; DPR = d; cv.width = Math.round(w * d); cv.height = Math.round(h * d); geo(); }
  return true;
}
function geo() {
  if (!lev || !W) return;
  const sb = sbEl ? sbEl.offsetHeight : 0;
  gy = Math.round(H - 44 - sb);
  const top = 62, tw = Math.min(250, Math.round(W * .54)), left = W - tw - 24;
  rh = Math.min(100, ...lev.towers.map(t => (gy - top - (t.fin ? 80 : 50)) / (t.floors + (t.fin ? .3 : 0))));
  cs = clamp(rh / 92, .64, 1.05);
  lev.towers.forEach((t, k) => {
    t.x0 = k * W + left; t.w = tw; t.rows = [];
    let y = gy;
    for (let f = 0; f < t.floors; f++) { const h = t.fin && f === t.floors - 1 ? rh * 1.3 : rh; y -= h; t.rows.push([y, h]); }
    t.top = y;
    const cw = tw / t.cols;
    t.rooms.forEach(r => { const [yy, h] = t.rows[r.f]; r.x = t.x0 + r.c * cw; r.y = yy; r.w = cw * (r.span || 1); r.h = h; });
  });
  cam = st.ti * W; skyG = null;
  if (st.phase !== 'busy' && !hero.drag) place();
}

// ---------- drawing ----------
function rr(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath();
}
const ell = (x, y, a, b) => { cx.beginPath(); cx.ellipse(x, y, a, b, 0, 0, 6.2832); };
const hexRGB = {};
function mix(a, b, k) {
  const p = c => hexRGB[c] || (hexRGB[c] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)));
  const A = p(a), B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
}
function drawSky() {
  if (!skyG) { skyG = cx.createLinearGradient(0, 0, 0, gy); skyG.addColorStop(0, pal.sky[0]); skyG.addColorStop(.62, pal.sky[1]); skyG.addColorStop(1, pal.sky[2]); }
  cx.fillStyle = skyG; cx.fillRect(0, 0, W, H);
  const t = gt / 1000;
  if (pal.stars) {
    cx.fillStyle = '#fff';
    for (let i = 0; i < 38; i++) { cx.globalAlpha = .3 + .35 * (reduced ? 1 : Math.sin(t * 1.3 + i * 2.1) * .5 + .5); const x = (i * 97.3 + 13) % W, y = (i * 53.7 + 20) % (gy * .55); cx.fillRect(x, y, 1.8, 1.8); }
    cx.globalAlpha = 1;
  }
  const sx = W * .15, sy = 112;
  const g = cx.createRadialGradient(sx, sy, 16, sx, sy, 60); g.addColorStop(0, pal.glow); g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  cx.fillStyle = g; cx.beginPath(); cx.arc(sx, sy, 60, 0, 6.3); cx.fill();
  cx.fillStyle = pal.sun; cx.beginPath(); cx.arc(sx, sy, 22, 0, 6.3); cx.fill();
  if (dark) { cx.fillStyle = pal.sky[1]; cx.beginPath(); cx.arc(sx + 10, sy - 7, 18, 0, 6.3); cx.fill(); }
  for (let i = 0; i < 4; i++) {
    const span = W + 180, x = (((i * 157 + (reduced ? 0 : t * (5 + i * 2)) - cam * .08) % span) + span) % span - 90, y = 78 + (i * 61) % 130;
    cloud(x, y, .7 + (i % 2) * .35);
  }
  hills(gy - 58, pal.hill[0], .1, 30);
  hills(gy - 22, pal.hill[1], .25, 22);
}
// one path, so a see-through cloud has no seams where its puffs overlap
function cloud(x, y, s) {
  cx.fillStyle = pal.cloud; cx.beginPath();
  for (const [dx, dy, r] of [[0, 0, 14], [17, -9, 18], [36, -2, 14]]) { cx.moveTo(x + (dx + r) * s, y + dy * s); cx.arc(x + dx * s, y + dy * s, r * s, 0, 6.2832); }
  const l = x - 4 * s, t = y - 2 * s, w = 46 * s, h = 16 * s, q = 8 * s;
  cx.moveTo(l + q, t); cx.arcTo(l + w, t, l + w, t + h, q); cx.arcTo(l + w, t + h, l, t + h, q); cx.arcTo(l, t + h, l, t, q); cx.arcTo(l, t, l + w, t, q); cx.closePath();
  cx.fill('nonzero');
}
function hills(base, col, par, amp) {
  const off = cam * par;
  cx.fillStyle = col; cx.beginPath(); cx.moveTo(0, H);
  for (let x = 0; x <= W + 20; x += 16) { const u = x + off; cx.lineTo(x, base - amp * (.6 * Math.sin(u * .011) + .4 * Math.sin(u * .027 + 1.3)) - amp * .4); }
  cx.lineTo(W + 20, H); cx.closePath(); cx.fill();
}
function drawGround() {
  const x0 = cam - 40, x1 = cam + W + 40;
  cx.fillStyle = pal.dirt; cx.fillRect(x0, gy, x1 - x0, H - gy + 20);
  cx.fillStyle = pal.dirt2;
  for (let x = Math.floor(x0 / 34) * 34; x < x1; x += 34) { const k = Math.abs(Math.sin(x * 12.9898) * 43758.5453) % 1; ell(x + k * 20, gy + 20 + k * 16, 4 + k * 3, 2.4); cx.fill(); }
  cx.fillStyle = pal.grass; cx.beginPath(); cx.moveTo(x0, gy - 3);
  for (let x = Math.floor(x0 / 18) * 18; x <= x1; x += 18) cx.quadraticCurveTo(x + 9, gy + 13, x + 18, gy + 7);
  cx.lineTo(x1, gy - 3); cx.closePath(); cx.fill();
  cx.fillRect(x0, gy - 3, x1 - x0, 6);
  // tufts and flowers
  for (let x = Math.floor(x0 / 46) * 46; x < x1; x += 46) {
    const k = Math.abs(Math.sin(x * 78.233) * 12345.678) % 1, fx = x + k * 30;
    if (lev && lev.towers.some(t => !t.gone && fx > t.x0 - 12 && fx < t.x0 + t.w + 12)) continue;
    cx.strokeStyle = pal.grass2; cx.lineWidth = 2; cx.lineCap = 'round'; cx.beginPath();
    cx.moveTo(fx - 4, gy - 1); cx.lineTo(fx - 6, gy - 8); cx.moveTo(fx, gy - 1); cx.lineTo(fx, gy - 11); cx.moveTo(fx + 4, gy - 1); cx.lineTo(fx + 6, gy - 8); cx.stroke();
    if (k > .55) { cx.fillStyle = ['#ff7eb6', '#ffd23f', '#fff'][Math.floor(k * 30) % 3]; cx.beginPath(); cx.arc(fx + 10, gy - 7, 3, 0, 6.3); cx.fill(); cx.fillStyle = '#ffc21a'; cx.beginPath(); cx.arc(fx + 10, gy - 7, 1.2, 0, 6.3); cx.fill(); }
  }
}
function arch(x, y, w, h, a) {
  cx.beginPath(); cx.moveTo(x, y + h); cx.lineTo(x, y + a); cx.quadraticCurveTo(x, y, x + a, y); cx.lineTo(x + w - a, y); cx.quadraticCurveTo(x + w, y, x + w, y + a); cx.lineTo(x + w, y + h); cx.closePath();
}
function hlOf(r) {
  if (st.phase !== 'play') return null;
  if (st.hover === r) return valid(r) ? '#ffffff' : null;
  const pulse = .55 + .45 * Math.sin(gt / 140);
  if (st.sel === r) return `rgba(255, 210, 63, ${pulse})`;
  if (st.hint === r) return `rgba(255, 210, 63, ${pulse})`;
  return null;
}
function drawRoom(r) {
  const x = r.x + 6, y = r.y + 6, w = r.w - 12, h = r.h - 10, a = Math.min(18, w * .3);
  const g = cx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, pal.room2); g.addColorStop(.45, pal.room); g.addColorStop(1, pal.room);
  arch(x, y, w, h, a); cx.fillStyle = g; cx.fill();
  cx.strokeStyle = 'rgba(255, 255, 255, .055)'; cx.lineWidth = 1.5;
  rr(x + w * .1, y + h * .3, w * .2, h * .1, 2); cx.stroke(); rr(x + w * .2, y + h * .42, w * .2, h * .1, 2); cx.stroke(); rr(x + w * .64, y + h * .2, w * .22, h * .1, 2); cx.stroke();
  cx.fillStyle = pal.floor; rr(x, y + h - 5, w, 5, 2); cx.fill();
  if (!r.done && r.w > 90 && r.t !== 'b') torch(x + 10, y + h * .42);
  const hl = hlOf(r);
  if (hl) { arch(x - 1.5, y - 1.5, w + 3, h + 3, a); cx.lineWidth = 3.5; cx.strokeStyle = hl; cx.stroke(); cx.fillStyle = 'rgba(255, 255, 255, .08)'; cx.fill(); }
}
function torch(x, y) {
  const t = gt / 1000, f = reduced ? 1 : 1 + Math.sin(t * 17 + x) * .12 + Math.sin(t * 7.3 + x) * .1;
  const g = cx.createRadialGradient(x, y - 6, 1, x, y - 6, 24 * f); g.addColorStop(0, 'rgba(255, 190, 90, .38)'); g.addColorStop(1, 'rgba(255, 190, 90, 0)');
  cx.fillStyle = g; cx.beginPath(); cx.arc(x, y - 6, 24 * f, 0, 6.3); cx.fill();
  cx.fillStyle = '#7a4b22'; rr(x - 2, y - 2, 4, 10, 1.5); cx.fill();
  cx.fillStyle = '#ff8a2a'; ell(x, y - 6, 3.6 * f, 6 * f); cx.fill();
  cx.fillStyle = '#ffe07a'; ell(x, y - 4.5, 1.8, 3 * f); cx.fill();
}
function drawTower(t, k) {
  if (t.gone || t.x0 - cam > W + 40 || t.x0 + t.w - cam < -40) return;
  cx.save();
  if (t.sink) cx.translate(reduced ? 0 : Math.sin(gt * .09) * 2.2, t.sink);
  const x = t.x0, w = t.w, top = t.top, bot = gy + 8;
  cx.fillStyle = 'rgba(40, 20, 70, .12)'; rr(x - 4, top + 6, w + 18, bot - top, 10); cx.fill();
  cx.fillStyle = pal.wall; rr(x - 9, top - 2, w + 18, bot - top + 2, 9); cx.fill();
  cx.lineWidth = 2.5; cx.strokeStyle = pal.edge; cx.stroke();
  cx.fillStyle = pal.wall2;
  t.rows.forEach(([y, h], i) => {
    cx.fillRect(x - 8, y + h - 4, w + 16, 4);
    for (const [bx, by] of [[x - 8, y + h * (.22 + (i % 2) * .08)], [x - 8, y + h * (.58 + (i % 2) * .08)], [x + w + 1, y + h * (.36 - (i % 2) * .08)], [x + w + 1, y + h * (.72 - (i % 2) * .08)]]) { rr(bx, by, 7, 5, 2); cx.fill(); }
  });
  t.rooms.forEach(drawRoom);
  if (t.fin) drawKeep(t); else drawRoof(t, pal.roofs[k % pal.roofs.length]);
  cx.restore();
}
function drawRoof(t, col) {
  const x = t.x0 - 16, w = t.w + 32, y = t.top + 3, hgt = 34 + t.w * .05, mx = x + w / 2, top = y - hgt;
  cx.fillStyle = col; cx.beginPath(); cx.moveTo(x, y); cx.quadraticCurveTo(mx - w * .2, y - hgt * .45, mx, top); cx.quadraticCurveTo(mx + w * .2, y - hgt * .45, x + w, y); cx.quadraticCurveTo(mx, y + 9, x, y); cx.fill();
  cx.fillStyle = 'rgba(0, 0, 0, .13)'; cx.beginPath(); cx.moveTo(mx, top); cx.quadraticCurveTo(mx + w * .2, y - hgt * .45, x + w, y); cx.quadraticCurveTo(mx + w * .25, y + 7, mx, y + 7); cx.fill();
  cx.strokeStyle = 'rgba(255, 255, 255, .28)'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(x + w * .2, y - hgt * .18); cx.quadraticCurveTo(mx - w * .1, y - hgt * .55, mx - 3, top + 6); cx.stroke();
  const wave = reduced ? 0 : Math.sin(gt / 180) * 2.5;
  cx.strokeStyle = '#7a4b22'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(mx, top + 2); cx.lineTo(mx, top - 18); cx.stroke();
  cx.fillStyle = '#ffc21a'; cx.beginPath(); cx.moveTo(mx + 1, top - 18); cx.quadraticCurveTo(mx + 8, top - 18 + wave, mx + 15, top - 14); cx.quadraticCurveTo(mx + 8, top - 10 - wave, mx + 1, top - 10); cx.fill();
}
function drawKeep(t) {
  const x = t.x0 - 9, w = t.w + 18, y = t.top, n = Math.max(4, Math.round(w / 30)), mw = w / (n * 2 - 1);
  for (let i = 0; i < n; i++) { rr(x + i * 2 * mw, y - 13, mw, 16, 3); cx.fillStyle = pal.wall; cx.fill(); cx.lineWidth = 2.5; cx.strokeStyle = pal.edge; cx.stroke(); }
  cx.fillStyle = pal.wall; cx.fillRect(x + 2, y - 2, w - 4, 6);
  const px = t.x0 + t.w / 2, s = cs * .95;
  if (!st.prin) drawPrincess(px, y - 12, s, true);
  if (st.cage < 1) drawCage(px, y - 8, s, st.cage);
  if (!st.prin && st.cage === 0) {
    const k = ((gt / 1000) % 4.2) / 4.2;
    if (k < .42) bubble(px + 26 * s, y - 62 * s, 'Help!', k < .06 ? k / .06 : 1);
  }
}
function drawCage(x, y, s, lift) {
  cx.save(); cx.translate(x, y); cx.scale(s, s);
  cx.fillStyle = '#5b4a6e'; rr(-22, -4, 44, 7, 3.5); cx.fill();
  cx.globalAlpha = 1 - lift; cx.translate(0, -lift * 40);
  cx.lineCap = 'round';
  for (const [c, lw] of [['#3b2f4d', 3], ['#9a87b8', 1.1]]) {
    cx.strokeStyle = c; cx.lineWidth = lw; cx.beginPath();
    for (let i = -2; i <= 2; i++) { const bx = i * 8.5; cx.moveTo(bx, -3); cx.lineTo(bx, -38 + Math.abs(i) * 3); }
    cx.moveTo(-19, -34); cx.quadraticCurveTo(0, -60, 19, -34); cx.moveTo(-19, -34); cx.lineTo(19, -34);
    cx.stroke();
  }
  cx.strokeStyle = '#3b2f4d'; cx.lineWidth = 2.4; cx.beginPath(); cx.arc(0, -51, 4, 0, 6.3); cx.stroke();
  cx.restore();
}
function drawPrincess(x, y, s, caged) {
  const t = gt / 1000, wave = reduced ? 0 : Math.sin(t * (caged ? 6 : 9));
  cx.save(); cx.translate(x, y); cx.scale(s, s);
  cx.fillStyle = 'rgba(0, 0, 0, .15)'; ell(0, 0, 10, 2.5); cx.fill();
  cx.strokeStyle = '#ffd7b5'; cx.lineWidth = 3.2; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(-5, -15); cx.lineTo(-10, -9); cx.moveTo(5, -15); cx.lineTo(12, -22 - wave * 4); cx.stroke();
  cx.fillStyle = '#ff7eb6'; cx.beginPath(); cx.moveTo(-11, 0); cx.quadraticCurveTo(-9, -10, -5, -18); cx.lineTo(5, -18); cx.quadraticCurveTo(9, -10, 11, 0); cx.closePath(); cx.fill();
  cx.fillStyle = '#ffb3d4'; cx.beginPath(); cx.moveTo(-11, 0); cx.quadraticCurveTo(0, -4, 11, 0); cx.lineTo(11, 0); cx.fill(); rr(-5, -19, 10, 4, 2); cx.fill();
  cx.fillStyle = '#ffcf4a'; cx.beginPath(); cx.arc(0, -26, 9.5, 0, 6.3); cx.fill(); rr(-9.5, -27, 19, 12, 5); cx.fill();
  cx.fillStyle = '#ffd7b5'; cx.beginPath(); cx.arc(0, -24.5, 7.5, 0, 6.3); cx.fill();
  cx.fillStyle = '#ffcf4a'; cx.beginPath(); cx.arc(0, -29, 8, Math.PI * 1.05, Math.PI * 1.95); cx.fill();
  cx.fillStyle = '#ffc21a'; cx.beginPath(); cx.moveTo(-6, -33); cx.lineTo(-6, -39); cx.lineTo(-3, -36); cx.lineTo(0, -41); cx.lineTo(3, -36); cx.lineTo(6, -39); cx.lineTo(6, -33); cx.closePath(); cx.fill();
  cx.fillStyle = '#1d1026'; ell(-3, -24, 1.3, 1.8); cx.fill(); ell(3, -24, 1.3, 1.8); cx.fill();
  cx.fillStyle = 'rgba(255, 110, 140, .5)'; ell(-5, -21, 1.8, 1.1); cx.fill(); ell(5, -21, 1.8, 1.1); cx.fill();
  cx.strokeStyle = '#a0413b'; cx.lineWidth = 1.2; cx.beginPath(); cx.arc(0, -21.5, 1.8, .15 * Math.PI, .85 * Math.PI); cx.stroke();
  cx.restore();
}
function bubble(x, y, txt, a) {
  cx.save(); cx.globalAlpha = a; cx.font = `700 12px ${TF}`;
  const w = cx.measureText(txt).width + 14;
  cx.fillStyle = '#fff'; rr(x - 4, y - 11, w, 22, 11); cx.fill();
  cx.beginPath(); cx.moveTo(x + 2, y + 8); cx.lineTo(x - 5, y + 16); cx.lineTo(x + 10, y + 9); cx.fill();
  cx.fillStyle = '#e8364f'; cx.textAlign = 'left'; cx.textBaseline = 'middle'; cx.fillText(txt, x + 3, y + 1);
  cx.restore();
}
function eyes(x1, x2, y, r, angry, sclera = '#fff') {
  for (const x of [x1, x2]) {
    cx.fillStyle = sclera; ell(x, y, r, r * 1.12); cx.fill();
    cx.fillStyle = '#1d1026'; ell(x + r * .22, y + r * .18, r * .56, r * .66); cx.fill();
    cx.fillStyle = '#fff'; ell(x + r * .02, y - r * .2, r * .22, r * .22); cx.fill();
  }
  if (angry) {
    cx.strokeStyle = '#1d1026'; cx.lineWidth = 2.2; cx.lineCap = 'round'; cx.beginPath();
    cx.moveTo(x1 - r * 1.1, y - r * 1.55); cx.lineTo(x1 + r * .7, y - r * 1.05);
    cx.moveTo(x2 + r * 1.1, y - r * 1.55); cx.lineTo(x2 - r * .7, y - r * 1.05); cx.stroke();
  }
}
// monsters face left, toward the hero; feet at (x, y)
function drawMon(kind, x, y, s, o) {
  const t = gt / 1000 + (o.ph || 0), m = reduced ? 0 : 1, hurt = o.hurt || 0;
  let [c1, c2] = KC[kind];
  if (hurt > .05) { c1 = mix(c1, '#ffffff', hurt * .75); c2 = mix(c2, '#ffffff', hurt * .75); }
  cx.save(); cx.translate(x + (o.dx || 0), y);
  const sq = o.sq || 0;
  cx.fillStyle = 'rgba(0, 0, 0, .2)'; ell(0, 0, 15 * s, 3 * s); cx.fill();
  cx.scale(-s * (1 + sq * .35), s * (1 - sq * .45));
  if (kind === 'slime') {
    const wb = Math.sin(t * 4) * 1.6 * m;
    cx.fillStyle = c1; cx.beginPath(); cx.moveTo(-18, 0); cx.bezierCurveTo(-20, -15, -12, -31 - wb, 0, -31 - wb); cx.bezierCurveTo(12, -31 - wb, 20, -15, 18, 0); cx.closePath(); cx.fill();
    cx.fillStyle = c2; cx.beginPath(); cx.moveTo(-18, 0); cx.bezierCurveTo(-17, -6, 17, -6, 18, 0); cx.closePath(); cx.fill();
    ell(13, -6, 3, 4.5); cx.fill();
    cx.fillStyle = 'rgba(255, 255, 255, .55)'; ell(-8, -22, 4.5, 3); cx.fill(); ell(-13, -15, 1.8, 1.8); cx.fill();
    eyes(-5.5, 6, -15, 4.3, 0);
    cx.fillStyle = '#1d1026'; ell(1, -7.5, 2.6, 2); cx.fill();
  } else if (kind === 'bat') {
    cx.translate(0, -10 + Math.sin(t * 3) * 3 * m);
    const fl = Math.sin(t * 11) * .45 * m;
    for (const sd of [-1, 1]) {
      cx.save(); cx.scale(sd, 1); cx.translate(9, -18); cx.rotate(fl);
      cx.fillStyle = c2; cx.beginPath(); cx.moveTo(0, -2); cx.quadraticCurveTo(12, -16, 23, -7); cx.quadraticCurveTo(19, -4, 19, 1); cx.quadraticCurveTo(14, -2, 12, 3); cx.quadraticCurveTo(7, -1, 0, 4); cx.closePath(); cx.fill();
      cx.restore();
    }
    cx.fillStyle = c1;
    cx.beginPath(); cx.moveTo(-10, -26); cx.lineTo(-7, -38); cx.lineTo(-2, -29); cx.moveTo(10, -26); cx.lineTo(7, -38); cx.lineTo(2, -29); cx.fill();
    cx.beginPath(); cx.arc(0, -18, 13.5, 0, 6.3); cx.fill();
    cx.fillStyle = mix(KC.bat[0], '#ffffff', .35); ell(0, -12, 8, 6); cx.fill();
    cx.fillStyle = 'rgba(255, 255, 255, .4)'; ell(-6, -26, 3.5, 2.2); cx.fill();
    eyes(-5, 5, -20, 3.8, 1, '#fff7b0');
    cx.fillStyle = '#fff'; cx.beginPath(); cx.moveTo(-3, -11); cx.lineTo(-1.5, -7); cx.lineTo(0, -11); cx.moveTo(1, -11); cx.lineTo(2.5, -7); cx.lineTo(4, -11); cx.fill();
  } else if (kind === 'imp') {
    const b = Math.abs(Math.sin(t * 3.4)) * 1.5 * m;
    cx.strokeStyle = c2; cx.lineWidth = 3; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(12, -7); cx.quadraticCurveTo(24, -9, 22, -20); cx.stroke();
    cx.fillStyle = c2; cx.beginPath(); cx.moveTo(22, -26); cx.lineTo(26, -18); cx.lineTo(18, -19); cx.fill();
    cx.fillStyle = '#5a1d2c'; ell(-6, -2.5, 5, 3); cx.fill(); ell(6, -2.5, 5, 3); cx.fill();
    cx.translate(0, -b);
    cx.fillStyle = '#fff3d6';
    cx.beginPath(); cx.moveTo(-11, -29); cx.quadraticCurveTo(-19, -40, -12, -46); cx.quadraticCurveTo(-12, -38, -5, -32); cx.fill();
    cx.beginPath(); cx.moveTo(11, -29); cx.quadraticCurveTo(19, -40, 12, -46); cx.quadraticCurveTo(12, -38, 5, -32); cx.fill();
    cx.fillStyle = c1; rr(-15, -34, 30, 32, 13); cx.fill();
    cx.fillStyle = mix(KC.imp[0], '#ffffff', .3); ell(0, -10, 9, 6.5); cx.fill();
    cx.fillStyle = 'rgba(255, 255, 255, .35)'; ell(-7, -27, 4, 2.4); cx.fill();
    eyes(-5.5, 6, -21, 4, 1);
    cx.fillStyle = '#1d1026'; cx.beginPath(); cx.moveTo(-6, -13); cx.quadraticCurveTo(0, -7, 6, -13); cx.closePath(); cx.fill();
    cx.fillStyle = '#fff'; cx.beginPath(); cx.moveTo(-4, -12.6); cx.lineTo(-2.6, -10.4); cx.lineTo(-1.2, -12.2); cx.moveTo(1.2, -12.2); cx.lineTo(2.6, -10.4); cx.lineTo(4, -12.6); cx.fill();
  } else if (kind === 'ghost') {
    cx.translate(0, -6 + Math.sin(t * 2.4) * 3 * m);
    const wv = Math.sin(t * 6) * 1.5 * m;
    cx.fillStyle = 'rgba(0, 0, 0, .0)';
    cx.fillStyle = c1; cx.beginPath(); cx.moveTo(-15, -2); cx.lineTo(-15, -22); cx.arc(0, -22, 15, Math.PI, 0); cx.lineTo(15, -2);
    cx.quadraticCurveTo(11, -7 + wv, 7.5, -2); cx.quadraticCurveTo(4, 3 - wv, 0, -2); cx.quadraticCurveTo(-4, -7 + wv, -7.5, -2); cx.quadraticCurveTo(-11, 3 - wv, -15, -2); cx.fill();
    cx.fillStyle = c2; cx.beginPath(); cx.arc(0, -22, 15, Math.PI * .1, Math.PI * .35); cx.lineTo(0, -22); cx.fill();
    cx.fillStyle = 'rgba(255, 255, 255, .8)'; ell(-7, -30, 4, 2.6); cx.fill();
    cx.fillStyle = '#2a1840'; ell(-5, -22, 3, 4.4); cx.fill(); ell(5.5, -22, 3, 4.4); cx.fill();
    cx.fillStyle = '#fff'; ell(-4.4, -23.6, 1, 1); cx.fill(); ell(6.1, -23.6, 1, 1); cx.fill();
    cx.fillStyle = '#2a1840'; ell(0.5, -12.5, 2.6, 3.4); cx.fill();
    cx.fillStyle = 'rgba(255, 120, 170, .45)'; ell(-10, -16, 2.6, 1.6); cx.fill(); ell(10.5, -16, 2.6, 1.6); cx.fill();
  } else if (kind === 'golem') {
    const b = Math.abs(Math.sin(t * 2)) * 1 * m;
    cx.fillStyle = c2; cx.beginPath(); cx.arc(-18, -12 - b, 6.5, 0, 6.3); cx.arc(18, -12 - b, 6.5, 0, 6.3); cx.fill();
    cx.fillStyle = c1; rr(-16, -34 - b, 32, 33, 9); cx.fill();
    cx.fillStyle = c2; rr(-16, -27 - b, 32, 5, 2.5); cx.fill();
    cx.fillStyle = 'rgba(0, 0, 0, .12)'; rr(-10, -12 - b, 8, 6, 2); cx.fill(); rr(4, -8 - b, 7, 5, 2); cx.fill();
    cx.fillStyle = 'rgba(255, 255, 255, .35)'; ell(-8, -31 - b, 4.5, 2); cx.fill();
    cx.fillStyle = '#ffd84a'; rr(-9, -21 - b, 6, 4.5, 2); cx.fill(); rr(3, -21 - b, 6, 4.5, 2); cx.fill();
    cx.strokeStyle = 'rgba(40, 30, 60, .5)'; cx.lineWidth = 1.4; cx.beginPath(); cx.moveTo(10, -34 - b); cx.lineTo(7, -29 - b); cx.lineTo(10, -26 - b); cx.stroke();
    cx.fillStyle = '#3a3050'; rr(-5, -12 - b, 10, 2.6, 1.3); cx.fill();
    cx.fillStyle = '#4b4160'; ell(-7, -1.5, 6, 3); cx.fill(); ell(7, -1.5, 6, 3); cx.fill();
  }
  cx.restore();
}
function drawBoss(x, y, s, o) {
  const t = gt / 1000, m = reduced ? 0 : 1, hurt = o.hurt || 0;
  let [c1, c2] = KC.boss;
  if (hurt > .05) { c1 = mix(c1, '#ffffff', hurt * .75); c2 = mix(c2, '#ffffff', hurt * .75); }
  cx.save(); cx.translate(x + (o.dx || 0), y);
  const sq = o.sq || 0;
  cx.fillStyle = 'rgba(0, 0, 0, .22)'; ell(0, 0, 30 * s, 5 * s); cx.fill();
  cx.scale(-s * (1 + sq * .3), s * (1 - sq * .4));
  const br = Math.sin(t * 2.2) * 1.2 * m, fl = Math.sin(t * 3) * .18 * m;
  for (const sd of [-1, 1]) {
    cx.save(); cx.scale(sd, 1); cx.translate(18, -34); cx.rotate(-.3 + fl);
    cx.fillStyle = c2; cx.beginPath(); cx.moveTo(0, 0); cx.quadraticCurveTo(14, -26, 30, -20); cx.quadraticCurveTo(26, -12, 28, -4); cx.quadraticCurveTo(20, -8, 18, 0); cx.quadraticCurveTo(10, -3, 4, 8); cx.closePath(); cx.fill();
    cx.restore();
  }
  cx.fillStyle = '#3d1780'; ell(-11, -3, 9, 4.5); cx.fill(); ell(11, -3, 9, 4.5); cx.fill();
  cx.fillStyle = c1; cx.beginPath(); cx.ellipse(0, -28 - br, 25, 27 + br, 0, 0, 6.3); cx.fill();
  cx.fillStyle = mix(KC.boss[0], '#ffffff', .4); ell(0, -16 - br, 15, 12); cx.fill();
  cx.strokeStyle = 'rgba(93, 34, 199, .35)'; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(-10, -18 - br); cx.lineTo(10, -18 - br); cx.moveTo(-12, -12 - br); cx.lineTo(12, -12 - br); cx.stroke();
  cx.fillStyle = '#ffc21a'; cx.strokeStyle = '#c98a00'; cx.lineWidth = 1.5;
  for (const sd of [-1, 1]) { cx.beginPath(); cx.moveTo(sd * 14, -46 - br); cx.quadraticCurveTo(sd * 30, -52, sd * 26, -70); cx.quadraticCurveTo(sd * 22, -56, sd * 7, -50 - br); cx.closePath(); cx.fill(); cx.stroke(); }
  cx.fillStyle = '#ffc21a'; cx.beginPath(); cx.moveTo(-11, -50 - br); cx.lineTo(-12, -62 - br); cx.lineTo(-5.5, -56 - br); cx.lineTo(0, -65 - br); cx.lineTo(5.5, -56 - br); cx.lineTo(12, -62 - br); cx.lineTo(11, -50 - br); cx.closePath(); cx.fill(); cx.stroke();
  cx.fillStyle = '#ff2e4d'; cx.beginPath(); cx.arc(0, -55 - br, 2, 0, 6.3); cx.fill();
  cx.fillStyle = 'rgba(255, 255, 255, .3)'; ell(-11, -44 - br, 6, 3.4); cx.fill();
  eyes(-9, 9, -35 - br, 6, 1, '#ffe66b');
  cx.fillStyle = '#1d1026'; cx.beginPath(); cx.moveTo(-12, -22 - br); cx.quadraticCurveTo(0, -12 - br, 12, -22 - br); cx.quadraticCurveTo(0, -18 - br, -12, -22 - br); cx.fill();
  cx.fillStyle = '#fff'; cx.beginPath(); cx.moveTo(-9, -21.2 - br); cx.lineTo(-7, -17 - br); cx.lineTo(-5, -20 - br); cx.moveTo(5, -20 - br); cx.lineTo(7, -17 - br); cx.lineTo(9, -21.2 - br); cx.fill();
  cx.restore();
}
// the hero faces right; feet at (x, y)
function drawHero(x, y, s, o) {
  const t = gt / 1000, m = reduced ? 0 : 1, hurt = o.hurt || 0, tint = c => (hurt > .05 ? mix(c, '#ff4d6a', hurt * .6) : c);
  cx.save(); cx.translate(x, y);
  if (!o.air) { cx.fillStyle = 'rgba(0, 0, 0, .2)'; ell(0, 0, 14 * s, 3 * s); cx.fill(); }
  if (o.glow > .02) {
    const g = cx.createRadialGradient(0, -30 * s, 4 * s, 0, -30 * s, 44 * s);
    g.addColorStop(0, `rgba(255, 214, 80, ${(o.glow * .55).toFixed(3)})`); g.addColorStop(1, 'rgba(255, 214, 80, 0)');
    cx.fillStyle = g; cx.beginPath(); cx.arc(0, -30 * s, 44 * s, 0, 6.3); cx.fill();
  }
  if (o.rot) cx.rotate(o.rot);
  const sq = o.sq || 0;
  cx.scale(s * (o.flip || 1) * (1 + sq * .1), s * (1 - sq * .12));
  if (o.alpha < 1) cx.globalAlpha = o.alpha;
  const bob = o.air ? 0 : Math.sin(t * 3.4) * 1 * m + (o.walk ? -Math.abs(Math.sin(o.walk * 18)) * 2 : 0);
  const cw = Math.sin(t * 5) * 2 * m * (o.air ? 2 : 1);
  cx.fillStyle = tint('#e8334f'); cx.beginPath(); cx.moveTo(-6, -31 + bob); cx.quadraticCurveTo(-17 - cw, -18, -15 - cw, -3); cx.lineTo(-3, -6); cx.closePath(); cx.fill();
  cx.fillStyle = '#3a2a55';
  if (o.air) { ell(-5, 0, 4, 4.5); cx.fill(); ell(6, 1, 4, 4.5); cx.fill(); } else { ell(-5.5, -2.8, 5.2, 3.2); cx.fill(); ell(6, -2.8, 5.2, 3.2); cx.fill(); }
  cx.translate(0, bob);
  cx.fillStyle = tint('#3b7bff'); rr(-11.5, -27, 23, 23, 9); cx.fill();
  cx.fillStyle = 'rgba(255, 255, 255, .28)'; ell(-5, -20, 3.6, 5); cx.fill();
  cx.fillStyle = '#ffc21a'; rr(-11.5, -11.5, 23, 3.4, 1.7); cx.fill();
  cx.save(); cx.translate(10.5, -15); cx.rotate(-.55 + (o.swing || 0));
  cx.fillStyle = o.gold ? '#ffe28a' : '#eef3fb'; rr(-2, -26, 4, 23, 2); cx.fill(); cx.strokeStyle = '#8b97ad'; cx.lineWidth = 1.1; cx.stroke();
  cx.fillStyle = '#ffc21a'; rr(-5.5, -4, 11, 3.2, 1.6); cx.fill();
  cx.fillStyle = '#7a4b22'; rr(-1.5, -1.5, 3, 5.5, 1.2); cx.fill();
  cx.restore();
  cx.fillStyle = tint('#ffd7b5'); cx.beginPath(); cx.arc(10.5, -15, 3.4, 0, 6.3); cx.fill();
  cx.beginPath(); cx.arc(1, -38, 13.5, 0, 6.3); cx.fill();
  cx.fillStyle = tint('#d6deec'); cx.beginPath(); cx.arc(1, -39, 14.8, Math.PI * 1.02, Math.PI * 1.98); cx.closePath(); cx.fill();
  cx.fillStyle = tint('#b3c0d6'); rr(-14, -41.5, 30, 4.4, 2.2); cx.fill();
  cx.fillStyle = 'rgba(255, 255, 255, .6)'; ell(-4, -48, 4.5, 2.2); cx.fill();
  cx.fillStyle = tint('#ff4f6d'); cx.beginPath(); cx.moveTo(1, -53); cx.quadraticCurveTo(-3, -65, -14, -61); cx.quadraticCurveTo(-8, -58, -5, -52); cx.closePath(); cx.fill();
  if (o.faint) {
    cx.strokeStyle = '#1d1026'; cx.lineWidth = 1.6; cx.lineCap = 'round'; cx.beginPath();
    for (const ex of [-2.5, 6.5]) { cx.moveTo(ex - 2, -34.5); cx.lineTo(ex + 2, -30.5); cx.moveTo(ex + 2, -34.5); cx.lineTo(ex - 2, -30.5); }
    cx.stroke();
  } else {
    cx.fillStyle = '#1d1026'; ell(-2.5, -32.5, 2.3, 3); cx.fill(); ell(6.5, -32.5, 2.3, 3); cx.fill();
    cx.fillStyle = '#fff'; ell(-1.8, -33.6, .9, .9); cx.fill(); ell(7.2, -33.6, .9, .9); cx.fill();
  }
  cx.fillStyle = 'rgba(255, 110, 140, .45)'; ell(-7, -28, 2.8, 1.7); cx.fill(); ell(11, -28, 2.8, 1.7); cx.fill();
  cx.strokeStyle = '#7a3b2e'; cx.lineWidth = 1.5; cx.lineCap = 'round'; cx.beginPath();
  if (o.faint) { cx.moveTo(0, -26.5); cx.quadraticCurveTo(2.2, -28.5, 4.4, -26.5); } else cx.arc(2.2, -29, 2.6, .15 * Math.PI, .85 * Math.PI);
  cx.stroke();
  cx.restore();
}
function drawSpirit(x, y, s, a) {
  cx.save(); cx.globalAlpha = a; cx.translate(x, y); cx.scale(s, s);
  cx.fillStyle = 'rgba(240, 240, 255, .9)'; cx.beginPath(); cx.moveTo(-9, 0); cx.lineTo(-9, -12); cx.arc(0, -12, 9, Math.PI, 0); cx.lineTo(9, 0);
  cx.quadraticCurveTo(6, -3, 4.5, 0); cx.quadraticCurveTo(2, 3, 0, 0); cx.quadraticCurveTo(-2, -3, -4.5, 0); cx.quadraticCurveTo(-6, 3, -9, 0); cx.fill();
  cx.fillStyle = '#2a1840'; ell(-3, -13, 1.6, 2.4); cx.fill(); ell(3, -13, 1.6, 2.4); cx.fill();
  cx.strokeStyle = '#ffd23f'; cx.lineWidth = 1.6; ell(0, -24, 6, 1.8); cx.stroke();
  cx.restore();
}
function drawPotion(x, y, s, col, skull) {
  const t = gt / 1000, m = reduced ? 0 : 1;
  cx.save(); cx.translate(x, y); cx.scale(s, s);
  cx.fillStyle = 'rgba(0, 0, 0, .2)'; ell(0, 0, 10, 2.6); cx.fill();
  cx.translate(0, -3 - Math.abs(Math.sin(t * 2.4)) * 3 * m);
  if (skull) { cx.fillStyle = 'rgba(160, 90, 255, .35)'; for (let i = 0; i < 3; i++) { const k = ((t * .6 + i / 3) % 1); cx.globalAlpha = 1 - k; cx.beginPath(); cx.arc(Math.sin(k * 6 + i) * 4, -34 - k * 16, 3 + k * 4, 0, 6.3); cx.fill(); } cx.globalAlpha = 1; }
  cx.fillStyle = 'rgba(236, 246, 255, .95)'; cx.beginPath(); cx.arc(0, -12, 11.5, 0, 6.3); cx.fill(); rr(-4.5, -29, 9, 9, 2); cx.fill();
  cx.save(); cx.beginPath(); cx.arc(0, -12, 9.8, 0, 6.3); cx.clip();
  const lv = -13 + Math.sin(t * 3) * 1.2 * m;
  cx.fillStyle = col; cx.fillRect(-11, lv, 22, 14); cx.fillStyle = 'rgba(255, 255, 255, .3)'; cx.fillRect(-11, lv, 22, 2.4);
  cx.restore();
  cx.fillStyle = '#b07a4a'; rr(-5.2, -33, 10.4, 5.5, 2); cx.fill();
  cx.strokeStyle = 'rgba(40, 20, 70, .3)'; cx.lineWidth = 1.3; cx.beginPath(); cx.arc(0, -12, 11.5, 0, 6.3); cx.stroke();
  cx.fillStyle = 'rgba(255, 255, 255, .85)'; ell(-4.5, -16, 2.2, 3.4); cx.fill();
  if (skull) {
    cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(0, -9, 4.2, 0, 6.3); cx.fill(); rr(-2.4, -6.5, 4.8, 3.4, 1); cx.fill();
    cx.fillStyle = '#3b1a66'; ell(-1.6, -9.4, 1.2, 1.4); cx.fill(); ell(1.6, -9.4, 1.2, 1.4); cx.fill();
  }
  cx.restore();
}
function drawSword(x, y, s) {
  const t = gt / 1000, m = reduced ? 0 : 1;
  cx.save(); cx.translate(x, y); cx.scale(s, s);
  const g = cx.createRadialGradient(0, -26, 2, 0, -26, 28);
  g.addColorStop(0, `rgba(255, 214, 80, ${(.45 + .15 * Math.sin(t * 4) * m).toFixed(3)})`); g.addColorStop(1, 'rgba(255, 214, 80, 0)');
  cx.fillStyle = g; cx.beginPath(); cx.arc(0, -26, 28, 0, 6.3); cx.fill();
  cx.fillStyle = '#9d97b8'; cx.beginPath(); cx.moveTo(-16, 0); cx.quadraticCurveTo(-14, -12, -2, -12); cx.quadraticCurveTo(13, -12, 16, 0); cx.closePath(); cx.fill();
  cx.fillStyle = 'rgba(255, 255, 255, .3)'; ell(-6, -8, 5, 2); cx.fill();
  cx.fillStyle = '#eef3fb'; rr(-3, -32, 6, 24, 2); cx.fill(); cx.strokeStyle = '#8b97ad'; cx.lineWidth = 1.2; cx.stroke();
  cx.fillStyle = '#ffc21a'; rr(-10.5, -35, 21, 4.6, 2.3); cx.fill();
  cx.fillStyle = '#7a4b22'; rr(-2.2, -44, 4.4, 9.5, 1.6); cx.fill();
  cx.fillStyle = '#ffc21a'; cx.beginPath(); cx.arc(0, -45.5, 3.3, 0, 6.3); cx.fill();
  const tw = .5 + .5 * Math.sin(t * 5) * m;
  sparkle(9, -38, 3.5 * tw + 1, '#fff');
  cx.restore();
}
function sparkle(x, y, r, c) {
  cx.fillStyle = c; cx.beginPath(); cx.moveTo(x, y - r); cx.quadraticCurveTo(x, y, x + r, y); cx.quadraticCurveTo(x, y, x, y + r); cx.quadraticCurveTo(x, y, x - r, y); cx.quadraticCurveTo(x, y, x, y - r); cx.fill();
}
const starPath = typeof Path2D === 'function' ? new Path2D(FP.star) : null;
function drawShield(x, y, s) {
  const t = gt / 1000, m = reduced ? 0 : 1;
  cx.save(); cx.translate(x, y); cx.scale(s, s);
  cx.fillStyle = 'rgba(0, 0, 0, .2)'; ell(0, 0, 11, 2.6); cx.fill();
  cx.translate(0, -3 - Math.abs(Math.sin(t * 2.2)) * 3 * m);
  cx.beginPath(); cx.moveTo(0, -33); cx.quadraticCurveTo(9, -28, 15, -30); cx.quadraticCurveTo(16, -10, 0, -2); cx.quadraticCurveTo(-16, -10, -15, -30); cx.quadraticCurveTo(-9, -28, 0, -33); cx.closePath();
  cx.fillStyle = '#2f8fff'; cx.fill(); cx.strokeStyle = '#ffc21a'; cx.lineWidth = 2.6; cx.stroke();
  cx.fillStyle = 'rgba(255, 255, 255, .25)'; cx.beginPath(); cx.moveTo(0, -31); cx.quadraticCurveTo(-8, -26, -13, -28); cx.quadraticCurveTo(-13, -18, -6, -12); cx.closePath(); cx.fill();
  if (starPath) { cx.save(); cx.translate(-7, -24); cx.scale(.58, .58); cx.fillStyle = '#fff'; cx.fill(starPath); cx.restore(); }
  cx.restore();
}
function drawTrap(x, y, s, spring) {
  cx.save(); cx.translate(x, y); cx.scale(s, s);
  const n = 5, w = 44, sw = w / n, hgt = 11 * (1 + (spring || 0) * .7);
  cx.fillStyle = '#4a4260'; rr(-w / 2 - 2, -4, w + 4, 5, 2.5); cx.fill();
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + i * sw;
    cx.fillStyle = '#e6ecf5'; cx.beginPath(); cx.moveTo(x0, -3); cx.lineTo(x0 + sw / 2, -3 - hgt); cx.lineTo(x0 + sw, -3); cx.closePath(); cx.fill();
    cx.fillStyle = '#aab3c5'; cx.beginPath(); cx.moveTo(x0 + sw / 2, -3 - hgt); cx.lineTo(x0 + sw, -3); cx.lineTo(x0 + sw / 2, -3); cx.closePath(); cx.fill();
  }
  cx.restore();
}
function drawChest(x, y, s, open) {
  cx.save(); cx.translate(x, y); cx.scale(s, s);
  cx.fillStyle = 'rgba(0, 0, 0, .2)'; ell(0, 0, 16, 3); cx.fill();
  if (open > 0) { cx.fillStyle = `rgba(255, 214, 90, ${open * .5})`; cx.beginPath(); cx.arc(0, -20, 22, 0, 6.3); cx.fill(); }
  cx.fillStyle = '#c47534'; rr(-15, -18, 30, 18, 3); cx.fill();
  cx.fillStyle = '#a95f25'; cx.fillRect(-15, -5, 30, 5);
  cx.fillStyle = '#ffc21a'; cx.fillRect(-10.5, -18, 3.5, 18); cx.fillRect(7, -18, 3.5, 18);
  cx.save(); cx.translate(-15, -18); cx.rotate(-open * 1.9);
  cx.fillStyle = '#dd8c46'; rr(0, -10, 30, 11, 5); cx.fill();
  cx.fillStyle = '#ffc21a'; cx.fillRect(4.5, -10, 3.5, 11); cx.fillRect(22, -10, 3.5, 11);
  cx.fillStyle = 'rgba(255, 255, 255, .25)'; rr(3, -8, 24, 3, 1.5); cx.fill();
  cx.restore();
  if (open < .3) { cx.fillStyle = '#ffc21a'; rr(-3.2, -20, 6.4, 7, 1.6); cx.fill(); cx.fillStyle = '#7a4b22'; cx.fillRect(-.8, -17.5, 1.6, 2.6); }
  cx.restore();
}
function boltAt(x, y, h, c) {
  const k = h / 20;
  cx.save(); cx.translate(x - 8.5 * k, y - 12 * k); cx.scale(k, k);
  cx.fillStyle = c; cx.beginPath(); cx.moveTo(13.5, 2); cx.lineTo(4, 13.5); cx.lineTo(11, 13.5); cx.lineTo(10, 22); cx.lineTo(20, 10); cx.lineTo(13, 10); cx.closePath(); cx.fill();
  cx.restore();
}
function crownAt(x, y, h, c) {
  cx.save(); cx.translate(x, y); cx.fillStyle = c; cx.beginPath();
  cx.moveTo(-h * .6, h * .4); cx.lineTo(-h * .7, -h * .35); cx.lineTo(-h * .3, 0); cx.lineTo(0, -h * .5); cx.lineTo(h * .3, 0); cx.lineTo(h * .7, -h * .35); cx.lineTo(h * .6, h * .4); cx.closePath(); cx.fill();
  cx.restore();
}
// a number badge, the way the ads draw them
function pill(x, y, txt, bg, o = {}) {
  const fs = Math.round(o.fs || 16);
  cx.font = `700 ${fs}px ${TF}`;
  const tw = cx.measureText(txt).width, ic = o.icon ? fs * 1.02 : 0, w = Math.max(fs * 2.1, tw + fs * 1.1 + ic), h = Math.round(fs * 1.62);
  cx.save(); cx.translate(x, y);
  if (o.sc && o.sc !== 1) cx.scale(o.sc, o.sc);
  if (o.alpha != null) cx.globalAlpha *= clamp(o.alpha, 0, 1);
  cx.fillStyle = 'rgba(20, 8, 30, .3)'; rr(-w / 2, -h / 2 + 3, w, h, h / 2); cx.fill();
  cx.fillStyle = bg; cx.beginPath(); cx.moveTo(-5, h / 2 - 1); cx.lineTo(0, h / 2 + 5); cx.lineTo(5, h / 2 - 1); cx.fill();
  rr(-w / 2, -h / 2, w, h, h / 2); cx.fill();
  cx.lineWidth = 2; cx.strokeStyle = 'rgba(255, 255, 255, .95)'; cx.stroke();
  cx.fillStyle = 'rgba(255, 255, 255, .22)'; rr(-w / 2 + 4, -h / 2 + 2.5, w - 8, h * .36, h * .18); cx.fill();
  const tx = ic / 2;
  if (o.icon === 'bolt') boltAt(tx - tw / 2 - ic * .45, 0, fs * .95, '#fff');
  if (o.icon === 'crown') crownAt(tx - tw / 2 - ic * .5, -.5, fs * .7, '#ffd23f');
  cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText(txt, tx, fs * .08 + .5);
  cx.restore();
}
function badgeOf(r) {
  switch (r.t) {
    case 'e': return [n0(r.show), '#ef3a55'];
    case 'b': return [n0(r.show), '#b3125a', 'crown'];
    case 'p': return ['+' + n0(r.v), '#10b26a'];
    case 'x': return ['×' + r.v, '#f59e0b'];
    case 'h': return ['Shield', '#2f8fff'];
    case 't': return ['−' + n0(r.v), '#3d2e52'];
    case 'd': return ['÷' + r.v, '#8a3ffc'];
    default: return ['+' + n0(r.v), '#f59e0b', 'bolt'];
  }
}
const BOSS_S = 1.2;
const thingH = r => (MH[r.t === 'e' ? r.kind : r.t === 'b' ? 'boss' : r.t] || 40) * cs * (r.t === 'b' ? BOSS_S : r.size || 1);
const heroBadge = () => { const s = hsc(); return [hero.x + hero.dx, hero.y - 68 * s - 10]; };
function drawThing(r) {
  let x = spot(r), y = floorY(r);
  const s = cs * (r.size || 1);
  cx.save();
  if (r.pop) cx.globalAlpha = 1 - r.pop;
  if (r.fly) { const [hx, hy] = [hero.x + hero.dx, hero.y - 26 * hsc()]; x += (hx - x) * r.fly; y += (hy + 14 - y) * r.fly - Math.sin(r.fly * Math.PI) * 30; cx.translate(x, y); cx.scale(1 - r.fly * .6, 1 - r.fly * .6); cx.translate(-x, -y); }
  const o = { dx: r.dx, hurt: r.hurt, sq: r.pop, ph: r.ph };
  switch (r.t) {
    case 'e': drawMon(r.kind, x, y, s, o); break;
    case 'b': drawBoss(x, y, cs * BOSS_S, o); break;
    case 'p': drawPotion(x, y, s, '#ff4f8a'); break;
    case 'x': drawSword(x, y, s); break;
    case 'h': drawShield(x, y, s); break;
    case 't': drawTrap(r.x + r.w / 2, y, s, r.spk); break;
    case 'd': drawPotion(x, y, s, '#7b2cff', 1); break;
    case 'c': drawChest(x, y, s, r.open || 0); break;
  }
  cx.restore();
}
function drawBadge(r) {
  if (r.fly > .3) return;
  const fade = r.used ? clamp(1 - (gt - r.used) / 160, 0, 1) : 1;
  if (!fade) return;
  const [txt, bg, icon] = badgeOf(r), x = (r.t === 't' ? r.x + r.w / 2 : spot(r)) + (r.dx || 0), y = Math.max(r.y + 20, floorY(r) - thingH(r) - 12);
  pill(x, y, txt, bg, { fs: (r.t === 'b' ? 18 : 15) * clamp(cs, .9, 1.05), icon, alpha: Math.min(fade, 1 - (r.pop || 0) - (r.fly || 0) * 2), sc: 1 + (r.bump || 0) * .25 });
}
function drawHand(x, y, k) {
  // a pointing hand; the fingertip sits on (x, y)
  const press = k > .7 ? Math.sin((k - .7) / .3 * Math.PI) : 0;
  cx.save(); cx.translate(x, y); cx.rotate(-.35); cx.scale(1 - press * .12, 1 - press * .12);
  cx.fillStyle = '#fff'; cx.strokeStyle = '#2a1d3a'; cx.lineWidth = 2.2; cx.lineJoin = 'round';
  rr(-4.5, 0, 9, 22, 4.5); cx.fill(); cx.stroke();
  rr(-10, 14, 24, 22, 8); cx.fill(); cx.stroke();
  cx.beginPath(); cx.ellipse(-10, 24, 4.5, 7, -.5, 0, 6.3); cx.fill(); cx.stroke();
  cx.fillStyle = '#fff'; cx.fillRect(-3.3, 12, 6.6, 5);
  cx.strokeStyle = 'rgba(42, 29, 58, .35)'; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(5, 20); cx.lineTo(5, 26); cx.moveTo(9.5, 20); cx.lineTo(9.5, 26); cx.stroke();
  cx.restore();
}
function drawParts() {
  for (const p of tps) {
    const a = p.home ? 1 : clamp(1 - p.life / p.max, 0, 1);
    cx.globalAlpha = a; cx.fillStyle = p.c;
    if (p.k === 'sq') { cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); rr(-p.sz / 2, -p.sz / 2, p.sz, p.sz * .8, 1.5); cx.fill(); cx.restore(); }
    else if (p.k === 'star') sparkle(p.x, p.y, p.sz, p.c);
    else if (p.k === 'ring') { cx.strokeStyle = p.c; cx.lineWidth = 3 * a; cx.beginPath(); cx.arc(p.x, p.y, p.sz + p.life * 1.6, 0, 6.3); cx.stroke(); }
    else if (p.k === 'heart') { cx.save(); cx.translate(p.x, p.y); const s = p.sz / 8; cx.scale(s, s); cx.beginPath(); cx.moveTo(0, 3.5); cx.bezierCurveTo(-6, -.5, -3, -6, 0, -2.5); cx.bezierCurveTo(3, -6, 6, -.5, 0, 3.5); cx.fill(); cx.restore(); }
    else if (p.k === 'coin') { ell(p.x, p.y, p.sz * Math.abs(Math.cos(p.life * .2)) + .5, p.sz); cx.fill(); }
    else { cx.beginPath(); cx.arc(p.x, p.y, p.sz / 2, 0, 6.3); cx.fill(); }
  }
  cx.globalAlpha = 1;
}
function drawFloats() {
  for (const f of tfl) {
    const k = f.life / f.max, a = k < .1 ? k / .1 : k > .7 ? (1 - k) / .3 : 1, y = f.y - eo(Math.min(1, k * 1.4)) * 34;
    cx.globalAlpha = clamp(a, 0, 1); cx.font = `700 ${f.fs}px ${TF}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.lineWidth = 5; cx.lineJoin = 'round'; cx.strokeStyle = 'rgba(29, 16, 38, .85)'; cx.strokeText(f.txt, f.x, y);
    cx.fillStyle = f.c; cx.fillText(f.txt, f.x, y);
  }
  cx.globalAlpha = 1;
}
function drawTitle() {
  const k = (gt - st.titleAt) / 1500;
  if (k < 0 || k >= 1 || !lev) return;
  const a = k < .12 ? k / .12 : k > .72 ? (1 - k) / .28 : 1, sc = k < .12 ? .6 + .4 * eo(k / .12) : 1 + (k - .12) * .06;
  cx.save(); cx.globalAlpha = a; cx.translate(W / 2, H * .34); cx.scale(sc, sc);
  cx.font = `700 46px ${TF}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.lineJoin = 'round';
  cx.lineWidth = 10; cx.strokeStyle = '#4b1fa8'; cx.strokeText(`Level ${lev.L}`, 0, 0);
  cx.fillStyle = '#fff'; cx.fillText(`Level ${lev.L}`, 0, 0);
  cx.restore();
}
function draw() {
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawSky();
  if (!lev) return;
  const sx = shk ? rnd(-shk, shk) : 0, sy = shk ? rnd(-shk, shk) : 0;
  cx.save(); cx.translate(-cam + sx, sy);
  lev.towers.forEach(drawTower);
  drawGround();
  lev.towers.forEach(t => {
    if (t.gone && t.x0 - cam < W + 40 && t.x0 + t.w - cam > -40) rubble(t);
  });
  const vis = lev.towers.filter(t => !t.gone && !t.sink && t.x0 - cam < W + 40 && t.x0 + t.w - cam > -40);
  vis.forEach(t => t.rooms.forEach(r => { if (!r.done && !r.gone) drawThing(r); }));
  if (st.prin) drawPrincess(st.prin.x, st.prin.y, cs * .95, false);
  const hs = hsc();
  if (hero.ghost < 1) drawHero(hero.x + hero.dx, hero.y, hs, { rot: hero.rot, flip: hero.flip, sq: hero.sq, hurt: hero.hurt, glow: hero.glow, air: hero.air || !!hero.drag, alpha: hero.alpha * (1 - hero.ghost * .8), walk: hero.walk, faint: hero.ghost > 0 || hero.faint, gold: hero.gold });
  if (hero.ghost > 0) drawSpirit(hero.x + hero.dx - 28 * hs, hero.y - 12 * hs - hero.ghost * 60, hs, Math.sin(hero.ghost * Math.PI));
  vis.forEach(t => t.rooms.forEach(r => { if (!r.done && !r.gone) drawBadge(r); }));
  if (!hero.faint) {
    const [bx, by] = heroBadge();
    pill(bx, by, n0(st.show), '#2f6bff', { fs: 18 * clamp(cs, .92, 1.08), sc: 1 + hero.bump * .3 });
    if (st.sh) { cx.save(); cx.translate(bx + 28 + String(st.show).length * 4, by + 12); cx.scale(.55 * cs, .55 * cs); drawShield(0, 12, 1); cx.restore(); }
  }
  for (const f of flies) { const k = eo(clamp((gt - f.t0) / f.d, 0, 1)); pill(f.x0 + (f.x1 - f.x0) * k, f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * 30, f.txt, f.bg, { fs: 15, sc: 1 - k * .2 }); }
  drawParts(); drawFloats();
  const target = st.hint || (st.tut && lev.L === 1 && st.moves === 0 ? st.tut : null);
  if (target && st.phase === 'play' && !hero.drag && !target.done) {
    const k = ((gt - st.hintAt) % 1600) / 1600, e = eio(Math.min(1, k / .7));
    const [ax, ay] = [hero.x, hero.y - 30 * hs], [bx, by] = [spot(target), target.y + target.h * .55];
    drawHand(ax + (bx - ax) * e, ay + (by - ay) * e, k);
  }
  cx.restore();
  if (flash > .01) { cx.fillStyle = `rgba(255, 46, 77, ${flash * .28})`; cx.fillRect(0, 0, W, H); }
  drawTitle();
}
function rubble(t) {
  const n = Math.max(5, Math.round(t.w / 22));
  for (let i = 0; i < n; i++) {
    const k = Math.abs(Math.sin((t.x0 + i * 31) * 3.1)) % 1, x = t.x0 + (i + .5) * t.w / n, w = 14 + k * 12;
    cx.fillStyle = i % 2 ? pal.wall : pal.rubble; rr(x - w / 2, gy - 7 - k * 6, w, 10 + k * 5, 4); cx.fill();
    cx.strokeStyle = pal.edge; cx.lineWidth = 1.5; cx.stroke();
  }
}

// ---------- the loop: runs only while the game is on screen ----------
function frame(ts) {
  raf = 0;
  if (curApp !== 'tower' || !cv) return;
  if (!W && !size()) { raf = requestAnimationFrame(frame); return; }
  const busy = tws.length || tps.length || tfl.length || flies.length || ptr || hero.drag || shk || flash > .01 || st.phase === 'busy' || st.phase === 'win' || st.phase === 'fail' || gt - st.titleAt < 1600 || st.hint || (st.tut && !st.moves);
  if (!busy && lastT && ts - lastT < 30) { raf = requestAnimationFrame(frame); return; } // a calm scene redraws at 30 fps
  const dt = Math.min(50, lastT ? ts - lastT : 16.7); lastT = ts;
  gt += dt * tscale;
  update(dt * tscale);
  draw();
  raf = requestAnimationFrame(frame);
}
function update(dt) {
  const f = dt / 16.7;
  for (let i = 0; i < tws.length; i++) {
    const w = tws[i], k = Math.min(1, (gt - w.t0) / w.d);
    w.fn(k);
    if (k >= 1) { tws.splice(i--, 1); w.res(); }
  }
  shk = shk > .3 ? shk * Math.pow(.86, f) : 0;
  flash *= Math.pow(.9, f);
  hero.sq *= Math.pow(.8, f); hero.hurt *= Math.pow(.9, f); hero.bump *= Math.pow(.85, f); hero.glow *= Math.pow(.97, f);
  if (lev) for (const t of lev.towers) for (const r of t.rooms) { if (r.hurt) r.hurt *= Math.pow(.86, f); if (r.bump) r.bump *= Math.pow(.85, f); }
  if (hero.drag) {
    const d = hero.drag, px = hero.x;
    hero.x += (d.tx - hero.x) * Math.min(1, .45 * f); hero.y += (d.ty - hero.y) * Math.min(1, .45 * f);
    hero.rot = clamp((hero.x - px) * .03, -.35, .35);
  }
  for (let i = tps.length - 1; i >= 0; i--) {
    const p = tps[i];
    p.life += f;
    if (p.home) {
      const tx = hero.x + hero.dx, ty = hero.y - 26 * hsc(), dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
      if (d < 10 || p.life > 70) { tps.splice(i, 1); continue; }
      p.vx = (p.vx + dx / d * 1.1 * f) * .92; p.vy = (p.vy + dy / d * 1.1 * f) * .92;
    } else {
      if (p.life >= p.max) { tps.splice(i, 1); continue; }
      p.vy += p.g * f; p.vx *= Math.pow(.985, f);
    }
    p.x += p.vx * f; p.y += p.vy * f; p.r += p.vr * f;
  }
  for (let i = tfl.length - 1; i >= 0; i--) if ((tfl[i].life += f) >= tfl[i].max) tfl.splice(i, 1);
  for (let i = flies.length - 1; i >= 0; i--) if (gt - flies[i].t0 >= flies[i].d) flies.splice(i, 1);
  if (tipUntil && gt > tipUntil) hideTip();
  if (st.phase === 'win' && oel.needle) {
    const u = (1 - Math.cos((gt - st.meterAt) / 1000 * 3.4)) / 2, m = multAt(u);
    st.meterU = u; oel.needle.style.left = (u * 100).toFixed(2) + '%';
    if (m !== st.mult) { st.mult = m; if (oel.mx) oel.mx.textContent = '×' + m; sfx.tick(); }
  }
  if (st.phase === 'fail' && oel.ring) {
    const left = st.revEnd - gt;
    oel.ring.style.setProperty('--k', clamp(left / 8000, 0, 1).toFixed(3));
    if (left <= 0 && oel.rev && !oel.rev.hidden) { oel.rev.hidden = true; if (oel.retry) oel.retry.classList.add('gold'); }
  }
}
function puff(x, y, o) {
  const n = reduced ? Math.min(4, o.n || 10) : o.n || 10;
  for (let i = 0; i < n; i++) {
    const a = o.a != null ? o.a + rnd(-(o.sp || .6), o.sp || .6) : R() * 6.2832, v = rnd(1, 3.4) * (o.pw || 1);
    tps.push({ x: x + rnd(-(o.w || 0), o.w || 0), y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up || 0), g: o.g ?? .12, life: 0, max: ri(24, 42), sz: rnd(3, 6) * (o.sz || 1), c: pick(o.cols), k: o.k || 'dot', r: R() * 6, vr: rnd(-.2, .2), home: o.home });
  }
}
const floatTxt = (x, y, txt, c, fs = 24) => tfl.push({ x, y, txt, c, fs, life: 0, max: 55 });
const fly = (x0, y0, x1, y1, txt, bg, d = 340) => flies.push({ x0, y0, x1, y1, txt, bg, d, t0: gt });
const dust = (x, y, n = 6) => puff(x, y - 2, { n, cols: [dark ? 'rgba(200, 180, 240, .5)' : 'rgba(255, 255, 255, .85)'], a: -Math.PI / 2, sp: 1.4, pw: .7, g: -.01, sz: 1.6, w: 8 });
function hitFx(x, y) {
  puff(x, y, { n: 8, cols: ['#fff', '#ffe66b', '#ffc21a'], k: 'star', pw: 1.3, g: 0, sz: 1.2 });
  tps.push({ x, y, vx: 0, vy: 0, g: 0, life: 0, max: 12, sz: 6, c: '#fff', k: 'ring', r: 0, vr: 0 });
}

// ---------- a move ----------
async function jump(tx, ty) {
  const x0 = hero.x + hero.dx, y0 = hero.y, dist = Math.hypot(tx - x0, ty - y0);
  const d = clamp(260 + dist * .55, 300, 560), hgt = 24 + Math.max(0, y0 - ty) * .22 + dist * .12;
  hero.dx = 0; hero.x = x0; hero.drag = null; hero.flip = tx < x0 - 2 ? -1 : 1; hero.air = 1; sfx.swoosh();
  await anim(d, k => { hero.x = x0 + (tx - x0) * k; hero.y = y0 + (ty - y0) * k - Math.sin(k * Math.PI) * hgt; hero.rot = Math.sin(k * Math.PI * 2) * .1 * hero.flip; });
  hero.air = 0; hero.rot = 0; hero.sq = 1; dust(tx, ty, 5); noise(.06, .06, 0, 700, 300);
}
async function walk(tx) {
  const x0 = hero.x; if (Math.abs(tx - x0) < 2) return;
  hero.flip = tx < x0 ? -1 : 1;
  await anim(clamp(Math.abs(tx - x0) * 5, 140, 420), k => { hero.x = x0 + (tx - x0) * eio(k); hero.walk = k; });
  hero.walk = 0; hero.flip = 1;
}
function count(to, d = 480) {
  const a = st.show, up = to > a; let last = -1;
  hero.bump = 1;
  return anim(d, k => {
    st.show = Math.round(a + (to - a) * eo(k));
    const sn = Math.floor(k * 7);
    if (sn !== last && k < 1) { last = sn; if (up) sfx.clear(sn + 3); else sfx.tick(); }
  }).then(() => { st.show = to; hero.bump = 1; TWS.maxPow = Math.max(TWS.maxPow, st.p); });
}
async function go(r) {
  if (!valid(r)) return;
  st.phase = 'busy'; st.sel = null; st.hover = null; st.hint = null; st.moves++;
  hideTip(); act();
  const tok = st.tok;
  st.snap = { p: st.p, sh: st.sh, at: st.at };
  const fight = r.t === 'e' || r.t === 'b';
  await jump(entryX(r), floorY(r));
  if (tok !== st.tok) return;
  hero.flip = 1; st.at = r;
  if (!fight) r.used = gt;
  const ok = fight ? await battle(r, tok) : await useItem(r, tok);
  if (tok !== st.tok) return;
  if (!ok) { lose(r); return; }
  r.done = 1; S.towerRooms++;
  if (r.t === 'b') { await victory(r, tok); return; }
  await walk(r.x + r.w * .5);
  if (tok !== st.tok) return;
  const t = lev.towers[st.ti];
  if (!t.fin && t.rooms.every(x => x.done)) { await collapse(t, tok); if (tok !== st.tok) return; }
  st.phase = 'play'; renderHud(); queueCheck();
}
async function battle(r, tok) {
  const win = st.p > r.v, ex = spot(r), y = floorY(r), reach = Math.max(6, ex - hero.x - (r.t === 'b' ? 40 : 28) * cs);
  const my = y - 24 * cs;
  for (let i = 0; i < 2; i++) {
    await anim(90, k => { hero.dx = reach * ei(k); });
    if (tok !== st.tok) return false;
    hitFx((hero.x + hero.dx + ex) / 2 + 6, my); r.hurt = 1; r.dx = 7; shake(2.5 + i * 1.5); sfx.thunk(); haptic();
    await anim(130, k => { hero.dx = reach * (1 - eo(k)); r.dx = 7 * (1 - k); });
    if (!win || i === 0) {
      await anim(85, k => { r.dx = -reach * .5 * ei(k); });
      hitFx((hero.x + ex + r.dx) / 2 - 4, my); hero.hurt = 1; hero.dx = -5; shake(2.5); sfx.thunk();
      await anim(130, k => { r.dx = -reach * .5 * (1 - eo(k)); hero.dx = -5 * (1 - k); });
    }
  }
  if (tok !== st.tok) return false;
  if (win) {
    sfx.pop(9); haptic(true); shake(4);
    const [bx, by] = [ex, y - thingH(r) - 12], [hx, hy] = heroBadge();
    const [c1, c2] = KC[r.kind];
    await anim(220, k => { r.pop = k; });
    r.gone = 1;
    puff(ex, y - 20 * cs, { n: 22, cols: [c1, c2, '#fff'], home: 1, pw: 1.6 });
    puff(ex, y - 20 * cs, { n: 8, cols: ['#fff', '#ffe66b'], k: 'star', pw: 1.8, g: .02 });
    fly(bx, by, hx, hy, '+' + n0(r.v), '#ef3a55', 360);
    await sleep(300);
    st.p += r.v; hero.glow = .8;
    await count(st.p, r.t === 'b' ? 700 : 520);
    const [px, py] = toPhone(ex, y - 50 * cs);
    earn(1 + (lev.L >> 2), px, py);
    return true;
  }
  // the enemy takes everything the hero had
  sfx.lose(); haptic(true); shake(12); flash = 1; buzz();
  const gain = st.p, e0 = r.show, [hx, hy] = heroBadge();
  fly(hx, hy, ex, y - thingH(r) - 12, n0(gain), '#2f6bff', 380);
  anim(620, k => { r.show = Math.round(e0 + gain * eo(k)); if (k === 1) r.bump = 1; });
  count(0, 520);
  await knockOut(tok);
  return false;
}
// the hero is thrown out of the tower, spins down to the ground, and its spirit floats up
async function knockOut(tok) {
  hero.faint = 1; hero.air = 1;
  const hs = hsc(), x0 = hero.x + hero.dx, y0 = hero.y, ty = gy - 12 * hs, tx = Math.max(home(st.ti) + 40 * hs, x0 - 120 - R() * 30), fall = Math.max(0, ty - y0);
  hero.dx = 0; sfx.swoosh();
  await anim(clamp(520 + fall * .9, 560, 900), k => {
    hero.x = x0 + (tx - x0) * k;
    hero.y = y0 + (ty - y0) * k * k - Math.sin(k * Math.PI) * 46;
    hero.rot = -k * Math.PI * 2.5;
  });
  if (tok !== st.tok) return;
  hero.air = 0; hero.sq = 1; hero.y = ty; hero.rot = -Math.PI / 2;
  dust(hero.x, gy, 8); shake(6); sfx.thunk(); haptic(true);
  await sleep(220);
  await anim(900, k => { hero.ghost = k; });
}
async function useItem(r, tok) {
  const ix = spot(r), y = floorY(r), hs = hsc();
  if (r.t === 'c') {
    sfx.click(); await anim(300, k => { r.open = eo(k); });
    puff(ix, y - 18 * cs, { n: 14, cols: ['#ffd23f', '#ffc21a', '#fff1a8'], k: 'coin', a: -Math.PI / 2, sp: .9, pw: 2, g: .2, sz: 1 });
    sfx.coin(); haptic();
    const [px, py] = toPhone(ix, y - 40 * cs);
    earn(r.v, px, py, { raw: true });
    await sleep(260); await anim(220, k => { r.pop = k; });
    r.gone = 1; return true;
  }
  if (r.t === 't' || r.t === 'd') {
    if (r.t === 't') { await walk(r.x + r.w * .5); await anim(110, k => { r.spk = eo(k); }); }
    else { puff(ix, y - 30 * cs, { n: 14, cols: ['#a066ff', '#7b2cff', '#d9c2ff'], a: -Math.PI / 2, sp: 1.2, pw: 1, g: -.02, sz: 1.6 }); await anim(260, k => { r.fly = eo(k) * .8; }); r.gone = 1; }
    if (tok !== st.tok) return false;
    if (st.sh) {
      st.sh--; floatTxt(...sideTxt(), 'Blocked', '#6fb6ff', 20); sfx.thunk(); sfx.unlock(); haptic();
      puff(hero.x, hero.y - 30 * hs, { n: 12, cols: ['#8fd0ff', '#2f8fff', '#fff'], pw: 1.4, g: .05 });
      await anim(200, k => { r.pop = k; }); r.gone = 1; return true;
    }
    hero.hurt = 1; shake(r.t === 't' ? 6 : 4); haptic(true);
    if (r.t === 't' && st.p <= r.v) {
      sfx.lose(); flash = 1; buzz(); count(0, 400);
      await knockOut(tok);
      return false;
    }
    sfx.nope();
    st.p = r.t === 't' ? st.p - r.v : Math.max(1, Math.floor(st.p / r.v));
    floatTxt(...sideTxt(), r.t === 't' ? '−' + n0(r.v) : '÷' + r.v, '#ff5470', 26);
    await count(st.p, 420); await anim(200, k => { r.pop = k; });
    r.gone = 1; return true;
  }
  // pickups fly into the hero
  await anim(300, k => { r.fly = eo(k); });
  r.gone = 1;
  if (tok !== st.tok) return false;
  const [fx, fy] = sideTxt();
  if (r.t === 'p') {
    sfx.fresh(); st.p += r.v; floatTxt(fx, fy, '+' + n0(r.v), '#5cf2a2', 26);
    puff(hero.x, hero.y - 26 * hs, { n: 12, cols: ['#5cf2a2', '#fff', '#ff8fbf'], k: 'star', pw: 1.3, g: -.02 });
    await count(st.p, 420);
  } else if (r.t === 'x') {
    sfx.big(); st.p *= r.v; hero.glow = 1; hero.gold = 1; shake(5); haptic(true);
    floatTxt(fx, fy, '×' + r.v, '#ffd23f', 34);
    puff(hero.x, hero.y - 26 * hs, { n: 18, cols: ['#ffd23f', '#fff', '#ffb000'], k: 'star', pw: 2, g: 0 });
    await count(st.p, 680);
  } else if (r.t === 'h') {
    sfx.unlock(); st.sh++; floatTxt(fx, fy, 'Shield', '#6fb6ff', 22); haptic();
    puff(hero.x, hero.y - 26 * hs, { n: 10, cols: ['#8fd0ff', '#fff'], k: 'star', pw: 1.2, g: 0 });
    await sleep(300);
  }
  return true;
}
async function collapse(t, tok) {
  await sleep(220);
  if (tok !== st.tok) return;
  sfx.shake(0); haptic(true); shake(7);
  const h0 = gy - t.top + 70, hy = hero.y;
  let next = 0;
  await anim(950, k => {
    t.sink = h0 * ei(k);
    hero.y = Math.min(gy, hy + t.sink); hero.air = hero.y < gy ? 1 : 0;
    if (k >= next) {
      next += .13;
      puff(t.x0 + R() * t.w, gy - rnd(0, 40), { n: 3, cols: [pal.wall, pal.wall2, pal.edge], k: 'sq', a: -Math.PI / 2, sp: 1.2, pw: 1.8, g: .2, sz: 1.3 });
      dust(t.x0 + R() * t.w, gy, 3);
      sfx.shake(ri(0, 3)); if (!reduced) shk = Math.max(shk, 3);
    }
  });
  if (tok !== st.tok) return;
  t.gone = 1; t.sink = 0; hero.y = gy; hero.air = 0; hero.sq = 1; st.at = null;
  for (let i = 0; i < 5; i++) dust(t.x0 + t.w * (i + .5) / 5, gy, 4);
  sfx.thunk(); haptic();
  st.ti++; renderHud();
  await sleep(200);
  const c0 = cam, x0 = hero.x, tx = home(st.ti);
  hero.flip = 1;
  await anim(1050, k => { const e = eio(k); cam = c0 + (st.ti * W - c0) * e; hero.x = x0 + (tx - x0) * e; hero.walk = k; });
  hero.walk = 0;
}
async function victory(r, tok) {
  const t = lev.towers[st.ti];
  sfx.win(); haptic(true); confetti(110);
  await anim(420, k => { st.cage = eo(k); });
  if (tok !== st.tok) return;
  const px0 = t.x0 + t.w / 2, py0 = t.top - 12, tx = hero.x + 36 * cs, ty = floorY(r);
  st.prin = { x: px0, y: py0 }; sfx.match();
  await anim(620, k => { st.prin.x = px0 + (tx - px0) * k; st.prin.y = py0 + (ty - py0) * k - Math.sin(k * Math.PI) * 46; });
  puff((hero.x + tx) / 2, ty - 40 * cs, { n: 16, cols: ['#ff4fa3', '#ff7eb6', '#ff2e4d'], k: 'heart', a: -Math.PI / 2, sp: .9, pw: 1.1, g: -.025, sz: 3 });
  sfx.giggle();
  await sleep(900);
  if (tok !== st.tok) return;
  TWS.wins++; S.towerWins++; TWS.lv = lev.L + 1; TWS.best = Math.max(TWS.best, TWS.lv); save(); queueCheck();
  st.phase = 'win'; st.meterAt = gt; st.mult = 2;
  showOver('win');
}
function lose(r) {
  st.phase = 'fail'; st.fatal = r; TWS.fails++;
  st.need = Math.max(1, r.v - st.snap.p + 1);
  st.revEnd = gt + 8000;
  save(); showOver('fail');
}
function revive() {
  if (st.phase !== 'fail' || gt > st.revEnd) return;
  if (!spend(revCost())) return;
  st.revives++; TWS.revives++;
  const r = st.fatal, s = st.snap;
  st.p = s.p; st.show = s.p; st.sh = s.sh; st.at = s.at;
  Object.assign(r, { show: r.v, pop: 0, dx: 0, spk: 0, gone: 0, fly: 0, bump: 0, used: 0 });
  Object.assign(hero, { dx: 0, rot: 0, ghost: 0, alpha: 1, hurt: 0, flip: 1, faint: 0, air: 0 });
  place(); hideOver(); st.phase = 'play'; st.fatal = null;
  puff(hero.x, hero.y - 26 * hsc(), { n: 18, cols: ['#ffd23f', '#fff', '#7ae0ff'], k: 'star', pw: 1.8, g: 0 });
  sfx.win(); haptic(true); hero.glow = 1; hero.bump = 1;
  renderHud(); save();
}
function spendLife() {
  TWS.lives = Math.max(0, TWS.lives - 1);
  lifeTick();
  renderHud();
  if (!TWS.lives) { TWS.out = 1; st.phase = 'out'; showOver('out'); save(); return false; }
  save(); return true;
}
function retry() {
  if (st.phase !== 'fail') return;
  if (!spendLife()) return;
  hideOver(); newLevel();
}
function restartLevel() {
  if (st.phase !== 'play' || !st.moves) { if (st.phase === 'play') { sfx.nope(); toast('You’re already at the start'); } return; }
  if (now() - st.armedAt > 2600) { st.armedAt = now(); sfx.nope(); toast('Tap again to restart. It uses 1 life.'); return; }
  st.armedAt = 0;
  if (!spendLife()) return;
  sfx.whoosh(); newLevel();
}
const MULTS = [[2, 22], [3, 18], [5, 20], [3, 18], [2, 22]];
const segAt = u => { let x = u * 100; for (let i = 0; i < MULTS.length; i++) if ((x -= MULTS[i][1]) <= 0) return i; return MULTS.length - 1; };
const multAt = u => MULTS[segAt(u)][0];
function claim(m, btn) {
  if (st.phase !== 'win') return;
  st.phase = 'claimed';
  const g = reward(lev.L) * m, [x, y] = btn ? centerOf(btn) : [FW / 2, FH / 2];
  earn(g, x, y - 30, { raw: true });
  sfx.win(); haptic(true); burst(x, y, { n: 22, colors: ['#ffd23f', '#ffc21a', '#fff'] });
  if (m > 1 && oel.segs) { const sg = oel.segs.children[segAt(st.meterU)]; if (sg) restart(sg, 'hit'); }
  if (oel.needle) oel.needle.classList.add('stop');
  save();
  const tok = st.tok;
  setTimeout(() => { if (tok === st.tok) { hideOver(); newLevel(); } }, 750);
}
function useHint() {
  if (!lev || st.phase !== 'play') { sfx.nope(); return; }
  if (st.hint && !st.hint.done) { toast('Follow the hand'); return; }
  const r = bestMove();
  if (!r) { sfx.nope(); toast('This run can’t reach the boss. Restart the level to try again.'); return; }
  if (!spend(hintCost())) return;
  st.hint = r; st.hintAt = gt; st.hinted = 1; TWS.hints++;
  sfx.fresh(); haptic();
}
// the best room to take next, or null when the boss is already out of reach
function bestMove() {
  const t = lev.towers[st.ti], left = t.rooms.filter(r => !r.done), boss = lev.boss;
  if (t.fin && st.p > boss.v) return boss;
  let best = null, bp = 0;
  for (const r of left) {
    if (r.t === 'b') continue;
    const q = step(r, st.p, st.sh); if (!q) continue;
    const v = most(lev.towers, st.ti, left.filter(x => x !== r && x.t !== 'b'), [q]);
    if (v > boss.v && v > bp) { bp = v; best = r; }
  }
  return best;
}
function moveSel(k) {
  const L = lev.towers[st.ti].rooms.filter(r => !r.done).sort((a, b) => a.f - b.f || a.c - b.c);
  if (!L.length) return;
  let s = st.sel && L.includes(st.sel) ? st.sel : null;
  if (!s) s = L[0];
  else if (k === 'ArrowUp' || k === 'ArrowDown') {
    const dir = k === 'ArrowUp' ? 1 : -1;
    const c = L.filter(r => (r.f - s.f) * dir > 0).sort((a, b) => Math.abs(a.f - s.f) - Math.abs(b.f - s.f) || Math.abs(a.c - s.c) - Math.abs(b.c - s.c))[0];
    if (c) s = c;
  } else s = L[clamp(L.indexOf(s) + (k === 'ArrowRight' ? 1 : -1), 0, L.length - 1)];
  st.sel = s; sfx.tick();
}

// ---------- levels, lives, overlays ----------
function newLevel() {
  lev = genLevel(TWS.lv);
  st.tok++;
  tws.length = 0; tps.length = 0; tfl.length = 0; flies.length = 0;
  Object.assign(st, { p: lev.p0, sh: 0, show: lev.p0, ti: 0, at: null, phase: 'play', snap: null, fatal: null, hover: null, sel: null, hint: null, tut: null, moves: 0, revives: 0, hinted: 0, cage: 0, prin: null, titleAt: gt, armedAt: 0 });
  Object.assign(hero, { dx: 0, rot: 0, flip: 1, sq: 0, hurt: 0, bump: 0, glow: 0, air: 0, ghost: 0, alpha: 1, walk: 0, drag: null, faint: 0, gold: 0 });
  lev.towers.forEach(t => { t.sink = 0; t.gone = 0; t.rooms.forEach((r, i) => Object.assign(r, { done: 0, gone: 0, dx: 0, hurt: 0, pop: 0, fly: 0, spk: 0, open: 0, bump: 0, used: 0, show: r.v, ph: i * 1.7 + t.floors })); });
  cam = 0; shk = 0; flash = 0;
  if (W) geo();
  if (lev.L === 1) st.tut = bestMove();
  const has = new Set(lev.towers.flatMap(t => t.rooms.map(r => r.t)));
  if (lev.towers.length > 1) has.add('towers');
  const tip = TIPS.find(([k]) => has.has(k) && (!TWS.seen[k] || (k === 'e' && lev.L === 1)));
  if (tip) TWS.seen[tip[0]] = 1;
  showTip(tip && tip[1]);
  renderHud();
}
function lifeTick(quiet) {
  if (TWS.lives >= MAXL) { TWS.lifeAt = 0; return; }
  if (!TWS.lifeAt) TWS.lifeAt = T() + LIFE_MS;
  let got = 0;
  while (TWS.lives < MAXL && T() >= TWS.lifeAt) { TWS.lives++; TWS.lifeAt += LIFE_MS; got = 1; }
  if (TWS.lives >= MAXL) {
    TWS.lifeAt = 0;
    if (got && !quiet && TWS.out && S.onboarded && curApp !== 'tower') alertOnce('tw-lives', 'tower', `Your lives are full. Level ${TWS.lv} is ready.`, 600000);
  }
}
function showTip(txt) {
  if (!tipEl) return;
  if (!txt) { hideTip(); return; }
  tipEl.textContent = txt; tipEl.hidden = false; tipEl.classList.remove('out'); restart(tipEl, 'in');
  tipUntil = gt + 6500;
}
function hideTip() { if (!tipEl || tipEl.hidden) return; tipUntil = 0; tipEl.classList.add('out'); setTimeout(() => { if (tipEl.classList.contains('out')) tipEl.hidden = true; }, 300); }
const CROWN = '<svg viewBox="0 0 24 20" aria-hidden="true"><path d="M2.5 17 1.5 5l6 5 4.5-8 4.5 8 6-5-1 12z" fill="currentColor"/></svg>';
const BULB = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21.2h4M12 2.8a6.2 6.2 0 0 0-3.7 11.2c.7.6 1.2 1.4 1.2 2.4v.4h5v-.4c0-1 .5-1.8 1.2-2.4A6.2 6.2 0 0 0 12 2.8z"/></svg>';
const REDO = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 3.8v4.6h4.6"/></svg>';
const BROKEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11.2 6.1 9.6 10l2.6 2-1.8 4.3 3.7-5-2.5-2 1.2-3A4.6 4.6 0 0 1 20.7 8.9c0 6.3-8.7 11.4-8.7 11.4S3.3 15.2 3.3 8.9a4.6 4.6 0 0 1 7.9-2.8z"/></svg>';
const heartsHTML = n => Array.from({ length: MAXL }, (_, i) => `<i class="${i < n ? 'on' : ''}">${IF('heart')}</i>`).join('');
function showOver(k) {
  if (!over) return;
  let h = '';
  if (k === 'win') {
    const base = reward(lev.L), stars = Math.max(1, 3 - (st.revives ? 1 : 0) - (st.hinted ? 1 : 0));
    h = `<div class="tw-card tw-wcard"><div class="tw-rib">Level ${lev.L}</div>
      <div class="tw-stars">${[0, 1, 2].map(i => `<i class="${i < stars ? 'on' : ''}" style="--d:${(.12 + i * .16).toFixed(2)}s">${IF('star')}</i>`).join('')}</div>
      <h3>Level complete!</h3>
      <div class="tw-rew">${IF('bolt')}<b>${n0(base)}</b></div>
      <div class="tw-meter"><div class="tw-segs">${MULTS.map(([m, w]) => `<span class="m${m}" style="flex:${w}">×${m}</span>`).join('')}</div><i class="tw-needle"></i></div>
      <button class="pbtn gold tw-go" data-a="claimx">Claim <span class="tw-mx">×2</span></button>
      <button class="link" data-a="claim1">Claim ${n0(base)}</button></div>`;
  } else if (k === 'fail') {
    h = `<div class="tw-card"><span class="tw-bigic">${BROKEN}</span><h3>Level failed</h3><p>So close! You needed <b>${n0(st.need)}</b> more power.</p>
      <button class="pbtn gold tw-rev" data-a="revive"><span class="tw-ring"><i></i></span>Revive<span class="tw-cost">${IF('bolt')}${n0(revCost())}</span></button>
      <button class="pbtn" data-a="retry">Retry</button>
      <p class="tw-fine">Retry uses 1 life. You have ${TWS.lives}.</p></div>`;
  } else {
    h = `<div class="tw-card"><div class="tw-hearts">${heartsHTML(TWS.lives)}</div><h3>Out of lives</h3><p>Next life in <b class="tw-next">${cd(Math.max(0, TWS.lifeAt - T()))}</b></p>
      <button class="pbtn gold" data-a="refill">Refill lives<span class="tw-cost">${IF('bolt')}${refillCost()}</span></button>
      <button class="link" data-a="leave">Back to Games</button></div>`;
  }
  over.innerHTML = h; over.dataset.k = k; over.hidden = false; restart(over, 'in');
  oel = { needle: $('.tw-needle', over), mx: $('.tw-mx', over), segs: $('.tw-segs', over), ring: $('.tw-ring', over), rev: $('.tw-rev', over), retry: $('[data-a="retry"]', over), next: $('.tw-next', over) };
}
function hideOver() { if (over) { over.hidden = true; over.innerHTML = ''; } oel = {}; }
function renderHud() {
  if (!hud || !lev) return;
  if (hud.lv.textContent !== String(lev.L)) hud.lv.textContent = lev.L;
  const sig = lev.L + ':' + lev.towers.length + ':' + st.ti;
  if (hud.prog.dataset.s !== sig) { hud.prog.dataset.s = sig; hud.prog.innerHTML = lev.towers.map((t, k) => `<i class="${k < st.ti ? 'done' : k === st.ti ? 'on' : ''}${t.fin ? ' fin' : ''}">${t.fin ? CROWN : ''}</i>`).join(''); }
  const lv = String(TWS.lives), nx = TWS.lives < MAXL && TWS.lifeAt ? cd(Math.max(0, TWS.lifeAt - T())) : '';
  if (hud.lives.textContent !== lv) hud.lives.textContent = lv;
  if (hud.next.textContent !== nx) hud.next.textContent = nx;
  if (hintB) { const c = String(hintCost()); const el = $('.tw-hc b', hintB); if (el && el.textContent !== c) el.textContent = c; }
}

// the store face: a hero with a big number and the tower it is about to take
const ART = `<svg class="tw-art" viewBox="0 0 100 100" aria-hidden="true" stroke="none">
<rect width="100" height="100" rx="22" fill="#7a35f0"/>
<path d="M0 22A22 22 0 0 1 22 0h56a22 22 0 0 1 22 22v34H0z" fill="#9458ff"/>
<circle cx="22" cy="24" r="20" fill="#b98aff" opacity=".55"/><circle cx="22" cy="24" r="10" fill="#ffe28a"/>
<path d="M36 17a6 6 0 0 1 11-2 5 5 0 0 1 7 4.6H35.5A3 3 0 0 1 36 17z" fill="#fff" opacity=".85"/>
<path d="M0 74q16-12 32-5t34-2 34 1v32H0z" fill="#5b22c9"/>
<rect x="57" y="36" width="35" height="60" rx="4" fill="#f6ecff"/>
<rect x="57" y="36" width="35" height="60" rx="4" fill="none" stroke="#caa8f2" stroke-width="2"/>
<path d="M51 38 74.5 12 98 38q-23.5 5-47 0z" fill="#ff4f6d"/><path d="M74.5 12 98 38q-11.7 3-23.5 3z" fill="#e0304f"/>
<path d="M74.5 12V3" stroke="#6b4a2a" stroke-width="1.8"/><path d="M75 3.2l8.5 2.6L75 8.4z" fill="#ffc21a"/>
<rect x="62" y="43" width="25" height="23" rx="6" fill="#4d3470"/><rect x="62" y="71" width="25" height="21" rx="6" fill="#4d3470"/>
<rect x="62" y="63" width="25" height="3" fill="#c9a8f0"/><rect x="62" y="89" width="25" height="3" fill="#c9a8f0"/>
<path d="M68.5 50l-2-5 4.5 3.5zM80.5 50l2-5-4.5 3.5z" fill="#fff3d6"/>
<rect x="67" y="48" width="15" height="15" rx="6.5" fill="#ff6b6b"/>
<circle cx="71.5" cy="54" r="2.3" fill="#fff"/><circle cx="77.5" cy="54" r="2.3" fill="#fff"/><circle cx="71" cy="54.4" r="1.2" fill="#1d1026"/><circle cx="77" cy="54.4" r="1.2" fill="#1d1026"/>
<path d="M70.5 58.5q3.5 2.6 7 0z" fill="#1d1026"/>
<path d="M66.5 89q.5-11 8-11t8 11z" fill="#5fd46a"/><circle cx="72" cy="84" r="1.8" fill="#fff"/><circle cx="77.5" cy="84" r="1.8" fill="#fff"/><circle cx="71.7" cy="84.3" r="1" fill="#1d1026"/><circle cx="77.2" cy="84.3" r="1" fill="#1d1026"/>
<path d="M0 88q25-8 50-3t50 1v14H0z" fill="#35c26a"/><path d="M0 88q25-8 50-3t50 1v3q-25-4-50-1T0 91z" fill="#7be08f"/>
<path d="M22 67q-9 8-8 22h8z" fill="#e8334f"/>
<ellipse cx="25" cy="91.5" rx="4.6" ry="2.8" fill="#3a2a55"/><ellipse cx="35" cy="91.5" rx="4.6" ry="2.8" fill="#3a2a55"/>
<rect x="19.5" y="68" width="21" height="22" rx="8" fill="#3b7bff"/><rect x="19.5" y="82" width="21" height="3.2" rx="1.6" fill="#ffc21a"/>
<ellipse cx="25" cy="74" rx="3" ry="4.2" fill="#fff" opacity=".3"/>
<g transform="rotate(24 40 77)"><rect x="38.2" y="52" width="3.8" height="23" rx="1.9" fill="#eef3fb" stroke="#8b97ad" stroke-width="1"/><rect x="35" y="74" width="10.2" height="3.2" rx="1.6" fill="#ffc21a"/><rect x="38.6" y="77" width="3" height="5" rx="1.2" fill="#7a4b22"/></g>
<circle cx="40.5" cy="77" r="3.2" fill="#ffd7b5"/>
<circle cx="30.5" cy="57" r="12.5" fill="#ffd7b5"/>
<path d="M16.8 56a13.7 13.7 0 0 1 27.4 0z" fill="#d6deec"/><rect x="16.5" y="53.8" width="28" height="4.2" rx="2.1" fill="#b3c0d6"/>
<ellipse cx="26" cy="47.5" rx="4.2" ry="2" fill="#fff" opacity=".6"/>
<path d="M30.5 43.2q-4-11-14-7.5 5.5 2 8.4 8z" fill="#ff4f6d"/>
<ellipse cx="27.5" cy="62.4" rx="2.1" ry="2.8" fill="#1d1026"/><ellipse cx="35.8" cy="62.4" rx="2.1" ry="2.8" fill="#1d1026"/>
<circle cx="28.2" cy="61.4" r=".85" fill="#fff"/><circle cx="36.5" cy="61.4" r=".85" fill="#fff"/>
<ellipse cx="23.5" cy="66.4" rx="2.4" ry="1.5" fill="#ff7a95" opacity=".55"/><ellipse cx="39.6" cy="66.4" rx="2.4" ry="1.5" fill="#ff7a95" opacity=".55"/>
<path d="M29.8 66.3q2.1 2.1 4.2 0" fill="none" stroke="#7a3b2e" stroke-width="1.4" stroke-linecap="round"/>
<path d="M31 41.5l-3.5 4h7z" fill="#2f6bff"/>
<rect x="12" y="23" width="38" height="20" rx="10" fill="#2f6bff" stroke="#fff" stroke-width="2.4"/>
<text x="31" y="38" text-anchor="middle" font-family="DynaPuff, ui-rounded, 'Arial Rounded MT Bold', sans-serif" font-weight="700" font-size="15" fill="#fff">99</text>
<path d="M4 18Q6 5 20 3.5h60Q94 5 96 18 72 26 50 26T4 18z" fill="#fff" opacity=".1"/>
</svg>`;

def({
  id: 'tower', name: 'Power Tower', tag: 'Absorb. Grow. Rescue.', c: '#8a3ffc',
  genre: 'Puzzle',
  blurb: 'Absorb weaker monsters, grow your power and free the princess at the top. Most players never pass level 20.',
  art: ART,
  init() { lifeTick(true); },
  bg() { lifeTick(); },
  badge: () => (TWS.out && TWS.lives >= MAXL ? 1 : 0),
  wait: () => (TWS.out && TWS.lives >= MAXL ? [{ t: 'Your lives are full', sub: `Power Tower · Level ${TWS.lv}` }] : []),
  ping: () => (TWS.wins
    ? pick([`Level ${TWS.lv} is ready. Most players fail it on the first try.`, `A stronger boss is waiting on level ${TWS.lv}.`, `Your record is ${fmt(TWS.maxPow)} power. The next tower is taller.`])
    : pick(['The princess is still at the top of the tower.', 'Only 1 in 4 players beats level 1 without a hint.'])),
  build(b, right) {
    b.innerHTML = `<div class="tw" data-nodrag><canvas class="tw-cv" aria-label="Power Tower. Drag the hero into a room, or use the arrow keys and Enter."></canvas><i class="tw-sb"></i>
      <div class="tw-hud"><button class="tw-rs" aria-label="Restart level">${REDO}</button><span class="tw-pill tw-lv">Level <b></b></span><span class="tw-pill tw-prog" aria-label="Towers"></span><span class="tw-pill tw-lives" aria-label="Lives">${IF('heart')}<b></b><small></small></span></div>
      <div class="tw-tip" hidden></div><div class="tw-over" hidden></div></div>`;
    right.innerHTML = `<button class="chip tw-hb" aria-label="Hint">${BULB}Hint<span class="tw-hc">${IF('bolt')}<b></b></span></button>`;
    root = $('.tw', b); cv = $('.tw-cv', b); cx = cv.getContext('2d'); sbEl = $('.tw-sb', b); over = $('.tw-over', b); tipEl = $('.tw-tip', b); hintB = $('.tw-hb', right);
    cv.twDebug = { state: () => ({ lev, st, hero, cam, W, H, gy }), best: () => bestMove(), speed: k => { tscale = k; } }; // for automated tests
    hud = { lv: $('.tw-lv b', b), prog: $('.tw-prog', b), lives: $('.tw-lives b', b), next: $('.tw-lives small', b) };
    setPal();
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setPal); } catch {}
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (curApp === 'tower') size(); }).observe(root);
    // touch or mouse: drag the hero into a room, or tap the room
    cv.addEventListener('pointerdown', e => {
      if (e.button > 0 || !lev || st.phase !== 'play' || !W) return;
      e.preventDefault();
      const [x, y] = loc(e), hs = hsc(), near = Math.hypot(x + cam - hero.x, y - (hero.y - 30 * hs)) < 46 * Math.max(1, hs);
      ptr = { id: e.pointerId, x0: x, y0: y, drag: false, near, lift: e.pointerType === 'mouse' ? 26 : 8 };
      try { cv.setPointerCapture(e.pointerId); } catch {}
    });
    cv.addEventListener('pointermove', e => {
      if (!lev || !W) return;
      const [x, y] = loc(e);
      if (!ptr || e.pointerId !== ptr.id) {
        if (e.pointerType === 'mouse' && st.phase === 'play') {
          const r = roomAt(x + cam, y); st.hover = r;
          cv.style.cursor = r || Math.hypot(x + cam - hero.x, y - (hero.y - 30 * hsc())) < 40 ? 'pointer' : '';
        }
        return;
      }
      if (!ptr.drag && ptr.near && st.phase === 'play' && Math.hypot(x - ptr.x0, y - ptr.y0) > 6) {
        ptr.drag = true; hero.drag = { tx: hero.x, ty: hero.y }; st.hint = null; hideTip(); sfx.tick(); haptic();
        cv.style.cursor = 'grabbing';
      }
      if (ptr.drag && hero.drag) { hero.drag.tx = x + cam; hero.drag.ty = y + ptr.lift; st.hover = roomAt(x + cam, y); }
    });
    const up = e => {
      if (!ptr || e.pointerId !== ptr.id) return;
      const p = ptr; ptr = null; cv.style.cursor = '';
      if (p.drag) {
        const r = st.hover; st.hover = null;
        if (e.type !== 'pointercancel' && valid(r)) go(r); else backHome();
        return;
      }
      if (e.type === 'pointercancel' || st.phase !== 'play') return;
      const [x, y] = loc(e);
      if (Math.hypot(x - p.x0, y - p.y0) > 14) return;
      const r = roomAt(x + cam, y);
      if (r) go(r);
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !ptr) st.hover = null; });
    over.addEventListener('click', e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      const k = a.dataset.a;
      if (k === 'claimx') claim(st.mult, a);
      else if (k === 'claim1') claim(1, a);
      else if (k === 'revive') revive();
      else if (k === 'retry') retry();
      else if (k === 'refill') { if (spend(refillCost())) { TWS.lives = MAXL; TWS.lifeAt = 0; TWS.out = 0; save(); sfx.win(); hideOver(); newLevel(); } }
      else if (k === 'leave') { const B = bundleOf('tower'); showTab(B, B.tabs[0]); }
    });
    $('.tw-rs', b).onclick = restartLevel;
    hintB.onclick = useHint;
    newLevel();
  },
  open() {
    setPal();
    if (TWS.out && TWS.lives > 0) TWS.out = 0;
    lifeTick();
    if (!lev || (lev.L !== TWS.lv && (st.phase === 'play' || st.phase === 'out') && !st.moves)) newLevel();
    size();
    if (st.phase === 'play' && !st.moves && TWS.lives <= 0) { st.phase = 'out'; showOver('out'); }
    renderHud();
    try { document.fonts && document.fonts.load(`700 20px DynaPuff`).catch(() => {}); } catch {}
    lastT = 0;
    if (!raf) raf = requestAnimationFrame(frame);
  },
  close() {
    cancelAnimationFrame(raf); raf = 0;
    if (ptr) { ptr = null; if (hero.drag) { hero.drag = null; if (st.phase === 'play') place(); } }
    st.hover = null;
  },
  render() { renderHud(); },
  tick() {
    lifeTick(); renderHud();
    if (st.phase === 'out') {
      if (TWS.lives > 0) { TWS.out = 0; hideOver(); newLevel(); }
      else if (oel.next) oel.next.textContent = cd(Math.max(0, TWS.lifeAt - T()));
    }
  },
  key(e) {
    if (e.type !== 'keydown' || !lev) return false;
    const k = e.key;
    if (st.phase === 'win') { if (k === 'Enter' || k === ' ') { claim(st.mult, $('.tw-go', over)); return true; } return false; }
    if (st.phase === 'fail') {
      if (k === 'Enter' || k === ' ') { if (gt < st.revEnd && S.hits >= revCost()) revive(); else retry(); return true; }
      if (k === 'r') { retry(); return true; }
      return false;
    }
    if (st.phase !== 'play') return k.startsWith('Arrow') || k === 'Enter' || k === ' ';
    if (k.startsWith('Arrow')) { moveSel(k); return true; }
    if (k === 'Enter' || k === ' ') { if (valid(st.sel)) go(st.sel); else moveSel('ArrowUp'); return true; }
    if (k === '?') { useHint(); return true; }
    return false;
  },
});
function roomAt(wx, y) {
  if (!lev) return null;
  for (const r of lev.towers[st.ti].rooms) if (!r.done && wx >= r.x && wx <= r.x + r.w && y >= r.y - (r.f === lev.towers[st.ti].floors - 1 ? 20 : 0) && y <= r.y + r.h) return r;
  return null;
}
function backHome() {
  const d = hero.drag; hero.drag = null;
  if (!d) return;
  const x0 = hero.x, y0 = hero.y;
  place();
  const tx = hero.x, ty = hero.y;
  hero.x = x0; hero.y = y0;
  st.phase = 'busy';
  const tok = st.tok;
  anim(240, k => { hero.x = x0 + (tx - x0) * eo(k); hero.y = y0 + (ty - y0) * eo(k); hero.rot *= .8; }).then(() => { if (tok !== st.tok) return; hero.rot = 0; hero.sq = 1; if (st.phase === 'busy') st.phase = 'play'; });
}
}
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
