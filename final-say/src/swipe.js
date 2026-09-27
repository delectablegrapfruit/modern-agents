// Swipe: sort a pile — photos, a folder, a list file or pasted lines — one item at a time. Keep, bin or star each
// one; the room reacts, your picks are saved in this browser as you go, and you leave with the kept list.
import * as THREE from 'three';
import { SWIPE_QUIPS } from './data.js';
import { MARK, STAGE_Y } from './studio.js';
import { copyText, download } from './tournament.js';
import { clamp, escapeHtml, rng, storage } from './util.js';

const $ = (s) => document.querySelector(s);
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|heic|heif|tiff?)$/i;
const SPOT = new THREE.Vector3(0, STAGE_Y + 1.65, MARK.z + 1.8);
const MAX_W = 3.4;
const MAX_H = 2.4;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// A small CSV/TSV reader that understands quoted fields.
export function parseDelimited(text, delim) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

// Turns the text of a .txt, .csv, .tsv or .json file into items.
export function itemsFromText(name, text) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.json')) {
    let data = JSON.parse(text);
    if (!Array.isArray(data) && data && typeof data === 'object') data = Object.values(data).find(Array.isArray) || Object.entries(data).map(([k, v]) => ({ name: k, value: v }));
    return data.map((d, i) => {
      if (typeof d !== 'object' || d === null) return { key: `${i}:${String(d)}`, label: String(d), kind: 'text' };
      const labelKey = ['name', 'title', 'label', 'id'].find((k) => typeof d[k] === 'string' || typeof d[k] === 'number');
      const label = labelKey ? String(d[labelKey]) : String(Object.values(d).find((v) => typeof v === 'string') ?? JSON.stringify(d));
      const sub = Object.entries(d)
        .filter(([k]) => k !== labelKey)
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(' · ');
      return { key: `${i}:${label}`, label, sub, kind: 'text', raw: d };
    });
  }
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
    const rows = parseDelimited(text, lower.endsWith('.tsv') ? '\t' : ',');
    const [head, ...body] = rows;
    return body.map((r, i) => ({
      key: `${i}:${r[0]}`,
      label: r[0] || `Row ${i + 1}`,
      sub: head
        .slice(1)
        .map((h, k) => (r[k + 1] ? `${h}: ${r[k + 1]}` : ''))
        .filter(Boolean)
        .slice(0, 4)
        .join(' · '),
      kind: 'text',
      raw: r,
      head,
    }));
  }
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => ({ key: `${i}:${l}`, label: l, kind: 'text' }));
}

// Twelve made-up holiday snaps, some of them not very good, so the mode can be tried without your own photos.
function samplePhotos() {
  const scenes = [
    ['Beach, day two', 'sunset', 0, 0],
    ['Harbour at dawn', 'sea', 0, 0],
    ['Thumb over the lens', 'thumb', 0, 0],
    ['Hills from the train', 'hills', 0.6, 0],
    ['Ice cream, before', 'sunny', 0, 0],
    ['Wonky horizon', 'sea', 0, 0.2],
    ['Night market', 'night', 0, 0],
    ['Castle in the fog', 'fog', 0, 0],
    ['Blurry seagull', 'sunny', 3, 0],
    ['Lighthouse', 'lighthouse', 0, 0],
    ['Sunset again', 'sunset', 0, 0.05],
    ['The car park', 'grey', 0, 0],
  ];
  return scenes.map(([label, kind, blur, tilt], i) => {
    const c = document.createElement('canvas');
    c.width = 960;
    c.height = i % 5 === 3 ? 1280 : 640;
    const g = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    g.save();
    g.filter = blur ? `blur(${blur * 3}px)` : 'none';
    g.translate(W / 2, H / 2);
    g.rotate(tilt);
    g.translate(-W / 2, -H / 2);
    const skies = {
      sunset: ['#2b1055', '#ff7e5f', '#feb47b'],
      sea: ['#8fd3f4', '#c2e9fb', '#e0f7ff'],
      sunny: ['#4facfe', '#8fd3f4', '#dff6ff'],
      hills: ['#89f7fe', '#b5f0ff', '#f0fcff'],
      night: ['#0b0a23', '#1d1850', '#3a2d6b'],
      fog: ['#9aa5ad', '#c4ccd1', '#dfe4e7'],
      lighthouse: ['#355c7d', '#6c8fb3', '#c3d6e8'],
      grey: ['#8a8d91', '#a3a6aa', '#bfc1c4'],
      thumb: ['#4facfe', '#8fd3f4', '#dff6ff'],
    }[kind];
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, skies[0]);
    grad.addColorStop(0.55, skies[1]);
    grad.addColorStop(1, skies[2]);
    g.fillStyle = grad;
    g.fillRect(-W, -H, W * 3, H * 3);
    const horizon = H * 0.62;
    if (kind === 'sunset' || kind === 'sunny') {
      g.fillStyle = kind === 'sunset' ? '#ffd27f' : '#fff6c9';
      g.beginPath();
      g.arc(W * 0.68, horizon - H * 0.12, H * 0.1, 0, Math.PI * 2);
      g.fill();
    }
    if (kind === 'night') {
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `hsl(${rng.range(0, 360)}, 90%, 65%)`;
        g.beginPath();
        g.arc(rng.range(0, W), rng.range(horizon - 60, horizon + 30), rng.range(3, 8), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = kind === 'hills' ? '#5a9e4b' : kind === 'grey' ? '#55585c' : kind === 'night' ? '#141028' : '#1d6fa3';
    g.beginPath();
    g.moveTo(-W, horizon);
    for (let x = -W; x <= W * 2; x += 40) g.lineTo(x, horizon + (kind === 'hills' ? Math.sin(x / 140) * 50 - 40 : Math.sin(x / 60) * 4));
    g.lineTo(W * 2, H * 2);
    g.lineTo(-W, H * 2);
    g.fill();
    if (kind === 'sunset' || kind === 'sunny' || kind === 'sea') {
      g.fillStyle = '#f2d8a7';
      g.fillRect(-W, H * 0.82, W * 3, H);
    }
    if (kind === 'lighthouse') {
      g.fillStyle = '#f4f4f4';
      g.fillRect(W * 0.46, horizon - H * 0.34, W * 0.06, H * 0.36);
      g.fillStyle = '#c0392b';
      g.fillRect(W * 0.46, horizon - H * 0.24, W * 0.06, H * 0.05);
      g.fillStyle = '#ffe08a';
      g.fillRect(W * 0.455, horizon - H * 0.38, W * 0.07, H * 0.05);
    }
    if (kind === 'fog') {
      g.fillStyle = '#6d7479';
      g.fillRect(W * 0.3, horizon - H * 0.25, W * 0.4, H * 0.25);
      for (const x of [0.3, 0.42, 0.56, 0.66]) g.fillRect(W * x, horizon - H * 0.32, W * 0.04, H * 0.08);
      g.fillStyle = 'rgba(220,226,230,0.6)';
      g.fillRect(-W, 0, W * 3, H);
    }
    if (label.includes('seagull') || label.includes('Ice')) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(W * 0.4, H * 0.35, 60, 20, 0.2, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    if (kind === 'thumb') {
      const tg = g.createRadialGradient(W * 0.1, H * 0.9, 20, W * 0.1, H * 0.9, H * 0.7);
      tg.addColorStop(0, '#e8b89a');
      tg.addColorStop(0.7, '#c98d6f');
      tg.addColorStop(1, 'rgba(201,141,111,0)');
      g.fillStyle = tg;
      g.fillRect(0, 0, W, H);
    }
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = '600 22px system-ui, sans-serif';
    g.fillText(`IMG_${2040 + i}`, 20, H - 20);
    return { key: `sample-${i}`, label: `IMG_${2040 + i}.jpg`, sub: label, kind: 'image', canvas: c };
  });
}

export class Swipe {
  constructor(world, nav) {
    this.w = world;
    this.nav = nav;
    this.onStart = null;
    this.items = [];
    this.cache = new Map();
    this.active = false;
    this.cards = [];
    $('#s-photos').addEventListener('change', (e) => this.fromFiles([...e.target.files], 'Photos').then(() => (e.target.value = '')));
    $('#s-folder').addEventListener('change', (e) => this.fromFiles([...e.target.files], 'Folder').then(() => (e.target.value = '')));
    $('#s-file').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const items = itemsFromText(f.name, await f.text());
        this.prepare(items, f.name);
      } catch (err) {
        this.setupNote(`Couldn’t read ${f.name}: ${err.message}. Lists work as one item per line, CSV with a header row, or a JSON array.`);
      }
    });
    this.bindDrag();
  }

  setup() {
    this.w.hud.showScreen('screen-swipe');
    $('#s-resume').hidden = true;
  }
  setupNote(text) {
    const el = $('#s-resume');
    el.hidden = false;
    el.innerHTML = `<span>${escapeHtml(text)}</span>`;
  }

  async fromFiles(files, source) {
    const images = files.filter((f) => /^image\//.test(f.type) || IMAGE_EXT.test(f.name));
    if (!images.length) {
      this.setupNote(`No photos found in what you picked (${files.length} file${files.length === 1 ? '' : 's'}).`);
      return;
    }
    images.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }));
    const items = images.map((f) => ({ key: `${f.webkitRelativePath || f.name}|${f.size}|${f.lastModified}`, label: f.name, sub: f.webkitRelativePath ? f.webkitRelativePath.split('/').slice(0, -1).join('/') : `${(f.size / 1048576).toFixed(1)} MB`, kind: 'image', file: f }));
    this.prepare(items, source === 'Folder' && images[0].webkitRelativePath ? images[0].webkitRelativePath.split('/')[0] : `${images.length} photos`);
  }

  command(name) {
    if (name === 's-sample') this.prepare(samplePhotos(), 'Sample photos');
    else if (name === 's-start-text') {
      const items = itemsFromText('pasted.txt', $('#s-text').value);
      if (!items.length) {
        this.setupNote('Paste at least one line, or pick photos or a file above.');
        return;
      }
      this.prepare(items, 'Pasted list');
    } else if (name === 'keep') this.decide('keep');
    else if (name === 'nope') this.decide('nope');
    else if (name === 'star') this.decide('star');
    else if (name === 'undo') this.undo();
    else if (name === 'finish') this.finish();
  }

  key(k) {
    if (k === 'ArrowRight' || k === 'd' || k === 'D') this.decide('keep');
    else if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.decide('nope');
    else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 's' || k === 'S') this.decide('star');
    else if (k === 'z' || k === 'Z' || k === 'Backspace' || k === 'ArrowDown') this.undo();
    else if (k === 'Enter') this.finish();
  }

  // Checks for saved progress on this exact set of items before starting.
  prepare(items, name) {
    const sig = hash(`${items.length}|${items.slice(0, 400).map((i) => i.key).join('\n')}`);
    const saved = storage.get(`finalsay.swipe.${sig}`, null);
    const decided = saved ? Object.keys(saved.decisions || {}).length : 0;
    if (saved && decided > 0 && decided < items.length) {
      const el = $('#s-resume');
      el.hidden = false;
      el.innerHTML = `<span>You’ve already sorted <b>${decided} of ${items.length}</b> in “${escapeHtml(name)}”.</span><button type="button" class="go" id="s-continue">Carry on</button><button type="button" class="ghost" id="s-over">Start over</button>`;
      el.querySelector('#s-continue').onclick = () => this.begin(items, name, sig, saved.decisions);
      el.querySelector('#s-over').onclick = () => this.begin(items, name, sig, {});
      return;
    }
    this.begin(items, name, sig, {});
  }

  begin(items, name, sig, decisions) {
    const w = this.w;
    if (this.onStart) this.onStart();
    this.items = items;
    this.name = name;
    this.sig = sig;
    this.decisions = { ...decisions };
    this.history = [];
    this.active = true;
    this.index = this.nextUndecided(0);
    this.sinceMilestone = 0;
    w.hud.hideScreens();
    w.hud.setMode('swipe');
    w.hud.setInfo(name);
    w.look.dragEnabled = false;
    w.look.recenter();
    w.audience.setMood(0.3, 0.6);
    w.studio.mood.energy = 0.35;
    const [a, b] = w.studio.placards;
    this.cards = [a, b];
    for (const p of this.cards) p.group.visible = false;
    this.current = null;
    if (!this.hinted) {
      w.hud.hint('Swipe or press → to keep, ← to bin, ↑ to star, Z to undo. Your picks are saved as you go.', 7);
      this.hinted = true;
    }
    this.save();
    this.showCurrent();
  }

  stop() {
    this.active = false;
    for (const p of this.cards) {
      p.group.visible = false;
      p.group.rotation.set(0, 0, 0);
    }
    this.w.look.dragEnabled = true;
    this.w.look.resetFocus();
    this.w.hud.swipeStamp(null);
    for (const [, v] of this.cache) if (v.url) URL.revokeObjectURL(v.url);
    this.cache.clear();
    if (this.resultUrls) for (const u of this.resultUrls) URL.revokeObjectURL(u);
    this.resultUrls = null;
  }

  nextUndecided(from) {
    let i = from;
    while (i < this.items.length && this.decisions[this.items[i].key]) i++;
    return i;
  }
  counts() {
    const c = { keep: 0, nope: 0, star: 0 };
    for (const v of Object.values(this.decisions)) c[v]++;
    return c;
  }
  save() {
    storage.set(`finalsay.swipe.${this.sig}`, { name: this.name, total: this.items.length, decisions: this.decisions, updated: Date.now() });
  }

  // --- Loading ---
  async image(item) {
    if (item.canvas) return item.canvas;
    const hit = this.cache.get(item.key);
    if (hit) return hit.promise;
    const url = URL.createObjectURL(item.file);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    const promise = img
      .decode()
      .then(() => img)
      .catch(() => null);
    this.cache.set(item.key, { url, promise });
    // Keep the cache small: forget the oldest entries.
    while (this.cache.size > 8) {
      const [k, v] = this.cache.entries().next().value;
      URL.revokeObjectURL(v.url);
      this.cache.delete(k);
    }
    return promise;
  }

  async showCurrent(from = 'back') {
    const w = this.w;
    const total = this.items.length;
    const c = this.counts();
    if (this.index >= total) {
      this.updateStatus();
      this.finish();
      return;
    }
    const item = this.items[this.index];
    const token = (this.showToken = {});
    const card = this.cards.find((p) => p !== (this.current && this.current.card)) || this.cards[0];
    let img = null;
    if (item.kind === 'image') img = await this.image(item);
    if (token !== this.showToken || !this.active) return;
    if (item.kind === 'image' && !img) card.showEntry({ text: 'This photo can’t be shown here', sub: item.label }, MAX_W, MAX_H);
    else card.showEntry(img ? { image: img } : { text: item.label, sub: item.sub }, MAX_W, MAX_H);
    card.group.position.copy(SPOT);
    card.group.rotation.set(0, 0, 0);
    card.glow.material.opacity = 0;
    card.anim = { kind: 'enter', t: 0, from };
    this.current = { item, card };
    this.fitCamera(card);
    this.updateStatus();
    w.studio.wall.show({ kind: 'title', title: `${Math.min(this.index + 1, total)} / ${total}`, sub: `KEPT ${c.keep + c.star} · BINNED ${c.nope}` });
    // Warm up the next photos.
    for (let k = 1; k <= 2; k++) {
      const next = this.items[this.nextUndecided(this.index + k)];
      if (next && next.kind === 'image') this.image(next);
    }
  }

  fitCamera(card) {
    const w = this.w;
    const cam = w.studio.camera;
    const dist = w.look.camera.position.distanceTo(SPOT);
    const hNeed = (2 * Math.atan((card.h / 2 + 0.25) / dist) * 180) / Math.PI / 0.72;
    const wNeed = 2 * Math.atan((card.w / 2 + 0.25) / dist);
    const vFromW = ((2 * Math.atan(Math.tan(wNeed / 2) / cam.aspect)) * 180) / Math.PI / 0.85;
    w.look.setFocus(SPOT.clone().add(new THREE.Vector3(0, -0.12, 0)), clamp(Math.max(hNeed, vFromW), 18, 80));
  }

  updateStatus() {
    const c = this.counts();
    const item = this.items[Math.min(this.index, this.items.length - 1)];
    this.w.hud.swipeStatus({ label: this.index < this.items.length ? item.label : 'All done', sub: this.index < this.items.length ? item.sub : '', index: Object.keys(this.decisions).length, total: this.items.length, keep: c.keep, nope: c.nope, star: c.star });
  }

  decide(kind, fromDrag = false) {
    if (!this.active || !this.current || this.index >= this.items.length) return;
    const w = this.w;
    const { item, card } = this.current;
    this.decisions[item.key] = kind;
    this.history.push({ index: this.index, key: item.key, kind });
    this.save();
    card.anim = { kind, t: 0, x: card.group.position.x - SPOT.x, rz: card.group.rotation.z };
    this.current = null;
    w.hud.swipeStamp(null);
    const A = w.audience;
    if (kind === 'keep') {
      w.audio.sfx('swipeYes');
      A.react('clap', 0.35);
      A.nudge(0.02, 0.01);
    } else if (kind === 'nope') {
      w.audio.sfx('swipeNo');
      if (rng.chance(0.25)) A.react('aww', 0.3);
    } else {
      w.audio.sfx('sparkle');
      A.react('cheer', 0.6);
      w.fx.sparkle(SPOT.clone(), 18);
    }
    // Now and then a judge has an opinion.
    if (rng.chance(0.14) && !w.speech.busy) {
      const j = rng.int(0, 1);
      w.judgeSay(j, rng.pick(SWIPE_QUIPS[kind === 'star' ? 'star' : kind === 'keep' ? 'yes' : 'no'])).catch(() => {});
    }
    this.sinceMilestone++;
    const done = Object.keys(this.decisions).length;
    if (done % 25 === 0) {
      A.react('cheer', 0.7);
      w.studio.mood.flash = 0.6;
      w.hud.bigStamp(`${done}!`, 'gold');
    }
    this.index = this.nextUndecided(this.index + 1);
    this.showCurrent(fromDrag ? 'drag' : 'back');
  }

  undo() {
    if (!this.active) return;
    const last = this.history.pop();
    if (!last) return;
    delete this.decisions[last.key];
    this.save();
    this.w.audio.sfx('undo');
    if (this.current) this.current.card.group.visible = false;
    this.current = null;
    this.index = last.index;
    this.showCurrent('undo');
  }

  bindDrag() {
    const el = this.w.studio.canvas;
    let start = null;
    el.addEventListener('pointerdown', (e) => {
      if (!this.active || !this.current) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      this.dragX = 0;
      this.dragY = 0;
    });
    el.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id || !this.current) return;
      const W = el.clientWidth;
      this.dragX = (e.clientX - start.x) / W;
      this.dragY = (e.clientY - start.y) / el.clientHeight;
      const card = this.current.card;
      card.group.position.x = SPOT.x + this.dragX * 6;
      card.group.position.y = SPOT.y - Math.max(-0.4, Math.min(0.4, this.dragY * 2));
      card.group.rotation.z = -this.dragX * 0.5;
      const up = -this.dragY > 0.18 && Math.abs(this.dragX) < 0.12;
      this.w.hud.swipeStamp(up ? null : this.dragX > 0 ? 'keep' : 'nope', Math.abs(this.dragX) * 3);
    });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) return;
      start = null;
      if (!this.current) return;
      if (this.dragX > 0.18) this.decide('keep', true);
      else if (this.dragX < -0.18) this.decide('nope', true);
      else if (this.dragY < -0.2) this.decide('star', true);
      else {
        this.current.card.anim = { kind: 'spring', t: 0, x: this.current.card.group.position.x - SPOT.x, y: this.current.card.group.position.y - SPOT.y, rz: this.current.card.group.rotation.z };
        this.w.hud.swipeStamp(null);
      }
      this.dragX = 0;
      this.dragY = 0;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  update(dt) {
    if (!this.active) return;
    for (const card of this.cards) {
      const a = card.anim;
      if (!a) continue;
      a.t += dt;
      const g = card.group;
      if (a.kind === 'enter') {
        const k = clamp(a.t / 0.25);
        const e = 1 - Math.pow(1 - k, 3);
        g.scale.setScalar(0.75 + 0.25 * e);
        g.position.z = SPOT.z - (1 - e) * (a.from === 'undo' ? -1.5 : 1.5);
        if (k >= 1) card.anim = null;
      } else if (a.kind === 'spring') {
        const k = clamp(a.t / 0.2);
        g.position.x = SPOT.x + a.x * (1 - k);
        g.position.y = SPOT.y + a.y * (1 - k);
        g.rotation.z = a.rz * (1 - k);
        if (k >= 1) card.anim = null;
      } else {
        const k = clamp(a.t / 0.38);
        if (a.kind === 'keep') {
          g.position.x = SPOT.x + a.x + k * k * 9;
          g.position.y = SPOT.y + Math.sin(k * Math.PI) * 0.6;
          g.rotation.z = a.rz - k * 0.6;
        } else if (a.kind === 'nope') {
          g.position.x = SPOT.x + a.x - k * 1.5;
          g.position.y = SPOT.y - k * k * 4.5;
          g.rotation.z = a.rz + k * 0.8;
        } else {
          g.position.y = SPOT.y + k * k * 7;
          g.rotation.y = k * Math.PI * 2;
        }
        card.glow.material.opacity = a.kind === 'star' ? 0.4 * (1 - k) : 0;
        if (k >= 1) {
          card.anim = null;
          if (!this.current || this.current.card !== card) g.visible = false;
          g.rotation.set(0, 0, 0);
          g.scale.setScalar(1);
        }
      }
    }
  }

  // --- Results ---

  finish() {
    if (!this.items.length) return;
    const w = this.w;
    this.active = false;
    for (const p of this.cards) p.group.visible = false;
    w.look.resetFocus();
    w.look.dragEnabled = true;
    w.hud.swipeStamp(null);
    const c = this.counts();
    const left = this.items.length - Object.keys(this.decisions).length;
    const kept = this.items.filter((i) => this.decisions[i.key] === 'keep' || this.decisions[i.key] === 'star');
    const starred = this.items.filter((i) => this.decisions[i.key] === 'star');
    const binned = this.items.filter((i) => this.decisions[i.key] === 'nope');
    w.audience.react('cheer', 0.8);
    w.studio.wall.show({ kind: 'title', title: 'Sorted', sub: `${kept.length} KEPT` });
    const images = kept.filter((i) => i.kind === 'image');
    if (this.resultUrls) for (const u of this.resultUrls) URL.revokeObjectURL(u);
    this.resultUrls = [];
    const thumbs = images
      .slice(0, 150)
      .map((i) => {
        let src;
        if (i.canvas) src = i.canvas.toDataURL('image/jpeg', 0.7);
        else {
          src = URL.createObjectURL(i.file);
          this.resultUrls.push(src);
        }
        return `<figure class="${this.decisions[i.key] === 'star' ? 'starred' : ''}"><img src="${src}" alt="" loading="lazy"><figcaption>${escapeHtml(i.label)}</figcaption></figure>`;
      })
      .join('');
    const csvCell = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const csv = ['item,detail,decision', ...this.items.map((i) => [csvCell(i.label), csvCell(i.sub || ''), this.decisions[i.key] || 'undecided'].join(','))].join('\n');
    const keptText = kept.map((i) => `${this.decisions[i.key] === 'star' ? '★ ' : ''}${i.label}`).join('\n');
    const canSave = images.some((i) => i.file) && typeof window.showDirectoryPicker === 'function';
    const el = document.getElementById('results');
    el.innerHTML = `
      <h2>Sorted</h2>
      <p class="lede">${escapeHtml(this.name)} · ${this.items.length} item${this.items.length === 1 ? '' : 's'}${left ? ` · ${left} still to go` : ''}</p>
      <div class="tiles">
        <div class="tile"><span>Kept</span><b>${kept.length}</b><small>including starred</small></div>
        <div class="tile"><span>Starred</span><b>${c.star}</b><small>your favourites</small></div>
        <div class="tile"><span>Binned</span><b>${binned.length}</b><small>&nbsp;</small></div>
        <div class="tile"><span>Still to sort</span><b>${left}</b><small>${left ? 'saved for later' : 'all done'}</small></div>
      </div>
      ${thumbs ? `<div><h4>Kept photos${images.length > 150 ? ' (first 150)' : ''}</h4><div class="thumbs">${thumbs}</div></div>` : ''}
      <p class="status" id="s-status"></p>
      <div class="buttons">
        <button type="button" class="go" id="s-copy">Copy kept list</button>
        <button type="button" class="ghost" id="s-csv">Download all as CSV</button>
        ${canSave ? '<button type="button" class="ghost" id="s-save">Save kept photos to a folder…</button>' : ''}
        ${kept.length >= 2 ? `<button type="button" class="ghost" id="s-tourney">Tournament of the ${starred.length >= 2 ? 'starred' : 'kept'}</button>` : ''}
        ${left ? '<button type="button" class="ghost" id="s-more">Keep sorting</button>' : ''}
        <button type="button" class="ghost" id="s-reset">Forget these picks</button>
        <button type="button" class="ghost" id="s-menu">Menu</button>
      </div>
      <h4>Kept, as text</h4>
      <pre class="listing" id="s-list"></pre>`;
    el.querySelector('#s-list').textContent = keptText || 'Nothing kept yet.';
    const status = el.querySelector('#s-status');
    el.querySelector('#s-copy').onclick = () => copyText(keptText, status, el.querySelector('#s-list'));
    el.querySelector('#s-csv').onclick = () => download(`${this.name.replace(/[^\w.-]+/g, '-').toLowerCase() || 'swipe'}-picks.csv`, csv, status, 'text/csv');
    const save = el.querySelector('#s-save');
    if (save) save.onclick = () => this.saveToFolder(images.filter((i) => i.file), status);
    const tourney = el.querySelector('#s-tourney');
    if (tourney)
      tourney.onclick = () => {
        const pool = starred.length >= 2 ? starred : kept;
        const entries = pool.slice(0, 64).map((i) => ({ label: i.kind === 'image' ? i.label.replace(/\.[^.]+$/, '') : i.label, image: i.canvas || null, file: i.file, url: null }));
        this.toTournament(entries);
      };
    const more = el.querySelector('#s-more');
    if (more)
      more.onclick = () => {
        this.begin(this.items, this.name, this.sig, this.decisions);
      };
    el.querySelector('#s-reset').onclick = () => {
      storage.remove(`finalsay.swipe.${this.sig}`);
      status.textContent = 'Forgotten. These picks are no longer saved in this browser.';
    };
    el.querySelector('#s-menu').onclick = () => this.nav.menu();
    w.hud.setMode('menu');
    w.hud.showScreen('screen-results');
    document.getElementById('screen-results').scrollTop = 0;
  }

  async toTournament(entries) {
    // Photos from files need decoding before they can go on stage.
    for (const e of entries) {
      if (e.file && !e.image) {
        const url = URL.createObjectURL(e.file);
        const img = new Image();
        img.src = url;
        try {
          await img.decode();
          e.image = img;
          e.url = url;
        } catch {
          URL.revokeObjectURL(url);
        }
      } else if (e.image && e.image.toDataURL) e.url = e.image.toDataURL('image/jpeg', 0.8);
    }
    this.nav.tournament(entries);
  }

  async saveToFolder(items, status) {
    let dir;
    try {
      dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (err) {
      status.textContent = err && err.name === 'AbortError' ? 'No folder chosen.' : 'Saving to a folder isn’t allowed here. Use Copy or the CSV instead.';
      return;
    }
    const used = new Set();
    let n = 0;
    for (const item of items) {
      let name = item.file.name;
      for (let k = 2; used.has(name); k++) name = item.file.name.replace(/(\.[^.]+)?$/, ` (${k})$1`);
      used.add(name);
      try {
        const fh = await dir.getFileHandle(name, { create: true });
        const out = await fh.createWritable();
        await out.write(item.file);
        await out.close();
        n++;
        status.textContent = `Saving… ${n} of ${items.length}`;
      } catch (err) {
        status.textContent = `Stopped after ${n}: ${err.message}`;
        return;
      }
    }
    status.textContent = `Saved ${n} photo${n === 1 ? '' : 's'} to “${dir.name}”. The originals are untouched.`;
  }
}
