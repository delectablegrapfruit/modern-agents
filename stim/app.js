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
const glyph = id => (id === 'streak' ? IF('flame') : `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${G[id]}</svg>`);
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
  settings: { sound: true, haptics: true, nudges: true, pace: 'normal' },
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
const save = () => { S.lastSeen = T(); store.set(S); };

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
const PACE = { chill: 9000, normal: 3000, chaos: 1000 };
const paceK = () => ({ chill: 2.2, normal: 1, chaos: .45 })[S.settings.pace] || 1;

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
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1500);
}

// ---------- economy: hits, combo, level ----------
let combo = 0, comboT = 0;
const COMBO_MS = 1600;
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
const ACH = [
  ['tap-1', 'First tap', 'Tap the big button', 'check', () => S.taps >= 1],
  ['tap-1k', 'Thumb of steel', 'Tap 1,000 times', 'bolt', () => S.taps >= 1000],
  ['crit', 'Critical', 'Land 25 crits', 'star', () => S.crits >= 25],
  ['combo', 'On a roll', 'Reach a ×10 combo', 'bolt', () => S.bestCombo >= 54],
  ['cards', 'Bottomless', 'Reveal 500 cards', 'down', () => S.cards >= 500],
  ['zero', 'Inbox zero', 'Read every message', 'check'],
  ['jackpot', 'Jackpot', 'Hit three of a kind', 'gem'],
  ['match', 'Matchmaker', 'Get 10 matches', 'heart', () => S.matches >= 10],
  ['clips', 'Autopilot', 'Watch 100 clips', 'play', () => S.clips >= 100],
  ['legend', 'Legendary', 'Pull a legendary', 'star'],
  ['collect', 'Completionist', 'Collect 12 of 24', 'gem', () => Object.keys(S.loot.own).length >= 12],
  ['scratch', 'Lucky scratch', 'Win a scratch card', 'star', () => S.scratchWins >= 1],
  ['pulse', 'Heartbeat', 'Keep a pulse of 20', 'flame', () => S.pulse.best >= 20],
  ['day7', 'Day seven', 'Claim a day-7 reward', 'chest'],
  ['quests', 'Busy', 'Finish 10 quests', 'check', () => S.questsDone >= 10],
  ['promo', 'Promoted', 'Move up a league', 'level'],
  ['pet', 'Good owner', 'Get all of Blob’s needs above 90', 'heart'],
  ['perfect', 'Perfectionist', 'Land 10 perfect holds', 'bolt', () => S.perfects >= 10],
  ['rings', 'Quick hands', 'Catch 100 rings', 'check', () => S.rings >= 100],
  ['pickups', 'Can’t put it down', 'Unlock 25 times', 'lock', () => S.pickups >= 25],
  ['level', 'Chronically online', 'Reach level 10', 'level', () => lvl().l >= 10],
  ['night', 'Night owl', 'Play between midnight and 4 am', 'moon', () => new Date().getHours() < 4],
  ['grass', 'Touched grass', 'Take a break, then come back', 'leaf'],
  ['rocket', 'Moonshot', 'Cash out a rocket above 10×', 'up', () => S.bestCash >= 10],
  ['flip8', 'Let it ride', 'Double a pot eight times', 'star', () => S.maxFlips >= 8],
  ['oracle', 'Oracle', 'Win 10 predictions', 'eye', () => S.predWins >= 10],
  ['whale', 'Whale', 'Grow a portfolio past 10,000', 'gem', () => (S.trade.athV || 0) >= 10000],
].map(([id, n, d, i, t]) => ({ id, n, d, i, t }));
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
let noClickUntil = 0;
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
        on = true; o.onStart && o.onStart();
      }
      if (ev.cancelable) ev.preventDefault();
      o.onMove(dx, dy);
    };
    const up = ev => {
      if (ev.pointerId !== id) return;
      done();
      if (on) { suppressClick(); o.onEnd(dx, dy); }
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

// ---------- notifications: banners, center, lock screen ----------
const notifs = [];
let nid = 0, lockOn = false, ncOn = false;
const nIcon = app => `<span class="gl mgl" style="--c:${APPS[app].c}">${glyph(app)}</span>`;
const nciHTML = (n, fresh) => `<div class="nci${fresh ? ' fresh' : ''}" data-n="${n.id}">${nIcon(n.app)}<div class="bt"><div class="bh"><b>${APPS[n.app].name}</b><span>${ago(n.ts)}</span></div><div class="bx">${n.text}</div></div></div>`;
function notify(app, text, o = {}) {
  const n = { id: ++nid, app, text, ts: T() };
  notifs.unshift(n); if (notifs.length > 80) notifs.pop();
  S.notifs++;
  buzz(); islandPop(app);
  if (lockOn) renderLock(true);
  else if (!o.silent) banner(n);
  if (ncOn) { const list = $('#nc-list'), empty = $('.nc-empty', list); if (empty) empty.remove(); list.prepend(html(nciHTML(n, true))); }
  refreshBadges();
}
const alertAt = {};
function alertOnce(key, app, text, gap = 15000) { if (T() - (alertAt[key] || 0) < gap) return; alertAt[key] = T(); notify(app, text); }
const bq = [];
let bOn = null;
function banner(n) { if (n.award) bq.unshift(n); else bq.push(n); if (bq.length > 3) bq.pop(); if (!bOn) nextBanner(); else bOn.hurry(); }
function bannerAward(title, text, icon, go) { banner({ award: true, title, text, icon, go }); }
function nextBanner() {
  const n = bq.shift();
  if (!n) { bOn = null; return; }
  const node = html(`<div class="banner${n.award ? ' award' : ''}" role="status">${n.award ? `<span class="gl mgl" style="--c:#5a3c00">${I(n.icon || 'star')}</span>` : nIcon(n.app)}<div class="bt"><div class="bh"><b>${n.award ? n.title : APPS[n.app].name}</b><span>now</span></div><div class="bx">${n.text}</div></div></div>`);
  $('#banners').append(node);
  void node.offsetWidth; node.classList.add('in');
  if (n.award) sfx.win(); else sfx.ding(n.app);
  haptic();
  let gone = false, timer = 0;
  const dismiss = () => {
    if (gone) return; gone = true; clearTimeout(timer);
    node.classList.remove('in'); node.classList.add('out');
    setTimeout(() => { node.remove(); bOn = null; nextBanner(); }, 200);
  };
  timer = setTimeout(dismiss, n.award ? 2600 : 2100);
  node.addEventListener('click', () => { dismiss(); if (n.award) { if (n.go) openApp(n.go); } else openFromNotif(n); });
  drag(node, {
    axis: 'y', onStart: () => clearTimeout(timer),
    onMove: (dx, dy) => { node.style.transition = 'none'; node.style.transform = `translateY(${dy < 0 ? dy : dy * .25}px)`; },
    onEnd: (dx, dy) => { node.style.transition = ''; node.style.transform = ''; if (dy < -20) dismiss(); else timer = setTimeout(dismiss, 1200); },
  });
  bOn = { dismiss, hurry: () => { if (gone) return; clearTimeout(timer); timer = setTimeout(dismiss, 450); } };
}
function openFromNotif(n) {
  const i = notifs.indexOf(n); if (i >= 0) notifs.splice(i, 1);
  closeNC(); openApp(n.app); refreshBadges();
}
let islandT = 0;
function islandPop(app) {
  if (!framed) return;
  const is = $('#island');
  $('.ia', is).innerHTML = `<i style="--c:${APPS[app].c}">${glyph(app)}</i>`;
  $('.ib', is).textContent = `+${Math.min(99, notifs.length)}`;
  is.classList.add('pop');
  clearTimeout(islandT); islandT = setTimeout(() => is.classList.remove('pop'), 1100);
}
function renderNC() {
  $('#nc-list').innerHTML = notifs.length ? notifs.map(n => nciHTML(n)).join('') : '<div class="nc-empty">Nothing yet. Give it a second.</div>';
}
function openNC() { if (lockOn) return; ncOn = true; renderNC(); $('#nc').classList.add('show'); sfx.whoosh(); }
function closeNC() { if (!ncOn) return; ncOn = false; $('#nc').classList.remove('show'); }
const nById = id => notifs.find(n => n.id === +id);

function renderLock(fresh) {
  const d = new Date();
  $('#lk-time').textContent = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
  $('#lk-date').textContent = d.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });
  const st = $('#lk-stack');
  if (!S.onboarded) {
    st.innerHTML = '<div class="lk-intro"><div class="a-logo">st<span class="i">ı<b class="tittle">1</b></span>m</div><p>Every hook a phone has, with nothing inside.</p><p>Badges, banners, streaks, slots, swipes, autoplay. Everything is fast and everything pays out.</p></div>';
    $('#lk-hint').textContent = 'Swipe up or tap to start';
    return;
  }
  const top = notifs.slice(0, 4);
  st.innerHTML = top.map((n, i) => nciHTML(n, fresh && i === 0)).join('') + (notifs.length > 4 ? `<div class="lk-more">${notifs.length - 4} more notifications</div>` : '');
  $('#lk-hint').textContent = 'Swipe up or tap to unlock';
}
function lock() {
  if (lockOn) return;
  closeNC(); lockOn = true;
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
  if (!S.onboarded) { S.onboarded = true; save(); startSchedule(); earn(500, FW / 2, FH / 2, { raw: true }); setTimeout(() => bannerAward('Welcome bonus', '+500 hits. Go place a bet.', 'gem', 'rocket'), 600); }
  else earn(2, FW / 2, 140, { raw: true });
  offline();
  if (then) setTimeout(() => openApp(then), 120);
  refreshBadges(); queueCheck();
}
function offline() {
  const away = Math.min(7200, (T() - (S.lastSeen || T())) / 1000);
  S.lastSeen = T();
  if (away < 30 || !S.tap.A) return;
  const g = Math.round(away * S.tap.A * .5);
  if (g < 1) return;
  setTimeout(() => { earn(g, FW / 2, 200, { raw: true }); bannerAward('While you were away', `Auto-tapper made ${fmt(g)} hits`, 'bolt', 'tap'); }, 500);
}

// ---------- app framework ----------
const APPS = {};
const GRID = ['rocket', 'flip', 'predict', 'trade', 'scroll', 'swipe', 'loop', 'loot', 'scratch', 'streak', 'quests', 'rank', 'pet', 'shop', 'hold', 'rings'];
const DOCK = ['tap', 'inbox', 'slots', 'you'];
const def = a => { APPS[a.id] = a; a.bdg = 0; };
let curApp = null;
const iconHTML = a => `<button class="ic" data-app="${a.id}" aria-label="${a.name}"><span class="gl" style="--c:${a.c}">${glyph(a.id)}</span><span class="badge"></span><span>${a.name}</span></button>`;
function mountApp(a) {
  const v = html(`<section class="app" style="--c:${a.c}" aria-label="${a.name}" hidden><header class="ah"><button class="ax" aria-label="Close">${I('close')}</button><div class="at"><b>${a.name}</b><small>${a.tag}</small></div><div class="ar"></div></header><div class="ab"></div></section>`);
  $('#apps').append(v);
  a.view = v; a.body = $('.ab', v); a.right = $('.ar', v);
  $('.ax', v).onclick = () => closeApp();
  drag($('.ah', v), {
    axis: 'y',
    onMove: (dx, dy) => { v.style.transition = 'none'; v.style.transform = `translateY(${Math.max(0, dy)}px)`; },
    onEnd: (dx, dy) => { v.style.transition = ''; v.style.transform = ''; if (dy > 100) closeApp(); },
  });
  a.build(a.body, a.right);
  return v;
}
function openApp(id, from) {
  const a = APPS[id];
  if (!a || lockOn) return;
  closeNC();
  if (curApp === id) return;
  if (curApp) closeApp(true);
  const v = a.view || mountApp(a);
  const src = from || $(`.ic[data-app="${id}"]`);
  if (src) {
    const r = src.getBoundingClientRect(), p = $('#apps').getBoundingClientRect();
    v.style.transformOrigin = `${(r.left + r.width / 2 - p.left) / scale}px ${(r.top + r.height / 2 - p.top) / scale}px`;
  }
  v.hidden = false; v.classList.remove('closing'); restart(v, 'opening');
  curApp = id; S.opens++;
  if (a.open) a.open();
  if (a.render) a.render();
  sfx.open(); haptic();
  refreshBadges();
}
function closeApp(instant) {
  if (!curApp) return;
  const a = APPS[curApp], v = a.view;
  curApp = null;
  if (a.close) a.close();
  if (instant || reduced) v.hidden = true;
  else {
    v.classList.remove('opening'); v.classList.add('closing'); sfx.close();
    setTimeout(() => { if (v.classList.contains('closing')) { v.hidden = true; v.classList.remove('closing'); } }, 180);
  }
  refreshBadges();
}
let badgeTotal = -1;
function refreshBadges() {
  let total = 0;
  for (const id in APPS) {
    const a = APPS[id], n = Math.max(0, Math.floor(a.badge ? a.badge() : 0));
    total += n;
    if (n !== a.bdg) {
      const el = $(`.ic[data-app="${id}"]`);
      if (el) {
        const b = $('.badge', el);
        b.textContent = n ? (n > 99 ? '99+' : n) : '';
        if (n > a.bdg) { restart(b, 'bump'); restart(el, 'jig'); }
      }
      a.bdg = n;
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

// =====================================================================
// the apps: one hook each
// =====================================================================

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
  badge: () => UPG.filter(u => (!u.max || S.tap[u.k] < u.max) && S.hits >= upPrice(u)).length,
  ping: () => (S.tap.A ? `Your auto-tapper made ${fmt(S.tap.A * 30)} hits. Come get more.` : 'Your thumb is getting cold'),
  build(b) {
    b.innerHTML = `<div class="pad"><div class="tp-stats"><div><b id="tp-p"></b><small>per tap</small></div><div><b id="tp-a"></b><small>per second</small></div><div><b id="tp-c"></b><small>crit chance</small></div></div>
      <div class="tp-zone"><button class="bigbtn" id="tp-btn" aria-label="Tap">TAP</button></div><div class="ups" id="tp-ups"></div></div>`;
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
    $('#tp-ups').innerHTML = UPG.map(u => {
      const maxed = u.max && S.tap[u.k] >= u.max, p = upPrice(u), ok = !maxed && S.hits >= p;
      return `<button class="upg${ok ? ' ok' : ' cant'}" data-u="${u.k}"><span class="ut"><b>${u.n} <span class="lv">Lv ${S.tap[u.k]}</span></b><small>${u.d}</small>${!ok && !maxed ? `<small class="nd">${fmt(p - S.hits)} more to go</small>` : ''}</span><span class="buy">${maxed ? 'Max' : IF('bolt') + fmt(p)}</span></button>`;
    }).join('');
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
  c._r = 1; c.classList.add('rev'); APPS.scroll.io.unobserve(c);
  const t = +c.dataset.t, v = +c.dataset.v, [x, y] = centerOf(c);
  S.cards++; act();
  earn(v, x + 40, y - 10);
  if (now() - cardGate > 45) { sfx.card(t); cardGate = now(); }
  if (t >= 3) { burst(x, y, { n: 24, colors: t === 4 ? ['#ffc21a', '#fff1a8', '#ff7a00'] : ['#9b5cff', '#c05cff', '#fff'], shape: 'dot', power: 1.3 }); haptic(true); }
  if (t === 4) { confetti(120); sfx.win(); }
}
function moreCards() {
  const a = APPS.scroll;
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
    if (a.sc.scrollHeight - (a.sc.scrollTop + a.sc.clientHeight) < 700) moreCards();
  }, 110);
}
async function refreshScroll() {
  S.refreshes++;
  await wait(ri(260, 620));
  const r = R(), a = APPS.scroll;
  if (r < .12) { sfx.nope(); toast('Nothing new. Pull again.'); return; }
  const big = r < .24, n = big ? 16 : ri(5, 9);
  hotLeft = big ? 16 : 4;
  const made = Array.from({ length: n }, () => mkCard(true));
  a.list.prepend(...made); made.forEach(c => a.io.observe(c));
  if (big) { sfx.big(); confetti(70); haptic(true); toast(`Hot refresh: ${n} boosted cards`); } else { sfx.fresh(); toast(`${n} fresh cards`); }
}
def({
  id: 'scroll', name: 'Scroll', tag: 'Infinite scroll · pull to refresh', c: '#7b61ff',
  badge: () => Math.min(99, S.scrollNew),
  ping: () => { S.scrollNew += ri(4, 16); return `${Math.min(99, S.scrollNew)} new cards to reveal`; },
  build(b) {
    b.innerHTML = `<div class="scroller" id="sr-sc">${spinner}<div class="ptr-body" id="sr-list"><div class="loadrow" id="sr-load"></div></div></div>`;
    this.sc = $('#sr-sc', b); this.list = $('#sr-list', b); this.load = $('#sr-load', b);
    this.io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) revealCard(e.target); }), { root: this.sc, threshold: .6 });
    new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) moreCards(); }, { root: this.sc, rootMargin: '0px 0px 700px 0px' }).observe(this.load);
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
  setTimeout(() => { if (!document.hidden && S.onboarded && !lockOn) addMail(); mailLoop(); }, (open ? rnd(650, 1600) : rnd(2200, 5000)) * paceK());
}
def({
  id: 'inbox', name: 'Inbox', tag: 'Unread dots · inbox zero', c: '#2f9bff',
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
  if (got && S.energy >= MAXE && S.onboarded) alertOnce('spins', 'slots', 'Spins are full. Pull now!', 30000);
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
  APPS.swipe.render();
}
function showMatch() {
  const a = APPS.swipe;
  const m = html(`<div class="match"><div class="two"><i style="--h:${ri(0, 359)}"></i><i></i></div><b>It’s a match!</b></div>`);
  a.body.append(m);
  S.matches++; sfx.match(); haptic(true);
  const [x, y] = centerOf(m); burst(x, y, { n: 30, colors: ['#fff', '#ffd6e8', '#ff2e4d'], shape: 'heart', power: 1.4 });
  earn(25, x, y - 90);
  setTimeout(() => m.remove(), 1000);
  queueCheck();
}
def({
  id: 'swipe', name: 'Swipe', tag: 'Swipe cards · intermittent match', c: '#ff4fa3',
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
        S.likesYou = 0; APPS.swipe.render(); refreshBadges();
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
  c._c = { d: ri(2600, 4600), el: 0, likes: Math.round(Math.exp(rnd(5, 12))), views: Math.round(Math.exp(rnd(7, 14))), liked: false, seen: false, vt: 0 };
  $('.lk span', c).textContent = fmt(c._c.likes); $('.vw', c).textContent = fmt(c._c.views);
  return c;
}
function addClips(n) {
  const a = APPS.loop;
  for (let i = 0; i < n; i++) { const c = mkClip(); a.lp.append(c); a.io.observe(c); }
}
function clipTick(t) {
  if (curApp !== 'loop') { clipRaf = 0; return; }
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
    if (p >= 1 && !k.done) { k.done = true; APPS.loop.lp.scrollBy({ top: APPS.loop.lp.clientHeight, behavior: 'smooth' }); }
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
  id: 'loop', name: 'Loop', tag: 'Autoplay · vertical swipe', c: '#2b1a3a',
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
          if (curApp === 'loop') { sfx.tick(); haptic(); }
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
  open() { if ((!sx || sx.done) && scratchFree()) setTimeout(newScratch, 80); },
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

// ---------- Streak: daily login, and a pulse that dies in 45 seconds ----------
const LOGIN_REW = [10, 20, 30, 50, 80, 120, 300];
const PULSE_MS = 45000, PULSE_OPEN = 30000;
const loginReady = () => S.login.claimed !== TODAY;
const pulseLeft = () => S.pulse.until - T();
function tickPulse() {
  if (S.pulse.until && pulseLeft() <= 0) {
    S.pulse.dead = S.pulse.n; S.pulse.n = 0; S.pulse.until = 0; S.pulse.restoreUntil = T() + 10000;
    sfx.lose(); haptic(true);
    notify('streak', `Your pulse died at ×${S.pulse.dead}. Restore it in 10 s?`);
  } else if (S.pulse.until && pulseLeft() < 12000) alertOnce('pulse', 'streak', `Your pulse dies in ${Math.ceil(pulseLeft() / 1000)}s`, 20000);
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
  badge: () => (loginReady() ? 1 : 0) + (S.pulse.restoreUntil ? 1 : 0) + (!S.pulse.until || pulseLeft() <= PULSE_OPEN ? 1 : 0),
  ping: () => (loginReady() ? `Day ${S.login.day} reward is waiting` : !S.pulse.until ? 'Start a pulse. Keep it alive.' : `Keep your ${S.streak}-day streak going`),
  build(b) {
    b.innerHTML = `<div class="pad"><div class="card"><div class="st-hero"><span class="flame">${IF('flame')}</span><div><b><span id="st-n"></span>-day streak</b><small id="st-frz"></small></div></div>
      <div class="cal" id="st-cal"></div><button class="pbtn gold" id="st-claim"></button></div>
      <div class="card pulse"><h3 style="align-self:flex-start;margin:0">Pulse</h3><div class="pl-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" class="trk" pathLength="100"/><circle cx="18" cy="18" r="15.5" class="ok" pathLength="100"/><circle cx="18" cy="18" r="15.5" class="prg" pathLength="100" id="pl-prg"/></svg><div class="pl-in"><b id="pl-t"></b><small id="pl-n"></small></div></div>
      <button class="pbtn" id="pl-btn"></button><p class="pl-msg" id="pl-msg"></p></div>
      <p class="fine">A pulse lasts 45 s. Feed it in the last 30 s to keep it alive. Miss it and it’s gone.</p></div>`;
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
    $('#pl-t').textContent = S.pulse.until ? cd(left) : S.pulse.restoreUntil ? cd(S.pulse.restoreUntil - T()) : '0:45';
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
const QDEF = [
  ['taps', 'Tap {n} times', 60, 250], ['cleared', 'Read {n} messages', 8, 30], ['cards', 'Reveal {n} cards', 25, 100],
  ['swipes', 'Swipe {n} cards', 8, 30], ['clips', 'Watch {n} clips', 4, 15], ['boxes', 'Open {n} boxes', 1, 4],
  ['spins', 'Pull the lever {n} times', 3, 8], ['scratches', 'Scratch {n} cards', 1, 3], ['rings', 'Catch {n} rings', 10, 35],
  ['holds', 'Hold {n} times', 4, 15], ['pulses', 'Feed your pulse {n} times', 2, 5], ['pets', 'Tickle Blob {n} times', 5, 20],
];
function mkQuest(rapid) {
  const [k, t, lo, hi] = pick(QDEF), n = rapid ? Math.max(2, Math.round(lo * .9)) : ri(lo, hi);
  const endow = rapid ? 0 : Math.max(1, Math.ceil(n * .12)); // "you've already started"
  return { k, text: t.replace('{n}', n), n, base: (S[k] || 0) - endow, reward: rapid ? n * 3 + 40 : n * 2 + 30, claimed: false };
}
const qProg = q => clamp((S[q.k] || 0) - q.base, 0, q.n);
const qDone = q => qProg(q) >= q.n;
function newQuests() { const used = new Set(); S.quests = []; while (S.quests.length < 3) { const q = mkQuest(); if (!used.has(q.k)) { used.add(q.k); S.quests.push(q); } } }
function newRapid() { S.rapid = { q: mkQuest(true), until: T() + 90000 }; }
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
  badge: () => [...S.quests, S.rapid.q].filter(q => qDone(q) && !q.claimed).length + (S.chest >= 5 ? 1 : 0),
  ping: () => `Rapid quest: ${S.rapid.q.text}. ${cd(S.rapid.until - T())} left.`,
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
      '<p class="fine">Finish all three and three more appear. The rapid quest changes every 90 s.</p>';
  },
  tick() { this.render(); },
});

// ---------- Rank: leagues with a three-minute week ----------
const LEAGUES = [['Bronze', '#c77b3a'], ['Silver', '#98a2b3'], ['Gold', '#ffc21a'], ['Ruby', '#ff2e4d'], ['Emerald', '#12c48b'], ['Diamond', '#3bb6ff'], ['Obsidian', '#3a2a4a']];
const LEAGUE_MS = 180000;
function newLeague(tier) {
  S.league = { tier, endsAt: T() + LEAGUE_MS, me: 0, rank: 30, passed: 0, rivals: Array.from({ length: 29 }, () => ({ pts: ri(0, 30), rate: rnd(.4, 3 + tier * 1.6), w: ri(40, 85) })) };
}
const myRank = () => 1 + S.league.rivals.filter(r => r.pts > S.league.me).length;
function tickRank() {
  const L = S.league;
  L.rivals.forEach(r => { r.pts += r.rate * rnd(.2, 1.8); });
  const rk = myRank();
  if (rk > L.rank) { L.passed += rk - L.rank; if (S.onboarded) alertOnce('passed', 'rank', `Someone passed you. You’re #${rk}.`, 12000); }
  else if (rk < L.rank && curApp === 'rank') { sfx.fresh(); toast(`You passed ${L.rank - rk} ${L.rank - rk === 1 ? 'person' : 'people'}`); }
  L.rank = rk;
  if (T() >= L.endsAt) {
    const name = LEAGUES[L.tier][0];
    if (rk <= 5 && L.tier < LEAGUES.length - 1) { S.promos++; unlock('promo'); confetti(150); notify('rank', `Promoted to ${LEAGUES[L.tier + 1][0]} League!`); newLeague(L.tier + 1); }
    else if (rk >= 26 && L.tier > 0) { sfx.lose(); notify('rank', `Demoted to ${LEAGUES[L.tier - 1][0]}. Earn it back.`); newLeague(L.tier - 1); }
    else { if (S.onboarded) notify('rank', `You finished #${rk} in ${name}. A new week started.`); newLeague(L.tier); }
  } else if (T() > L.endsAt - 20000 && rk > 5 && S.onboarded) alertOnce('rankend', 'rank', `League ends in ${cd(L.endsAt - T())}. You’re #${rk}. Top 5 move up.`, 30000);
}
const gemSVG = c => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12l3.5 5.5L12 20.5 2.5 9z" fill="${c}"/><path d="M2.5 9h19M9 3.5 12 9l3-5.5M12 20.5 8.5 9M12 20.5 15.5 9" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1.1"/></svg>`;
def({
  id: 'rank', name: 'Rank', tag: 'Leaderboards · social comparison', c: '#2a6bff',
  badge: () => Math.min(9, S.league.passed),
  ping: () => `You’re #${myRank()} in ${LEAGUES[S.league.tier][0]} League`,
  build(b) {
    b.innerHTML = '<div class="pad"><div class="card rk-head" id="rk-h"></div><div class="rk-list" id="rk-l"></div><p class="fine">Top 5 move up. Bottom 5 move down. A week lasts three minutes.</p></div>';
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

// ---------- Blob: a creature that needs you ----------
const MOUTH = { happy: 'M84 118 Q100 136 116 118', meh: 'M86 124 L114 124', sad: 'M84 132 Q100 116 116 132' };
const MOODC = { happy: '#ff9ec8', meh: '#c9a7ff', sad: '#a9b8c9' };
const petMood = () => { const p = S.pet, avg = (p.food + p.fun + p.love) / 3; return avg > 62 ? 'happy' : avg > 32 ? 'meh' : 'sad'; };
function tickPet() {
  const p = S.pet;
  p.food = Math.max(0, p.food - .8); p.fun = Math.max(0, p.fun - 1.1); p.love = Math.max(0, p.love - .6);
  if (!S.onboarded) return;
  if (p.food < 25) alertOnce('pfood', 'pet', 'Blob is hungry', 25000);
  else if (p.fun < 25) alertOnce('pfun', 'pet', 'Blob is bored. Come play.', 25000);
  else if (p.love < 25) alertOnce('plove', 'pet', 'Blob misses you', 25000);
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

// ---------- Shop: flash sales, fake scarcity, fake savings ----------
const WARES = [
  { n: '2× hits for 60 s', p: 150, g: 'tap', fx: () => { S.boostUntil = Math.max(T(), S.boostUntil) + 60000; } },
  { n: 'Streak freeze', p: 120, g: 'streak', fx: () => { S.freezes++; } },
  { n: 'Refill all spins', p: 80, g: 'slots', fx: () => { S.energy = Math.max(S.energy, MAXE); } },
  { n: 'Mystery box', p: 90, g: 'loot', fx: () => { S.loot.extra++; } },
  { n: '3 super-likes', p: 60, g: 'swipe', fx: () => { S.supers += 3; } },
  { n: 'Snack pack for Blob', p: 40, g: 'pet', fx: () => { S.pet.food = 100; } },
  { n: '2 scratch cards', p: 50, g: 'scratch', fx: () => { S.scratchExtra += 2; } },
  { n: 'Auto-tapper +1', p: 400, g: 'tap', fx: () => { S.tap.A++; } },
];
let deals = [], dealN = 0, freshDeals = 0;
function mkDeal() {
  const w = pick(WARES), off = pick([30, 40, 50, 60, 70, 80]), old = Math.round(w.p * 1.8), price = Math.max(5, Math.round(old * (1 - off / 100))), life = ri(25, 60) * 1000;
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
  badge: () => Math.min(9, freshDeals),
  ping: () => { const d = pick(deals); return d ? `${d.off}% off: ${d.w.n}. Only ${d.stock} left.` : null; },
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
      $('#sh-list').innerHTML = deals.map(d => `<div class="deal${d.stock ? '' : ' sold'}${d.fresh ? ' fresh' : ''}" data-id="${d.id}">${nIcon(d.w.g)}<div class="dn"><b>${d.w.n}</b><small>${d.stock ? `Only ${d.stock} left` : 'Sold out'}</small><em>${I('eye')}<span class="vw">${d.viewers}</span> viewing</em></div><div class="dp"><span class="off">-${d.off}%</span><s>${fmt(d.old)}</s><button class="buy" data-d="${d.id}"${d.stock ? '' : ' disabled'}>${IF('bolt')}${fmt(d.price)}</button></div><i class="tb"></i></div>`).join('');
      deals.forEach(d => { d.fresh = false; });
    }
    deals.forEach(d => { const el = $(`.deal[data-id="${d.id}"]`); if (!el) return; $('.vw', el).textContent = d.viewers; $('.tb', el).style.width = clamp((d.ends - T()) / d.life, 0, 1) * 100 + '%'; });
  },
  tick() { this.render(); },
});

// ---------- Hold: press, fill, release in the zone ----------
let hold = null, goldHoldUntil = 0, nextGoldAt = T() + 25000, perfectRun = 0;
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
    goldHoldUntil = T() + 10000; nextGoldAt = T() + ri(25, 40) * 1000;
    if (S.onboarded) notify('hold', 'Golden hold: double rewards for 10 s');
  }
}
def({
  id: 'hold', name: 'Hold', tag: 'Progress bars · timing', c: '#00a8c0',
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
  if (!ar || ringCount >= 7) return;
  const taken = new Set($$('.rg', ar).map(r => r.dataset.cell));
  let cell; do cell = ri(0, 11); while (taken.has(String(cell)) && taken.size < 12);
  const col = cell % 3, row = Math.floor(cell / 3), d = rnd(1.6, 3.4);
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
  ringT = setTimeout(ringLoop, rnd(280, 700) * Math.min(1, paceK()));
}
def({
  id: 'rings', name: 'Rings', tag: 'Ephemeral · fear of missing out', c: '#ff3d6e',
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

// =====================================================================
// the money apps: every bet wins
// =====================================================================
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
  cancelAnimationFrame(rkt.raf); if (rkt.tone) rkt.tone.stop();
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
  const s = pick([10, 15, 20, 25, 30]), yes = rnd(.15, .85);
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
  if (m.done || T() > m.ends - 1500) { sfx.nope(); toast('Trading closed on this one'); return; }
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
    if (curApp !== 'trade' && S.onboarded) { S.trade.athNew++; alertOnce('ath', 'trade', `Your portfolio hit a new all-time high: ${fmt(v)}`, 20000); }
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
      <div class="coins" id="tr-coins"></div>${chipsHTML('tr-st', tStake)}
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
    $('#tr-coins').innerHTML = COINS.map(([k, cc]) => {
      const o = S.trade.c[k], hh = hist[k], c1 = (hh[hh.length - 1] / hh[0] - 1) * 100;
      return `<button class="coin-row${k === sel ? ' on' : ''}" data-k="${k}" style="--cc:${cc}"><span class="cb">${k.slice(0, 1)}</span><span><b>$${k}</b><small>${o.u ? `${fmt(Math.round(o.u * o.p))} held` : 'Not held'}</small></span>${sparkSVG(hh.slice(-40), 70, 30, cc)}<span class="px">${px(o.p)}<small>${c1 >= 0 ? '▲' : '▼'} ${Math.abs(c1).toFixed(1)}%</small></span></button>`;
    }).join('');
    $('#tr-buy').textContent = `Buy $${sel} · ${fmt(stakeVal(tStake))}`;
    $('#tr-sell').textContent = c.u ? `Sell $${sel} · ${fmt(Math.round(c.u * c.p))}` : `Sell $${sel}`;
    $('#tr-sell').classList.toggle('off', !c.u);
  },
  key(e) { if (e.type !== 'keydown') return; if (e.key === ' ') { buyCoin(); return true; } if (e.key === 'Enter') { sellCoin(); return true; } },
});

// ---------- You: screen time, achievements, settings ----------
const STATS = [
  ['screen time today', () => dur(S.today.ms)], ['unlocks', () => fmt(S.pickups)],
  ['notifications', () => fmt(S.notifs)], ['hits today', () => fmt(S.today.hits)],
  ['hits all time', () => fmt(S.total)], ['best combo', () => `×${Math.min(10, 1 + Math.floor(S.bestCombo / 6))} (${S.bestCombo})`],
  ['taps', () => fmt(S.taps)], ['cards revealed', () => fmt(S.cards)],
  ['messages read', () => fmt(S.cleared)], ['swipes', () => fmt(S.swipes)],
  ['clips watched', () => fmt(S.clips)], ['lever pulls', () => fmt(S.spins)],
  ['boxes opened', () => fmt(S.boxes)], ['rings caught', () => fmt(S.rings)],
  ['rocket launches', () => fmt(S.launches)], ['coin flips', () => fmt(S.flips)],
  ['predictions won', () => fmt(S.predWins)], ['trades', () => fmt(S.trades)],
  ['rings missed', () => fmt(S.missed)], ['scrolled', () => { const m = S.scrollPx * .00016; return m < 1000 ? `${m.toFixed(m < 10 ? 1 : 0)} m` : `${(m / 1000).toFixed(2)} km`; }],
];
const statsHTML = () => STATS.map(([l, f]) => `<div class="stat"><b>${f()}</b><span>${l}</span></div>`).join('');
def({
  id: 'you', name: 'You', tag: 'Screen time · achievements', c: '#6b5b7b',
  badge: () => Math.max(0, Object.keys(S.ach).length - S.achSeen),
  ping: () => `You’ve spent ${dur(S.today.ms)} on stim today`,
  build(b) {
    b.innerHTML = `<div class="pad"><div class="stats" id="me-stats"></div><div class="sec"><span>Achievements</span><span id="me-an"></span></div><div class="achs" id="me-achs"></div>
      <div class="sec"><span>Settings</span></div><div class="settings">
      <label class="srow"><span class="rt"><b>Sound</b><small>Pops, dings and clicks</small></span><input type="checkbox" class="sw" id="set-sound"></label>
      <label class="srow"><span class="rt"><b>Haptics</b><small>Vibration on Android. Taps on iPhone with iOS 18 or later.</small></span><input type="checkbox" class="sw" id="set-haptics"></label>
      <div class="srow"><span class="rt"><b>Pace</b><small>How often something happens</small></span><span class="seg" id="set-pace"><button data-v="chill">Chill</button><button data-v="normal">Fast</button><button data-v="chaos">Chaos</button></span></div>
      <label class="srow"><span class="rt"><b>Break reminders</b><small>Every 8 minutes</small></span><input type="checkbox" class="sw" id="set-nudges"></label>
      <button class="danger" id="set-reset">Reset progress</button></div>
      <p class="fine">stim has no content, no accounts and no network. Every like, rival and message is made up on this device. Progress stays in this browser.</p></div>`;
    track($('.pad', b));
    const sw = (id, k) => { const i = $(id, b); i.checked = !!S.settings[k]; i.onchange = () => { S.settings[k] = i.checked; save(); if (i.checked) (k === 'sound' ? sfx.pop(5) : haptic()); }; };
    sw('#set-sound', 'sound'); sw('#set-haptics', 'haptics'); sw('#set-nudges', 'nudges');
    const pace = $('#set-pace', b), syncPace = () => $$('button', pace).forEach(x => x.classList.toggle('on', x.dataset.v === S.settings.pace));
    syncPace();
    pace.onclick = e => { const x = e.target.closest('button'); if (!x) return; S.settings.pace = x.dataset.v; syncPace(); save(); if (S.onboarded) startSchedule(); sfx.click(); };
    let armedAt = 0;
    $('#set-reset', b).onclick = e => {
      const x = e.currentTarget;
      if (now() - armedAt < 3000) { store.clear(); location.reload(); return; }
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
  const q = S.rapid.q;
  $('#w-q').textContent = q.claimed ? 'Rapid quest claimed' : q.text; $('#w-qt').textContent = cd(S.rapid.until - T()); $('#w-qb').style.width = (qProg(q) / q.n) * 100 + '%';
}

// ---------- OS interruptions: rate prompt, break nudge, low battery ----------
let nextRate = 150000, nextNudge = 8 * 60000, lowWarned = false;
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
  schedT = setTimeout(() => { if (!document.hidden) ping(); startSchedule(); }, Math.max(450, -Math.log(1 - R()) * mean));
}
function ping() {
  const ids = Object.keys(APPS).filter(id => APPS[id].ping && id !== curApp);
  for (let i = 0; i < 5; i++) { const id = pick(ids), t = APPS[id].ping(); if (t) { notify(id, t); return; } }
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
  if (S.tap.A && S.onboarded) {
    const g = earn(S.tap.A, null, null, { raw: true });
    if (curApp === 'tap') { const [x, y] = centerOf($('#tp-btn')); floatText(x + rnd(-60, 60), y - 100, `+${fmt(g)}`); }
  }
  tickPet(); tickPulse(); regen(); tickRank(); tickQuests(); tickShop(); tickHold();
  if (S.supers < 3 && tickN % 40 === 0) S.supers++;
  if (curApp !== 'rings' && S.onboarded && chance(.35)) S.ringsLost++;
  if (curApp !== 'swipe' && chance(.12)) S.likesYou++;
  if (curApp && APPS[curApp].tick) APPS[curApp].tick();
  renderWidgets(); renderBoost(); refreshBadges();
  if (tickN % 5 === 0) save();
  if (tickN % 10 === 0) { refreshTimes(); queueCheck(); }
  if (!lockOn && S.onboarded && !$('.modal') && !$('.grass')) {
    if (sessionMs >= nextRate) { nextRate = sessionMs + 5 * 60000; ratePrompt(); }
    else if (S.settings.nudges && sessionMs >= nextNudge) { nextNudge = sessionMs + 8 * 60000; nudge(); }
  }
}, 1000);
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = T(); save(); return; }
  if (hiddenAt && T() - hiddenAt > 10000 && S.onboarded) {
    const away = (T() - hiddenAt) / 1000;
    closeApp(true); lock();
    for (let i = 0, n = Math.min(12, Math.round(away / 5)); i < n; i++) ping();
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
    if (modalEl) modalEl.remove(); else if (sc) sc.click(); else if (ncOn) closeNC(); else closeApp();
    return;
  }
  if (modalEl) return;
  if (k === 'n') { ping(); return; }
  if (k === 'L') { closeApp(true); lock(); return; }
  if (curApp && APPS[curApp].key && (!e.repeat || APPS[curApp].id === 'tap') && APPS[curApp].key(e)) e.preventDefault();
}
addEventListener('keydown', onKey);
addEventListener('keyup', onKey);

// ---------- boot ----------
$('#grid').innerHTML = GRID.map(id => iconHTML(APPS[id])).join('');
$('#dock').innerHTML = DOCK.map(id => iconHTML(APPS[id])).join('');
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

if (!Array.isArray(S.quests)) newQuests();
if (!S.rapid || !S.rapid.q) newRapid();
if (!S.league || !S.league.rivals) newLeague(0);
tickShop();
layout();
addEventListener('resize', layout);
for (let i = 0; i < 7; i++) addMail();
mail.forEach((m, i) => { m.ts = T() - i * ri(20, 200) * 1000; });
shownHits = S.hits; $('#hits').textContent = fmt(S.hits);
renderLevel(); renderCombo(); renderWidgets(); renderBoost(); clock();
lock();
if (S.onboarded) { for (let i = 0; i < 5; i++) ping(); startSchedule(); }
refreshBadges();
mailLoop();
queueCheck();
if (frozeUsed) setTimeout(() => notify('streak', `A streak freeze saved your ${S.streak - 1}-day streak`), 800);
})();
