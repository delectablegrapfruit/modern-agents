// What each kind of act does on stage. A script plays out beats; every beat asks the show how well it went
// (from the act's talent and confidence) and plays the good or the bad version.
import * as THREE from 'three';
import { Props } from './character.js';
import { JOKES_BAD, JOKES_GOOD, PUPPET_LINES_BAD, PUPPET_LINES_GOOD } from './data.js';
import { mat, MARK, STAGE_Y } from './studio.js';
import { clamp, quietly, rng, TAU } from './util.js';

const v3 = () => new THREE.Vector3();

function headPos(ch, up = 0.45) {
  const p = v3();
  ch.head.getWorldPosition(p);
  p.y += up * ch.scale;
  return p;
}
function handPos(ch, side = 'R') {
  const p = v3();
  (side === 'R' ? ch.handR : ch.handL).getWorldPosition(p);
  return p;
}

// Runs fn(k) for k from 0 to 1 over `seconds` of game time.
async function animate(s, seconds, fn) {
  let t = 0;
  const off = s.everyFrame((dt) => {
    t = Math.min(seconds, t + dt);
    fn(t / seconds);
  });
  try {
    await s.pwait(seconds);
  } finally {
    off();
    fn(1);
  }
}

// Keeps dancers' feet on the music.
function followBeat(s, chars) {
  const m = s.w.audio.music;
  s.everyFrame(() => {
    const beats = m.songTime / (m.stepDur * 4);
    for (const ch of chars) ch.beatPhase = (((beats + (ch.offset || 0)) % 1) + 1) % 1;
  });
}

async function fall(s, ch, rest = 'dance') {
  const w = s.w;
  ch.set('fallen', 'shock');
  w.audio.sfx('thud');
  w.audience.react(rng.chance(0.5) ? 'gasp' : 'laugh', 0.8);
  w.look.shake(0.05);
  await s.pwait(1.3);
  ch.set(rest, 'nervous');
}

async function flip(s, ch, rest = 'dance') {
  ch.set('flip');
  s.w.audio.sfx('whoosh');
  await animate(s, 0.75, (k) => (ch.flip = k));
  ch.j.bodyX = 0;
  ch.flip = 0;
  ch.set(rest);
}

function noteBurst(s, ch, ev, color) {
  if (ev.type !== 'note') return;
  if (rng.chance(0.55)) s.fx.note(headPos(ch), color, ev.wrong);
  if (ev.crack) {
    s.w.audio.sfx('squeak');
    s.w.audience.react('laugh', 0.5);
  } else if (ev.wrong && rng.chance(0.25)) s.w.audience.react('laugh', 0.15);
}

// --- Singers, whistlers, kazoo players -------------------------------------------------------------------------

async function singer(s, c) {
  const ch = c.lead;
  const music = s.music();
  ch.set('sing');
  ch.intensity = 0.2;
  let pulse = 0;
  const top = (c.music?.key ?? 60) + 12;
  s.onMusic((ev) => {
    if (ev.type === 'beat') pulse = 1;
    if (ev.type === 'note') ch.intensity = clamp((ev.midi - top) / 14);
    noteBurst(s, ch, ev, 0xffc53d);
  });
  s.everyFrame((dt) => {
    pulse = Math.max(0, pulse - dt * 3);
    ch.beat = pulse;
  });
  const bars = s.short ? 5 : 9;
  const bar = s.barSeconds();
  await s.pwait(bar);
  for (let b = 0; b < bars; b++) {
    const big = b === bars - 2;
    if (big) {
      music.intensity = 1;
      s.studio.mood.flash = 0.6;
      ch.emotion = 'elated';
    }
    const q = s.beat({ big, difficulty: big ? 0.6 : 0.1 });
    if (big && q < 0.3) {
      s.w.audio.sfx('squeak');
      ch.emotion = 'wince';
    }
    await s.pwait(bar);
  }
  ch.set('present');
}

// --- Dancers and dance crews -----------------------------------------------------------------------------------

async function dancers(s, c) {
  const list = c.chars;
  const music = s.music();
  followBeat(s, list);
  for (const ch of list) {
    ch.set('dance', 'happy');
    ch.move = 0;
    ch.offset = 0;
  }
  const bars = s.short ? 5 : 8;
  const bar = s.barSeconds();
  let formationFlip = false;
  for (let b = 0; b < bars; b++) {
    const big = b >= bars - 2;
    if (b === bars - 3) music.intensity = 1;
    const q = s.beat({ big, difficulty: big ? 0.5 : 0.1 });
    const move = big ? 5 : rng.int(0, 4);
    list.forEach((ch) => {
      ch.move = q < 0.3 && rng.chance(0.5) ? rng.int(0, 4) : move; // the weak ones do the wrong move
      ch.sloppy = 1 - q;
      ch.offset = list.length > 1 ? (1 - q) * rng.range(-0.4, 0.4) : 0;
      if (move === 1 && q > 0.6) ch.spinTime = 0.55;
    });
    if (q < 0.22) quietly(fall(s, rng.pick(list)));
    if (big && q > 0.8) for (const ch of list) quietly(flip(s, ch));
    if (list.length > 2 && b % 2 === 1) {
      // Change formation: the line splits and the ends swap.
      formationFlip = !formationFlip;
      list.forEach((ch, i) => {
        const x = (i - (list.length - 1) / 2) * 1.0 * (formationFlip ? -1 : 1);
        ch.walkTo(new THREE.Vector3(x, STAGE_Y, MARK.z - (formationFlip ? (i % 2 ? 0 : 0.6) : (i % 2) * 0.5)), 3.2);
      });
      await s.pwait(0.5);
      for (const ch of list) ch.face(0);
      await s.pwait(bar - 0.5);
    } else await s.pwait(bar);
  }
  for (const ch of list) ch.set('present', 'elated');
}

// --- Bands and choirs ------------------------------------------------------------------------------------------

async function band(s, c) {
  const [singerCh, guitarist, drummer, keys] = c.chars;
  const w = s.w;
  const extras = [];
  const place = (obj, ch, dx = 0, dz = 0) => {
    obj.position.copy(ch.position).add(new THREE.Vector3(dx, 0, dz));
    w.scene.add(obj);
    extras.push(obj);
  };
  s.fx.smoke(new THREE.Vector3(0, STAGE_Y, MARK.z - 1), 10);
  singerCh.attach('mic', Props.mic());
  if (guitarist) guitarist.attach('guitar', Props.guitar(rng.pick([0xb3202a, 0x1d3557, 0xffc53d])), 'chest');
  if (drummer) {
    const kit = Props.drumKit();
    place(kit, drummer, 0, 0.35);
    drummer.face(0);
  }
  if (keys) {
    const kb = Props.keyboard();
    place(kb, keys, 0, 0.45);
  }
  const music = s.music({ lead: 'voice', sloppy: true });
  followBeat(s, c.chars);
  singerCh.set('sing');
  if (guitarist) guitarist.set('guitar');
  if (drummer) drummer.set('drum');
  if (keys) keys.set('keys');
  s.onMusic((ev) => noteBurst(s, singerCh, ev, 0x4fd6ff));
  const bars = s.short ? 5 : 8;
  const bar = s.barSeconds();
  try {
    await s.pwait(bar);
    for (let b = 0; b < bars; b++) {
      const big = b === bars - 2;
      if (big) {
        music.intensity = 1;
        if (guitarist) guitarist.set('dance');
        s.studio.mood.flash = 0.7;
      }
      const q = s.beat({ big, difficulty: big ? 0.5 : 0.1 });
      singerCh.intensity = q;
      if (q < 0.25) {
        w.audio.sfx('squeak');
        w.audience.react('ears', 0.8);
      }
      await s.pwait(bar);
      if (big && guitarist) guitarist.set('guitar');
    }
    for (const ch of c.chars) if (ch !== drummer) ch.set('present', 'elated');
    await s.pwait(0.2);
  } finally {
    s.after(() => {
      for (const o of extras) w.scene.remove(o);
      singerCh.detach('mic');
      if (guitarist) guitarist.detach('guitar');
    });
  }
}

async function choir(s, c) {
  const music = s.music();
  followBeat(s, c.chars);
  for (const ch of c.chars) {
    ch.set('choir', 'happy');
    ch.talking = true;
    ch.intensity = 0.3;
  }
  s.onMusic((ev) => {
    if (ev.type === 'note' && rng.chance(0.4)) s.fx.note(headPos(rng.pick(c.chars)), 0xffe08a, ev.wrong);
  });
  const bars = s.short ? 5 : 9;
  const bar = s.barSeconds();
  try {
    await s.pwait(bar);
    for (let b = 0; b < bars; b++) {
      const big = b === bars - 3;
      if (big) {
        // The key change.
        music.key += 2;
        music.intensity = 1;
        s.studio.mood.flash = 0.8;
        for (const ch of c.chars) ch.intensity = 1;
      }
      const q = s.beat({ big, difficulty: big ? 0.5 : 0.1 });
      if (q < 0.25) rng.pick(c.chars).emotion = 'wince';
      await s.pwait(bar);
    }
  } finally {
    for (const ch of c.chars) ch.talking = false;
  }
  for (const ch of c.chars) ch.set('bow');
}

// --- Magicians -------------------------------------------------------------------------------------------------

async function magician(s, c) {
  const w = s.w;
  const m = c.lead;
  const assistant = c.chars[1];
  s.music();
  const extras = [];
  try {
    await s.pwait(1.2);
    // Trick one: something from nothing.
    m.set('magic');
    m.intensity = 0;
    await animate(s, 1.0, (k) => (m.intensity = k));
    let q = s.beat();
    s.fx.smoke(handPos(m).add(new THREE.Vector3(0, -0.3, 0)), 8, 0xe8dcff);
    w.audio.sfx('pop');
    if (q > 0.45) {
      for (let i = 0; i < (q > 0.75 ? 3 : 1); i++) s.fx.dove(handPos(m));
      w.audio.sfx('flap');
      w.audience.react(q > 0.75 ? 'cheer' : 'ooh', 0.6);
      m.set('present', 'happy');
    } else {
      w.audio.crickets();
      w.audience.react('laugh', 0.35);
      m.set('idle', 'nervous');
    }
    await s.pwait(1.6);

    // Trick two: levitation.
    if (assistant) {
      assistant.set('lie');
      await s.pwait(0.9);
      m.set('magic');
      m.intensity = 1;
      q = s.beat({ big: true, difficulty: 0.3 });
      const height = q > 0.4 ? 1.2 : 0.35;
      w.audio.sfx('sparkle');
      await animate(s, 2.2, (k) => {
        assistant.root.position.y = STAGE_Y + height * Math.sin((k * Math.PI) / 2) + (q < 0.6 ? Math.sin(k * 40) * 0.03 : 0);
      });
      if (q < 0.3) {
        assistant.root.position.y = STAGE_Y;
        w.audio.sfx('thud');
        w.audience.react('gasp', 0.8);
        w.look.shake(0.06);
      } else {
        w.audience.react(q > 0.7 ? 'cheer' : 'clap', 0.7);
        await s.pwait(1.2);
        await animate(s, 1.0, (k) => (assistant.root.position.y = STAGE_Y + height * (1 - k)));
      }
      assistant.set('idle', q > 0.4 ? 'happy' : 'nervous');
    } else {
      // A giant card floats up out of the hat.
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.02), [mat(0xffffff), mat(0xffffff), mat(0xffffff), mat(0xffffff), cardFace(), mat(0x9b1b30)]);
      card.position.copy(m.position).add(new THREE.Vector3(0.7, 1.2, 0.2));
      w.scene.add(card);
      extras.push(card);
      m.set('magic');
      q = s.beat({ big: true, difficulty: 0.3 });
      w.audio.sfx('sparkle');
      await animate(s, 2.0, (k) => {
        card.position.y = STAGE_Y + 1.2 + k * (q > 0.4 ? 1.4 : 0.3);
        card.rotation.y = k * TAU * 2;
      });
      if (q > 0.4) {
        w.audience.react(q > 0.7 ? 'cheer' : 'ooh', 0.7);
        s.fx.sparkle(card.position, 14);
      } else {
        await animate(s, 0.5, (k) => (card.position.y = STAGE_Y + 1.5 - k * 1.45));
        w.audio.sfx('thud');
        w.audience.react('laugh', 0.5);
      }
      await s.pwait(0.8);
    }

    // Finale: the vanishing cabinet.
    const cab = Props.cabinet();
    cab.position.set(m.position.x + 1.3, STAGE_Y, m.position.z - 0.2);
    w.scene.add(cab);
    extras.push(cab);
    s.fx.smoke(cab.position.clone(), 10);
    w.audio.sfx('pop');
    await s.pwait(0.8);
    m.walkTo(cab.position.clone().add(new THREE.Vector3(0, 0, 0.05)), 1.5);
    await w.clock.waitFor(() => m.arrived, s.perf.token, 3);
    m.face(0);
    const door = cab.userData.door;
    await animate(s, 0.5, (k) => (door.rotation.y = -1.6 * (1 - k)));
    w.audio.sfx('drumroll', { dur: 2.4 });
    await s.pwait(2.4);
    q = s.beat({ big: true, difficulty: 0.45 });
    s.fx.smoke(cab.position.clone().add(new THREE.Vector3(0, 0.2, 0.5)), 16);
    w.audio.sfx('pop');
    if (q > 0.45) m.root.visible = false;
    await animate(s, 0.5, (k) => (door.rotation.y = -1.6 * k));
    if (q > 0.45) {
      w.audience.react('gasp', 1);
      await s.pwait(1.2);
      // Reappears at the front of the stage.
      const spot = new THREE.Vector3(-1.2, STAGE_Y, -5.6);
      m.place(spot);
      m.root.visible = true;
      m.face(0);
      s.fx.smoke(spot.clone(), 14, 0xfff0c0);
      s.fx.sparkle(spot.clone().add(new THREE.Vector3(0, 1.5, 0)), 20);
      w.audio.sfx('tada');
      m.set('present', 'elated');
      w.audience.react('cheer', q > 0.75 ? 1.2 : 0.8);
      s.studio.mood.flash = 1;
    } else {
      m.set('present', 'nervous');
      w.audio.crickets();
      w.audience.react('laugh', 0.7);
    }
    await s.pwait(1.5);
  } finally {
    m.root.visible = true;
    s.after(() => {
      for (const o of extras) w.scene.remove(o);
    });
  }
}

function cardFace() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 360;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 256, 360);
  g.fillStyle = '#b3202a';
  g.font = 'bold 150px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('♥', 128, 190);
  g.font = 'bold 56px serif';
  g.fillText('A', 36, 44);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
}

// --- Comedians and ventriloquists ------------------------------------------------------------------------------

function laughFor(s, q) {
  const w = s.w;
  if (q > 0.78) {
    w.audience.react('laugh', 1.1);
    w.judgePose(rng.int(0, 1), 'sitClap', 2);
  } else if (q > 0.55) w.audience.react('laugh', 0.6);
  else if (q > 0.36) w.audience.react('laugh', 0.18);
  else {
    w.audio.crickets();
    if (q < 0.2) w.audience.react('boo', 0.35);
    w.judgePose(rng.int(0, 1), 'sitFacepalm', 2);
  }
}

async function comedian(s, c) {
  const ch = c.lead;
  ch.set('mic', 'happy');
  const n = s.short ? 3 : 5;
  const good = rng.shuffle(JOKES_GOOD);
  const bad = rng.shuffle(JOKES_BAD);
  await s.pwait(0.6);
  for (let i = 0; i < n; i++) {
    const q = s.beat({ big: i === n - 1, difficulty: i === n - 1 ? 0.3 : 0 });
    const joke = q > 0.5 ? good.pop() : bad.pop();
    await s.psay(c.speaker, joke);
    laughFor(s, q);
    ch.emotion = q > 0.5 ? 'happy' : 'nervous';
    await s.pwait(q > 0.55 ? 1.7 : 1.3);
  }
  ch.set('bow');
}

async function vent(s, c) {
  const v = c.lead;
  const p = c.puppet;
  v.set('idle', 'happy');
  const n = s.short ? 3 : 4;
  const good = rng.shuffle(PUPPET_LINES_GOOD);
  const bad = rng.shuffle(PUPPET_LINES_BAD);
  let q = 0.5;
  s.everyFrame((dt, t) => {
    if (p) p.head.rotation.y = Math.sin(t * 1.3) * 0.5;
  });
  await s.pwait(0.5);
  for (let i = 0; i < n; i++) {
    q = s.beat({ big: i === n - 1, difficulty: 0.15 });
    const line = q > 0.5 ? good.pop() || rng.pick(PUPPET_LINES_GOOD) : bad.pop() || rng.pick(PUPPET_LINES_BAD);
    // The tell: a weak ventriloquist's lips move with the puppet's.
    v.talking = q < 0.45;
    v.emotion = q < 0.45 ? 'nervous' : 'happy';
    await s.psay(c.puppetSpeaker, line);
    v.talking = false;
    laughFor(s, q);
    await s.pwait(1.2);
  }
  if (q > 0.6) {
    // Finale: the puppet sings while the ventriloquist drinks a glass of water.
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.13, 12), new THREE.MeshStandardMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.5 }));
    v.attach('glass', glass, 'R');
    v.set('thinking');
    s.music({ style: 'swing', lead: 'voice', key: 67 });
    s.onMusic((ev) => ev.type === 'note' && p && rng.chance(0.5) && s.fx.note(headPos(p, 0.25), 0xff9ed2, ev.wrong));
    p.talking = true;
    await s.pwait(s.barSeconds() * 3);
    s.beat({ big: true });
    p.talking = false;
    v.detach('glass');
    s.w.audience.react('cheer', 0.9);
  }
  v.set('bow');
}

// --- Jugglers --------------------------------------------------------------------------------------------------

async function juggler(s, c) {
  const w = s.w;
  const ch = c.lead;
  s.music();
  ch.set('juggle', 'happy');
  const colors = [0xff3d57, 0xffc53d, 0x36d399, 0x4fd6ff, 0xff4fb6, 0x7c5cff, 0xffffff];
  const balls = [];
  const addBall = () => {
    const b = Props.ball(colors[balls.length % colors.length]);
    b.userData = { dropped: false, v: v3() };
    w.scene.add(b);
    balls.push(b);
  };
  let t = 0;
  const period = 1.0;
  s.everyFrame((dt) => {
    t += dt;
    const live = balls.filter((b) => !b.userData.dropped);
    ch.jugglePhase = (t / period) * Math.max(1, live.length / 2);
    const L = handPos(ch, 'L');
    const R = handPos(ch, 'R');
    const h = 0.7 + live.length * 0.12;
    live.forEach((b, i) => {
      const ph = (t / period + i / live.length) % 1;
      const across = ph < 0.5;
      const k = across ? ph * 2 : (ph - 0.5) * 2;
      const from = across ? L : R;
      const to = across ? R : L;
      b.position.lerpVectors(from, to, k);
      b.position.y += h * 4 * k * (1 - k) * (across ? 1 : 0.55);
      b.position.z += 0.15;
    });
    for (const b of balls) {
      const u = b.userData;
      if (!u.dropped) continue;
      u.v.y -= 9.8 * dt;
      b.position.addScaledVector(u.v, dt);
      if (b.position.y < STAGE_Y + 0.06 && u.v.y < 0) {
        b.position.y = STAGE_Y + 0.06;
        u.v.y *= -0.55;
        u.v.x *= 0.8;
        if (Math.abs(u.v.y) > 0.6) w.audio.sfx('bounce');
      }
    }
  });
  const levels = s.short ? [3, 4, 5] : [3, 3, 4, 5, 5, 6, 7];
  try {
    for (let n = 0; n < 3; n++) addBall();
    await s.pwait(1.5);
    for (let i = 0; i < levels.length; i++) {
      while (balls.filter((b) => !b.userData.dropped).length < levels[i]) addBall();
      const live = balls.filter((b) => !b.userData.dropped).length;
      const big = live >= 5;
      const q = s.beat({ big, difficulty: (live - 3) * 0.18 });
      if (q < 0.3) {
        const b = balls.find((x) => !x.userData.dropped);
        b.userData.dropped = true;
        b.userData.v.set(rng.range(-1.5, 1.5), 1, rng.range(0.5, 1.5));
        ch.emotion = 'shock';
        w.audience.react(rng.chance(0.5) ? 'laugh' : 'gasp', 0.6);
      } else ch.emotion = 'happy';
      if (big && q > 0.8) {
        ch.spinTime = 0.6;
        w.audience.react('cheer', 0.8);
      }
      await s.pwait(1.7);
    }
    ch.set('present', 'elated');
    await s.pwait(0.3);
  } finally {
    s.after(() => {
      for (const b of balls) w.scene.remove(b);
    });
  }
}

// --- Dog acts --------------------------------------------------------------------------------------------------

async function dogAct(s, c) {
  const w = s.w;
  const owner = c.lead;
  const dog = c.dog;
  s.music();
  const hoop = Props.hoop();
  hoop.position.set(MARK.x - 1.8, STAGE_Y, MARK.z + 0.2);
  hoop.rotation.y = Math.PI / 2;
  w.scene.add(hoop);
  let hopT = -1;
  s.everyFrame((dt) => {
    if (hopT >= 0) {
      hopT += dt;
      dog.hop = Math.max(0, Math.sin(Math.min(1, hopT / 0.6) * Math.PI) * 0.55);
      if (hopT > 0.6) hopT = -1;
    }
  });
  const tricks = s.short ? ['sit', 'spin', 'hoop'] : ['sit', 'spin', 'beg', 'hoop', 'dead'];
  const home = MARK.clone().add(new THREE.Vector3(0.8, 0, 0.3));
  try {
    for (let i = 0; i < tricks.length; i++) {
      const trick = tricks[i];
      owner.set('point', 'happy');
      await s.pwait(0.7);
      const q = s.beat({ big: trick === 'hoop' || i === tricks.length - 1, difficulty: trick === 'hoop' ? 0.3 : 0.05 });
      if (q > 0.33) {
        if (trick === 'hoop') {
          dog.walkTo(new THREE.Vector3(MARK.x - 3.2, STAGE_Y, MARK.z + 0.2), 3.2);
          await s.pwait(0.5);
          hopT = 0;
          dog.set('jump');
          await w.clock.waitFor(() => dog.arrived, s.perf.token, 3);
          dog.set('idle');
          w.audience.react(q > 0.7 ? 'cheer' : 'clap', 0.8);
          dog.walkTo(home, 2.5);
          await w.clock.waitFor(() => dog.arrived, s.perf.token, 3);
          dog.face(0);
        } else {
          dog.set(trick);
          w.audio.sfx('bark');
          await s.pwait(1.4);
          w.audience.react(trick === 'dead' ? 'laugh' : q > 0.7 ? 'cheer' : 'aww', 0.7);
          await s.pwait(0.6);
          dog.set('idle');
        }
      } else {
        // The dog has other plans.
        dog.set('wander');
        dog.walkTo(new THREE.Vector3(rng.range(-2, 2), STAGE_Y, -5.4), 2.2);
        w.audience.react('laugh', 0.6);
        owner.set('facepalm', 'nervous');
        await w.clock.waitFor(() => dog.arrived, s.perf.token, 3);
        w.audio.sfx('bark');
        await s.pwait(1.0);
        owner.set('point');
        dog.walkTo(home, 2.2);
        await w.clock.waitFor(() => dog.arrived, s.perf.token, 3);
        dog.face(0);
        dog.set('idle');
      }
      await s.pwait(0.4);
    }
    owner.set('present', 'elated');
    hopT = 0;
    dog.set('jump');
    w.audio.sfx('bark');
    await s.pwait(0.8);
    dog.set('sit');
  } finally {
    s.after(() => w.scene.remove(hoop));
  }
}

// --- Acrobats --------------------------------------------------------------------------------------------------

async function acro(s, c) {
  const w = s.w;
  const team = c.chars;
  s.music();
  for (const ch of team) ch.set('stretch', 'happy');
  await s.pwait(1.2);
  // Flips, one after another.
  for (const ch of team) {
    const q = s.beat({ difficulty: 0.2 });
    if (q > 0.35) {
      await flip(s, ch, 'stretch');
      if (q > 0.75) w.audience.react('clap', 0.5);
    } else await fall(s, ch, 'stretch');
    await s.pwait(0.3);
  }
  // Handstands together.
  const q2 = s.beat({ big: true, difficulty: 0.25 });
  for (const ch of team) ch.set(q2 > 0.3 || rng.chance(0.5) ? 'handstand' : 'fallen');
  await s.pwait(2.0);
  w.audience.react(q2 > 0.6 ? 'cheer' : 'clap', 0.6);
  for (const ch of team) ch.set('stretch');
  await s.pwait(1.0);
  // The pyramid.
  if (team.length >= 2) {
    const top = team[team.length - 1];
    const base = team.slice(0, -1);
    base.forEach((ch, i) => ch.walkTo(new THREE.Vector3((i - (base.length - 1) / 2) * 0.55, STAGE_Y, MARK.z), 2.5));
    top.walkTo(new THREE.Vector3(0, STAGE_Y, MARK.z - 0.05), 2.5);
    await w.clock.waitFor(() => team.every((ch) => ch.arrived), s.perf.token, 3);
    for (const ch of team) ch.face(0);
    for (const ch of base) ch.set('lift', 'nervous');
    w.audio.sfx('drumroll', { dur: 1.6 });
    const height = 1.25 * base[0].scale;
    await animate(s, 1.4, (k) => (top.root.position.y = STAGE_Y + height * k));
    top.set('stretch');
    top.intensity = 1;
    const q = s.beat({ big: true, difficulty: 0.5 });
    if (q < 0.35) {
      await s.pwait(0.6);
      await animate(s, 0.4, (k) => (top.root.position.y = STAGE_Y + height * (1 - k)));
      for (const ch of team) ch.set('fallen', 'shock');
      w.audio.sfx('thud');
      w.audio.sfx('crash');
      w.look.shake(0.1);
      w.audience.react('gasp', 1);
      await s.pwait(1.5);
      for (const ch of team) ch.set('idle', 'sad');
    } else {
      w.audio.sfx('tada');
      w.audience.react('cheer', 1);
      s.studio.mood.flash = 1;
      await s.pwait(2);
      await animate(s, 0.4, (k) => (top.root.position.y = STAGE_Y + height * (1 - k)));
      for (const ch of team) ch.set('present', 'elated');
    }
  }
}

// --- Strongmen -------------------------------------------------------------------------------------------------

function barbell(weight) {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.7, 10), mat(0xcfcfd6, { metalness: 0.9, roughness: 0.25 }));
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const side of [-1, 1]) {
    for (let i = 0; i < weight; i++) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2 + i * 0.03, 0.2 + i * 0.03, 0.07, 20), mat(i % 2 ? 0x111111 : 0xb3202a, { roughness: 0.5 }));
      disc.rotation.z = Math.PI / 2;
      disc.position.x = side * (0.62 + i * 0.075);
      g.add(disc);
    }
  }
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}

async function strongman(s, c) {
  const w = s.w;
  const ch = c.lead;
  s.music();
  const lifts = s.short ? [1, 3] : [1, 2, 4];
  let current = null;
  let held = 0; // 0 floor … 1 overhead
  s.everyFrame(() => {
    if (!current) return;
    const base = ch.position;
    current.position.set(base.x, STAGE_Y + 0.22 + held * 1.95 * ch.scale, base.z + 0.25);
  });
  try {
    for (let i = 0; i < lifts.length; i++) {
      if (current) w.scene.remove(current);
      current = barbell(lifts[i]);
      w.scene.add(current);
      held = 0;
      ch.set('stretch', 'cocky');
      ch.intensity = 1;
      w.audio.sfx('thud');
      await s.pwait(1.0);
      ch.set('lift', 'angry');
      const q = s.beat({ big: i === lifts.length - 1, difficulty: i * 0.3 });
      const reach = q > 0.35 ? 1 : 0.45;
      await animate(s, 1.4, (k) => (held = reach * k * k));
      if (q > 0.35) {
        ch.emotion = 'elated';
        w.audience.react(q > 0.7 ? 'cheer' : 'clap', 0.6 + i * 0.2);
        await s.pwait(1.2);
        await animate(s, 0.25, (k) => (held = 1 - k));
        w.audio.sfx('thud');
        w.look.shake(0.08);
      } else {
        await animate(s, 0.3, (k) => (held = reach * (1 - k)));
        w.audio.sfx('thud');
        w.look.shake(0.1);
        ch.set('idle', 'sad');
        w.audience.react(rng.chance(0.5) ? 'gasp' : 'aww', 0.7);
        await s.pwait(1.0);
      }
    }
    ch.set('present', 'elated');
  } finally {
    s.after(() => current && w.scene.remove(current));
  }
}

export const ACT_SCRIPTS = {
  singer,
  opera: singer,
  kazoo: singer,
  whistler: singer,
  dancer: dancers,
  crew: dancers,
  band,
  choir,
  magician,
  comedian,
  juggler,
  dog: dogAct,
  acro,
  vent,
  strongman,
};
