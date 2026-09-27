// Lull — the save: lines banked, items, cosmetics, settings, every statistic, the factory, and where each mode
// was left. Saved to Application Support by the macOS app, to localStorage in a browser.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { native, dateKey, Emitter, Factory } = L;

  const SAVE_VERSION = 2;
  const LS_KEY = 'lull.save.v1';

  // ---- the catalog --------------------------------------------------------------------------------------------------

  // Item types: the bar under the board shows one button per type; each opens a tray of its items.
  const ITEM_GROUPS = [
    { id: 'shape', name: 'Shapers', short: 'Shape', icon: '◇' },
    { id: 'choice', name: 'Choice', icon: '☰' },
    { id: 'tool', name: 'Tools', icon: '↡' },
    { id: 'board', name: 'Board', icon: '⟲' },
    { id: 'luck', name: 'Luck', icon: '★' },
  ];
  // Single-use power-ups, bought with lines right where they are used — the item bar under the Relaxed board (never
  // the Shop) — and given free by the daily gift and, now and then, by play (js/items.js: Gifts, Earn; rarity weights
  // those draws: common 8, uncommon 3, rare 1). Shapers change the piece in play; Choice picks which piece it is;
  // Tools turn it into something that acts where it lands; Board items act on the board at once; Luck changes what
  // the next clears pay, and nothing else.
  const ITEMS = {
    reroll:    { group: 'shape', name: 'Reroll', icon: '⟳', price: 15, rarity: 'common', desc: 'Swap the piece in play for a different one.' },
    mirror:    { group: 'shape', name: 'Mirror', icon: '⇋', price: 15, rarity: 'common', desc: 'Flip the piece in play: J and L, S and Z swap.' },
    pebble:    { group: 'shape', name: 'Pebble', icon: '●', price: 20, rarity: 'common', desc: 'The piece in play becomes a single block.' },
    noodle:    { group: 'shape', name: 'Noodle', icon: '∿', price: 25, rarity: 'uncommon', desc: 'The piece becomes a six-long rod.' },
    giant:     { group: 'shape', name: 'Giant', icon: '▣', price: 30, rarity: 'uncommon', desc: 'The piece grows to twice its size.' },
    blueprint: { group: 'shape', name: 'Blueprint', icon: '▦', price: 100, rarity: 'rare', desc: 'Draw your own piece, up to six connected blocks.' },
    pick:      { group: 'choice', name: 'Pick of Three', icon: '⁝', price: 20, rarity: 'common', desc: 'Play one of the next three pieces now; this one takes its place in line.' },
    fit:       { group: 'choice', name: 'Best Fit', icon: '✧', price: 45, rarity: 'uncommon', desc: 'The piece becomes the one that fits the stack best, right over its spot.' },
    order:     { group: 'choice', name: 'Order Slip', icon: '✎', price: 35, rarity: 'rare', desc: 'Choose the piece in play.' },
    patch:     { group: 'tool', name: 'Patch', icon: '⊡', price: 20, rarity: 'common', desc: 'One block that drops into the highest covered hole in its column.' },
    phase:     { group: 'tool', name: 'Ghost', icon: '⬚', price: 50, rarity: 'uncommon', desc: 'The piece passes through blocks into the first gap below where it fits.' },
    drill:     { group: 'tool', name: 'Drill', icon: '⇣', price: 40, rarity: 'uncommon', desc: 'A bit that bores out its whole column.' },
    bomb:      { group: 'tool', name: 'Bomb', icon: '✹', price: 45, rarity: 'uncommon', desc: 'Clears a 13-block diamond where it lands.' },
    laser:     { group: 'tool', name: 'Laser', icon: '↯', price: 65, rarity: 'rare', desc: 'Clears every row the piece touches, full or not.' },
    blackhole: { group: 'tool', name: 'Black Hole', icon: '◎', price: 90, rarity: 'rare', desc: 'Swallows everything within three blocks of where it sets.' },
    flip:      { group: 'board', name: 'Mirror World', icon: '⇄', price: 20, rarity: 'common', desc: 'Flips the whole board left to right.' },
    rewind:    { group: 'board', name: 'Rewind', icon: '↶', price: 25, rarity: 'common', desc: 'Take back your last placement, and the lines it cleared.' },
    trapdoor:  { group: 'board', name: 'Trapdoor', icon: '⤓', price: 40, rarity: 'uncommon', desc: 'The bottom row falls away, whatever it holds.' },
    tornado:   { group: 'board', name: 'Tornado', icon: '◌', price: 60, rarity: 'rare', desc: 'Shuffles the columns, holes and all.' },
    settle:    { group: 'board', name: 'Settle', icon: '⤋', price: 70, rarity: 'rare', desc: 'Every block falls straight down, closing every hole. Full rows clear.' },
    golden:    { group: 'luck', name: 'Golden Piece', icon: '✦', price: 35, rarity: 'uncommon', desc: 'Your next five clears pay triple.' },
    double:    { group: 'luck', name: 'Double or Nothing', icon: '◐', price: 30, rarity: 'uncommon', desc: 'Your next clear pays double if it is a quad or a T-spin, and nothing if it is less.' },
    net:       { group: 'luck', name: 'Safety Net', icon: '⊔', price: 60, rarity: 'rare', desc: 'Keeps your back-to-back streak through one ordinary clear.' },
  };
  // Items that no longer exist: what an old save's leftovers become (a comparable item, or their old price back in
  // lines). The sandbox's matter and energy went with the sandbox; Nuke, Chroma Purge, Anvil and Jackpot with it.
  const RETIRED_ITEMS = {
    magnet: { price: 45 },
    sand: { to: 'patch' }, water: { to: 'patch' }, lava: { to: 'patch' }, seed: { price: 20 }, oil: { price: 15 },
    acid: { to: 'drill' }, frost: { price: 25 }, steel: { price: 30 }, tnt: { to: 'bomb' }, torch: { price: 25 }, bolt: { price: 40 },
    anvil: { to: 'drill' }, nuke: { to: 'blackhole' }, purge: { price: 75 }, jackpot: { price: 50 },
  };
  const ITEM_ORDER = ITEM_GROUPS.flatMap((g) => Object.keys(ITEMS).filter((id) => ITEMS[id].group === g.id));

  // Colour slots: 1 I, 2 O, 3 T, 4 S, 5 Z, 6 J, 7 L, 8 garbage, 9–14 other shapes, 15 custom.
  const PALETTES = {
    classic:  { name: 'Classic', price: 0, colors: ['#000', '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#64b5f6', '#ffb74d', '#6b7280', '#f06292', '#aed581', '#4db6ac', '#9575cd', '#ff8a65', '#90a4ae', '#b8c4d6'] },
    pastel:   { name: 'Pastel', price: 250, colors: ['#000', '#a8e6f0', '#fff1a8', '#d9b8f0', '#b8e6c1', '#f5b8b8', '#b8d4f5', '#fcd5b0', '#9ca3af', '#f7c6d9', '#d4ecb3', '#b3e0db', '#cdbff0', '#f9c9b5', '#c4ced4', '#fafafa'] },
    ink:      { name: 'Ink', price: 300, colors: ['#000', '#e8e8e8', '#cfcfcf', '#b5b5b5', '#9d9d9d', '#858585', '#6e6e6e', '#dcdcdc', '#4b4b4b', '#c2c2c2', '#a9a9a9', '#909090', '#777', '#5f5f5f', '#b0b0b0', '#ffffff'] },
    neon:     { name: 'Neon', price: 400, colors: ['#000', '#00f0ff', '#faff00', '#d400ff', '#39ff14', '#ff2079', '#2d6bff', '#ff8c00', '#3a3f55', '#ff4ecd', '#b4ff39', '#00ffc3', '#8a5cff', '#ff5e3a', '#7a8cff', '#ffffff'] },
    sunset:   { name: 'Sunset', price: 500, colors: ['#000', '#ffb88c', '#ffd56b', '#de6fa1', '#f7a072', '#e8505b', '#a06cd5', '#f9844a', '#5c4a6e', '#ff9aa2', '#ffcf99', '#c86b98', '#8f5fa8', '#ff7b54', '#b38fa8', '#fff2e0'] },
    forest:   { name: 'Forest', price: 500, colors: ['#000', '#8fbc8f', '#d4c16a', '#7a9e7e', '#5f8d4e', '#b5651d', '#3e6b48', '#c8a165', '#4a4436', '#a3b18a', '#dad7cd', '#588157', '#6b705c', '#bc6c25', '#8a817c', '#f1efe2'] },
    ocean:    { name: 'Ocean', price: 500, colors: ['#000', '#48cae4', '#ade8f4', '#0077b6', '#90e0ef', '#023e8a', '#00b4d8', '#caf0f8', '#34506b', '#5fa8d3', '#62b6cb', '#1b98e0', '#4895ef', '#80ffdb', '#7d9fb6', '#f0fbff'] },
    candy:    { name: 'Candy', price: 600, colors: ['#000', '#7ee8fa', '#fdfd96', '#ff9cee', '#b5ff9c', '#ff6b9d', '#9cb4ff', '#ffc09c', '#8a7f9c', '#ff85c0', '#c7ff85', '#85ffe0', '#c485ff', '#ffa585', '#d0c3e0', '#fff'] },
    handheld: { name: 'Handheld', price: 750, colors: ['#000', '#9bbc0f', '#8bac0f', '#306230', '#8bac0f', '#306230', '#0f380f', '#9bbc0f', '#0f380f', '#8bac0f', '#306230', '#9bbc0f', '#306230', '#8bac0f', '#0f380f', '#cadc9f'] },
    vapor:    { name: 'Vapor', price: 900, colors: ['#000', '#01cdfe', '#fffb96', '#b967ff', '#05ffa1', '#ff71ce', '#7b8cff', '#ffb3fd', '#50456b', '#ff9ff3', '#a3fff0', '#6effd6', '#c89bff', '#ffa3c7', '#9f95c9', '#fdf6ff'] },
    assembly: { name: 'Assembly Line', price: 0, reward: 'Build a second press in the factory', colors: ['#000', '#f2c14e', '#f78154', '#4d9078', '#b4436c', '#5fad56', '#2e86ab', '#f2a541', '#3d4451', '#e0a458', '#8bb174', '#5b8e7d', '#a1869e', '#d1495b', '#8d99ae', '#edf2f4'] },
    gold:     { name: 'Gold Leaf', price: 2500, colors: ['#000', '#f9e79f', '#f4d03f', '#d4ac0d', '#f7dc6f', '#b7950b', '#e9c46a', '#fcf3cf', '#5a4a1f', '#f5cba7', '#e59866', '#dc7633', '#f0b27a', '#ca6f1e', '#b9a37a', '#fffaf0'] },
    prism:    { name: 'Prism', price: 4000, animated: true, colors: null },
  };

  const SKINS = {
    flat:    { name: 'Flat', price: 0 },
    bevel:   { name: 'Bevel', price: 300 },
    outline: { name: 'Outline', price: 350 },
    bubble:  { name: 'Bubble', price: 450 },
    pixel:   { name: 'Pixel', price: 500 },
    glass:   { name: 'Glass', price: 600 },
    wire:    { name: 'Wireframe', price: 700 },
    neon:    { name: 'Neon Tube', price: 800 },
    brick:   { name: 'Brick', price: 900 },
    gem:     { name: 'Gem', price: 1200 },
    jelly:   { name: 'Jelly', price: 1500 },
    steel:   { name: 'Steel', price: 0, reward: 'Build all four factory presses' },
  };

  const FRAMES = {
    hairline: { name: 'Hairline', price: 0 },
    double:   { name: 'Double', price: 200 },
    dashed:   { name: 'Dashed', price: 300 },
    rounded:  { name: 'Rounded', price: 400 },
    glow:     { name: 'Glow', price: 500 },
    brass:    { name: 'Brass', price: 1000 },
    rainbow:  { name: 'Rainbow', price: 1500, animated: true },
    hazard:   { name: 'Hazard Tape', price: 0, reward: 'Build a third press in the factory' },
  };

  const BACKDROPS = {
    none:      { name: 'Plain', price: 0 },
    grid:      { name: 'Grid', price: 0 },
    dots:      { name: 'Dots', price: 150 },
    scan:      { name: 'Scanlines', price: 300 },
    blueprint: { name: 'Blueprint', price: 400 },
    dusk:      { name: 'Dusk', price: 600 },
    stars:     { name: 'Starfield', price: 800 },
    belt:      { name: 'Conveyor', price: 0, reward: 'Collect 500 lines from the factory' },
  };

  const EFFECTS = {
    fade:     { name: 'Fade', price: 0 },
    sparkle:  { name: 'Sparkle', price: 500 },
    ripple:   { name: 'Ripple', price: 700 },
    shatter:  { name: 'Shatter', price: 900 },
    confetti: { name: 'Confetti', price: 1200 },
    sparks:   { name: 'Welding Sparks', price: 0, reward: 'Build the tallest factory bin' },
  };

  const GHOSTS = {
    outline: { name: 'Outline', price: 0 },
    faint:   { name: 'Faint', price: 100 },
    dotted:  { name: 'Dotted', price: 150 },
    glow:    { name: 'Glow', price: 250 },
    off:     { name: 'Off', price: 0 },
  };

  // Sound packs (the synth voices live in audio.js).
  const SOUNDS = {
    soft:       { name: 'Drift', price: 0 },
    typewriter: { name: 'Typewriter', price: 300 },
    chip:       { name: 'Chiptune', price: 400 },
    bubbles:    { name: 'Bubbles', price: 450 },
    marimba:    { name: 'Marimba', price: 600 },
    synth:      { name: 'Analog Synth', price: 750 },
    glass:      { name: 'Glass', price: 900 },
    chimes:     { name: 'Wind Chimes', price: 1200 },
  };

  const COSMETICS = { palette: PALETTES, skin: SKINS, frame: FRAMES, backdrop: BACKDROPS, effect: EFFECTS, ghost: GHOSTS, sound: SOUNDS };
  const COSMETIC_LABELS = { palette: 'Palettes', skin: 'Mino skins', frame: 'Frames', backdrop: 'Backdrops', effect: 'Line clears', ghost: 'Ghosts', sound: 'Sounds' };

  const ACCENTS = ['#8fb3ff', '#7bd88f', '#f6c177', '#eb6f92', '#c4a7e7', '#9ccfd8', '#f5f5f5', '#ff9e64'];

  // ---- state --------------------------------------------------------------------------------------------------------

  function freshPuzzleDiff() { return { played: 0, solved: 0, firstTry: 0, attempts: 0, fails: 0, bestMs: 0, totalMs: 0, streak: 0, bestStreak: 0, hints: 0 }; }

  function defaults() {
    const now = Date.now();
    return {
      v: SAVE_VERSION,
      created: now,
      lines: 0,
      inventory: Object.fromEntries(ITEM_ORDER.map((k) => [k, 0])),
      owned: { palette: ['classic'], skin: ['flat'], frame: ['hairline'], backdrop: ['none', 'grid'], effect: ['fade'], ghost: ['outline', 'off'], sound: ['soft'] },
      equipped: { palette: 'classic', skin: 'flat', frame: 'hairline', backdrop: 'grid', effect: 'fade', ghost: 'outline', sound: 'soft' },
      settings: {
        bg: 'glass', tint: 0.78, accent: ACCENTS[0], theme: 'dark', onTop: true, fadeAway: true,
        sound: true, volume: 0.35, das: 230, arr: 55, lowerRepeat: 70, mouse: true, preview: 5,
        motion: 'full', showKeys: true, music: true, musicVolume: 0.25, announcer: true, announcerRelaxed: false, announcerVolume: 0.4, ccwPuzzles: false,
        muted: false, // the top bar's mute (M): over everything, separate from the toggles and volumes above
        hints: true, // control hints (js/hints.js); they retire on their own either way
      },
      tab: 'play',
      free: null,
      achievements: {},
      // Control hints (js/hints.js): pieces and board time toward retiring them all, times each was shown, good uses
      // of each control, the ones retired for good. seeded: an older save has had its history counted in, once.
      hints: { seeded: 0, pieces: 0, ms: 0, over: false, shown: {}, skill: {}, retired: {} },
      combos: {}, // Free Play combos found: id → { n: times, lines: paid, first: when }
      gift: { at: null, n: 0, log: [] }, // the daily gift: when it was last opened (ms), how many, the last few
      earn: { board: null, paid: 0 }, // power-ups earned by lines on one board (js/items.js, Earn): which board, how many paid
      puzzle: { diff: 'E', next: { E: 1, M: 1, H: 1 }, current: null, solved: {}, history: [], saved: [] },
      factory: Factory.create(),
      stats: {
        sessions: 0, days: 0, timeMs: { play: 0, classic: 0, puzzle: 0, factory: 0, total: 0 },
        classic: { games: 0, best: 0, bestLevel: 0, bestLines: 0, lines: 0, pieces: 0 },
        lines: { earned: 0, spent: 0, play: 0, puzzles: 0, contracts: 0, achievements: 0, refunded: 0, luck: 0, combos: 0 },
        free: { boardLog: [], boards: 1, pieces: 0, lines: 0, score: 0, bestScore: 0, bestLines: 0, clears: [0, 0, 0, 0, 0, 0], tspins: 0, tspinLines: 0, perfect: 0, maxCombo: 0, maxB2B: 0, holds: 0, rotations: 0, moves: 0, lowers: 0, drops: 0, byType: {}, topouts: 0 },
        // firstRun: first-try solves in a row; dailyRun: Dailies solved on consecutive dates (runDay is the last one).
        puzzle: { E: freshPuzzleDiff(), M: freshPuzzleDiff(), H: freshPuzzleDiff(), mods: {}, daily: 0, lastDaily: null, firstRun: 0, bestFirstRun: 0, dailyRun: 0, bestDailyRun: 0, runDay: null },
        items: { bought: {}, used: {}, got: {} },
        cosmetics: { bought: 0, spent: 0 },
      },
      history: {},
    };
  }

  /** Fills in anything a newer version added, keeping everything the save already has. */
  function merge(base, saved) {
    if (saved == null || typeof saved !== 'object' || Array.isArray(saved)) return saved === undefined ? base : saved;
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    for (const k of Object.keys(saved)) {
      const b = base ? base[k] : undefined;
      if (b && typeof b === 'object' && !Array.isArray(b) && saved[k] && typeof saved[k] === 'object' && !Array.isArray(saved[k])) out[k] = merge(b, saved[k]);
      else out[k] = saved[k];
    }
    return out;
  }

  /** Brings an older save up to date. */
  function migrate(st) {
    if ((st.v || 1) < 2) {
      // v2: sound on by default, a longer key-repeat delay, and the old defaults moved with it.
      st.settings.sound = true;
      if (st.settings.das === 150) st.settings.das = 230;
      if (st.settings.arr === 45) st.settings.arr = 55;
      if (st.settings.lowerRepeat === 60) st.settings.lowerRepeat = 70;
    }
    for (const k of Object.keys(COSMETICS)) {
      if (!Array.isArray(st.owned[k])) st.owned[k] = [];
      const free = Object.keys(COSMETICS[k]).find((id) => COSMETICS[k][id].price === 0 && !COSMETICS[k][id].reward);
      if (free && !st.owned[k].includes(free)) st.owned[k].push(free);
      if (!COSMETICS[k][st.equipped[k]] || !st.owned[k].includes(st.equipped[k])) st.equipped[k] = free;
    }
    st.settings.muted = st.settings.muted === true;
    migrateHints(st);
    migrateItems(st);
    if (!Array.isArray(st.puzzle.history)) st.puzzle.history = [];
    if (!Array.isArray(st.puzzle.saved)) st.puzzle.saved = [];
    // Days played used to be counted from the day log alone (which keeps 120 days); older saves start from that, once.
    if (!st.stats.daysCounted) {
      st.stats.days = Math.max(st.stats.days || 0, Object.keys(st.history || {}).length);
      for (const d of Object.values(st.history || {})) if (d && typeof d === 'object') d.played = 1;
      st.stats.daysCounted = 1;
    }
    // The factory's own save (v6: presses fill a bin with lines); credits are gone from the day log too.
    st.factory = Factory.migrate(st.factory);
    for (const d of Object.values(st.history || {})) if (d && typeof d === 'object') delete d.credits;
    st.v = SAVE_VERSION;
    return st;
  }

  /**
   * Items an old save still holds that no longer exist: mapped to their replacement, or refunded at their old price.
   * Unknown ids (not ours at all) are dropped. Every item that exists has a count.
   */
  function migrateItems(st, retired) {
    retired = retired || RETIRED_ITEMS;
    const inv = st.inventory = st.inventory && typeof st.inventory === 'object' ? st.inventory : {};
    for (const id of Object.keys(inv)) {
      if (ITEMS[id]) continue;
      const n = Math.max(0, Math.floor(Number(inv[id]) || 0)), r = retired[id];
      delete inv[id];
      if (!n || !r) continue;
      if (r.to && ITEMS[r.to]) inv[r.to] = (inv[r.to] || 0) + n;
      else if (r.price) st.lines += n * r.price;
    }
    for (const id of ITEM_ORDER) if (!(inv[id] >= 0)) inv[id] = 0;
    if (!st.combos || typeof st.combos !== 'object') st.combos = {};
    // The gift used to come once a calendar day: the last date it was opened becomes that date's midnight, so the
    // next one still comes at the next midnight, and from then on 24 hours after each claim.
    const g = st.gift = st.gift && typeof st.gift === 'object' ? st.gift : {};
    if (typeof g.last === 'string' && g.at == null) { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(g.last); if (m) g.at = new Date(+m[1], +m[2] - 1, +m[3]).getTime(); }
    delete g.last;
    g.at = Number.isFinite(g.at) ? g.at : null;
    g.n = Math.max(0, Math.floor(Number(g.n) || 0));
    if (!Array.isArray(g.log)) g.log = [];
    if (!st.earn || typeof st.earn !== 'object') st.earn = { board: null, paid: 0 };
    if (st.stats && st.stats.items && !st.stats.items.got) st.stats.items.got = {};
    return st;
  }

  /**
   * Control hints: a save from before them counts the play it already has toward retiring them (pieces set in Free
   * Play and Classic, about five per puzzle opened, and time on the boards), so a seasoned player is not taught.
   */
  function migrateHints(st) {
    let hs = st.hints;
    if (!hs || typeof hs !== 'object' || Array.isArray(hs)) hs = st.hints = { seeded: 0 };
    for (const k of ['shown', 'skill', 'retired']) if (!hs[k] || typeof hs[k] !== 'object' || Array.isArray(hs[k])) hs[k] = {};
    hs.pieces = Math.max(0, Number(hs.pieces) || 0);
    hs.ms = Math.max(0, Number(hs.ms) || 0);
    hs.over = hs.over === true;
    if (!hs.seeded) {
      const S = st.stats || {}, t = S.timeMs || {}, pz = S.puzzle || {};
      const opened = ['E', 'M', 'H'].reduce((n, d) => n + ((pz[d] && pz[d].played) || 0), 0);
      hs.pieces += ((S.free && S.free.pieces) || 0) + ((S.classic && S.classic.pieces) || 0) + 5 * opened;
      hs.ms += (t.play || 0) + (t.classic || 0) + (t.puzzle || 0);
      hs.seeded = 1;
    }
    if (st.settings) st.settings.hints = st.settings.hints !== false;
    return st;
  }

  class Store extends Emitter {
    constructor() {
      super();
      this.state = defaults();
      this.dirty = false;
      this.loadedFrom = 'new';
    }

    load() {
      let raw = null;
      try {
        if (native.info && native.info.saveB64) { raw = L.decodeBase64Utf8(native.info.saveB64); this.loadedFrom = 'native'; }
        else if (root.localStorage) { raw = root.localStorage.getItem(LS_KEY); if (raw) this.loadedFrom = 'browser'; }
      } catch (e) { raw = null; }
      if (raw) {
        try { this.state = merge(defaults(), JSON.parse(raw)); } catch (e) { this.state = defaults(); this.loadedFrom = 'corrupt'; }
      }
      migrate(this.state);
      this.state.stats.sessions++;
      return this.state;
    }

    serialize() { return JSON.stringify(this.state); }

    save() {
      const json = this.serialize();
      this.dirty = false;
      if (native.available) native.post('save', { data: json });
      else {
        try { root.localStorage && root.localStorage.setItem(LS_KEY, json); } catch (e) { /* storage full or blocked */ }
      }
      this.emit('saved');
    }

    touch() { this.dirty = true; this.emit('change'); }

    reset() {
      const keepSettings = this.state.settings;
      this.state = defaults();
      this.state.settings = keepSettings;
      this.save();
    }

    importJSON(text) {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || parsed.v == null) throw new Error('Not a Lull save');
      this.state = merge(defaults(), parsed);
      this.save();
    }

    // ---- lines: the currency ----------------------------------------------------------------------------------------

    day() {
      const k = dateKey();
      const h = this.state.history;
      if (!h[k]) {
        h[k] = { lines: 0, pieces: 0, puzzles: 0, minos: 0, ms: 0 };
        const keys = Object.keys(h).sort();
        while (keys.length > 120) delete h[keys.shift()];
      }
      return h[k];
    }

    /** Today counts as a day played: called from real, in-front play (a factory running alone does not count). */
    played() {
      const d = this.day();
      if (d.played) return;
      d.played = 1;
      this.state.stats.days = (this.state.stats.days || 0) + 1;
    }

    addLines(n, source) {
      if (!n) return;
      const s = this.state;
      s.lines += n;
      if (n > 0) {
        s.stats.lines.earned += n;
        if (source && s.stats.lines[source] != null) s.stats.lines[source] += n;
        this.day().lines += n;
      } else {
        s.stats.lines.refunded += -n;
      }
      this.touch();
      this.emit('lines', n, source);
    }

    spend(n) {
      if (this.state.lines < n) return false;
      this.state.lines -= n;
      this.state.stats.lines.spent += n;
      this.touch();
      this.emit('lines', -n, 'spend');
      return true;
    }

    /**
     * The daily gift (Relaxed tab): three power-ups, 24 hours after the last one was opened (js/items.js, Gifts).
     * The draw is fixed by the save and how many gifts it has opened; the claim is booked and saved at once.
     * Returns the ids, or null (not ready yet).
     */
    openGift(now) {
      const st = this.state;
      now = now == null ? Date.now() : now;
      if (!L.Gifts || !L.Gifts.ready(st, now)) return null;
      const ids = L.Gifts.forClaim(st.created, st.gift.n || 0);
      for (const id of ids) this.grantItem(id, 1);
      st.gift.at = now; st.gift.n = (st.gift.n || 0) + 1;
      st.gift.log.unshift({ at: now, ids });
      if (st.gift.log.length > 14) st.gift.log.length = 14;
      this.save();
      return ids;
    }

    /** Buys a power-up with lines (the Relaxed tab's item bar). */
    buyItem(id, qty) {
      qty = qty || 1;
      const it = ITEMS[id];
      if (!it || !this.spend(it.price * qty)) return false;
      this.state.inventory[id] = (this.state.inventory[id] || 0) + qty;
      this.state.stats.items.bought[id] = (this.state.stats.items.bought[id] || 0) + qty;
      this.touch();
      return true;
    }

    grantItem(id, qty) {
      if (!ITEMS[id]) return;
      qty = qty || 1;
      this.state.inventory[id] = (this.state.inventory[id] || 0) + qty;
      const got = this.state.stats.items.got = this.state.stats.items.got || {};
      got[id] = (got[id] || 0) + qty;
      this.touch();
    }

    useItem(id) {
      const inv = this.state.inventory;
      if (!inv[id]) return false;
      inv[id]--;
      this.state.stats.items.used[id] = (this.state.stats.items.used[id] || 0) + 1;
      this.touch();
      return true;
    }

    owns(kind, id) { return this.state.owned[kind].includes(id); }

    buyCosmetic(kind, id) {
      const c = COSMETICS[kind][id];
      if (!c || this.owns(kind, id) || c.reward) return false;
      if (!this.spend(c.price)) return false;
      this.state.owned[kind].push(id);
      this.state.stats.cosmetics.bought++;
      this.state.stats.cosmetics.spent += c.price;
      this.touch();
      return true;
    }

    grantCosmetic(kind, id) {
      if (this.owns(kind, id)) return false;
      this.state.owned[kind].push(id);
      this.touch();
      return true;
    }

    equip(kind, id) {
      if (!this.owns(kind, id)) return false;
      this.state.equipped[kind] = id;
      this.touch();
      this.emit('equip', kind, id);
      return true;
    }
  }

  L.Store = Store;
  Object.assign(L, { SOUNDS, migrateState: migrate, migrateItems, migrateHints, RETIRED_ITEMS, ITEMS, ITEM_ORDER, ITEM_GROUPS, PALETTES, SKINS, FRAMES, BACKDROPS, EFFECTS, GHOSTS, COSMETICS, COSMETIC_LABELS, ACCENTS, SAVE_VERSION, defaultState: defaults, mergeState: merge });
})(typeof globalThis !== 'undefined' ? globalThis : this);
