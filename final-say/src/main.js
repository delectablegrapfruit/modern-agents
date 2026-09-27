// Boots the studio and routes between the menu and the three modes: Audition Night, Tournament, Swipe.
import { AudioEngine } from './audio.js';
import { Audience } from './audience.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';
import { Look } from './look.js';
import { renderSummary } from './results.js';
import { Show } from './show.js';
import { Studio } from './studio.js';
import { Swipe } from './swipe.js';
import { Tournament } from './tournament.js';
import { World } from './world.js';
import { JUDGES } from './data.js';
import { Clock, rng, storage } from './util.js';

const params = new URLSearchParams(location.search);
const touchFirst = matchMedia('(pointer: coarse)').matches;
const defaults = { voices: 'babble', volume: 0.8, optionTimer: 'normal', acts: 6, quality: touchFirst ? 'low' : 'high', hints: true, muted: false, textSpeed: 1 };
const settings = { ...defaults, ...storage.get('finalsay.settings', {}) };
const saveSettings = () => storage.set('finalsay.settings', settings);
const speed = Number(params.get('speed')) || 1;
if (params.get('quality')) settings.quality = params.get('quality');

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

if (!webglAvailable()) {
  document.body.innerHTML = '<p class="noscript">Final Say needs WebGL, which this browser has turned off.</p>';
  throw new Error('WebGL unavailable');
}

const hud = new Hud();
hud.showHints = settings.hints;
const studio = new Studio(document.getElementById('scene'), settings);
const audio = new AudioEngine(settings);
const audience = new Audience(studio.scene, audio, { density: settings.quality === 'low' ? 0.7 : 1 });
const fx = new Effects(studio.scene);
const look = new Look(studio.camera, studio.canvas, studio);
const clock = new Clock();
const world = new World({ studio, audience, audio, fx, hud, look, clock, settings });
world.setJudges(rng.shuffle(JUDGES).slice(0, 2));

let mode = 'menu';
let active = null; // the running Show, Tournament or Swipe
let paused = false;

const show = new Show(world, (summary) => {
  hud.setMode('menu');
  renderSummary(hud, summary, { again: () => startShow(), menu: () => toMenu() });
});
const tournament = new Tournament(world, { menu: () => toMenu() });
const swipe = new Swipe(world, { menu: () => toMenu(), tournament: (entries) => tournament.setup(entries) });

function toMenu() {
  if (active) active.stop();
  active = null;
  mode = 'menu';
  paused = false;
  hud.setMode('menu');
  hud.showScreen('screen-title');
  look.glance = null;
  look.resetFocus();
  look.recenter();
  look.drift = 1;
  look.dragEnabled = true;
  studio.wall.show({ kind: 'logo' });
  studio.clearX();
  audience.setMood(0.2, 0.5);
}

function startShow() {
  if (active) active.stop();
  audio.unlock();
  hud.hideScreens();
  mode = 'show';
  active = show;
  look.drift = 0;
  look.recenter();
  show.start({ acts: Number(settings.acts) || 6, types: params.get('acts') ? params.get('acts').split(',') : null });
}

hud.on('play', () => startShow());
hud.on('tournament', () => {
  audio.unlock();
  tournament.setup();
});
hud.on('swipe', () => {
  audio.unlock();
  swipe.setup();
});
hud.on('menu', () => toMenu());
hud.on('option', (i) => active && active.slots && active.slots.choose(i));
hud.on('buzz', () => mode === 'show' && show.buzz('player'));
hud.on('golden', () => mode === 'show' && show.golden());
hud.on('yes', () => mode === 'show' && show.decide(true));
hud.on('no', () => mode === 'show' && show.decide(false));
hud.on('lookHold', (down) => (look.glance = down ? 'back' : null));
hud.on('mute', () => {
  settings.muted = !settings.muted;
  audio.setVolume(settings.muted ? 0 : settings.volume);
  hud.setMuted(settings.muted);
  saveSettings();
});
hud.on('pause', () => setPaused(!paused));
hud.on('resume', () => setPaused(false));
hud.on('quit', () => toMenu());

// Tournament and swipe route their own commands.
for (const name of ['left', 'right', 'bracket', 'close-bracket', 't-start', 't-random', 't-clear']) hud.on(name, (el) => tournament.command(name, el));
for (const name of ['keep', 'nope', 'star', 'undo', 'finish', 's-sample', 's-start-text']) hud.on(name, (el) => swipe.command(name, el));

tournament.onStart = () => {
  if (active) active.stop();
  mode = 'tournament';
  active = tournament;
  look.drift = 0;
};
swipe.onStart = () => {
  if (active) active.stop();
  mode = 'swipe';
  active = swipe;
  look.drift = 0;
};

// A menu, setup or results screen is up (the game underneath isn't being played).
const screenUp = () => [...document.querySelectorAll('.screen')].some((el) => !el.hidden && el.id !== 'screen-pause');

function setPaused(p) {
  if (mode === 'menu' || (p && screenUp())) return;
  paused = p;
  if (p) hud.showScreen('screen-pause');
  else hud.hideScreens();
  if (audio.ctx) (p ? audio.ctx.suspend() : audio.ctx.resume()).catch(() => {});
}

// --- Settings form ---
const bindSetting = (id, key, parse = (v) => v) => {
  const el = document.getElementById(id);
  if (el.type === 'checkbox') el.checked = !!settings[key];
  else el.value = String(settings[key]);
  el.addEventListener('change', () => {
    settings[key] = el.type === 'checkbox' ? el.checked : parse(el.value);
    saveSettings();
    if (key === 'volume') audio.setVolume(settings.muted ? 0 : settings.volume);
    if (key === 'hints') hud.showHints = settings.hints;
    if (key === 'quality') location.reload();
  });
};
bindSetting('set-voices', 'voices');
bindSetting('set-volume', 'volume', Number);
bindSetting('set-timer', 'optionTimer');
bindSetting('set-acts', 'acts', Number);
bindSetting('set-quality', 'quality');
bindSetting('set-hints', 'hints');
hud.setMuted(settings.muted);
if (settings.muted) audio.setVolume(0);

// --- Keyboard ---
const held = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  const k = e.key;
  if (k === 'Escape') {
    const bracket = document.getElementById('bracket');
    if (!bracket.hidden) bracket.hidden = true;
    else setPaused(!paused);
    return;
  }
  if (mode === 'menu' || paused || screenUp()) return;
  audio.unlock();
  if (held.has(k)) return;
  held.add(k);
  if (k >= '1' && k <= '4') active && active.slots && active.slots.choose(Number(k) - 1);
  else if (k === ' ') {
    e.preventDefault();
    look.glance = 'back';
  } else if (k === 'q' || k === 'Q') look.glance = 'left';
  else if (k === 'e' || k === 'E') look.glance = 'right';
  else if (k === 'c' || k === 'C') look.recenter();
  else if (k === 'm' || k === 'M') hud.emit('mute');
  else if (mode === 'show') {
    if (k === 'x' || k === 'X') show.buzz('player');
    else if (k === 'g' || k === 'G') show.golden();
    else if (k === 'y' || k === 'Y') show.decide(true);
    else if (k === 'n' || k === 'N') show.decide(false);
  } else if (active && active.key) active.key(k, e);
});
window.addEventListener('keyup', (e) => {
  held.delete(e.key);
  if (e.key === ' ' || e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') look.glance = null;
});
window.addEventListener('blur', () => {
  held.clear();
  look.glance = null;
});
document.addEventListener('pointerdown', () => audio.unlock(), { once: false, passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode !== 'menu' && !paused) setPaused(true);
});

// --- Main loop ---
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (paused) dt = 0;
  dt *= speed;
  const t = clock.time;
  clock.update(dt);
  if (active && active.update) active.update(dt, t);
  world.update(dt, t);
  audience.update(dt, t, look.facingAudience);
  audio.update(dt);
  fx.update(dt);
  look.update(dt, t);
  studio.update(dt, t);
  hud.crowdRead(mode !== 'menu' && look.facingAudience > 0.6 ? audience.read() : null);
  studio.render();
}

toMenu();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => studio.wall.show({ kind: 'logo' }));
requestAnimationFrame(frame);

// Test and debugging hook.
window.__finalSay = { world, show, tournament, swipe, settings, clock, audience, studio, start: startShow, look, get mode() { return mode; } };
if (params.get('autostart') === 'show') startShow();
