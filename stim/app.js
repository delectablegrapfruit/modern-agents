/* stim: no content, only the hooks. */
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
const html = s => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstElementChild; };
const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const nf = new Intl.NumberFormat('en');
const cf = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const fmt = n => (n < 10000 ? nf.format(n) : cf.format(n));
const ago = ts => {
  const s = (Date.now() - ts) / 1000;
  if (s < 50) return 'now';
  if (s < 3600) return Math.round(s / 60) + 'm';
  if (s < 86400) return Math.round(s / 3600) + 'h';
  if (s < 604800) return Math.round(s / 86400) + 'd';
  return Math.round(s / 604800) + 'w';
};
const agoLong = ts => {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  const [v, u] = s < 3600 ? [s / 60, 'minute'] : s < 86400 ? [s / 3600, 'hour'] : [s / 86400, 'day'];
  const n = Math.round(v);
  return `${n} ${u}${n === 1 ? '' : 's'} ago`;
};
const dur = ms => {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
};
const bars = (...ws) => ws.map(w => `<i style="width:${w}%"></i>`).join('');
const pickW = list => { let r = R() * list.reduce((s, x) => s + x[1], 0); for (const [k, w] of list) if ((r -= w) < 0) return k; return list[0][0]; };
const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const CONF = ['#ff2d55', '#ff3b30', '#ffc300', '#0a84ff', '#30d158', '#d62dff', '#ff8a00'];

// ---------- icons ----------
const P = {
  home: '<path class="fillable" d="M3.5 10.2 12 3.3l8.5 6.9v9.3c0 .8-.7 1.5-1.5 1.5h-4.2v-6.3H9.2V21H5c-.8 0-1.5-.7-1.5-1.5z"/>',
  reels: '<rect class="fillable" x="3" y="3" width="18" height="18" rx="5.5"/><path class="cut" d="M10 8.6v6.8l5.6-3.4z" fill="currentColor"/>',
  gift: '<path class="fillable" d="M4 11h16v8.5c0 .8-.7 1.5-1.5 1.5h-13c-.8 0-1.5-.7-1.5-1.5zM3 7.5h18V11H3z"/><path class="cut" d="M12 7.5V21"/><path d="M12 7.5C11 4 9.5 3 8.2 3a2.2 2.2 0 0 0 0 4.5zm0 0C13 4 14.5 3 15.8 3a2.2 2.2 0 0 1 0 4.5z"/>',
  bell: '<path class="fillable" d="M6 9a6 6 0 1 1 12 0c0 6.2 2.6 8 2.6 8H3.4S6 15.2 6 9z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  heart: '<path d="M12 20.3S3.3 15.2 3.3 8.9A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.7 2.3c0 6.3-8.7 11.4-8.7 11.4z"/>',
  comment: '<path d="M16.1 20A9 9 0 1 1 20 16.1l1.8 5.7z"/>',
  send: '<path d="m21.5 2.5-7 19-4-8.5-8.5-4z"/><path d="M21.5 2.5 10.5 13"/>',
  save: '<path class="fillable" d="M18.5 21 12 16.3 5.5 21V4.5c0-.8.7-1.5 1.5-1.5h10c.8 0 1.5.7 1.5 1.5z"/>',
  more: '<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M5 12.5 10 17.5 19.5 7"/>',
  up: '<path d="M12 20V5M5.5 11.5 12 5l6.5 6.5"/>',
  down: '<path d="M12 4v15M5.5 12.5 12 19l6.5-6.5"/>',
  chevL: '<path d="M15 5 8 12l7 7"/>',
  chevR: '<path d="m9 5 7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  userPlus: '<circle cx="9" cy="8" r="4"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  ring: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  gem: '<path d="M6 3.5h12l3.5 5.5L12 20.5 2.5 9z"/><path d="M2.5 9h19"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/>',
  glass: '<path d="M6 3h12M6 21h12M7 3v2a5 5 0 0 0 10 0V3M7 21v-2a5 5 0 0 1 10 0v2"/>',
  leaf: '<path d="M5 19C5 10 11 5 20 5c0 9-5 15-14 15zM5 19l8-8"/>',
  level: '<path d="M6 11.5 12 5.5l6 6M6 18.5l6-6 6 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  reelsO: '<rect x="3" y="3" width="18" height="18" rx="5.5"/><path d="M10 8.6v6.8l5.6-3.4z"/>',
};
const FP = {
  heart: P.heart,
  bolt: '<path d="M13.5 2 4 13.5h7L10 22l10-12h-7z"/>',
  flame: '<path d="M12 22c4.4 0 7.5-3 7.5-7.2 0-3.7-2.3-6.2-4.2-8.6-.4 2-1.5 3.3-2.8 3.8.3-3.4-1.2-6.4-3.8-8 .1 4.1-2.2 6.4-3.9 8.8C3.7 12.4 4.5 16 6 18.2 7.4 20.6 9.6 22 12 22z"/>',
  play: '<path d="M7 4.5v15L20 12z"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 6.2 2.6 8 2.6 8H3.4S6 15.2 6 9z"/><path d="M9.8 19.2h4.4a2.2 2.2 0 0 1-4.4 0z"/>',
  star: '<path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z"/>',
};
const I = name => P[name] ? `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${P[name]}</svg>` : IF(name);
const IF = (name, cls = '') => `<svg class="fill ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${FP[name] || ''}</svg>`;

// ---------- state ----------
const KEY = 'stim.v1';
const DEF = {
  pts: 0, likes: 0, likesIn: 0, refreshes: 0, seen: 0, cleared: 0, scrollPx: 0, spins: 0, wins: 0, stories: 0,
  reels: 0, sent: 0, bestCombo: 0, timeMs: 0, followers: 0, following: 0,
  streak: 0, lastDay: '', days: [], today: { day: '', ms: 0 },
  energy: 5, energyAt: 0, earn: 0, ach: {}, onboarded: false,
  settings: { sound: true, haptics: true, nudges: true, pace: 'normal' },
};
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
  clear() { try { localStorage.removeItem(KEY); } catch {} },
};
const saved = store.get();
const S = Object.assign(JSON.parse(JSON.stringify(DEF)), saved);
S.settings = Object.assign({}, DEF.settings, saved.settings || {});
S.ach = Object.assign({}, saved.ach || {});
const save = () => store.set(S);

const TODAY = dayKey(new Date());
if (S.lastDay !== TODAY) {
  S.streak = S.lastDay === dayKey(new Date(Date.now() - 864e5)) ? S.streak + 1 : 1;
  S.lastDay = TODAY;
  S.days = [...S.days.filter(d => d !== TODAY), TODAY].slice(-14);
}
if (!S.today || S.today.day !== TODAY) S.today = { day: TODAY, ms: 0 };
if (!S.energyAt) S.energyAt = Date.now();

let sessionMs = 0, sessionSeen = 0;
let cur = 'home';

// ---------- sound ----------
let AC = null, master = null, noiseBuf = null;
function actx() {
  if (!S.settings.sound) return null;
  if (!AC) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { AC = new C(); } catch { return null; }
    master = AC.createGain(); master.gain.value = .55; master.connect(AC.destination);
  }
  if (AC.state === 'suspended') AC.resume().catch(() => {});
  return AC;
}
function tone(f, d = .1, type = 'sine', v = .2, at = 0, f2 = 0) {
  const a = actx(); if (!a || a.state !== 'running') return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + d);
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
const semi = n => Math.pow(2, n / 12);
const sfx = {
  pop: (k = 0) => { const f = 587 * semi(k); tone(f, .1, 'sine', .22, 0, f * 1.6); tone(f * 2, .05, 'triangle', .05); },
  unpop: () => tone(520, .09, 'sine', .12, 0, 300),
  tick: () => tone(2400, .012, 'square', .03),
  tap: () => tone(1500, .02, 'triangle', .05),
  ding: () => { tone(1568, .45, 'sine', .11); tone(2093, .6, 'sine', .08, .085); },
  whoosh: () => noise(.28, .1, 0, 500, 3500),
  fresh: () => { tone(880, .09, 'sine', .13); tone(1319, .16, 'sine', .13, .07); },
  big: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, .14, 'triangle', .11, i * .06)),
  nope: () => tone(300, .18, 'triangle', .1, 0, 220),
  clear: k => { const f = 880 * semi(Math.min(k, 24)); tone(f, .07, 'sine', .14, 0, f * 1.25); },
  send: () => { tone(620, .09, 'sine', .12, 0, 1240); noise(.1, .04, 0, 2000, 6000); },
  recv: () => { tone(1175, .08, 'sine', .1); tone(1568, .14, 'sine', .1, .07); },
  coin: () => { tone(988, .07, 'square', .05); tone(1319, .22, 'square', .05, .07); },
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .2, 'triangle', .12, i * .07)),
  level: () => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .22, 'triangle', .12, i * .08)); noise(.6, .04, .4, 3000, 9000); },
  thunk: () => { tone(160, .09, 'sine', .22, 0, 90); noise(.05, .06, 0, 1500, 900); },
  lever: () => noise(.18, .08, 0, 300, 1200),
  riser: d => tone(300, d, 'sawtooth', .02, 0, 1200),
};
const unlockAudio = () => { if (!AC || AC.state !== 'running') actx(); };
['pointerdown', 'touchend', 'keydown'].forEach(ev => addEventListener(ev, unlockAudio, { passive: true, capture: true }));

// ---------- haptics ----------
// Android vibrates. Safari 18+ on iPhone gives a tick when a switch control is toggled, so click a hidden one.
const canVibrate = typeof navigator.vibrate === 'function' && !/iPhone|iPad|Macintosh/.test(navigator.userAgent);
function haptic(strong) {
  if (!S.settings.haptics) return;
  try {
    if (canVibrate) { navigator.vibrate(strong ? [14, 30, 14] : 9); return; }
    const l = document.createElement('label'), c = document.createElement('input');
    l.setAttribute('aria-hidden', 'true'); l.style.display = 'none';
    c.type = 'checkbox'; c.setAttribute('switch', '');
    l.append(c); document.head.append(l); l.click(); l.remove();
  } catch {}
}

// ---------- layout: full screen on a phone, a phone on everything else ----------
const body = document.body, stage = $('#stage'), appEl = $('#app'), screenEl = $('#screen');
let scale = 1, framed = false;
const isPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
function layout() {
  framed = !isPhone() && innerWidth >= 460 && innerHeight >= 420;
  body.classList.toggle('framed', framed);
  scale = framed ? Math.min(1, (innerHeight - 36) / 876, (innerWidth - 24) / 417) : 1;
  stage.style.setProperty('--scale', scale.toFixed(4));
  sizeFx();
}
const toLocal = (cx, cy) => { const r = appEl.getBoundingClientRect(); return [(cx - r.left) / scale, (cy - r.top) / scale]; };
const centerOf = el => { const r = el.getBoundingClientRect(); return toLocal(r.left + r.width / 2, r.top + r.height / 2); };

// ---------- particles ----------
const fx = $('#fx'), g2 = fx.getContext('2d');
let parts = [], fxRaf = 0, FW = 0, FH = 0;
function sizeFx() {
  FW = appEl.clientWidth; FH = appEl.clientHeight;
  const d = Math.min(2.5, devicePixelRatio || 1);
  fx.width = Math.round(FW * d); fx.height = Math.round(FH * d);
  g2.setTransform(d, 0, 0, d, 0, 0);
}
const runFx = () => { if (!fxRaf) fxRaf = requestAnimationFrame(stepFx); };
function burst(x, y, o = {}) {
  if (reduced) return;
  const cols = o.colors || ['#ff2d55', '#ff5c7f', '#ff9ab0', '#ffc300'];
  for (let i = 0, n = o.n || 14; i < n; i++) {
    const a = R() * Math.PI * 2, s = rnd(1.6, 4.6);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.2, g: .12, life: 0, max: ri(26, 44), sz: rnd(6, 11), c: pick(cols), k: chance(.6) ? 'heart' : 'dot', r: rnd(-.5, .5), vr: rnd(-.12, .12) });
  }
  runFx();
}
function confetti(n = 140) {
  if (reduced) return;
  for (let i = 0; i < n; i++) parts.push({ x: rnd(0, FW), y: rnd(-60, -8), vx: rnd(-1.6, 1.6), vy: rnd(1.5, 5.5), g: .07, life: 0, max: ri(100, 170), sz: rnd(6, 10), c: pick(CONF), k: 'rect', r: rnd(0, 6), vr: rnd(-.25, .25) });
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
    else {
      const s = p.sz / 8; g2.scale(s, s); g2.beginPath();
      g2.moveTo(0, 3.5); g2.bezierCurveTo(-6, -.5, -3, -6, 0, -2.5); g2.bezierCurveTo(3, -6, 6, -.5, 0, 3.5); g2.fill();
    }
    g2.restore();
    return true;
  });
  g2.globalAlpha = 1;
  fxRaf = parts.length ? requestAnimationFrame(stepFx) : 0;
  if (!fxRaf) g2.clearRect(0, 0, FW, FH);
}

// ---------- toast, points ----------
let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800);
}
function floatPts(x, y, n, extra) {
  if (x == null) return;
  const f = html(`<div class="fdp">+${n}${extra ? `<small>${extra}</small>` : ''}</div>`);
  f.style.left = x + 'px'; f.style.top = y + 'px';
  appEl.append(f); f.addEventListener('animationend', () => f.remove());
}
let shownPts = S.pts, ptsRaf = 0;
function renderPts() {
  cancelAnimationFrame(ptsRaf);
  const from = shownPts, to = S.pts, t0 = now();
  const step = t => {
    const k = Math.min(1, (t - t0) / 450);
    shownPts = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    $('#pts-n').textContent = nf.format(shownPts);
    if (k < 1) ptsRaf = requestAnimationFrame(step);
  };
  ptsRaf = requestAnimationFrame(step);
  restart($('#pts'), 'bump');
}

const TITLES = ['Glancer', 'Thumb Twitcher', 'Feed Goblin', 'Refresh Rat', 'Badge Moth', 'Doomscroll Adept', 'Algorithm’s Pet', 'Chronically Online', 'Touch Grass? Never', 'Ascended Screen Being'];
function lvl(p = S.pts) {
  let l = 1, base = 0, need = 60;
  while (p >= base + need) { base += need; l++; need = Math.round(60 * Math.pow(l, 1.45)); }
  const title = l <= TITLES.length ? TITLES[l - 1] : `${TITLES[TITLES.length - 1]} ${l - TITLES.length + 1}`;
  return { l, into: p - base, need, pct: (p - base) / need, title };
}
function award(n, x, y, extra) {
  if (!n) return;
  const before = lvl().l;
  S.pts += n;
  floatPts(x, y, n, extra);
  renderPts(); renderRing();
  const after = lvl();
  if (after.l > before) levelUp(after);
  queueCheck();
}
function renderRing() {
  $('#lvl-prg').style.strokeDashoffset = String(100 - lvl().pct * 100);
  if (cur === 'me') renderMe();
}
function levelUp(L) {
  sfx.level(); haptic(true); confetti(150);
  restart($('.tab.me'), 'lvlup');
  banner({ kind: 'award', icon: 'level', title: `Level ${L.l}`, text: L.title, onTap: () => go('me') });
}

// ---------- achievements ----------
const meters = () => S.scrollPx * 0.00016; // one CSS pixel on an iPhone is about 0.16 mm
const ACH = [
  { id: 'first-like', i: 'heart', n: 'First like', d: 'Like anything', t: () => S.likes >= 1 },
  { id: 'likes-100', i: 'heart', n: 'Heart machine', d: 'Like 100 times', t: () => S.likes >= 100 },
  { id: 'combo', i: 'bolt', n: 'Combo ×10', d: 'Like 10 times in quick succession', t: () => S.bestCombo >= 10 },
  { id: 'refresh-25', i: 'refresh', n: 'Slot puller', d: 'Pull to refresh 25 times', t: () => S.refreshes >= 25 },
  { id: 'seen-100', i: 'eye', n: 'Deep feed', d: 'See 100 cards', t: () => S.seen >= 100 },
  { id: 'seen-1000', i: 'eye', n: 'Bottomless', d: 'See 1,000 cards', t: () => S.seen >= 1000 },
  { id: 'scroll-100', i: 'down', n: 'Thumb marathon', d: 'Scroll 100 meters', t: () => meters() >= 100 },
  { id: 'notif-50', i: 'bell', n: 'Badge buster', d: 'Clear 50 notifications', t: () => S.cleared >= 50 },
  { id: 'zero', i: 'check', n: 'Inbox zero', d: 'Clear every notification' },
  { id: 'rare', i: 'star', n: 'Rare drop', d: 'Like a golden card' },
  { id: 'jackpot', i: 'gem', n: 'Jackpot', d: 'Hit three of a kind' },
  { id: 'reels-50', i: 'reelsO', n: 'Autopilot', d: 'Watch 50 autoplays', t: () => S.reels >= 50 },
  { id: 'caught', i: 'ring', n: 'Caught up', d: 'Watch every story' },
  { id: 'streak-3', i: 'flame', n: 'On fire', d: 'Keep a 3-day streak', t: () => S.streak >= 3 },
  { id: 'night', i: 'moon', n: 'Night owl', d: 'Scroll between midnight and 4 am', t: () => new Date().getHours() < 4 },
  { id: 'level-5', i: 'level', n: 'Chronically online', d: 'Reach level 5', t: () => lvl().l >= 5 },
  { id: 'session-30', i: 'glass', n: 'Just one more', d: 'Stay 30 minutes in one sitting', t: () => sessionMs >= 30 * 60e3 },
  { id: 'grass', i: 'leaf', n: 'Touched grass', d: 'Take a break, then come back' },
];
let chkT = 0;
function queueCheck() {
  clearTimeout(chkT);
  chkT = setTimeout(() => ACH.forEach(a => { if (a.t && !S.ach[a.id] && a.t()) unlock(a.id); }), 400);
}
function unlock(id) {
  if (S.ach[id]) return;
  const a = ACH.find(x => x.id === id); if (!a) return;
  S.ach[id] = Date.now(); save();
  banner({ kind: 'award', icon: a.i, title: 'Achievement unlocked', text: a.n, onTap: () => go('me') });
  confetti(80); renderAchs(id); award(25);
}

// ---------- gestures ----------
let noClickUntil = 0;
const suppressClick = () => { noClickUntil = now() + 400; };
document.addEventListener('click', e => {
  if (now() < noClickUntil && appEl.contains(e.target)) { e.stopPropagation(); e.preventDefault(); }
}, true);
document.addEventListener('gesturestart', e => e.preventDefault());

function drag(elm, o) {
  elm.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const id = e.pointerId, sx = e.clientX, sy = e.clientY;
    let on = false, dx = 0, dy = 0;
    const mv = ev => {
      if (ev.pointerId !== id) return;
      dx = (ev.clientX - sx) / scale; dy = (ev.clientY - sy) / scale;
      if (!on) {
        if (Math.hypot(dx, dy) < 7) return;
        if ((o.axis === 'y') !== (Math.abs(dy) > Math.abs(dx))) { done(); return; }
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

// ---------- pull to refresh ----------
function PTR(sc, onRefresh) {
  const ind = $('.ptr-ind', sc), bodyEl = $('.ptr-body', sc), ticks = $$('.spinner i', ind);
  const TH = 66, MAX = 150;
  let pull = 0, armed = false, busy = false, tracking = false, decided = false, sy = 0, sx = 0;
  let wheelAcc = 0, wheelT = 0, lastScroll = 0;
  const damp = d => MAX * (1 - Math.exp(-d / 190));
  function set(p, anim) {
    pull = p;
    bodyEl.style.transition = anim ? 'transform .45s cubic-bezier(.2,.9,.25,1)' : 'none';
    bodyEl.style.transform = p > 0 ? `translate3d(0,${p}px,0)` : '';
    ind.style.transition = anim ? 'opacity .3s' : 'none';
    ind.style.opacity = p > 6 ? Math.min(1, p / 40) : 0;
    ind.style.transform = `translateY(${(p - 64) / 2}px)`;
    if (busy) return;
    const k = Math.min(8, Math.floor((p / TH) * 8 + .2));
    ticks.forEach((t, i) => { t.style.opacity = i < k ? .9 : 0; });
    if (p >= TH && !armed) { armed = true; haptic(); sfx.tick(); }
    else if (p < TH - 8 && armed) armed = false;
  }
  async function release() {
    if (busy) return;
    if (!armed) { set(0, true); return; }
    busy = true; ind.classList.add('spin'); set(56, true); sfx.whoosh();
    try { await onRefresh(); } finally {
      ind.classList.remove('spin'); busy = false; armed = false; set(0, true);
    }
  }
  sc.addEventListener('touchstart', e => {
    if (busy || e.touches.length > 1) { tracking = false; return; }
    tracking = sc.scrollTop <= 0; decided = false;
    sy = e.touches[0].clientY; sx = e.touches[0].clientX;
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
    if (busy || sc.scrollTop > 0) return;
    if (e.deltaY >= 0 && pull <= 0) return;
    if (pull <= 0 && now() - lastScroll < 250) return; // momentum arriving at the top is not a pull
    e.preventDefault();
    wheelAcc = Math.max(0, wheelAcc - e.deltaY * (e.deltaMode === 1 ? 16 : 1));
    set(damp(wheelAcc * .7));
    clearTimeout(wheelT);
    wheelT = setTimeout(() => { wheelAcc = 0; release(); }, 170);
  }, { passive: false });

  return {
    trigger() {
      if (busy) return;
      sc.scrollTo({ top: 0 });
      set(TH, true);
      setTimeout(release, 260);
    },
  };
}

// ---------- banners (notification drops) ----------
const bq = []; let bOn = null;
function banner(b) { if (bq.length >= 3) bq.shift(); bq.push(b); if (!bOn) nextBanner(); }
function nextBanner() {
  const b = bq.shift();
  if (!b) { bOn = null; return; }
  const icon = b.kind === 'award'
    ? `<span class="appi">${I(b.icon || 'star')}</span>`
    : `<span class="appi">${IF('heart')}</span>${b.type ? tyBadge(b.type) : ''}`;
  const node = html(`<div class="banner ${b.kind || ''}" role="status"><div class="bi">${icon}</div><div class="bt"><div class="bh"><b>${b.title || 'stim'}</b><span>now</span></div><div class="bx">${b.text}</div></div></div>`);
  $('#banners').append(node);
  void node.offsetWidth; node.classList.add('in');
  if (b.kind === 'award') sfx.win(); else sfx.ding();
  haptic();
  let gone = false, timer = 0;
  const dismiss = () => {
    if (gone) return; gone = true; clearTimeout(timer);
    node.classList.remove('in'); node.classList.add('out');
    setTimeout(() => { node.remove(); bOn = null; nextBanner(); }, 320);
  };
  timer = setTimeout(dismiss, b.ms || 4000);
  node.addEventListener('click', () => { dismiss(); b.onTap && b.onTap(); });
  drag(node, {
    axis: 'y',
    onStart: () => clearTimeout(timer),
    onMove: (dx, dy) => { node.style.transition = 'none'; node.style.transform = `translateY(${dy < 0 ? dy : dy * .25}px)`; },
    onEnd: (dx, dy) => { node.style.transition = ''; node.style.transform = ''; if (dy < -24) dismiss(); else timer = setTimeout(dismiss, 2000); },
  });
  bOn = { node, dismiss };
}
let islandT = 0;
function islandPop(type) {
  if (!framed) return;
  const t = NT[type], is = $('#island');
  $('.ia', is).innerHTML = `<span style="color:${t.c}">${t.fill ? IF(t.icon) : I(t.icon)}</span>`;
  $('.ib', is).textContent = '+1';
  is.classList.add('pop');
  clearTimeout(islandT); islandT = setTimeout(() => is.classList.remove('pop'), 1600);
}

// ---------- sheets ----------
let sheet = null;
function openSheet(title, content, cls = '', onClose) {
  closeSheet(true);
  const scrim = html('<div class="scrim"></div>');
  const sh = html(`<div class="sheet ${cls}" role="dialog"${title ? ` aria-label="${title}"` : ''}><div class="grab"></div>${title ? `<h3>${title}</h3>` : ''}</div>`);
  sh.append(content);
  appEl.append(scrim, sh);
  void sh.offsetHeight; scrim.classList.add('show'); sh.classList.add('show');
  scrim.onclick = () => closeSheet();
  sheet = { scrim, sh, onClose };
  $$(':scope > .grab, :scope > h3', sh).forEach(h => drag(h, {
    axis: 'y',
    onMove: (dx, dy) => { sh.style.transition = 'none'; sh.style.transform = `translateY(${Math.max(0, dy)}px)`; },
    onEnd: (dx, dy) => { sh.style.transition = ''; if (dy > 90) closeSheet(); else sh.style.transform = ''; },
  }));
  sfx.tap();
}
function closeSheet(instant) {
  if (!sheet) return;
  const { scrim, sh, onClose } = sheet; sheet = null;
  if (instant) { scrim.remove(); sh.remove(); }
  else {
    scrim.classList.remove('show'); sh.classList.remove('show'); sh.style.transform = '';
    setTimeout(() => { scrim.remove(); sh.remove(); }, 420);
  }
  onClose && onClose();
}

// ---------- likes, follows ----------
let combo = 0, lastLike = 0;
function doLike(obj, btn, countEl, onlyOn) {
  if (obj.liked && onlyOn) { sfx.pop(Math.min(combo, 12)); haptic(); return; }
  obj.liked = !obj.liked;
  btn.classList.toggle('on', obj.liked); btn.classList.toggle('off', !obj.liked);
  const svg = $('svg', btn); svg.style.animation = 'none'; void svg.offsetWidth; svg.style.animation = '';
  obj.likes += obj.liked ? 1 : -1;
  if (countEl) countEl.textContent = fmt(obj.likes);
  if (!obj.liked) { sfx.unpop(); return; }
  const t = now();
  combo = t - lastLike < 1500 ? combo + 1 : 0; lastLike = t;
  S.bestCombo = Math.max(S.bestCombo, combo + 1);
  S.likes++;
  sfx.pop(Math.min(combo, 14)); haptic();
  const [x, y] = centerOf(btn);
  burst(x, y, { n: 10 + Math.min(combo, 10) * 2 });
  if (!obj.paid) {
    obj.paid = true;
    award(obj.gold ? 40 : 2 + Math.min(combo, 8), x, y - 18, combo >= 2 ? `×${combo + 1}` : '');
    if (obj.gold) { confetti(160); sfx.win(); unlock('rare'); }
  }
  if (chance(.2)) setTimeout(() => pushNotif({ type: 'like' }), ri(2500, 9000));
  queueCheck();
}
function follow(btn, onLabel = 'Following', offLabel = 'Follow') {
  const on = !btn.classList.contains('on');
  btn.classList.toggle('on', on);
  btn.textContent = on ? onLabel : offLabel;
  S.following = Math.max(0, S.following + (on ? 1 : -1));
  if (!on) { sfx.unpop(); return; }
  sfx.pop(5); haptic();
  if (!btn._paid) { btn._paid = true; const [x, y] = centerOf(btn); award(2, x, y - 16); }
  if (chance(.35)) setTimeout(() => pushNotif({ type: 'follow' }), ri(3000, 10000));
}
function bigHeart(container, e) {
  const r = container.getBoundingClientRect();
  const x = e && e.clientX ? (e.clientX - r.left) / scale : r.width / scale / 2;
  const y = e && e.clientY ? (e.clientY - r.top) / scale : r.height / scale / 2;
  const h = html(`<div class="big-heart" style="left:${x}px;top:${y}px;--r:${ri(-18, 18)}deg">${IF('heart')}</div>`);
  container.append(h);
  h.addEventListener('animationend', () => h.remove());
}

// ---------- feed ----------
const feedSc = $('#feed-sc'), feed = $('#feed'), loader = $('#feed-loader');
let postN = 0;
function mkPost(o = {}) {
  const gold = !!o.gold, carousel = !gold && chance(.18), sq = chance(.35), h = ri(0, 359);
  const likes = gold ? ri(90000, 900000) : Math.round(Math.exp(rnd(2.5, 11.2)));
  const p = {
    id: ++postN, likes, comments: Math.round(likes * rnd(.003, .03)), liked: false, saved: false, paid: false, gold,
    ts: Date.now() - (o.fresh ? ri(5, 400) : ri(900, 2.5 * 86400)) * 1000, slides: carousel ? ri(2, 5) : 1, slide: 0, seenSlides: 1,
  };
  const slides = carousel
    ? `<div class="slides">${Array.from({ length: p.slides }, (_, i) => `<div class="slide" style="--th:${(h + i * 40) % 360}"></div>`).join('')}</div><span class="count">1/${p.slides}</span><button class="cbtn prev" aria-label="Previous">${I('chevL')}</button><button class="cbtn next" aria-label="Next">${I('chevR')}</button>`
    : '';
  const node = html(`<article class="post${gold ? ' gold' : ''}${o.fresh ? ' enter' : ''}">
    <div class="post-head"><span class="ph-av"></span><span class="ph-lines">${bars(ri(28, 46), ri(16, 30))}</span>${chance(.22) ? '<button class="follow">Follow</button>' : ''}<button class="more" aria-label="More">${I('more')}</button></div>
    <div class="media${sq ? ' sq' : ''}" style="--th:${h}">${slides}${gold ? '<span class="rare">Rare drop</span>' : ''}</div>
    <div class="actions"><button class="act like" aria-label="Like">${I('heart')}</button><button class="act cmt" aria-label="Comments">${I('comment')}</button><button class="act share" aria-label="Share">${I('send')}</button>${carousel ? `<span class="cdots">${Array.from({ length: p.slides }, (_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</span>` : ''}<button class="act save" aria-label="Save">${I('save')}</button></div>
    <div class="likes"><span class="lc">${fmt(likes)}</span> likes</div>
    <div class="ph-lines cap">${bars(ri(70, 96), ri(30, 70))}</div>
    ${p.comments ? `<button class="vc">View all ${fmt(p.comments)} comments</button>` : ''}
    <time data-ts="${p.ts}" data-long>${agoLong(p.ts)}</time>
  </article>`);
  node._p = p;
  return node;
}
function caughtEl() {
  return html(`<div><div class="caught"><span class="ck-ring">${I('check')}</span><b>You're all caught up</b><small>You've seen all new posts from the past 3 days.</small></div><div class="sugg">Suggested posts</div></div>`);
}

const visible = new Set();
const seenIO = new IntersectionObserver(es => {
  for (const e of es) {
    const n = e.target;
    if (!e.isIntersecting) { visible.delete(n); continue; }
    visible.add(n);
    if (!n._p.seen && e.intersectionRatio >= .5) { n._p.seen = true; S.seen++; sessionSeen++; award(1); }
  }
}, { root: feedSc, threshold: [0, .5] });

let loading = false, sinceTop = 0, caught = false;
const nearBottom = () => feedSc.scrollHeight - (feedSc.scrollTop + feedSc.clientHeight) < 1400;
async function loadMore() {
  if (loading) return;
  loading = true;
  await wait(ri(380, 950)); // the shimmer is part of it
  const frag = document.createDocumentFragment(), made = [];
  for (let i = 0; i < 5; i++) {
    if (!caught && ++sinceTop > 16) { caught = true; frag.append(caughtEl()); }
    const n = mkPost({ gold: chance(.03) });
    made.push(n); frag.append(n);
  }
  feed.append(frag);
  made.forEach(n => seenIO.observe(n));
  loading = false;
  trimFeed();
  requestAnimationFrame(() => { if (nearBottom()) loadMore(); });
}
new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) loadMore(); }, { root: feedSc, rootMargin: '0px 0px 1200px 0px' }).observe(loader);

function trimFeed() {
  if (feed.children.length < 180) return;
  const cut = 60, h = feed.children[cut].offsetTop - feed.children[0].offsetTop;
  for (let i = 0; i < cut; i++) {
    const c = feed.firstElementChild;
    if (c._p) { seenIO.unobserve(c); visible.delete(c); }
    c.remove();
  }
  feedSc.scrollTop -= h;
}

async function refreshFeed() {
  S.refreshes++;
  await wait(ri(600, 1600));
  const r = R();
  const n = r < .15 ? 0 : r < .25 ? ri(10, 16) : ri(2, 6);
  const [x, y] = toLocal(...(() => { const b = feedSc.getBoundingClientRect(); return [b.left + b.width / 2, b.top + 40 * scale]; })());
  if (!n) { sfx.nope(); toast('Nothing new. Pull again?'); award(1, x, y); return; }
  const gold = chance(.08), made = [];
  for (let i = 0; i < n; i++) made.push(mkPost({ fresh: true, gold: gold && i === 0 }));
  feed.prepend(...made);
  made.forEach(m => seenIO.observe(m));
  if (n >= 10) { sfx.big(); confetti(90); haptic(true); award(12, x, y); }
  else { sfx.fresh(); haptic(); award(3, x, y); }
  toast(`${n} new posts`);
  if (chance(.35)) addStory();
  hidePill();
}

let mTap = 0, mTapEl = null;
feed.addEventListener('click', e => {
  const post = e.target.closest('.post'); if (!post) return;
  const p = post._p, b = e.target.closest('button');
  if (!b) {
    if (!e.target.closest('.media')) return;
    const t = now();
    if (t - mTap < 320 && mTapEl === post) { mTap = 0; bigHeart($('.media', post), e); doLike(p, $('.like', post), $('.lc', post), true); }
    else { mTap = t; mTapEl = post; }
    return;
  }
  const c = b.classList;
  if (c.contains('like')) doLike(p, b, $('.lc', post));
  else if (c.contains('cmt') || c.contains('vc')) openComments(p, $('.vc', post), true);
  else if (c.contains('share')) openShare();
  else if (c.contains('save')) {
    p.saved = !p.saved; c.toggle('on', p.saved);
    if (p.saved) { sfx.pop(7); haptic(); toast('Saved'); } else sfx.unpop();
  }
  else if (c.contains('follow')) follow(b);
  else if (c.contains('more')) openMore(() => hidePost(post));
  else if (c.contains('cbtn')) { const sl = $('.slides', post); sl.scrollBy({ left: (c.contains('next') ? 1 : -1) * sl.clientWidth, behavior: 'smooth' }); }
});
feed.addEventListener('scroll', e => {
  const sl = e.target;
  if (!sl.classList || !sl.classList.contains('slides')) return;
  const post = sl.closest('.post'), p = post._p, i = Math.round(sl.scrollLeft / sl.clientWidth);
  if (i === p.slide) return;
  p.slide = i;
  $$('.cdots i', post).forEach((d, k) => d.classList.toggle('on', k === i));
  $('.count', post).textContent = `${i + 1}/${p.slides}`;
  sfx.tick();
  if (i + 1 > p.seenSlides) { p.seenSlides = i + 1; award(1); }
}, true);

function hidePost(post) {
  post.style.height = post.offsetHeight + 'px'; post.style.overflow = 'hidden';
  post.style.transition = 'height .35s cubic-bezier(.2,.9,.25,1), opacity .25s';
  requestAnimationFrame(() => { post.style.height = '0px'; post.style.opacity = '0'; });
  setTimeout(() => { seenIO.unobserve(post); visible.delete(post); post.remove(); }, 380);
  toast('Hidden. Here is more of the same.');
}

// new posts pill
let pillT = 0;
function pillLoop() {
  pillT = setTimeout(() => {
    if (cur === 'home' && feedSc.scrollTop > 1600 && !document.hidden && !$('#newpill').classList.contains('show')) { $('#newpill').classList.add('show'); sfx.tick(); }
    pillLoop();
  }, ri(25000, 50000));
}
const hidePill = () => $('#newpill').classList.remove('show');
$('#newpill').onclick = async () => {
  hidePill(); sfx.tap();
  feedSc.scrollTo({ top: 0, behavior: 'smooth' });
  await wait(500);
  PTRS.home.trigger();
};
feedSc.addEventListener('scroll', () => { if (feedSc.scrollTop < 200) hidePill(); }, { passive: true });

// live counts tick up while you look
setInterval(() => {
  if (cur !== 'home' || document.hidden) return;
  visible.forEach(n => {
    if (!chance(.5)) return;
    const p = n._p;
    p.likes += ri(1, Math.max(1, Math.round(p.likes / 3000)));
    const lc = $('.lc', n); lc.textContent = fmt(p.likes); restart(lc, 'tick');
  });
}, 1100);

// ---------- comment, share, more sheets (all blank) ----------
function openComments(obj, countEl, isPost) {
  const row = mine => {
    const k = mine ? 0 : (chance(.4) ? 0 : ri(1, 900));
    return `<div class="cm${mine ? ' mine' : ''}"><span class="ph-av"></span><span class="ph-lines">${bars(ri(22, 36), ri(50, 95), ...(chance(.4) ? [ri(20, 60)] : []))}<small>${mine ? 'now' : ri(1, 23) + 'h'} · Reply</small></span><button class="cm-like" data-n="${k}" aria-label="Like">${I('heart')}<span>${k ? fmt(k) : ''}</span></button></div>`;
  };
  const c = html(`<div style="display:flex;flex-direction:column;flex:1;min-height:0"><div class="sbody">${Array.from({ length: ri(10, 18) }, () => row(false)).join('')}</div><div class="compose"><span class="cfield"></span><button class="sendbtn" aria-label="Post">${I('send')}</button></div></div>`);
  openSheet('Comments', c, 'tall');
  c.addEventListener('click', e => {
    const lb = e.target.closest('.cm-like');
    if (lb) {
      const on = lb.classList.toggle('on'), n = +lb.dataset.n + (on ? 1 : -1);
      lb.dataset.n = n; $('span', lb).textContent = n ? fmt(n) : '';
      if (on) { sfx.pop(9); haptic(); if (!lb._paid) { lb._paid = true; const [x, y] = centerOf(lb); award(1, x, y - 14); } } else sfx.unpop();
      return;
    }
    const sb = e.target.closest('.sendbtn');
    if (!sb) return;
    const list = $('.sbody', c);
    list.insertAdjacentHTML('afterbegin', row(true)); list.scrollTop = 0;
    obj.comments++;
    if (countEl) countEl.textContent = isPost ? `View all ${fmt(obj.comments)} comments` : fmt(obj.comments);
    sfx.send(); haptic();
    const [x, y] = centerOf(sb); award(3, x, y - 20);
    setTimeout(() => pushNotif({ type: chance(.5) ? 'like' : 'comment' }), ri(3000, 9000));
  });
}
function openShare() {
  const c = html(`<div class="sbody"><div class="share-grid">${Array.from({ length: 12 }, () => `<button class="sg"><span class="ph-av"></span><span class="sent">${I('check')}</span><i class="sk-bar"></i><small></small></button>`).join('')}</div></div>`);
  openSheet('Send to', c);
  c.addEventListener('click', e => {
    const b = e.target.closest('.sg'); if (!b) return;
    const on = b.classList.toggle('on');
    $('small', b).textContent = on ? 'Sent' : '';
    if (!on) { sfx.unpop(); return; }
    sfx.send(); haptic();
    if (!b._paid) { b._paid = true; const [x, y] = centerOf(b); award(1, x, y - 20); }
  });
}
function openMore(onHide) {
  const c = html('<div class="opts"><button data-a="save">Save</button><button data-a="fav">Add to favorites</button><button data-a="why">Why you\'re seeing this</button><button data-a="hide">Not interested</button><button data-a="report" class="red">Report</button></div>');
  openSheet('', c);
  c.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    closeSheet(); sfx.tap();
    const a = b.dataset.a;
    if (a === 'hide') onHide();
    else toast({ save: 'Saved', fav: 'Added to favorites', why: 'Because you kept scrolling.', report: 'Thanks. Nothing will change.' }[a]);
  });
}

// ---------- stories ----------
const stories = [];
let storyN = 0;
const mkStory = () => ({ id: ++storyN, seen: false, segs: ri(1, 4), h: ri(0, 359) });
for (let i = 0; i < 11; i++) stories.push(mkStory());
function renderStories() {
  const row = $('#stories'), x = row.scrollLeft;
  const order = [...stories.filter(s => !s.seen), ...stories.filter(s => s.seen)];
  row.innerHTML = `<button class="story mine" data-me aria-label="Your story"><span class="ring"><span class="ph-av"></span></span><i class="sk-bar"></i><span class="plus">${I('plus')}</span></button>`
    + order.map(s => `<button class="story${s.seen ? ' seen' : ''}" data-id="${s.id}" aria-label="Story"><span class="ring"><span class="ph-av"></span></span><i class="sk-bar"></i></button>`).join('');
  row.scrollLeft = x;
}
function addStory() { stories.unshift(mkStory()); if (stories.length > 18) stories.pop(); renderStories(); }
$('#stories').addEventListener('click', e => {
  const b = e.target.closest('.story'); if (!b) return;
  if (b.hasAttribute('data-me')) { sfx.nope(); toast('Nothing to post.'); return; }
  const s = stories.find(x => x.id === +b.dataset.id);
  if (s) openStory(s);
});

let sv = null;
const SEG_MS = 4800;
function openStory(s) {
  if (sv) closeStory(true);
  const node = html(`<div class="sv" role="dialog" aria-label="Story"><div class="sv-card"><div class="glow"></div><div class="sv-bars"></div><div class="sv-head"><span class="ph-av"></span><i class="sk-bar" style="width:84px"></i><small class="sv-ago"></small></div><div class="sv-lines"></div><button class="sv-x" aria-label="Close">${I('close')}</button></div><div class="sv-foot"><span class="sv-reply"></span><button class="sv-like" aria-label="Like">${I('heart')}</button><button class="sv-send" aria-label="Send">${I('send')}</button></div></div>`);
  appEl.append(node);
  sv = { node, s, seg: 0, el: 0, last: now(), paused: false, raf: 0, down: 0, bar: null };
  setDark(); showSeg(); sfx.tap();
  sv.raf = requestAnimationFrame(svTick);
  const card = $('.sv-card', node);
  card.addEventListener('pointerdown', e => { if (!sv || e.target.closest('button')) return; sv.paused = true; sv.down = now(); node.classList.add('paused'); });
  const resume = () => { if (!sv) return; sv.paused = false; node.classList.remove('paused'); };
  card.addEventListener('pointerup', resume); card.addEventListener('pointercancel', resume); card.addEventListener('pointerleave', resume);
  card.addEventListener('click', e => {
    if (!sv || e.target.closest('button') || now() - sv.down > 350) return;
    const r = card.getBoundingClientRect();
    if (e.clientX - r.left < r.width * .3) prevSeg(); else nextSeg();
  });
  drag(card, {
    axis: 'y',
    onMove: (dx, dy) => { card.style.transition = 'none'; card.style.transform = `translateY(${Math.max(0, dy)}px) scale(${1 - Math.max(0, dy) / 1600})`; },
    onEnd: (dx, dy) => { card.style.transition = ''; card.style.transform = ''; if (dy > 110) closeStory(); },
  });
  $('.sv-x', node).onclick = () => closeStory();
  $('.sv-like', node).onclick = e => {
    const b = e.currentTarget, on = b.classList.toggle('on');
    if (!on) { sfx.unpop(); return; }
    sfx.pop(4); haptic(); S.likes++;
    const [x, y] = centerOf(b); burst(x, y); award(2, x, y - 16);
  };
  $('.sv-send', node).onclick = e => { sfx.send(); haptic(); toast('Sent'); const [x, y] = centerOf(e.currentTarget); award(1, x, y - 16); };
}
function showSeg() {
  const { s, node } = sv;
  if (!s.seen) { s.seen = true; S.stories++; award(2); }
  $('.sv-bars', node).innerHTML = Array.from({ length: s.segs }, (_, i) => `<i><b style="width:${i < sv.seg ? 100 : 0}%"></b></i>`).join('');
  sv.bar = $$('.sv-bars b', node)[sv.seg];
  const h = (s.h + sv.seg * 35) % 360;
  $('.sv-card', node).style.setProperty('--sbg', `linear-gradient(170deg, hsl(${h} 22% 21%), hsl(${(h + 40) % 360} 18% 9%))`);
  $('.sv-lines', node).innerHTML = bars(...Array.from({ length: ri(1, 3) }, () => ri(45, 100)));
  $('.sv-ago', node).textContent = ri(1, 23) + 'h';
  $('.sv-like', node).classList.remove('on');
  sv.el = 0;
}
function svTick(t) {
  if (!sv) return;
  const dt = Math.min(100, t - sv.last); sv.last = t;
  if (!sv.paused && !document.hidden) {
    sv.el += dt;
    const k = Math.min(1, sv.el / SEG_MS);
    sv.bar.style.width = k * 100 + '%';
    if (k >= 1) nextSeg();
  }
  if (sv) sv.raf = requestAnimationFrame(svTick);
}
function nextSeg() {
  if (!sv) return;
  sfx.tap();
  if (sv.seg < sv.s.segs - 1) { sv.seg++; showSeg(); return; }
  const nx = stories.find(x => !x.seen); // autoplay into the next unseen story
  if (nx) { sv.s = nx; sv.seg = 0; showSeg(); } else closeStory();
}
function prevSeg() { if (!sv) return; if (sv.seg > 0) sv.seg--; showSeg(); }
function closeStory(instant) {
  if (!sv) return;
  const { node } = sv;
  cancelAnimationFrame(sv.raf); sv = null;
  if (instant) node.remove(); else { node.classList.add('out'); setTimeout(() => node.remove(), 260); }
  setDark(); renderStories();
  if (stories.every(s => s.seen)) unlock('caught');
}

// ---------- autoplay (reels) ----------
const reelsEl = $('#reels');
let curReel = null, reelRaf = 0, reelLast = 0, swipedOnce = false;
function mkReel(forceLive) {
  const h = ri(0, 359), live = forceLive || chance(.16);
  const r = { h, live, d: ri(7000, 13000), el: 0, likes: Math.round(Math.exp(rnd(6, 13))), comments: ri(20, 9000), shares: ri(10, 20000), views: Math.round(Math.exp(rnd(8, 15))), viewers: ri(120, 9000), liked: false, watched: false, done: false, vt: 0 };
  const node = html(`<section class="reel" style="--rbg:linear-gradient(170deg, hsl(${h} 24% 17%), hsl(${(h + 40) % 360} 20% 7%))">
    <div class="glow"></div><div class="shade"></div>
    <div class="rtop">${live ? `<span class="livebadge"><b>LIVE</b><span class="lv">${fmt(r.viewers)}</span></span>` : '<span></span>'}<span class="views">${I('eye')}<span class="vw">${fmt(r.views)}</span></span></div>
    <div class="rail">
      <button class="r-like" aria-label="Like">${I('heart')}<span class="rl">${fmt(r.likes)}</span></button>
      <button class="r-cmt" aria-label="Comments">${I('comment')}<span>${fmt(r.comments)}</span></button>
      <button class="r-share" aria-label="Share">${I('send')}<span>${fmt(r.shares)}</span></button>
      <button class="r-more" aria-label="More">${I('more')}</button>
    </div>
    <div class="rinfo"><div class="rwho"><span class="ph-av"></span><i class="sk-bar" style="width:${ri(70, 110)}px"></i><button class="rfollow">Follow</button></div><i class="sk-bar" style="width:${ri(70, 92)}%"></i><i class="sk-bar" style="width:${ri(30, 60)}%"></i></div>
    ${live ? '' : '<div class="rprog"><i></i></div>'}
    <div class="upnext">Next in <b>3</b></div>
    <div class="pz">${IF('play')}</div>
  </section>`);
  node._r = r;
  return node;
}
const reelIO = new IntersectionObserver(es => {
  for (const e of es) {
    const n = e.target;
    if (e.intersectionRatio >= .6) { n.classList.add('playing'); if (curReel !== n) setCurReel(n); }
    else n.classList.remove('playing');
  }
}, { root: reelsEl, threshold: [0, .6] });
function appendReels(n) {
  const first = !reelsEl.children.length;
  for (let i = 0; i < n; i++) { const r = mkReel(); reelsEl.append(r); reelIO.observe(r); }
  if (first && !swipedOnce) reelsEl.firstElementChild.insertAdjacentHTML('beforeend', `<div class="swipehint">${I('up')}Swipe up</div>`);
}
function setCurReel(n) {
  if (curReel) { curReel.classList.remove('held'); $('.upnext', curReel).classList.remove('show'); }
  curReel = n;
  const r = n._r;
  if (r.done) { r.done = false; r.el = 0; const pi = $('.rprog i', n); if (pi) pi.style.width = '0%'; }
  const idx = Array.prototype.indexOf.call(reelsEl.children, n);
  if (idx > reelsEl.children.length - 4) appendReels(5);
  if (idx > 0 && !swipedOnce) { swipedOnce = true; $$('.swipehint').forEach(x => x.remove()); }
  if (cur === 'reels') haptic();
}
function reelTick(t) {
  if (cur !== 'reels') { reelRaf = 0; return; }
  const dt = Math.min(100, t - reelLast); reelLast = t;
  const n = curReel;
  if (n && !document.hidden && !sheet && !n.classList.contains('held')) {
    const r = n._r;
    r.el += dt;
    if (r.el > 3000 && !r.watched) { r.watched = true; watchedReel(); }
    if (!r.live) {
      const k = Math.min(1, r.el / r.d), left = Math.ceil((r.d - r.el) / 1000), up = $('.upnext', n);
      $('.rprog i', n).style.width = k * 100 + '%';
      if (left <= 3 && k < 1) { up.classList.add('show'); $('b', up).textContent = left; } else up.classList.remove('show');
      if (k >= 1 && !r.done) { r.done = true; reelsEl.scrollBy({ top: reelsEl.clientHeight, behavior: 'smooth' }); }
    }
    r.vt += dt;
    if (r.vt > 700) { r.vt = 0; r.views += ri(1, 40); $('.vw', n).textContent = fmt(r.views); }
  }
  reelRaf = requestAnimationFrame(reelTick);
}
function watchedReel() {
  S.reels++; S.earn++;
  award(2);
  if (S.earn >= 3) { S.earn = 0; S.energy++; sfx.coin(); toast('+1 free spin'); }
  renderEnergy();
}
function likeReel(n, onlyOn) {
  doLike(n._r, $('.r-like', n), $('.rl', n), onlyOn);
  if (n._r.live && n._r.liked) for (let i = 0; i < 5; i++) setTimeout(() => floatHeart(n), i * 90);
}
function floatHeart(n) {
  if (reduced) return;
  const h = html(`<i class="lh" style="--dx:${ri(-70, 10)}px;--c:${pick(CONF)}">${IF('heart')}</i>`);
  n.append(h); h.addEventListener('animationend', () => h.remove());
}
setInterval(() => {
  if (cur !== 'reels' || !curReel || document.hidden) return;
  const r = curReel._r;
  if (!r.live || curReel.classList.contains('held')) return;
  floatHeart(curReel);
  if (chance(.35)) { const n = curReel; setTimeout(() => floatHeart(n), 160); }
  r.viewers = Math.max(40, r.viewers + ri(-25, 45));
  $('.lv', curReel).textContent = fmt(r.viewers);
}, 420);
function goLive() {
  if (cur !== 'reels') go('reels');
  const n = mkReel(true);
  if (curReel && curReel.nextSibling) reelsEl.insertBefore(n, curReel.nextSibling); else reelsEl.append(n);
  reelIO.observe(n);
  requestAnimationFrame(() => reelsEl.scrollTo({ top: n.offsetTop, behavior: 'smooth' }));
}
let rTap = 0, rTimer = 0;
reelsEl.addEventListener('click', e => {
  const n = e.target.closest('.reel'); if (!n) return;
  const b = e.target.closest('button');
  if (b) {
    const c = b.classList;
    if (c.contains('r-like')) likeReel(n);
    else if (c.contains('r-cmt')) openComments(n._r, $('.r-cmt span', n));
    else if (c.contains('r-share')) openShare();
    else if (c.contains('r-more')) openMore(() => reelsEl.scrollBy({ top: reelsEl.clientHeight, behavior: 'smooth' }));
    else if (c.contains('rfollow')) follow(b);
    return;
  }
  const t = now();
  if (t - rTap < 300) { clearTimeout(rTimer); rTap = 0; bigHeart(n, e); likeReel(n, true); }
  else { rTap = t; rTimer = setTimeout(() => { n.classList.toggle('held'); sfx.tap(); }, 300); }
});

// ---------- notifications ----------
const NT = {
  like: { w: 24, icon: 'heart', fill: true, c: '#ff2d55', thumb: true, text: () => 'New like', fx: () => { S.likesIn++; } },
  likes: { w: 9, icon: 'heart', fill: true, c: '#ff2d55', thumb: true, n: () => ri(3, 80), text: n => `${n} new likes`, fx: n => { S.likesIn += n; } },
  follow: { w: 13, icon: 'userPlus', c: '#0a84ff', fb: true, text: () => 'New follower', fx: () => { S.followers++; } },
  comment: { w: 10, icon: 'comment', c: '#30b158', thumb: true, text: () => 'New comment' },
  mention: { w: 6, icon: 'at', c: '#8e5cff', thumb: true, text: () => 'You were mentioned' },
  story: { w: 7, icon: 'ring', c: '#ff6a00', text: () => 'New story', fx: () => addStory() },
  live: { w: 4, icon: 'play', fill: true, c: '#d62dff', text: () => 'Live now. Watch before it ends' },
  streak: { w: 2, icon: 'flame', fill: true, c: '#ff8a00', text: () => `Your ${S.streak}-day streak is at risk` },
  milestone: { w: 2, icon: 'star', fill: true, c: '#ffb300', n: () => ri(3, 40), text: n => `+${n} followers this week`, fx: n => { S.followers += n; } },
  dm: { w: 9, icon: 'send', c: '#0a84ff', text: () => 'New message' },
  spins: { w: 0, icon: 'bolt', fill: true, c: '#ffb300', text: () => 'Free spins are full' },
};
const tyBadge = type => { const t = NT[type]; return `<span class="ty" style="background:${t.c}">${t.fill ? IF(t.icon) : I(t.icon)}</span>`; };
const pickType = (noDM) => pickW(Object.entries(NT).filter(([k, v]) => v.w && !(noDM && k === 'dm')).map(([k, v]) => [k, v.w]));
const nlist = $('#nlist'), notifs = [];
let nid = 0;
function niEl(n) {
  const t = NT[n.type];
  const extra = t.thumb ? `<span class="thumb" style="background:hsl(${ri(0, 359)} var(--tint-s) var(--tint-l))"></span>` : t.fb ? '<button class="fb">Follow back</button>' : '';
  const node = html(`<div class="ni${n.read ? '' : ' unread'}"><div class="ni-bg">Clear</div><div class="ni-row"><span class="dot"></span><span class="nav"><span class="ph-av"></span>${tyBadge(n.type)}</span><span class="ni-t"><i class="sk-bar" style="width:${ri(40, 80)}%"></i><small>${n.text} · <time data-ts="${n.ts}">${ago(n.ts)}</time></small></span>${extra}</div></div>`);
  node._n = n; n.el = node;
  const row = $('.ni-row', node);
  drag(row, {
    axis: 'x',
    onMove: dx => { row.style.transition = 'none'; row.style.transform = `translateX(${Math.min(0, dx)}px)`; },
    onEnd: dx => {
      row.style.transition = 'transform .3s cubic-bezier(.2,.9,.25,1)';
      if (dx < -100) { row.style.transform = 'translateX(-110%)'; removeNotif(n); } else row.style.transform = '';
    },
  });
  return node;
}
function pushNotif(o = {}) {
  const type = o.type || pickType(o.silent);
  if (type === 'dm') { incomingDM(); return; }
  const t = NT[type], k = t.n ? t.n() : 0;
  const n = { id: ++nid, type, ts: o.ts || Date.now(), read: !!o.read, text: t.text(k) };
  if (!o.seed && t.fx) t.fx(k);
  notifs.unshift(n);
  const node = niEl(n);
  if (!o.seed) node.classList.add('enter');
  nlist.prepend(node);
  if (notifs.length > 120) notifs.pop().el.remove();
  $('#nempty').hidden = true;
  if (o.seed) return;
  updateBadges(true); islandPop(type);
  if (!o.silent) banner({ type, text: n.text, onTap: () => openNotif(n, true) });
}
function openNotif(n, fromBanner) {
  if (!n.read) {
    n.read = true; n.el.classList.remove('unread'); S.cleared++;
    sfx.clear(ri(0, 7)); haptic();
    const [x, y] = fromBanner || !n.el.isConnected || cur !== 'activity' ? [FW / 2, 110] : centerOf($('.dot', n.el));
    award(3, x, y); updateBadges(); checkZero();
  } else sfx.tap();
  const t = n.type;
  if (t === 'story') { const s = stories.find(x => !x.seen); if (s) openStory(s); else go('home'); }
  else if (t === 'live') goLive();
  else if (t === 'streak' || t === 'spins') go('drops');
  else if (fromBanner && n.el.isConnected) {
    if (cur !== 'activity') go('activity');
    restart(n.el, 'flash');
    n.el.scrollIntoView({ block: 'nearest' });
  }
}
function removeNotif(n) {
  const node = n.el;
  if (!n.read) { n.read = true; S.cleared++; award(3); }
  sfx.whoosh(); haptic();
  const i = notifs.indexOf(n); if (i >= 0) notifs.splice(i, 1);
  updateBadges();
  node.style.height = node.offsetHeight + 'px'; void node.offsetHeight;
  node.style.transition = 'height .3s cubic-bezier(.2,.9,.25,1)'; node.style.height = '0px';
  setTimeout(() => { node.remove(); if (!notifs.length) $('#nempty').hidden = false; }, 320);
  checkZero();
}
function checkZero() {
  if (notifs.some(n => !n.read)) return;
  toast('All caught up');
  unlock('zero');
}
nlist.addEventListener('click', e => {
  const node = e.target.closest('.ni'); if (!node) return;
  const fb = e.target.closest('.fb');
  if (fb) { follow(fb, 'Following', 'Follow back'); if (!node._n.read) openNotif(node._n); return; }
  openNotif(node._n);
});
$('#mark-all').onclick = () => {
  const un = notifs.filter(n => !n.read);
  if (!un.length) { sfx.nope(); toast('Nothing to clear'); return; }
  const gap = clamp(1400 / un.length, 18, 60), [x, y] = centerOf($('#mark-all'));
  un.forEach((n, i) => setTimeout(() => {
    n.read = true; n.el.classList.remove('unread'); S.cleared++;
    sfx.clear(i); if (i % 2 === 0) haptic();
    updateBadges();
    if (i === un.length - 1) { award(un.length * 2, x, y + 20); checkZero(); }
  }, i * gap));
};
async function refreshActivity() {
  S.refreshes++;
  await wait(ri(500, 1300));
  const n = chance(.3) ? 0 : ri(1, 4);
  for (let i = 0; i < n; i++) pushNotif({ silent: true });
  if (n) { sfx.fresh(); toast(n === 1 ? '1 new notification' : `${n} new notifications`); } else { sfx.nope(); toast('Nothing new'); }
  award(2);
}

function setBadge(b, n, bump) {
  const grew = n > (+b.dataset.n || 0);
  b.dataset.n = n; b.textContent = n > 99 ? '99+' : n ? String(n) : '';
  if (bump && grew) restart(b, 'bump');
}
function updateBadges(bump) {
  const n = notifs.reduce((s, x) => s + !x.read, 0), d = convos.reduce((s, c) => s + c.unread, 0), total = n + d;
  setBadge($('#b-act'), n, bump); setBadge($('#b-dm'), d, bump);
  const tt = $('#tittle'), txt = total > 99 ? '99+' : total ? String(total) : '';
  if (tt.textContent !== txt) { tt.textContent = txt; if (bump && total) restart(tt, 'bump'); }
  document.title = total ? `(${total}) stim` : 'stim';
  try { if (navigator.setAppBadge) (total ? navigator.setAppBadge(total) : navigator.clearAppBadge()).catch(() => {}); } catch {}
}

const PACE = { chill: 26000, normal: 10000, chaos: 2600 };
let notifT = 0;
function schedule(first) {
  clearTimeout(notifT);
  const mean = PACE[S.settings.pace] || PACE.normal;
  const w = first ? 2500 : Math.max(900, -Math.log(1 - R()) * mean); // variable interval, like the real thing
  notifT = setTimeout(() => {
    if (!document.hidden) {
      pushNotif();
      if (chance(.14)) { setTimeout(() => pushNotif({ silent: true }), 700); setTimeout(() => pushNotif(), 1500); }
    }
    schedule();
  }, w);
}
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); save(); return; }
  const away = (Date.now() - hiddenAt) / 1000;
  if (hiddenAt && away > 20 && S.onboarded) {
    const n = Math.min(30, Math.max(2, Math.round(away / 8)));
    Array.from({ length: n }, () => Date.now() - R() * away * 1000).sort((a, b) => a - b)
      .forEach(ts => pushNotif({ silent: true, ts }));
    banner({ type: 'like', text: `${n} new notifications while you were away`, onTap: () => go('activity') });
  }
  hiddenAt = 0;
});
addEventListener('pagehide', save);

// ---------- messages (blank bubbles, real receipts) ----------
const convos = Array.from({ length: 9 }, (_, i) => ({
  id: i, active: chance(.4), unread: i < 2 ? ri(1, 3) : 0, typing: false, rcpt: '', nw: ri(70, 130),
  ts: Date.now() - (i < 2 ? ri(1, 30) : ri(40, 6000)) * 60000,
  msgs: Array.from({ length: ri(3, 8) }, () => ({ me: chance(.45), w: ri(60, 220), tall: chance(.15) })),
}));
let chatC = null;
const isOpen = sel => $(sel).classList.contains('show');
const showPage = sel => { $(sel).classList.add('show'); sfx.tap(); };
const hidePage = sel => $(sel).classList.remove('show');
function renderDMs() {
  $('#dm-req').textContent = `${ri(2, 9)} requests`;
  $('#dm-list').innerHTML = [...convos].sort((a, b) => b.ts - a.ts).map(c => {
    const last = c.msgs[c.msgs.length - 1];
    const sub = c.typing ? '<span class="typing"><i></i><i></i><i></i></span>Typing…'
      : c.unread ? `${c.unread > 1 ? c.unread + ' new messages' : 'New message'} · ${ago(c.ts)}`
      : `${last.me ? (c.rcpt || 'Sent') : 'Seen'} · ${ago(c.ts)}`;
    return `<button class="dmi${c.unread ? ' unread' : ''}" data-c="${c.id}"><span class="avw"><span class="ph-av"></span>${c.active ? '<i class="on"></i>' : ''}</span><span class="dmt"><i class="sk-bar" style="width:${c.nw}px"></i><small>${sub}</small></span>${c.unread ? '<i class="bdot"></i>' : ''}</button>`;
  }).join('');
}
const bubHTML = m => `<div class="bub${m.me ? ' me' : ''}${m.tall ? ' tall' : ''}" style="width:${m.w}px"></div>`;
function syncChat() {
  const box = $('#chat'), c = chatC; if (!c) return;
  $$('.rcpt, .typing', box).forEach(x => x.remove());
  const last = c.msgs[c.msgs.length - 1];
  if (last && last.me && c.rcpt) box.insertAdjacentHTML('beforeend', `<div class="rcpt">${c.rcpt}</div>`);
  if (c.typing) box.insertAdjacentHTML('beforeend', '<div class="typing"><i></i><i></i><i></i></div>');
  box.scrollTop = box.scrollHeight;
}
const chatOpenFor = c => chatC === c && isOpen('#pg-chat');
function refreshConvo(c) { if (chatOpenFor(c)) syncChat(); if (isOpen('#pg-dm')) renderDMs(); }
function openChat(c) {
  chatC = c;
  if (c.unread) { award(2 * c.unread, FW / 2, 120); c.unread = 0; updateBadges(); sfx.clear(4); S.cleared++; }
  $('#chat-status').textContent = c.active ? 'Active now' : `Active ${ri(2, 50)}m ago`;
  const box = $('#chat');
  box.innerHTML = '<div class="tsep">Today</div>' + c.msgs.map(bubHTML).join('');
  $$('.bub', box).forEach(b => { b.style.animation = 'none'; });
  syncChat(); showPage('#pg-chat');
}
function addMsg(c, m) {
  c.msgs.push(m); c.ts = Date.now();
  if (chatOpenFor(c)) { const box = $('#chat'); $$('.rcpt, .typing', box).forEach(x => x.remove()); box.insertAdjacentHTML('beforeend', bubHTML(m)); syncChat(); }
}
function replyFrom(c) {
  clearTimeout(c.replyT);
  c.typing = true; refreshConvo(c);
  c.replyT = setTimeout(() => {
    c.typing = false;
    const k = ri(1, 3);
    for (let i = 0; i < k; i++) setTimeout(() => {
      addMsg(c, { me: false, w: ri(50, 230), tall: chance(.15) });
      sfx.recv();
      if (!chatOpenFor(c)) c.unread++;
      if (i === k - 1) {
        refreshConvo(c); updateBadges(true);
        if (!chatOpenFor(c)) { islandPop('dm'); banner({ type: 'dm', text: k > 1 ? `${k} new messages` : 'New message', onTap: () => { if (sv) closeStory(true); renderDMs(); showPage('#pg-dm'); openChat(c); } }); }
      }
    }, i * 380);
  }, ri(1200, 3200));
}
const incomingDM = () => replyFrom(pick(convos));
$('#open-dm').onclick = () => { renderDMs(); showPage('#pg-dm'); };
$('#pg-dm .back').onclick = () => hidePage('#pg-dm');
$('#pg-chat .back').onclick = () => { hidePage('#pg-chat'); chatC = null; renderDMs(); };
$('#dm-list').addEventListener('click', e => { const b = e.target.closest('.dmi'); if (b) openChat(convos[+b.dataset.c]); });
$('#send').onclick = e => {
  const c = chatC; if (!c) return;
  clearTimeout(c.replyT); c.typing = false;
  addMsg(c, { me: true, w: ri(50, 210), tall: chance(.12) });
  c.rcpt = 'Sent'; syncChat();
  S.sent++; sfx.send(); haptic();
  const [x, y] = centerOf(e.currentTarget); award(1, x, y - 20);
  c.replyT = setTimeout(() => {
    c.rcpt = 'Delivered'; refreshConvo(c);
    c.replyT = setTimeout(() => {
      c.rcpt = 'Seen just now'; refreshConvo(c);
      if (chance(.8)) c.replyT = setTimeout(() => replyFrom(c), ri(600, 1600)); // or leave you on read
    }, ri(500, 1400));
  }, 450);
};

// ---------- rewards: streak, slot machine, energy ----------
const MAXE = 5, REGEN = 30000, CELL = 58;
const SYM = {
  heart: { c: '#ff2d55', pay: 20, svg: FP.heart },
  bell: { c: '#ffb000', pay: 30, svg: FP.bell },
  badge: { c: '#ff3b30', pay: 50, svg: '<circle cx="12" cy="12" r="10"/><path d="M10.6 8.8 13 7.4v9.2" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' },
  flame: { c: '#ff7a00', pay: 80, svg: FP.flame },
  bolt: { c: '#8e5cff', pay: 150, svg: FP.bolt },
  gem: { c: '#0a84ff', pay: 250, svg: '<path d="M6 3.5h12l3.5 5.5L12 20.5 2.5 9z"/><path d="M2.5 9h19M9 3.5 12 9l3-5.5M12 20.5 8.5 9M12 20.5 15.5 9" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.1"/>' },
};
const SYMS = Object.keys(SYM);
const symSVG = k => `<svg viewBox="0 0 24 24" fill="${SYM[k].c}" aria-hidden="true">${SYM[k].svg}</svg>`;
const cellHTML = k => `<div class="cell">${symSVG(k)}</div>`;
const slotState = [0, 1, 2].map(() => [pick(SYMS), pick(SYMS), pick(SYMS)]);
let spinning = false;

function buildDrops() {
  $('#drops').innerHTML = `
  <section class="card streak"><div class="st-top"><span class="flame">${IF('flame')}</span><div><b class="st-n"><span id="st-n"></span>-day streak</b><small id="st-left"></small></div></div><div class="week" id="week"></div></section>
  <section class="slot" id="slot">
    <div class="bulbs">${'<i></i>'.repeat(13)}</div>
    <div class="slot-h"><b>Lucky pull</b><span>Free spins refill every 30 s</span></div>
    <div class="slot-body"><div class="wins">${'<div class="win"><div class="strip"></div></div>'.repeat(3)}<div class="payline"></div></div>
      <div class="lever" id="lever"><div class="rod"></div><div class="knob" id="knob" role="button" tabindex="0" aria-label="Pull the lever"></div><div class="base"></div></div></div>
    <div class="sres" id="sres">Pull the lever</div>
    <button class="pull" id="pull">PULL</button>
    <div class="energy"><span class="bolts" id="bolts"></span><span id="etimer"></span></div>
  </section>
  <section class="card earn"><div><b>Watch 3 autoplays, earn a spin</b><small id="earn-t"></small></div><button class="txtbtn" id="go-reels">Watch</button><div class="bar"><i id="earn-bar"></i></div></section>
  <section class="card"><h3>Payouts</h3><div class="paytable">${[...SYMS].reverse().map(k => `<span class="trip">${symSVG(k).repeat(3)}</span><b>+${SYM[k].pay}</b>`).join('')}<small>Any two in a row</small><b>+5</b></div></section>`;
  $$('.strip').forEach((s, i) => { s.innerHTML = slotState[i].map(cellHTML).join(''); });
  const lever = $('#lever'), knob = $('#knob');
  let armed = false;
  drag(knob, {
    axis: 'y',
    onStart: () => lever.classList.remove('spring'),
    onMove: (dx, dy) => {
      const y = clamp(dy, 0, 118);
      lever.style.setProperty('--ly', y + 'px');
      if (y > 84 && !armed) { armed = true; sfx.tick(); haptic(); } else if (y < 70) armed = false;
    },
    onEnd: () => { lever.classList.add('spring'); lever.style.setProperty('--ly', '0px'); if (armed) { armed = false; spin(); } },
  });
  knob.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pullLever(); } });
  $('#pull').onclick = pullLever;
  $('#go-reels').onclick = () => go('reels');
}
function pullLever() {
  const lever = $('#lever');
  lever.classList.add('spring'); lever.style.setProperty('--ly', '100px');
  setTimeout(() => lever.style.setProperty('--ly', '0px'), 180);
  spin();
}
function outcome() {
  const r = R();
  if (r < .08) { const k = pickW(SYMS.map(s => [s, 300 / SYM[s].pay])); return [k, k, k]; }
  if (r < .55) { const k = pick(SYMS); let o; do o = pick(SYMS); while (o === k); return [k, k, o]; } // near miss
  const a = pick(SYMS); let b; do b = pick(SYMS); while (b === a);
  return [a, b, pick(SYMS)];
}
const secsToNext = () => Math.max(0, Math.ceil((REGEN - (Date.now() - S.energyAt)) / 1000));
async function spin() {
  if (spinning) return;
  regen();
  const pullB = $('#pull');
  if (S.energy <= 0) { sfx.nope(); restart(pullB, 'shake'); toast(`Next free spin in ${secsToNext()}s`); return; }
  spinning = true;
  if (S.energy >= MAXE) S.energyAt = Date.now();
  S.energy--; S.spins++; renderEnergy();
  sfx.lever(); haptic();
  const res = outcome(), tease = res[0] === res[1], near = tease && res[2] !== res[0];
  const durs = [1200, 1750, tease ? 3400 : 2300];
  const slot = $('#slot'), out = $('#sres');
  slot.classList.add('hot'); out.textContent = '';
  $$('.strip').forEach((st, i) => {
    const fill = Array.from({ length: 16 + i * 7 + (tease && i === 2 ? 18 : 0) }, () => pick(SYMS));
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
    setTimeout(() => { sfx.thunk(); haptic(); if (i === 1 && tease) sfx.riser(1.5); }, durs[i]);
  });
  await wait(durs[2] + 250);
  slot.classList.remove('hot');
  $$('.strip').forEach((st, i) => { st.style.transition = 'none'; st.style.transform = 'translateY(0)'; st.innerHTML = slotState[i].map(cellHTML).join(''); });
  let win;
  if (res[0] === res[1] && res[1] === res[2]) {
    win = SYM[res[0]].pay; out.textContent = `JACKPOT +${win}`; S.wins++;
    sfx.win(); confetti(180); haptic(true); unlock('jackpot');
    slot.classList.add('win-flash'); setTimeout(() => slot.classList.remove('win-flash'), 1600);
  } else if (tease) { win = 5; out.textContent = 'So close! +5'; sfx.coin(); }
  else { win = 1; out.textContent = 'Almost! +1'; sfx.tap(); }
  restart(out, 'pop');
  const [x, y] = centerOf($('.wins')); award(win, x, y);
  spinning = false;
}
function regen() {
  if (S.energy >= MAXE) return;
  let got = false;
  while (S.energy < MAXE && Date.now() - S.energyAt >= REGEN) { S.energy++; S.energyAt += REGEN; got = true; }
  if (got) { renderEnergy(); if (S.energy >= MAXE && S.onboarded) pushNotif({ type: 'spins' }); }
}
function renderEnergy() {
  const full = Math.min(S.energy, MAXE), extra = Math.max(0, S.energy - MAXE);
  $('#epill').innerHTML = `${IF('bolt')}${S.energy}/${MAXE}`;
  $('#b-drops').classList.toggle('on', S.energy >= MAXE);
  $('#bolts').innerHTML = Array.from({ length: MAXE }, (_, i) => IF('bolt', i < full ? '' : 'off')).join('') + (extra ? `<b>+${extra}</b>` : '');
  $('#etimer').textContent = S.energy >= MAXE ? 'Spins full' : `Next spin in 0:${String(secsToNext()).padStart(2, '0')}`;
  const p = $('#pull');
  p.classList.toggle('empty', S.energy <= 0);
  p.textContent = S.energy > 0 ? 'PULL' : `Next spin in ${secsToNext()}s`;
  $('#earn-bar').style.width = (S.earn / 3) * 100 + '%';
  $('#earn-t').textContent = `${S.earn} of 3 watched`;
}
function renderStreak() {
  $('#st-n').textContent = S.streak;
  $('#week').innerHTML = Array.from({ length: 7 }, (_, i) => new Date(Date.now() - (6 - i) * 864e5)).map((d, i) => {
    const on = S.days.includes(dayKey(d));
    return `<span class="wd${on ? ' on' : ''}${i === 6 ? ' today' : ''}"><i>${on ? IF('flame') : ''}</i>${'SMTWTFS'[d.getDay()]}</span>`;
  }).join('');
  const mid = new Date(); mid.setHours(24, 0, 0, 0);
  const left = mid - Date.now();
  $('#st-left').textContent = `Day ${S.streak + 1} unlocks in ${Math.floor(left / 3600e3)}h ${Math.floor((left % 3600e3) / 60e3)}m`;
  $('#streak-mini').innerHTML = IF('flame') + S.streak;
}

// ---------- you ----------
function buildMe() {
  $('#me').innerHTML = `
  <div class="me-top"><div class="me-av"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16" class="trk"/><circle cx="18" cy="18" r="16" class="prg" pathLength="100" id="me-prg"/></svg><span class="ph-av"></span><span class="lvl" id="me-lvl"></span></div>
    <div class="counts"><div><b data-k="followers"></b><span>followers</span></div><div><b data-k="following"></b><span>following</span></div><div><b data-k="likesIn"></b><span>likes</span></div></div></div>
  <div class="xp"><div class="xp-h"><b id="me-title"></b><small id="me-xp"></small></div><div class="bar"><i id="me-bar"></i></div></div>
  <h4 class="sec"><span>Screen time</span></h4>
  <div class="stats">
    <div class="stat wide"><div><b data-k="today"></b><span>today</span></div><div style="text-align:right"><b data-k="session"></b><span>this session</span></div></div>
    <div class="stat"><b data-k="pts"></b><span>points</span></div>
    <div class="stat"><b data-k="meters"></b><span>scrolled</span></div>
    <div class="stat"><b data-k="seen"></b><span>cards seen</span></div>
    <div class="stat"><b data-k="likes"></b><span>likes given</span></div>
    <div class="stat"><b data-k="refreshes"></b><span>refreshes</span></div>
    <div class="stat"><b data-k="cleared"></b><span>notifications cleared</span></div>
    <div class="stat"><b data-k="reels"></b><span>autoplays watched</span></div>
    <div class="stat"><b data-k="stories"></b><span>stories watched</span></div>
    <div class="stat"><b data-k="spins"></b><span>spins</span></div>
    <div class="stat"><b data-k="sent"></b><span>messages sent</span></div>
    <div class="stat"><b data-k="bestCombo"></b><span>best like combo</span></div>
    <div class="stat"><b data-k="total"></b><span>all-time</span></div>
  </div>
  <h4 class="sec"><span>Achievements</span><span id="ach-n"></span></h4>
  <div class="achs" id="achs"></div>
  <h4 class="sec"><span>Settings</span></h4>
  <div class="settings">
    <label class="row"><span class="rt"><b>Sound</b><small>Pops, dings and clicks</small></span><input type="checkbox" class="sw" id="set-sound"></label>
    <label class="row"><span class="rt"><b>Haptics</b><small>Vibration on Android. Taps on iPhone with iOS 18 or later.</small></span><input type="checkbox" class="sw" id="set-haptics"></label>
    <div class="row"><span class="rt"><b>Notifications</b><small>How often nothing happens</small></span><span class="seg" id="set-pace"><button data-v="chill">Chill</button><button data-v="normal">Normal</button><button data-v="chaos">Chaos</button></span></div>
    <label class="row"><span class="rt"><b>Break reminders</b><small>Every 10 minutes</small></span><input type="checkbox" class="sw" id="set-nudges"></label>
    <button class="danger" id="reset">Reset progress</button>
  </div>
  <p class="fine">stim has no content, no accounts and no network. Every like, follower and message is made up on this device, and your progress stays in this browser.</p>`;

  const sw = (id, key) => {
    const i = $(id); i.checked = !!S.settings[key];
    i.onchange = () => { S.settings[key] = i.checked; save(); if (i.checked) (key === 'sound' ? sfx.pop(5) : haptic()); };
  };
  sw('#set-sound', 'sound'); sw('#set-haptics', 'haptics'); sw('#set-nudges', 'nudges');
  const pace = $('#set-pace');
  const syncPace = () => $$('button', pace).forEach(b => b.classList.toggle('on', b.dataset.v === S.settings.pace));
  syncPace();
  pace.onclick = e => { const b = e.target.closest('button'); if (!b) return; S.settings.pace = b.dataset.v; syncPace(); save(); schedule(); sfx.tap(); };
  let armedAt = 0;
  $('#reset').onclick = e => {
    const b = e.currentTarget;
    if (now() - armedAt < 3000) { store.clear(); location.reload(); return; }
    armedAt = now(); b.textContent = 'Tap again to erase everything'; sfx.nope();
    setTimeout(() => { b.textContent = 'Reset progress'; }, 3000);
  };
  $('#achs').onclick = e => {
    const b = e.target.closest('.ach'); if (!b) return;
    const a = ACH.find(x => x.id === b.dataset.a);
    sfx.tap(); toast(S.ach[a.id] ? `${a.n}: ${a.d}` : a.d);
  };
}
function statVal(k) {
  switch (k) {
    case 'today': return dur(S.today.ms);
    case 'session': return dur(sessionMs);
    case 'total': return dur(S.timeMs);
    case 'meters': { const m = meters(); return m < 1000 ? `${m.toFixed(m < 10 ? 1 : 0)} m` : `${(m / 1000).toFixed(2)} km`; }
    case 'bestCombo': return '×' + S.bestCombo;
    default: return fmt(S[k] || 0);
  }
}
function renderMe() {
  const me = $('#me'); if (!$('#me-bar')) return;
  $$('[data-k]', me).forEach(b => { b.textContent = statVal(b.dataset.k); });
  const L = lvl();
  $('#me-prg').style.strokeDashoffset = String(100 - L.pct * 100);
  $('#me-lvl').textContent = `Level ${L.l}`;
  $('#me-title').textContent = L.title;
  $('#me-xp').textContent = `${fmt(L.into)} / ${fmt(L.need)}`;
  $('#me-bar').style.width = L.pct * 100 + '%';
}
function renderAchs(newId) {
  $('#achs').innerHTML = ACH.map(a => `<button class="ach${S.ach[a.id] ? '' : ' locked'}${a.id === newId ? ' new' : ''}" data-a="${a.id}"><span class="medal">${I(S.ach[a.id] ? a.i : 'lock')}</span>${S.ach[a.id] ? a.n : '???'}</button>`).join('');
  $('#ach-n').textContent = `${Object.keys(S.ach).length} / ${ACH.length}`;
}

// ---------- the break nudge (with the usual dark pattern) ----------
let nextNudge = 10 * 60e3;
function nudge() {
  const mins = Math.round(sessionMs / 60000);
  const m = html(`<div class="modal" role="dialog" aria-label="Break reminder"><div class="mcard"><span class="mic">${I('glass')}</span><h3>You've been here ${mins} minutes</h3><p>${fmt(sessionSeen)} cards and ${statVal('meters')} of scrolling. Take a break?</p><button class="btn primary" data-a="keep">Keep scrolling</button><button class="btn link" data-a="brk">Take a break</button></div></div>`);
  appEl.append(m); sfx.ding();
  m.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'keep' || a === 'stay') { m.remove(); sfx.pop(7); award(5, FW / 2, FH / 2); }
    else if (a === 'brk') { sfx.nope(); $('.mcard', m).innerHTML = `<span class="mic">${I('bell')}</span><h3>Are you sure?</h3><p>${ri(12, 40)} new posts and ${ri(3, 9)} notifications are waiting.</p><button class="btn primary" data-a="stay">Stay</button><button class="btn link" data-a="leave">Leave anyway</button>`; }
    else if (a === 'leave') {
      m.remove();
      const gr = html('<div class="grass"><b>Go touch grass.</b><p>This screen will wait for you. It always does.</p><button class="btn">I\'m back</button></div>');
      appEl.append(gr);
      $('button', gr).onclick = () => { gr.remove(); unlock('grass'); };
    }
  });
}

// ---------- navigation ----------
const TABS = ['home', 'reels', 'drops', 'activity', 'me'];
const SCR = { home: '#s-home', reels: '#s-reels', drops: '#s-drops', activity: '#s-activity', me: '#s-me' };
const SCROLLER = { home: feedSc, reels: reelsEl, drops: $('#drops-sc'), activity: $('#act-sc'), me: $('#me-sc') };
const PTRS = { home: PTR(feedSc, refreshFeed), activity: PTR($('#act-sc'), refreshActivity) };
const setDark = () => screenEl.classList.toggle('dark-ui', cur === 'reels' || !!sv);
function go(tab) {
  closeSheet(); hidePage('#pg-dm'); hidePage('#pg-chat'); chatC = null;
  if (sv) closeStory(true);
  if (tab === cur) {
    const sc = SCROLLER[tab];
    if (sc.scrollTop > 4) sc.scrollTo({ top: 0, behavior: 'smooth' });
    else if (PTRS[tab]) PTRS[tab].trigger();
    return;
  }
  $(SCR[cur]).classList.remove('on'); $(SCR[tab]).classList.add('on');
  $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  cur = tab;
  reelsEl.classList.toggle('idle', tab !== 'reels');
  if (tab === 'reels') {
    if (!reelsEl.children.length) appendReels(6);
    reelLast = now(); if (!reelRaf) reelRaf = requestAnimationFrame(reelTick);
  }
  if (tab === 'me') renderMe();
  if (tab === 'drops') { renderStreak(); renderEnergy(); }
  setDark(); sfx.tap(); haptic();
}
$('#tabbar').addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) go(b.dataset.tab); });
$('#pts').onclick = () => go('me');

function step(d) {
  if (cur === 'reels') { reelsEl.scrollBy({ top: d * reelsEl.clientHeight, behavior: 'smooth' }); return true; }
  if (cur !== 'home') return false;
  const top = feedSc.scrollTop, posts = $$('.post', feed);
  const target = d > 0 ? posts.find(p => p.offsetTop > top + 8) : posts.reverse().find(p => p.offsetTop < top - 8);
  feedSc.scrollTo({ top: target ? target.offsetTop : 0, behavior: 'smooth' });
  return true;
}
function likeCentered() {
  if (cur === 'reels' && curReel) { bigHeart(curReel); likeReel(curReel, true); return; }
  if (cur !== 'home') return;
  const mid = feedSc.getBoundingClientRect().top + feedSc.clientHeight * scale / 2;
  let best = null, bd = Infinity;
  visible.forEach(n => { const r = n.getBoundingClientRect(), d = Math.abs(r.top + r.height / 2 - mid); if (d < bd) { bd = d; best = n; } });
  if (best) { bigHeart($('.media', best)); doLike(best._p, $('.like', best), $('.lc', best), true); }
}
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k >= '1' && k <= '5') { go(TABS[+k - 1]); return; }
  switch (k.toLowerCase()) {
    case 'r': if (PTRS[cur]) PTRS[cur].trigger(); break;
    case 'n': pushNotif(); break;
    case 'l': likeCentered(); break;
    case 'j': case 'arrowdown': if (step(1)) e.preventDefault(); break;
    case 'k': case 'arrowup': if (step(-1)) e.preventDefault(); break;
    case ' ':
      if (cur === 'drops') { e.preventDefault(); pullLever(); }
      else if (cur === 'reels' && curReel) { e.preventDefault(); curReel.classList.toggle('held'); }
      break;
    case 'escape':
      if (sv) closeStory(); else if (sheet) closeSheet();
      else if (isOpen('#pg-chat')) $('#pg-chat .back').click(); else if (isOpen('#pg-dm')) hidePage('#pg-dm');
      break;
  }
});

// ---------- welcome ----------
function welcome() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const c = html(`<div class="welcome"><div class="w-logo">st<span class="i">ı<b class="tittle">1</b></span>m</div><p>No content. Only the hooks.</p><ul>
    <li><span class="hk">${I('down')}</span>Scroll. It never ends.</li>
    <li><span class="hk">${I('refresh')}</span>Pull down to refresh. Sometimes there's more.</li>
    <li><span class="hk pink">${IF('heart')}</span>Double-tap anything to like it.</li>
    <li><span class="hk red">${I('bell')}</span>Clear the red dots. They come back.</li>
    <li><span class="hk gold">${IF('bolt')}</span>Everything earns points.</li></ul>
    <button class="btn primary" id="w-go">Start scrolling</button>${ios && !standalone ? '<p class="w-tip">On iPhone, tap Share, then Add to Home Screen for the full-screen app.</p>' : ''}</div>`);
  let started = false;
  const start = () => { if (started) return; started = true; S.onboarded = true; save(); schedule(true); };
  openSheet('', c, '', start);
  $('#w-go', c).onclick = () => { closeSheet(); sfx.fresh(); haptic(); award(10, FW / 2, FH - 160); };
}

// ---------- clock, battery, session ----------
const batt0 = ri(64, 96);
function clock() {
  const d = new Date();
  $('#clock').textContent = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function refreshTimes() {
  $$('time[data-ts]').forEach(t => { const ts = +t.dataset.ts; t.textContent = t.hasAttribute('data-long') ? agoLong(ts) : ago(ts); });
}
let tickN = 0;
setInterval(() => {
  clock();
  if (document.hidden) return;
  S.timeMs += 1000; sessionMs += 1000; S.today.ms += 1000; tickN++;
  regen();
  if (cur === 'drops') { renderEnergy(); if (tickN % 30 === 0) renderStreak(); }
  if (cur === 'me') renderMe();
  const b = Math.max(4, batt0 - Math.floor(sessionMs / 40000)), bi = $('#batt'); // the battery drains while you scroll
  bi.style.width = b + '%'; bi.parentElement.classList.toggle('low', b <= 20);
  if (S.settings.nudges && sessionMs >= nextNudge && !$('.modal') && !$('.grass')) { nextNudge = sessionMs + 10 * 60e3; nudge(); }
  if (tickN % 5 === 0) save();
  if (tickN % 15 === 0) { queueCheck(); refreshTimes(); if (isOpen('#pg-dm')) renderDMs(); }
}, 1000);
function track(sc) {
  let last = sc.scrollTop;
  sc.addEventListener('scroll', () => { const t = sc.scrollTop; S.scrollPx += Math.abs(t - last); last = t; }, { passive: true });
}

// ---------- boot ----------
$$('i[data-i]').forEach(e => { e.innerHTML = I(e.dataset.i); });
layout();
addEventListener('resize', layout);
renderStories();
const first = Array.from({ length: 4 }, () => mkPost());
feed.append(...first); first.forEach(n => seenIO.observe(n));
Array.from({ length: 9 }, () => Date.now() - ri(2, 1800) * 60000).sort((a, b) => a - b)
  .forEach((ts, i) => pushNotif({ seed: true, ts, read: i < 6, type: pickType(true) }));
buildDrops(); buildMe(); renderAchs(); renderStreak(); renderEnergy();
$('#pts-n').textContent = nf.format(S.pts); renderRing();
updateBadges();
[feedSc, reelsEl, $('#act-sc'), $('#drops-sc'), $('#me-sc'), $('#dm-list'), $('#chat')].forEach(track);
clock(); refreshTimes();
reelsEl.classList.add('idle');
if (!S.onboarded) setTimeout(welcome, 350); else schedule(true);
regen();
pillLoop();
queueCheck();
})();
