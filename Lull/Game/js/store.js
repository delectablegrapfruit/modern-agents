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
    { id: 'matter', name: 'Matter', icon: '⁘' },
    { id: 'energy', name: 'Energy', icon: 'ϟ' },
    { id: 'tool', name: 'Tools', icon: '↡' },
    { id: 'board', name: 'Board', icon: '⟲' },
    { id: 'luck', name: 'Luck', icon: '★' },
  ];
  // Single-use items: a few minutes of play buys most of them. Matter and Energy are the sandbox (js/sandbox.js): the
  // piece becomes a material, or a flame, a spark or a bomb, and the settle after it sets plays out what they do to
  // each other.
  const ITEMS = {
    reroll:    { group: 'shape', name: 'Reroll', icon: '⟳', price: 15, desc: 'Swap the piece in play for a different one.' },
    mirror:    { group: 'shape', name: 'Mirror', icon: '⇋', price: 15, desc: 'Flip the piece in play: J and L, S and Z swap.' },
    pebble:    { group: 'shape', name: 'Pebble', icon: '●', price: 20, desc: 'The piece in play becomes a single block.' },
    noodle:    { group: 'shape', name: 'Noodle', icon: '∿', price: 25, desc: 'The piece becomes a six-long rod.' },
    giant:     { group: 'shape', name: 'Giant', icon: '▣', price: 30, desc: 'The piece grows to twice its size.' },
    order:     { group: 'shape', name: 'Order Slip', icon: '✎', price: 35, desc: 'Choose exactly which piece you get next.' },
    blueprint: { group: 'shape', name: 'Blueprint', icon: '▦', price: 100, desc: 'Draw your own piece, up to six connected blocks.' },
    sand:      { group: 'matter', name: 'Sand', icon: '⁘', price: 15, desc: 'Falls and piles, filling the gaps below. Heat turns it to glass.' },
    seed:      { group: 'matter', name: 'Seed', icon: '⸙', price: 20, desc: 'Falls like sand. Given water, it grows into a vine along its row.' },
    water:     { group: 'matter', name: 'Water', icon: '≈', price: 20, desc: 'Runs into the lowest holes it can reach. Freezes, boils and carries current.' },
    oil:       { group: 'matter', name: 'Oil', icon: '◓', price: 15, desc: 'A liquid that floats on water and burns long.' },
    acid:      { group: 'matter', name: 'Acid', icon: '◒', price: 35, desc: 'A liquid that eats the blocks below and beside it, three each. Steel stands; water dilutes it.' },
    lava:      { group: 'matter', name: 'Lava', icon: '◉', price: 40, desc: 'A slow, hot liquid: it fills holes, then sets into stone. Water sets it at once.' },
    frost:     { group: 'matter', name: 'Ice', icon: '❅', price: 25, desc: 'Freezes the water it touches and turns steam to rain. Brittle: blasts and T-spins shatter it.' },
    steel:     { group: 'matter', name: 'Steel', icon: '▩', price: 30, desc: 'Stands through fire, acid and blasts. Carries current and laser beams.' },
    tnt:       { group: 'matter', name: 'Powder', icon: '⁂', price: 30, desc: 'Black powder: falls and piles. Heat, current or a blast sets it off.' },
    torch:     { group: 'energy', name: 'Flame', icon: '▲', price: 25, desc: 'The piece becomes fire: it lights, melts, boils and glazes.' },
    bolt:      { group: 'energy', name: 'Spark', icon: 'ϟ', price: 40, desc: 'A bolt that strikes where it lands. Steel and water carry it on.' },
    bomb:      { group: 'energy', name: 'Bomb', icon: '✹', price: 45, desc: 'Blasts a 13-block diamond where it lands (steel stands) and throws what is loose.' },
    laser:     { group: 'energy', name: 'Laser', icon: '↯', price: 65, desc: 'Vaporises every row it touches, full or not, and every row steel carries it to.' },
    drill:     { group: 'tool', name: 'Drill', icon: '⇣', price: 40, desc: 'A bit that bores out its whole column (steel stops it).' },
    phase:     { group: 'tool', name: 'Phase', icon: '◇', price: 50, desc: 'The piece passes through blocks, into any gap it fits.' },
    anvil:     { group: 'tool', name: 'Anvil', icon: '▼', price: 55, desc: 'Drops to the floor (or onto steel), flattening its columns on the way.' },
    flip:      { group: 'board', name: 'Mirror World', icon: '⇄', price: 20, desc: 'Flips the whole board left to right.' },
    rewind:    { group: 'board', name: 'Rewind', icon: '↶', price: 25, desc: 'Take back your last placement, and the lines it cleared.' },
    settle:    { group: 'board', name: 'Settle', icon: '⤋', price: 70, desc: 'Every block falls straight down, closing every hole. Full rows clear.' },
    purge:     { group: 'board', name: 'Chroma Purge', icon: '◍', price: 75, desc: 'Removes every block the colour of the piece in play.' },
    blackhole: { group: 'board', name: 'Black Hole', icon: '◎', price: 90, desc: 'Swallows everything within three blocks of where it sets.' },
    nuke:      { group: 'board', name: 'Nuke', icon: '✺', price: 120, desc: 'Erases the entire board. Pays no lines.' },
    tornado:   { group: 'board', name: 'Tornado', icon: '◌', price: 160, desc: 'Packs every block into solid rows from the floor up. Full rows clear.' },
    golden:    { group: 'luck', name: 'Golden Piece', icon: '✦', price: 35, desc: 'Your next five clears pay triple.' },
    jackpot:   { group: 'luck', name: 'Jackpot', icon: '❖', price: 50, desc: 'Three reels. Most pulls pay nothing; three stars pay 2,000.' },
  };
  // Items that no longer exist: what an old save's leftovers become (another item, or their price back in lines).
  // Magnet (pulled its columns down) is folded into Sand and Settle.
  const RETIRED_ITEMS = { magnet: { price: 45 } };
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
        motion: 'full', showKeys: true, music: true, musicVolume: 0.25, announcer: true, announcerVolume: 0.4, ccwPuzzles: false,
        muted: false, // the top bar's mute (M): over everything, separate from the toggles and volumes above
        hints: true, // control hints (js/hints.js); they retire on their own either way
      },
      tab: 'play',
      free: null,
      achievements: {},
      // Control hints (js/hints.js): pieces and board time toward retiring them all, times each was shown, good uses
      // of each control, the ones retired for good. seeded: an older save has had its history counted in, once.
      hints: { seeded: 0, pieces: 0, ms: 0, over: false, shown: {}, skill: {}, retired: {} },
      combos: {}, // Free Play combos and discoveries found: id → { n: times, lines: paid, first: when }
      gift: { last: null, n: 0, log: [] }, // the daily gift: the last date it was opened, how many, the last few
      puzzle: { diff: 'E', next: { E: 1, M: 1, H: 1 }, current: null, solved: {}, history: [], saved: [] },
      factory: Factory.create(),
      stats: {
        sessions: 0, days: 0, timeMs: { play: 0, classic: 0, puzzle: 0, factory: 0, total: 0 },
        classic: { games: 0, best: 0, bestLevel: 0, bestLines: 0, lines: 0, pieces: 0 },
        lines: { earned: 0, spent: 0, play: 0, puzzles: 0, contracts: 0, achievements: 0, refunded: 0, luck: 0, combos: 0 },
        free: { boardLog: [], boards: 1, pieces: 0, lines: 0, score: 0, bestScore: 0, bestLines: 0, clears: [0, 0, 0, 0, 0, 0], tspins: 0, tspinLines: 0, perfect: 0, maxCombo: 0, maxB2B: 0, holds: 0, rotations: 0, moves: 0, lowers: 0, drops: 0, byType: {}, topouts: 0 },
        // firstRun: first-try solves in a row; dailyRun: Dailies solved on consecutive dates (runDay is the last one).
        puzzle: { E: freshPuzzleDiff(), M: freshPuzzleDiff(), H: freshPuzzleDiff(), mods: {}, daily: 0, lastDaily: null, firstRun: 0, bestFirstRun: 0, dailyRun: 0, bestDailyRun: 0, runDay: null },
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
   * Items an old save still holds that are no longer sold: mapped to their replacement, or refunded at their price.
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
    if (!st.gift || typeof st.gift !== 'object') st.gift = { last: null, n: 0, log: [] };
    if (!Array.isArray(st.gift.log)) st.gift.log = [];
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

    buyItem(id, qty) {
      qty = qty || 1;
      const it = ITEMS[id];
      if (!it || !this.spend(it.price * qty)) return false;
      this.state.inventory[id] = (this.state.inventory[id] || 0) + qty;
      this.state.stats.items.bought[id] = (this.state.stats.items.bought[id] || 0) + qty;
      this.touch();
      return true;
    }

    /**
     * The daily gift (Relaxed tab): three power-ups once a calendar day, drawn by L.Gifts from the save and the date
     * (so it is the same draw however often Lull is reopened). Booked and saved at once. Returns the ids, or null.
     */
    openGift(now) {
      const st = this.state, day = dateKey(new Date(now || Date.now()));
      if (!L.Gifts || !L.Gifts.ready(st, day)) return null;
      const ids = L.Gifts.forDay(st.created, day);
      for (const id of ids) this.grantItem(id, 1);
      st.gift.last = day; st.gift.n = (st.gift.n || 0) + 1;
      st.gift.log.unshift({ day, ids });
      if (st.gift.log.length > 14) st.gift.log.length = 14;
      this.save();
      return ids;
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
  Object.assign(L, { SOUNDS, migrateState: migrate, migrateItems, migrateHints, RETIRED_ITEMS, ITEMS, ITEM_ORDER, ITEM_GROUPS, PALETTES, SKINS, FRAMES, BACKDROPS, EFFECTS, GHOSTS, COSMETICS, COSMETIC_LABELS, ACCENTS, SAVE_VERSION, defaultState: defaults, mergeState: merge });
})(typeof globalThis !== 'undefined' ? globalThis : this);
