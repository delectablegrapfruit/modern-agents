// Tournament: a knockout bracket for anything — a list of names, ideas or photos, or eight random acts. Each match
// puts two on stage and you pick who goes through, until one is left.
import * as THREE from 'three';
import { Character, randomLook } from './character.js';
import { formation, makeLineup, reply, spawn } from './contestants.js';
import { PITCH_LINES } from './data.js';
import { Show } from './show.js';
import { Slots } from './slots.js';
import { MARK, STAGE_Y } from './studio.js';
import { Cancelled, clamp, escapeHtml, quietly, RNG, rng, Token } from './util.js';

const $ = (s) => document.querySelector(s);
const SIDE_X = 2.35;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const shortLabel = (s, n = 28) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function roundName(teamsLeft) {
  if (teamsLeft === 2) return 'Final';
  if (teamsLeft === 4) return 'Semi-finals';
  if (teamsLeft === 8) return 'Quarter-finals';
  return `Round of ${teamsLeft}`;
}

// Knockout bracket with byes spread evenly through the first round.
export function buildBracket(count) {
  let size = 1;
  while (size < count) size *= 2;
  size = Math.max(2, size);
  const byes = size - count;
  const first = [];
  const matches = size / 2;
  const byeAt = new Set();
  for (let k = 0; k < byes; k++) byeAt.add(Math.floor((k * matches) / byes));
  let next = 0;
  for (let m = 0; m < matches; m++) {
    const a = next++;
    const b = byeAt.has(m) ? null : next++;
    first.push({ a, b, winner: b === null ? a : null });
  }
  const rounds = [first];
  while (rounds[rounds.length - 1].length > 1) {
    const prev = rounds[rounds.length - 1];
    rounds.push(Array.from({ length: prev.length / 2 }, () => ({ a: null, b: null, winner: null })));
  }
  return { rounds, size };
}

// Moves winners of round r into round r + 1.
export function advance(bracket, r) {
  const next = bracket.rounds[r + 1];
  if (!next) return;
  bracket.rounds[r].forEach((m, j) => {
    const slot = next[Math.floor(j / 2)];
    if (j % 2 === 0) slot.a = m.winner;
    else slot.b = m.winner;
  });
  // A match with only one side (from a bye above) resolves itself.
  for (const m of next) if (m.a !== null && m.b === null && bracket.rounds[r].length === 1) m.winner = m.a;
}

export class Tournament {
  constructor(world, nav) {
    this.w = world;
    this.nav = nav;
    this.slots = new Slots(world);
    this.performer = new Show(world, () => {});
    this.images = [];
    this.token = null;
    this.onStart = null;
    const text = $('#t-entries');
    text.addEventListener('input', () => this.updateCount());
    $('#t-images').addEventListener('change', (e) => this.addImages([...e.target.files]).then(() => (e.target.value = '')));
  }

  setup(prefill) {
    if (prefill) {
      $('#t-entries').value = prefill
        .filter((e) => !e.image)
        .map((e) => e.label)
        .join('\n');
      this.images = prefill.filter((e) => e.image).map((e) => ({ label: e.label, image: e.image, url: e.url }));
    } else if (!$('#t-entries').value.trim() && !this.images.length) {
      $('#t-entries').value = ['Pizza night', 'Tacos', 'Sushi', 'Curry', 'Burgers', 'Pho', 'Dumplings', 'Fish and chips'].join('\n');
    }
    this.w.hud.showScreen('screen-tournament');
    this.updateCount();
  }

  async addImages(files) {
    const note = $('#t-images-note');
    const images = files.filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(f.name));
    note.textContent = `Loading ${images.length} photo${images.length === 1 ? '' : 's'}…`;
    for (const f of images) {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.src = url;
      try {
        await img.decode();
        this.images.push({ label: f.name.replace(/\.[^.]+$/, ''), image: img, url });
      } catch {
        URL.revokeObjectURL(url);
      }
    }
    this.updateCount();
  }

  formEntries() {
    const lines = $('#t-entries')
      .value.split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    return [...lines.map((label) => ({ label })), ...this.images.map((i) => ({ label: i.label, image: i.image, url: i.url }))];
  }

  updateCount() {
    const n = this.formEntries().length;
    $('#t-images-note').textContent = this.images.length ? `${this.images.length} photo${this.images.length === 1 ? '' : 's'} added.` : '';
    let size = 1;
    while (size < n) size *= 2;
    $('#t-count').textContent = n < 2 ? 'Add at least two entries.' : `${n} entries · ${n - 1} matches${size > n ? ` · ${size - n} get a bye in the first round` : ''}`;
  }

  command(name) {
    const hud = this.w.hud;
    if (name === 't-start') {
      const entries = this.formEntries();
      if (entries.length < 2) {
        $('#t-count').textContent = 'Add at least two entries to start.';
        return;
      }
      this.start(entries, { acts: false });
    } else if (name === 't-random') {
      const lineup = makeLineup(8);
      this.start(
        lineup.map((c) => ({ label: c.name, contestant: c })),
        { acts: true }
      );
    } else if (name === 't-clear') {
      $('#t-entries').value = '';
      for (const i of this.images) URL.revokeObjectURL(i.url);
      this.images = [];
      this.updateCount();
    } else if (name === 'left' || name === 'right') this.pick(name);
    else if (name === 'bracket') this.showBracket(true);
    else if (name === 'close-bracket') this.showBracket(false);
    void hud;
  }

  key(k) {
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.pick('left');
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.pick('right');
    else if (k === 'b' || k === 'B') this.showBracket($('#bracket').hidden);
  }

  start(entries, { acts }) {
    const w = this.w;
    this.opts = { acts, quick: $('#t-quick').checked, shuffle: $('#t-shuffle').checked };
    let list = entries.map((e) => ({ ...e }));
    if (this.opts.shuffle) list = rng.shuffle(list);
    list.forEach((e) => {
      e.pop = rng.range(0.15, 1);
      e.look = randomLook(new RNG(hash(e.label) || 1));
    });
    this.entries = list;
    this.bracket = buildBracket(list.length);
    // Mark each entry's elimination round for the final ranking.
    this.out = new Map();
    if (this.onStart) this.onStart();
    this.token = new Token();
    w.hud.hideScreens();
    w.hud.setMode('tournament');
    w.hud.setPick('', '', false);
    w.look.recenter();
    quietly(this.run());
  }

  stop() {
    if (this.token) this.token.cancel();
    this.performer.cancelExhibition();
    this.slots.close();
    if (this.pickResolve) this.pickResolve(null);
    this.pickResolve = null;
    this.w.speech.interrupt();
    this.w.audio.music.stop(0.2);
    this.w.clearCast();
    this.w.audience.setOvation(0);
    for (const p of this.w.studio.placards) p.group.visible = false;
    this.showBracket(false);
  }

  wait(s) {
    return this.w.clock.wait(s, this.token);
  }

  async run() {
    const w = this.w;
    const b = this.bracket;
    w.studio.wall.show({ kind: 'title', title: 'Tournament', sub: `${this.entries.length} ENTER · ONE WINS` });
    w.audience.setMood(0.35, 0.7);
    w.audience.react('cheer', 0.8);
    w.audio.sfx('riser');
    await w.judgeSay(0, this.opts.acts ? 'Eight acts. One winner. Let’s go!' : `${this.entries.length} in the running. You pick who goes through.`, this.token);
    for (let r = 0; r < b.rounds.length; r++) {
      const round = b.rounds[r];
      const teams = round.length * 2;
      const name = roundName(teams);
      const playable = round.filter((m) => m.winner === null && m.a !== null && m.b !== null);
      if (r > 0 || playable.length !== round.length) {
        this.renderBracket(r, -1);
        this.showBracket(true);
        await this.wait(r === 0 ? 2.5 : 2.2);
        this.showBracket(false);
      }
      w.studio.wall.show({ kind: 'title', title: name, sub: `${playable.length} MATCH${playable.length === 1 ? '' : 'ES'}` });
      let k = 0;
      for (let j = 0; j < round.length; j++) {
        const m = round[j];
        if (m.winner !== null) continue;
        if (m.b === null) {
          m.winner = m.a;
          continue;
        }
        k++;
        this.current = { r, j };
        w.hud.setInfo(`${name} · Match ${k} of ${playable.length}`);
        const winner = this.opts.acts ? await this.actMatch(m, name) : await this.entryMatch(m, name);
        m.winner = winner;
        const loser = winner === m.a ? m.b : m.a;
        this.out.set(loser, r);
      }
      advance(b, r);
    }
    const champ = b.rounds[b.rounds.length - 1][0].winner;
    this.out.set(champ, b.rounds.length);
    await this.crown(champ);
  }

  // --- Matches --------------------------------------------------------------------------------------------------

  presenter(entry, side) {
    const ch = new Character(entry.look);
    ch.name = entry.label;
    const x = side * (SIDE_X + 1.45);
    const spot = new THREE.Vector3(x, STAGE_Y, MARK.z + 0.5);
    if (this.opts.quick) ch.place(spot);
    else {
      ch.place(new THREE.Vector3(side * 10.5, STAGE_Y, MARK.z));
      ch.walkTo(spot, 2.2);
    }
    ch.face(-side * 0.35);
    ch.lookTarget = new THREE.Vector3(0, 1.3, 0.4);
    this.w.add(ch);
    return { ch, speaker: { name: shortLabel(entry.label, 24), color: '#fff4dc', voice: { pitch: entry.look.height < 0.8 ? 300 : rng.range(110, 250), rate: 1.05 }, char: ch } };
  }

  showEntryPlacard(i, entry, side) {
    const p = this.w.studio.placards[i];
    p.showEntry({ image: entry.image || null, text: entry.label, sub: null }, 2.7, 2.0);
    p.group.position.set(side * SIDE_X, STAGE_Y + 1.55, MARK.z + 0.35);
    p.group.rotation.set(0, -side * 0.12, 0);
    p.glow.material.opacity = 0;
    return p;
  }

  async entryMatch(m, roundLabel) {
    const w = this.w;
    const A = this.entries[m.a];
    const B = this.entries[m.b];
    w.studio.wall.show({ kind: 'versus', left: A.image ? { image: A.image } : { text: A.label }, right: B.image ? { image: B.image } : { text: B.label }, round: roundLabel });
    const pa = this.showEntryPlacard(0, A, -1);
    const pb = this.showEntryPlacard(1, B, 1);
    const left = this.presenter(A, -1);
    const right = this.presenter(B, 1);
    w.audio.sfx('whoosh');
    w.audience.react('clap', 0.6);
    await w.clock.waitFor(() => left.ch.arrived && right.ch.arrived, this.token, 5);
    for (const p of [left, right]) {
      p.ch.face(0);
      p.ch.set('wave', 'happy');
    }
    await this.wait(0.5);
    for (const p of [left, right]) p.ch.set('idle');
    this.matchCtx = { A, B, left, right, pa, pb };
    this.openMatchOptions();
    w.hud.setPick(A.label, B.label, true);
    if (!this.hinted) {
      w.hud.hint('Press ← or → (or tap a name) to send one through. B shows the bracket.', 6);
      this.hinted = true;
    }
    const side = await this.waitPick();
    if (!side) throw new Cancelled();
    this.slots.close();
    w.hud.setPick(A.label, B.label, false);
    const winIdx = side === 'left' ? m.a : m.b;
    const win = side === 'left' ? left : right;
    const lose = side === 'left' ? right : left;
    const winPlacard = side === 'left' ? pa : pb;
    const losePlacard = side === 'left' ? pb : pa;
    await this.celebrate(win, lose, winPlacard, losePlacard, this.entries[winIdx]);
    return winIdx;
  }

  async actMatch(m, roundLabel) {
    const w = this.w;
    const A = this.entries[m.a];
    const B = this.entries[m.b];
    w.studio.wall.show({ kind: 'versus', left: { text: A.label }, right: { text: B.label }, round: roundLabel });
    const teams = [A.contestant, B.contestant];
    teams.forEach((c, i) => {
      c.known = new Set(['name', 'act']);
      spawn(w, c);
      const side = i ? 1 : -1;
      c.chars.forEach((ch, k) => ch.place(new THREE.Vector3(side * 10.5, STAGE_Y, MARK.z + k * 0.3)));
      if (c.dog) c.dog.place(new THREE.Vector3(side * 10.8, STAGE_Y, MARK.z));
    });
    const park = (c, side) => {
      c.chars.forEach((ch, k) => ch.walkTo(new THREE.Vector3(side * (4.2 + (k % 3) * 0.7), STAGE_Y, MARK.z + 0.6 - Math.floor(k / 3) * 0.7), 2.4));
      if (c.dog) c.dog.walkTo(new THREE.Vector3(side * 3.6, STAGE_Y, MARK.z + 1), 2.4);
    };
    park(A.contestant, -1);
    park(B.contestant, 1);
    w.audience.react('clap', 0.7);
    await w.clock.waitFor(() => teams.every((c) => c.chars.every((ch) => ch.arrived)), this.token, 7);
    for (const c of teams) for (const ch of c.chars) ch.face(0);
    this.matchCtx = { A, B, left: { ch: A.contestant.lead, speaker: A.contestant.speaker }, right: { ch: B.contestant.lead, speaker: B.contestant.speaker }, acts: true };
    this.openMatchOptions();
    w.hud.setPick(A.label, B.label, true);
    // Each act takes centre stage in turn. You can decide at any time.
    let side = null;
    const pickPromise = this.waitPick().then((s) => (side = s));
    for (const [i, c] of teams.entries()) {
      if (side) break;
      const s = i ? 1 : -1;
      c.chars.forEach((ch, k) => ch.walkTo(formation(c, k), 2.4));
      if (c.dog) c.dog.walkTo(MARK.clone().add(new THREE.Vector3(0.8, 0, 0.3)), 2.4);
      await w.clock.waitFor(() => side || c.chars.every((ch) => ch.arrived), this.token, 6);
      if (side) break;
      for (const ch of c.chars) ch.face(0);
      w.hud.setInfo(`${roundLabel} · ${c.name} performs`);
      const perfToken = new Token(this.token);
      this.perfToken = perfToken;
      try {
        c.entryScore = await this.performer.exhibition(c, perfToken);
      } catch (e) {
        if (!(e instanceof Cancelled) || this.token.cancelled) throw e;
      }
      w.audience.setOvation(0);
      if (side) break;
      park(c, s);
      await this.wait(0.8);
    }
    if (!side) {
      w.hud.prompt('Your pick.');
      await pickPromise;
    }
    w.hud.prompt(null);
    if (!side) throw new Cancelled();
    this.performer.cancelExhibition();
    this.slots.close();
    w.hud.setPick(A.label, B.label, false);
    const winC = side === 'left' ? A.contestant : B.contestant;
    const loseC = side === 'left' ? B.contestant : A.contestant;
    w.audio.sfx('yes');
    w.hud.bigStamp(shortLabel(winC.name, 16), 'gold');
    w.audience.react('cheer', 0.9);
    for (const ch of winC.chars) ch.set('cheer', 'elated');
    for (const ch of loseC.chars) {
      ch.set('idle', 'sad');
      ch.walkTo(new THREE.Vector3(side === 'left' ? 10.5 : -10.5, STAGE_Y, MARK.z), 1.4);
    }
    await this.wait(2.2);
    for (const ch of winC.chars) ch.walkTo(new THREE.Vector3(side === 'left' ? -10.5 : 10.5, STAGE_Y, MARK.z), 2.2);
    await this.wait(1.6);
    w.clearCast();
    return side === 'left' ? m.a : m.b;
  }

  openMatchOptions() {
    const ctx = this.matchCtx;
    const w = this.w;
    const used = new Set();
    this.slots.open(
      () =>
        [
          { id: 'caseA', text: `Make your case, ${shortLabel(ctx.A.label, 18)}!`, tone: 'ask', weight: 2 },
          { id: 'caseB', text: `Make your case, ${shortLabel(ctx.B.label, 18)}!`, tone: 'ask', weight: 2 },
          { id: 'crowd', text: 'Audience — who do you want?', tone: 'crowd', weight: 1.6 },
          { id: 'judges', text: 'What do you two think?', tone: 'ask', weight: 1.2 },
          { id: 'tough', text: 'Oh, this is a tough one.', tone: 'banter', weight: 1 },
        ].filter((o) => !used.has(o.id)),
      () => null,
      (o) => {
        used.add(o.id);
        quietly(this.matchOption(o));
      }
    );
    void w;
  }

  async matchOption(o) {
    const w = this.w;
    const ctx = this.matchCtx;
    const t = this.token;
    await w.playerSay(o.text, t);
    if (o.id === 'caseA' || o.id === 'caseB') {
      const p = o.id === 'caseA' ? ctx.left : ctx.right;
      const entry = o.id === 'caseA' ? ctx.A : ctx.B;
      p.ch.set('present', 'happy');
      const line = ctx.acts && entry.contestant ? reply(entry.contestant, 'filler') : rng.pick(PITCH_LINES);
      await w.speech.say(p.speaker, line, t);
      w.audience.react('cheer', 0.3 + entry.pop * 0.5);
      p.ch.set('idle');
    } else if (o.id === 'crowd') {
      for (const [p, e] of [
        [ctx.left, ctx.A],
        [ctx.right, ctx.B],
      ]) {
        p.ch.set('wave', 'happy');
        w.audience.react(e.pop > 0.55 ? 'cheer' : 'clap', 0.3 + e.pop * 0.8);
        await w.clock.wait(1.3, t);
        p.ch.set('idle');
      }
    } else if (o.id === 'judges') {
      for (const i of [0, 1]) {
        const fav = rng.chance(0.5) ? ctx.A : ctx.B;
        await w.judgeSay(i, rng.pick([`I’d go with ${shortLabel(fav.label, 24)}.`, `${shortLabel(fav.label, 24)}, every time.`, `Honestly? ${shortLabel(fav.label, 24)}.`]), {}, t);
      }
    } else if (o.id === 'tough') {
      await w.judgeSay(rng.int(0, 1), rng.pick(['Go with your gut!', 'That’s why you get the big chair.', 'No pressure. Everyone’s watching.']), {}, t);
    }
  }

  waitPick() {
    return new Promise((resolve) => {
      this.pickResolve = resolve;
    });
  }
  pick(side) {
    if (!this.pickResolve) return;
    const r = this.pickResolve;
    this.pickResolve = null;
    this.w.audio.sfx('click');
    r(side);
  }

  async celebrate(win, lose, winPlacard, losePlacard, entry) {
    const w = this.w;
    const pop = entry.pop;
    w.audio.sfx('yes');
    w.hud.bigStamp(shortLabel(entry.label, 16), 'gold');
    w.audience.react(pop > 0.45 ? 'cheer' : 'clap', 0.6 + pop * 0.5);
    if (pop < 0.35) w.audience.react('ooh', 0.4);
    win.ch.set('cheer', 'elated');
    lose.ch.set('idle', 'sad');
    winPlacard.glow.material.opacity = 0.35;
    w.fx.sparkle(winPlacard.group.position.clone(), 22);
    // The loser drops through the stage.
    w.audio.sfx('whoosh');
    const start = losePlacard.group.position.clone();
    let k = 0;
    await w.clock.waitFor(
      () => {
        k = Math.min(1, k + 0.035);
        losePlacard.group.position.y = start.y - k * k * 3.5;
        losePlacard.group.rotation.z = k * 0.4 * Math.sign(start.x);
        return k >= 1;
      },
      this.token,
      3
    );
    losePlacard.group.visible = false;
    losePlacard.group.rotation.z = 0;
    const exitSide = Math.sign(lose.ch.position.x) || 1;
    lose.ch.walkTo(new THREE.Vector3(exitSide * 10.5, STAGE_Y, MARK.z), this.opts.quick ? 3 : 1.4);
    if (rng.chance(0.3)) quietly(w.judgeSay(rng.int(0, 1), rng.pick(['Good call.', 'Bold.', 'I’d have gone the other way.', 'Correct.']), {}, this.token));
    await this.wait(this.opts.quick ? 1.0 : 2.0);
    win.ch.walkTo(new THREE.Vector3(-exitSide * 10.5, STAGE_Y, MARK.z), this.opts.quick ? 3.2 : 2);
    await this.wait(this.opts.quick ? 0.5 : 1.2);
    winPlacard.group.visible = false;
    winPlacard.glow.material.opacity = 0;
    this.w.remove(win.ch);
    this.w.remove(lose.ch);
  }

  async crown(champIdx) {
    const w = this.w;
    const champ = this.entries[champIdx];
    this.slots.close();
    w.hud.setPick('', '', false);
    w.hud.setInfo('Champion');
    w.audio.sfx('golden');
    w.studio.mood.golden = 1;
    w.fx.confettiBurst(undefined, 650, true);
    w.audience.setOvation(1);
    w.audience.react('cheer', 1.2);
    w.studio.wall.show(champ.image ? { kind: 'image', image: champ.image } : { kind: 'title', title: champ.label, sub: '★ CHAMPION ★', color: '#ffc53d' });
    if (!this.opts.acts) {
      const p = w.studio.placards[2];
      p.showEntry({ image: champ.image || null, text: champ.label }, 3.4, 2.4);
      p.group.position.set(0, STAGE_Y + 1.7, MARK.z + 0.6);
      p.group.rotation.set(0, 0, 0);
      p.glow.material.opacity = 0.25;
    } else {
      const c = champ.contestant;
      spawn(w, c);
      c.chars.forEach((ch, k) => ch.place(formation(c, k)));
      for (const ch of c.chars) {
        ch.face(0);
        ch.set('cheer', 'elated');
      }
    }
    await w.judgeSay(0, `And the winner is… ${shortLabel(champ.label, 40)}!`, this.token);
    await this.wait(2.5);
    w.studio.mood.golden = 0;
    w.audience.setOvation(0);
    this.renderResults(champIdx);
  }

  // --- Bracket and results --------------------------------------------------------------------------------------

  showBracket(show) {
    const el = $('#bracket');
    if (show && this.bracket) this.renderBracket(this.current ? this.current.r : 0, this.current ? this.current.j : -1);
    el.hidden = !show;
  }

  renderBracket(currentRound, currentMatch) {
    const b = this.bracket;
    if (!b) return;
    const label = (i) => (i === null ? '<span class="slot tbd">—</span>' : null);
    const html = b.rounds
      .map((round, r) => {
        const teams = round.length * 2;
        const matches = round
          .map((m, j) => {
            const cls = r === currentRound && j === currentMatch ? 'match current' : 'match';
            const slot = (i) => {
              if (i === null) return m.winner !== null && r === 0 ? '<span class="slot tbd">bye</span>' : label(i);
              const state = m.winner === null ? '' : m.winner === i ? 'win' : 'lose';
              return `<span class="slot ${state}" title="${escapeHtml(this.entries[i].label)}">${escapeHtml(shortLabel(this.entries[i].label, 30))}</span>`;
            };
            return `<div class="${cls}">${slot(m.a)}${slot(m.b)}</div>`;
          })
          .join('');
        return `<div class="round"><h3>${roundName(teams)}</h3>${matches}</div>`;
      })
      .join('');
    $('#bracket-grid').innerHTML = html;
  }

  ranking() {
    const b = this.bracket;
    const total = b.rounds.length;
    const tiers = [];
    for (let r = total; r >= 0; r--) {
      const ids = [...this.out.entries()].filter(([, round]) => round === r).map(([i]) => i);
      if (!ids.length) continue;
      const name = r === total ? 'Champion' : r === total - 1 ? 'Runner-up' : `Out in the ${roundName(b.rounds[r].length * 2).toLowerCase()}`;
      tiers.push({ name, place: tiers.reduce((s, t) => s + t.ids.length, 0) + 1, ids });
    }
    return tiers;
  }

  renderResults(champIdx) {
    const w = this.w;
    const champ = this.entries[champIdx];
    const tiers = this.ranking();
    const lines = tiers.flatMap((t) => t.ids.map((i) => `${t.place}. ${this.entries[i].label}${t.ids.length > 1 ? ` (${t.name.toLowerCase()})` : ''}`));
    const text = `Final Say tournament — ${new Date().toLocaleDateString()}\n${lines.join('\n')}`;
    const el = document.getElementById('results');
    el.innerHTML = `
      <div class="champion">
        <span class="crown">★ Champion ★</span>
        ${champ.url ? `<img src="${champ.url}" alt="${escapeHtml(champ.label)}">` : ''}
        <span class="name">${escapeHtml(champ.label)}</span>
        <span class="note">Beat ${this.entries.length - 1} other${this.entries.length === 2 ? '' : 's'} over ${this.bracket.rounds.length} round${this.bracket.rounds.length === 1 ? '' : 's'}.</span>
      </div>
      <div><h4>Final standings</h4>
        <ol class="ranking">${tiers
          .flatMap((t) => t.ids.map((i) => `<li value="${t.place}">${escapeHtml(this.entries[i].label)}${t.ids.length > 1 || t.place > 2 ? `<span class="tier">${escapeHtml(t.name)}</span>` : ''}</li>`))
          .join('')}</ol>
      </div>
      <p class="status" id="t-status"></p>
      <div class="buttons">
        <button type="button" class="go" id="t-copy">Copy results</button>
        <button type="button" class="ghost" id="t-download">Download .txt</button>
        <button type="button" class="ghost" id="t-again">Run it again</button>
        <button type="button" class="ghost" id="t-new">New tournament</button>
        <button type="button" class="ghost" id="t-menu">Menu</button>
      </div>
      <pre class="listing" id="t-text"></pre>`;
    el.querySelector('#t-text').textContent = text;
    const status = el.querySelector('#t-status');
    el.querySelector('#t-copy').onclick = () => copyText(text, status, el.querySelector('#t-text'));
    el.querySelector('#t-download').onclick = () => download('final-say-tournament.txt', text, status);
    el.querySelector('#t-again').onclick = () => {
      const entries = this.entries.map((e) => ({ label: e.label, image: e.image, url: e.url, contestant: e.contestant }));
      w.hud.hideScreens();
      this.start(entries, { acts: this.opts.acts });
    };
    el.querySelector('#t-new').onclick = () => {
      this.stop();
      this.setup();
    };
    el.querySelector('#t-menu').onclick = () => this.nav.menu();
    w.hud.setMode('menu');
    w.hud.showScreen('screen-results');
    document.getElementById('screen-results').scrollTop = 0;
  }

  update(dt) {
    this.slots.update(dt);
    this.performer.update(dt, this.w.clock.time);
  }
}

// Copies text; if the clipboard is refused, selects it so the viewer can copy it by hand.
export function copyText(text, status, fallbackEl) {
  const done = () => (status.textContent = 'Copied.');
  const fail = () => {
    status.textContent = 'Copying was blocked here — the text is selected below, copy it with your keyboard.';
    if (fallbackEl) {
      const range = document.createRange();
      range.selectNodeContents(fallbackEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };
  try {
    navigator.clipboard.writeText(text).then(done, fail);
  } catch {
    fail();
  }
}

export function download(name, text, status, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  if (status) status.textContent = `Saved ${name}. If nothing downloaded, use Copy instead.`;
}

export { clamp };
