// Lull — the save: lines banked, items, cosmetics, settings, every statistic, the factory, and where each mode
// was left. Saved to Application Support by the macOS app, to localStorage in a browser.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { native, dateKey, Emitter, Factory } = L;

  const SAVE_VERSION = 2;
  const LS_KEY = 'lull.save.v1';

  // ---- the catalog --------------------------------------------------------------------------------------------------

  // Single-use items: a few minutes of play buys most of them.
  const ITEMS = {
    reroll:    { name: 'Reroll', icon: '⟳', price: 15, desc: 'Swap the piece in play for a different one.' },
    mirror:    { name: 'Mirror', icon: '⇋', price: 15, desc: 'Flip the piece in play: J↔L, S↔Z, any shape reflected.' },
    pebble:    { name: 'Pebble', icon: '●', price: 20, desc: 'The piece in play becomes a single block. Perfect for one hole.' },
    sand:      { name: 'Sand', icon: '⁘', price: 25, desc: 'When this piece sets, each of its blocks falls on its own and fills the gaps below.' },
    rewind:    { name: 'Rewind', icon: '↶', price: 25, desc: 'Take back your last placement (and the lines it cleared).' },
    order:     { name: 'Order Slip', icon: '✎', price: 35, desc: 'Choose exactly which piece you get next.' },
    drill:     { name: 'Drill', icon: '⇣', price: 40, desc: 'Becomes a drill bit that bores out every block in its column.' },
    bomb:      { name: 'Bomb', icon: '✹', price: 45, desc: 'Becomes a bomb. Wherever it lands, it blasts a 13-block diamond.' },
    phase:     { name: 'Phase', icon: '◇', price: 50, desc: 'The piece passes through blocks. Drop it into any gap it fits, even under overhangs.' },
    settle:    { name: 'Settle', icon: '⤋', price: 70, desc: 'Every block falls straight down and closes every hole. Rows that fill up clear.' },
    purge:     { name: 'Chroma Purge', icon: '◍', price: 75, desc: 'Removes every block the same colour as the piece in play.' },
    blueprint: { name: 'Blueprint', icon: '▦', price: 100, desc: 'Draw your own piece — up to six connected blocks.' },
  };
  const ITEM_ORDER = Object.keys(ITEMS);

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
    assembly: { name: 'Assembly Line', price: 0, reward: 'Reach rank 3 in the factory', colors: ['#000', '#f2c14e', '#f78154', '#4d9078', '#b4436c', '#5fad56', '#2e86ab', '#f2a541', '#3d4451', '#e0a458', '#8bb174', '#5b8e7d', '#a1869e', '#d1495b', '#8d99ae', '#edf2f4'] },
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
    steel:   { name: 'Steel', price: 0, reward: 'Earn ten 5-star factory reviews' },
  };

  const FRAMES = {
    hairline: { name: 'Hairline', price: 0 },
    double:   { name: 'Double', price: 200 },
    dashed:   { name: 'Dashed', price: 300 },
    rounded:  { name: 'Rounded', price: 400 },
    glow:     { name: 'Glow', price: 500 },
    brass:    { name: 'Brass', price: 1000 },
    rainbow:  { name: 'Rainbow', price: 1500, animated: true },
    hazard:   { name: 'Hazard Tape', price: 0, reward: 'Reach rank 6 in the factory' },
  };

  const BACKDROPS = {
    none:      { name: 'Plain', price: 0 },
    grid:      { name: 'Grid', price: 0 },
    dots:      { name: 'Dots', price: 150 },
    scan:      { name: 'Scanlines', price: 300 },
    blueprint: { name: 'Blueprint', price: 400 },
    dusk:      { name: 'Dusk', price: 600 },
    stars:     { name: 'Starfield', price: 800 },
    belt:      { name: 'Conveyor', price: 0, reward: 'Pull 150 defects off the line by hand' },
  };

  const EFFECTS = {
    fade:     { name: 'Fade', price: 0 },
    sparkle:  { name: 'Sparkle', price: 500 },
    ripple:   { name: 'Ripple', price: 700 },
    shatter:  { name: 'Shatter', price: 900 },
    confetti: { name: 'Confetti', price: 1200 },
    sparks:   { name: 'Welding Sparks', price: 0, reward: 'Ship 25 factory orders' },
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
    soft:       { name: 'Drift', price: 0, desc: 'Airy bells and soft thuds in a big, calm room.' },
    typewriter: { name: 'Typewriter', price: 300, desc: 'Keys and clacks; every clear zips the carriage back and rings the bell.' },
    chip:       { name: 'Chiptune', price: 400, desc: 'An old handheld: a coin for every line, a power-up for four.' },
    bubbles:    { name: 'Bubbles', price: 450, desc: 'Everything goes bloop; clears fizz up like soda.' },
    marimba:    { name: 'Marimba', price: 600, desc: 'Wooden bars and soft mallets; clears roll up a chord.' },
    synth:      { name: 'Analog Synth', price: 750, desc: 'Plucks, a bass thump, chord stabs that open their filters.' },
    glass:      { name: 'Glass', price: 900, desc: 'Tapped wine glasses, ringing long; clears run up the rims.' },
    chimes:     { name: 'Wind Chimes', price: 1200, desc: 'Random notes from one calm scale, drifting in a wide space.' },
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
        bg: 'glass', tint: 0.78, accent: ACCENTS[0], theme: 'dark', onTop: true,
        sound: true, volume: 0.35, das: 230, arr: 55, lowerRepeat: 70, mouse: true, preview: 5,
        motion: 'full', showKeys: true, music: true, musicVolume: 0.25, announcer: true,
      },
      tab: 'play',
      free: null,
      puzzle: { diff: 'E', next: { E: 1, M: 1, H: 1 }, current: null, solved: {}, history: [] },
      factory: Factory.create(),
      stats: {
        sessions: 0, timeMs: { play: 0, classic: 0, puzzle: 0, factory: 0, total: 0 },
        classic: { games: 0, best: 0, bestLevel: 0, bestLines: 0, lines: 0, pieces: 0 },
        lines: { earned: 0, spent: 0, play: 0, puzzles: 0, contracts: 0, refunded: 0 },
        free: { boards: 1, pieces: 0, lines: 0, score: 0, bestScore: 0, bestLines: 0, clears: [0, 0, 0, 0, 0, 0], tspins: 0, tspinLines: 0, perfect: 0, maxCombo: 0, maxB2B: 0, holds: 0, rotations: 0, moves: 0, lowers: 0, drops: 0, byType: {}, topouts: 0 },
        puzzle: { E: freshPuzzleDiff(), M: freshPuzzleDiff(), H: freshPuzzleDiff(), mods: {}, daily: 0, lastDaily: null },
        items: { bought: {}, used: {} },
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
    if (!Array.isArray(st.puzzle.history)) st.puzzle.history = [];
    st.v = SAVE_VERSION;
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
        h[k] = { lines: 0, pieces: 0, puzzles: 0, credits: 0, ms: 0 };
        const keys = Object.keys(h).sort();
        while (keys.length > 120) delete h[keys.shift()];
      }
      return h[k];
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
      this.state.inventory[id] = (this.state.inventory[id] || 0) + (qty || 1);
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
  Object.assign(L, { SOUNDS, migrateState: migrate, ITEMS, ITEM_ORDER, PALETTES, SKINS, FRAMES, BACKDROPS, EFFECTS, GHOSTS, COSMETICS, COSMETIC_LABELS, ACCENTS, SAVE_VERSION, defaultState: defaults, mergeState: merge });
})(typeof globalThis !== 'undefined' ? globalThis : this);
