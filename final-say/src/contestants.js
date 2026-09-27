// Who walks on stage: an act, one or more people (sometimes a dog or a puppet), their story, how good they really
// are, and how they will talk about it.
import * as THREE from 'three';
import { Character, Dog, Props, randomLook, CLOTH } from './character.js';
import { ACTS, DOG_NAMES, DREAMS, EXPERIENCE, FIRST_F, FIRST_M, GROUP_ADJ, GROUP_NOUN, JOBS, JOB_BANTER, LAST, NICKS, ORIGIN_PLACES, ORIGIN_THINGS, PERSONAS, PLACES, PUPPET_NAMES, REPLIES, SONGS, SUPPORTERS, WHY } from './data.js';
import { MARK, WING } from './studio.js';
import { cap, clamp, fill, rng } from './util.js';

const AGES = {
  singer: [9, 82],
  opera: [45, 86],
  kazoo: [11, 78],
  whistler: [30, 84],
  dancer: [10, 38],
  crew: [14, 30],
  band: [16, 45],
  choir: [9, 80],
  magician: [12, 72],
  comedian: [19, 70],
  juggler: [12, 60],
  dog: [10, 76],
  acro: [16, 32],
  vent: [26, 74],
  strongman: [22, 58],
};

const PERSONA_TRAITS = {
  shy: { nerve: 0.9, charm: 0.62, conf: 0.3, expect: -0.15 },
  sweet: { nerve: 0.7, charm: 0.75, conf: 0.5, expect: 0 },
  confident: { nerve: 0.35, charm: 0.55, conf: 0.7, expect: 0.1 },
  cocky: { nerve: 0.2, charm: 0.3, conf: 0.85, expect: 0.18 },
  quirky: { nerve: 0.5, charm: 0.66, conf: 0.55, expect: -0.05 },
  deadpan: { nerve: 0.3, charm: 0.48, conf: 0.6, expect: 0 },
};

let nextId = 1;

// A running order with a spread of quality: at least one star and one disaster, rarely in the same slot twice.
export function makeLineup(count, r = rng, forcedTypes = null) {
  const tiers = [
    [0.86, 0.97],
    [0.05, 0.22],
    [0.62, 0.8],
    [0.4, 0.58],
    [0.25, 0.42],
    [0.0, 1.0],
    [0.7, 0.9],
    [0.1, 0.35],
  ];
  const picked = tiers.slice(0, count).map(([a, b]) => r.range(a, b));
  while (picked.length < count) picked.push(r.range(0.05, 0.95));
  let order = r.shuffle(picked);
  // Keep the star out of the opening slot: the show builds.
  const star = order.indexOf(Math.max(...order));
  if (star === 0 && count > 1) [order[0], order[count - 1]] = [order[count - 1], order[0]];
  const types = forcedTypes && forcedTypes.length ? forcedTypes.filter((t) => ACTS[t]) : r.shuffle(Object.keys(ACTS));
  return order.map((talent, i) => makeContestant({ talent, type: types[i % types.length] }, r));
}

export function makeContestant(opts = {}, r = rng) {
  const type = opts.type || r.pick(Object.keys(ACTS));
  const act = ACTS[type];
  const talent = opts.talent ?? r.range(0.05, 0.95);
  const size = r.int(act.members[0], act.members[1]);
  let persona = opts.persona || r.pick(PERSONAS);
  // Brilliant acts are often the quiet ones.
  if (talent > 0.85 && r.chance(0.45)) persona = r.pick(['shy', 'sweet']);
  if (talent < 0.2 && r.chance(0.4)) persona = 'cocky';
  const [amin, amax] = AGES[type];
  const lookAge = talent > 0.85 && r.chance(0.35) ? r.int(Math.max(amin, 60), Math.max(amax, 70)) : r.int(amin, amax);

  const members = [];
  const uniform = type === 'crew' || type === 'choir' || type === 'acro' ? r.pick(CLOTH) : null;
  const uniform2 = r.pick(CLOTH);
  for (let m = 0; m < size; m++) {
    const feminine = r.chance(0.5);
    const age = m === 0 ? lookAge : clamp(lookAge + r.int(-12, 12), AGES[type][0], 90);
    const extra = {};
    const look = randomLook(r, { age, feminine, top: uniform || undefined, bottom: uniform ? uniform2 : undefined });
    if (type === 'choir') {
      look.bottomStyle = 'dress';
      look.hat = null;
    }
    if (type === 'magician' && m === 0) {
      Object.assign(look, { top: 0x15131d, bottom: 0x15131d, bottomStyle: 'trousers', hat: 'tophat', hatColor: 0x111111, bowtie: 0xb3202a });
    }
    if (type === 'magician' && m === 1) Object.assign(look, { top: 0xff4fb6, bottomStyle: 'dress', hat: null });
    if (type === 'strongman') Object.assign(look, { build: 1.35, bottomStyle: 'shorts', top: 0xb3202a, sleeves: 'short', beard: 'mustache', hat: null });
    if (type === 'acro') Object.assign(look, { bottomStyle: 'shorts', hat: null, sleeves: 'short', build: r.range(0.85, 1.05) });
    if (type === 'opera') Object.assign(look, { bottomStyle: feminine ? 'dress' : 'trousers', top: feminine ? r.pick([0x8b0000, 0x1d3557, 0x7c5cff]) : 0x15131d, bowtie: feminine ? null : 0xffffff });
    members.push({ first: r.pick(feminine ? FIRST_F : FIRST_M), last: r.pick(LAST), feminine, age, look, extra });
  }
  const lead = members[0];
  const group = size > 1 && type !== 'magician';
  const dogName = type === 'dog' ? r.pick(DOG_NAMES) : null;
  const puppetName = type === 'vent' ? r.pick(PUPPET_NAMES) : null;
  let name;
  if (group) {
    const nouns = GROUP_NOUN[type === 'crew' ? 'crew' : type === 'band' ? 'band' : type === 'choir' ? 'choir' : 'acro'];
    name = r.chance(0.3) ? `The ${lead.last} ${type === 'choir' ? 'Family Choir' : 'Family'}` : r.chance(0.5) ? `The ${r.pick(GROUP_ADJ)} ${r.pick(nouns)}` : `${r.pick(PLACES)} ${r.pick(nouns)}`;
  } else if (type === 'dog') name = `${lead.first} & ${dogName}`;
  else if (type === 'vent') name = `${lead.first} & ${puppetName}`;
  else if (type === 'magician' && size > 1) name = `The Great ${lead.last}`;
  else name = `${lead.first} ${lead.last}`;

  const traits = PERSONA_TRAITS[persona];
  const expIdx = clamp(Math.round(talent * 6 + r.gauss() * 1.6), 0, EXPERIENCE.length - 1);
  const [supporter, sup] = r.pick(SUPPORTERS);
  const why = r.pick(WHY);
  const dream = r.pick(DREAMS);
  const song = r.pick(SONGS);
  const from = r.pick(PLACES);
  const job = lead.age < 17 ? 'at school' : lead.age > 67 ? `retired — I was ${r.pick(JOBS)}` : r.pick(JOBS);
  const actDesc = fill(r.pick(act.desc), { song, dog: dogName, puppet: puppetName });
  const ages = members.map((m) => m.age);
  const vars = {
    first: lead.first,
    name,
    nick: r.pick(NICKS),
    age: group ? `between ${Math.min(...ages)} and ${Math.max(...ages)}` : String(lead.age),
    agejoke: lead.age > 60 ? 'and still going!' : lead.age < 14 ? 'and three quarters!' : 'and loving it!',
    from,
    job: lead.age < 17 ? 'still at school' : job,
    act: actDesc,
    exp: EXPERIENCE[expIdx][0],
    why,
    whylow: why[0].toLowerCase() + why.slice(1),
    supporter: cap(supporter),
    sup,
    dream,
    dreamlow: dream[0].toLowerCase() + dream.slice(1),
    dreamverb: dream[0].toLowerCase() + dream.slice(1),
    song,
    dog: dogName,
    puppet: puppetName,
    place: r.pick(ORIGIN_PLACES),
    thing: r.pick(ORIGIN_THINGS),
    actlabel: act.label.toLowerCase(),
    jobbanter: JOB_BANTER[job] || null,
  };
  const pitchBase = lead.age < 13 ? r.range(290, 340) : lead.feminine ? r.range(195, 255) : r.range(100, 150);
  const music = act.music ? { style: r.pick(act.music), key: r.int(55, 64), lead: act.lead || null } : null;
  return {
    id: nextId++,
    type,
    act,
    label: act.label,
    group,
    members,
    size,
    name,
    first: lead.first,
    persona,
    talent,
    nerve: clamp(traits.nerve + r.gauss() * 0.08),
    confidence: clamp(traits.conf + r.gauss() * 0.08),
    charm: clamp(traits.charm + r.gauss() * 0.1),
    novelty: act.novelty || 0,
    expectation: clamp(0.5 + traits.expect + (lead.age > 65 ? -0.12 : 0) + (lead.age < 13 ? -0.05 : 0) - (act.novelty || 0) * 0.3 + r.gauss() * 0.05),
    vars,
    known: new Set(),
    asked: new Set(),
    voice: { pitch: pitchBase * (lead.age > 70 ? 0.9 : 1), rate: persona === 'shy' ? 0.9 : persona === 'cocky' || persona === 'sweet' ? 1.12 : 1, wobble: lead.age > 72 ? 0.02 : 0, timbre: 'sawtooth' },
    dogName,
    puppetName,
    dogColors: [r.pick([0xc28a4b, 0x3b2616, 0xf2e2c0, 0x111111, 0xd6b370]), r.pick([0xffffff, 0xf2e2c0, 0x3b2616])],
    music,
    entry: opts.entry || null, // tournament entry this contestant stands for
  };
}

// A line for a contestant, in their own voice.
export function reply(c, key) {
  const table = GROUP_REPLIES[key] && c.group ? GROUP_REPLIES[key] : REPLIES[key];
  if (!table) return '';
  const list = table[c.persona] || table.any || table.confident;
  return fill(rng.pick(list), c.vars);
}

const GROUP_REPLIES = {
  name: { any: ['We’re {name}!', 'We are… {name}!', 'We’re called {name}.'] },
  age: { any: ['We’re {age}.', 'Ages {age}. Don’t ask which is which.'] },
  from: { any: ['We’re all from {from}!', '{from}! Well, most of us.'] },
  act: { any: ['We’re doing {act}', '{act}'] },
  experience: { any: ['We’ve been together {exp}.', '{exp}, as a group.'] },
  job: { any: ['All sorts! Nurse, student, bin man…', 'Day jobs. Boring ones.'] },
};

// Builds the people (and dog, puppet, props) of an act in the wings, ready to walk on.
export function spawn(world, c) {
  const chars = c.members.map((m, i) => {
    const ch = new Character(m.look);
    ch.name = m.first;
    ch.emotion = c.persona === 'shy' ? 'nervous' : c.persona === 'cocky' ? 'cocky' : c.persona === 'sweet' ? 'happy' : 'neutral';
    ch.place(WING.clone().add(new THREE.Vector3(0.6 * i, 0, 0.5 * (i % 2))));
    world.add(ch);
    return ch;
  });
  c.chars = chars;
  c.lead = chars[0];
  c.speaker = { name: c.group ? `${c.first} (${c.name})` : c.first, color: '#fff4dc', voice: c.voice, char: c.lead };
  if (c.type === 'dog') {
    const dog = new Dog(...c.dogColors);
    dog.place(WING.clone().add(new THREE.Vector3(0.6, 0, 0.3)));
    world.add(dog);
    c.dog = dog;
  }
  if (c.type === 'vent') {
    const puppetLook = randomLook(rng, { age: 40, hat: 'bowler', glasses: rng.chance(0.5) });
    puppetLook.height = 0.4;
    const puppet = new Character(puppetLook);
    puppet.head.scale.setScalar(1.6);
    puppet.set('idle', 'cocky');
    // Sits on the left forearm, at the performer's hip.
    const holder = new THREE.Group();
    holder.position.set(-0.3, 0.05, 0.2);
    holder.rotation.y = 0.45;
    holder.add(puppet.root);
    c.lead.spine.add(holder);
    c.lead.overrides = { shLX: -0.35, shLZ: 0.1, elLX: -1.25 };
    puppet.baseYaw = 0;
    c.puppet = puppet;
    world.add(puppet);
    c.puppetSpeaker = { name: c.puppetName, color: '#ff9ed2', voice: { pitch: c.voice.pitch * 1.45, rate: 1.2, timbre: 'square' }, char: puppet };
  }
  if (c.type === 'singer' || c.type === 'opera' || c.type === 'comedian') c.lead.attach('mic', Props.mic());
  if (c.type === 'magician') c.lead.attach('wand', Props.wand());
  return chars;
}

// Where each member stands on stage: the lead on the mark, the rest spread out beside and behind.
export function formation(c, i) {
  if (c.size === 1) return MARK.clone();
  if (c.type === 'band') {
    const spots = [
      [-0.3, 0],
      [-2.1, -0.6],
      [1.0, -2.0],
      [2.3, -0.6],
    ];
    const [x, z] = spots[i] || [i, -1];
    return new THREE.Vector3(x, MARK.y, MARK.z + z);
  }
  if (c.type === 'magician') return new THREE.Vector3(i ? -1.3 : 0.2, MARK.y, MARK.z - i * 0.3);
  const n = c.size;
  const spacing = n > 4 ? 0.95 : 1.15;
  const x = (i - (n - 1) / 2) * spacing;
  const z = MARK.z - (i % 2) * 0.5 + Math.abs(x) * -0.08;
  return new THREE.Vector3(x, MARK.y, z);
}
