// The broadcast graphics over the 3D view: captions, options, lower thirds, buttons, and the menu screens.
import { escapeHtml } from './util.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export class Hud {
  constructor() {
    this.root = $('#hud');
    this.handlers = {};
    this.sub = $('#subtitle');
    this.subWho = $('.who', this.sub);
    this.subLine = $('.line', this.sub);
    this.optButtons = $$('#options .opt');
    this.optLife = this.optButtons.map((b) => $('.life', b));
    this.options = [null, null, null, null];
    this.subTimer = null;
    this.hintTimer = null;
    this.showHints = true;

    // Anything with data-cmd anywhere on the page is a command.
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-cmd]');
      if (!el || el.dataset.cmd === 'look') return;
      this.emit(el.dataset.cmd, el);
    });
    for (const b of this.optButtons) b.addEventListener('click', () => this.emit('option', Number(b.dataset.i)));
    // The look button works by holding it.
    const look = $('.act-btn.look');
    const down = (e) => {
      e.preventDefault();
      look.classList.add('held');
      this.emit('lookHold', true);
    };
    const up = () => {
      if (!look.classList.contains('held')) return;
      look.classList.remove('held');
      this.emit('lookHold', false);
    };
    look.addEventListener('pointerdown', down);
    look.addEventListener('pointerup', up);
    look.addEventListener('pointerleave', up);
    look.addEventListener('pointercancel', up);
    $('#btn-sound').addEventListener('click', () => this.emit('mute'));
    $('#btn-pause').addEventListener('click', () => this.emit('pause'));
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }
  emit(name, ...args) {
    const fn = this.handlers[name];
    if (fn) fn(...args);
  }

  // --- Screens ---

  showScreen(id) {
    for (const s of $$('.screen')) s.hidden = s.id !== id;
  }
  hideScreens() {
    for (const s of $$('.screen')) s.hidden = true;
  }
  setMode(mode) {
    this.mode = mode;
    this.root.hidden = mode === 'menu';
    const show = mode === 'show';
    $('#ticker').hidden = !show;
    $('#options').hidden = mode === 'swipe';
    $('#swipe-ui').hidden = mode !== 'swipe';
    $('#pick').hidden = mode !== 'tournament';
    $('#actions').hidden = mode === 'swipe';
    $('#final-call').hidden = true;
    $('#votes').innerHTML = '';
    this.renderOptions([null, null, null, null]);
    this.lowerThird(null);
    this.subtitleDone(true);
    this.setActions(null);
    this.crowdRead(null);
    this.prompt(null);
    $('#hint').hidden = true;
  }
  setInfo(text) {
    $('#mode-info').textContent = text;
  }
  setActCounter(i, n) {
    this.setInfo(i ? `Act ${i} of ${n}` : `${n} acts tonight`);
  }
  setMuted(muted) {
    $('#btn-sound').classList.toggle('muted', muted);
    $('#btn-sound').setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  }

  // --- Captions ---

  subtitle(name, text, color = '#fff4dc', hold) {
    clearTimeout(this.subTimer);
    this.sub.classList.remove('faded', 'cut');
    this.subWho.textContent = name;
    this.subWho.style.background = color;
    this.subLine.textContent = text;
    if (hold) this.subTimer = setTimeout(() => this.sub.classList.add('faded'), hold * 1000);
  }
  subtitleDone(now) {
    clearTimeout(this.subTimer);
    if (now) this.sub.classList.add('faded');
    else this.subTimer = setTimeout(() => this.sub.classList.add('faded'), 1400);
  }
  subtitleCut() {
    this.sub.classList.add('cut');
    this.subtitleDone();
  }

  // --- Options ---

  renderOptions(list) {
    this.options = list;
    list.forEach((o, i) => {
      const b = this.optButtons[i];
      b.classList.toggle('empty', !o);
      b.disabled = !o;
      if (!o) return;
      $('.text', b).textContent = o.text;
      b.dataset.tone = o.tone || '';
      if (o.fresh) {
        b.classList.remove('fresh');
        void b.offsetWidth;
        b.classList.add('fresh');
      }
    });
  }
  optionTimers(fracs) {
    fracs.forEach((f, i) => {
      const bar = this.optLife[i];
      if (!bar) return;
      bar.style.transform = `scaleX(${f})`;
      bar.classList.toggle('low', f < 0.25);
    });
  }
  flashOption(i) {
    const b = this.optButtons[i];
    if (!b) return;
    b.classList.remove('said');
    void b.offsetWidth;
    b.classList.add('said');
  }

  // --- Contestant caption ---

  lowerThird(c) {
    const el = $('#lower-third');
    if (!c) {
      el.hidden = true;
      this.ltKnown = null;
      return;
    }
    const k = c.known;
    const v = c.vars;
    const facts = [];
    if (!c.group) facts.push(['Age', k.has('age') ? v.age : null]);
    facts.push(['From', k.has('from') ? v.from : null]);
    if (!c.group) facts.push(['Job', k.has('job') ? v.job.replace(/^(a|an) /, '') : null]);
    if (c.group) facts.push(['Members', k.has('name') ? String(c.size) : null]);
    facts.push(['Act', k.has('act') ? c.label : null]);
    if (k.has('experience')) facts.push(['Doing it', v.exp]);
    if (k.has('dream')) facts.push(['Dream', v.dream.replace(/\.$/, '')]);
    const prev = this.ltKnown || new Set();
    $('.lt-act', el).textContent = k.has('act') ? c.label : 'New act';
    $('.lt-name', el).textContent = k.has('name') ? c.name : '??????';
    $('.lt-facts', el).innerHTML = facts
      .map(([label, value]) => `<dt>${label}</dt><dd class="${value ? (prev.has(label) ? '' : 'new') : 'unknown'}">${value ? escapeHtml(value) : '???'}</dd>`)
      .join('');
    this.ltKnown = new Set(facts.filter((f) => f[1]).map((f) => f[0]));
    el.hidden = false;
  }

  // --- Buttons ---

  setActions(kind, opts = {}) {
    const actions = $('#actions');
    const buzz = $('.act-btn.buzz');
    const golden = $('.act-btn.golden');
    buzz.hidden = kind !== 'perform';
    golden.hidden = !(kind === 'perform' || kind === 'ruling') || !opts.golden;
    actions.classList.toggle('quiet', !kind);
    $('#final-call').hidden = kind !== 'ruling';
  }
  setVotes(judges) {
    $('#votes').innerHTML = judges
      .filter((j) => j.vote)
      .map((j) => `<div class="vote ${j.vote}"><span>${escapeHtml(j.def.short)}</span><b>${j.vote === 'yes' ? 'Yes' : 'No'}</b></div>`)
      .join('');
  }
  setViewers(v, trend) {
    $('#viewers').textContent = `${v.toFixed(1)}M`;
    const t = $('#trend');
    const up = trend > 0.05;
    const down = trend < -0.05;
    t.textContent = up ? '▲' : down ? '▼' : '';
    t.className = `trend ${up ? 'up' : down ? 'down' : ''}`;
  }

  // --- Messages ---

  hint(text, seconds = 6) {
    if (!this.showHints) return;
    const el = $('#hint');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => (el.hidden = true), seconds * 1000);
  }
  prompt(text) {
    const el = $('#prompt');
    el.hidden = !text;
    if (text) el.textContent = text;
  }
  bigStamp(text, kind) {
    const el = $('#stamp');
    el.textContent = text;
    el.className = `stamp ${kind}`;
    el.hidden = false;
    clearTimeout(this.stampTimer);
    this.stampTimer = setTimeout(() => (el.hidden = true), 1700);
  }
  feedback(label, delta) {
    if (!this.showHints) return;
    const box = $('#feedback');
    const chip = document.createElement('div');
    chip.className = `chip ${delta > 0 ? 'up' : 'down'}`;
    chip.textContent = `${label} ${delta > 0 ? '▲' : '▼'}`;
    box.prepend(chip);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => chip.remove(), 2500);
  }
  crowdRead(read) {
    const el = $('#crowd-read');
    if (!read) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    if (el.dataset.text !== read.text) {
      el.dataset.text = read.text;
      $('b', el).textContent = read.text;
      el.className = `crowd-read ${read.tone}`;
    }
  }

  // --- Tournament and swipe ---

  setPick(left, right, enabled) {
    const pick = $('#pick');
    $('.left .name', pick).textContent = left || '';
    $('.right .name', pick).textContent = right || '';
    pick.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }
  swipeStatus({ label, sub, index, total, keep, nope, star }) {
    $('#swipe-label').textContent = label || '';
    $('#swipe-sub').textContent = sub || '';
    $('#swipe-bar').style.width = `${total ? (index / total) * 100 : 0}%`;
    $('#count-keep').textContent = keep;
    $('#count-nope').textContent = nope;
    $('#count-star').textContent = star;
    $('#count-left').textContent = `${Math.min(index + 1, total)} of ${total}`;
  }
  swipeStamp(kind, strength) {
    const el = $('#swipe-stamp');
    if (!kind || strength < 0.15) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.className = `swipe-stamp ${kind}`;
    el.textContent = kind === 'keep' ? 'Keep' : 'Nope';
    el.style.opacity = Math.min(1, strength * 1.4);
  }
}
