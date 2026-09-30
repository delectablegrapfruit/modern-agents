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
  // the next clears pay, and nothing else. One of them is also the Puzzles tab's: Undo (id 'rewind') is one count
  // shared by both, bought one at a time and given free as a pack (`pack`: every free grant gives that many).
  const ITEMS = {
    reroll:    { group: 'shape', name: 'Reroll', icon: '⟳', price: 15, rarity: 'common', desc: 'Swap the piece in play for a different one.' },
    mirror:    { group: 'shape', name: 'Turnabout', icon: '⇋', price: 15, rarity: 'common', desc: 'Flip the piece in play: J and L, S and Z swap.' },
    pebble:    { group: 'shape', name: 'Pebble', icon: '●', price: 20, rarity: 'common', desc: 'The piece in play becomes a single block.' },
    noodle:    { group: 'shape', name: 'Noodle', icon: '∿', price: 30, rarity: 'uncommon', desc: 'The piece becomes a six-long rod.' },
    giant:     { group: 'shape', name: 'Giant', icon: '▣', price: 30, rarity: 'uncommon', desc: 'The piece grows to twice its size.' },
    blueprint: { group: 'shape', name: 'Blueprint', icon: '▦', price: 100, rarity: 'rare', desc: 'Draw your own piece, up to six connected blocks.' },
    pick:      { group: 'choice', name: 'Pick of Three', icon: '⁝', price: 20, rarity: 'common', desc: 'Play one of the next three pieces now; this one takes its place in line.' },
    fit:       { group: 'choice', name: 'Best Fit', icon: '✧', price: 45, rarity: 'uncommon', desc: 'The piece becomes the one that fits the stack best, right over its spot.' },
    order:     { group: 'choice', name: 'Order Slip', icon: '✎', price: 55, rarity: 'rare', desc: 'Choose the piece in play.' },
    patch:     { group: 'tool', name: 'Patch', icon: '⊡', price: 20, rarity: 'common', desc: 'One block that drops into the highest covered hole in its column.' },
    phase:     { group: 'tool', name: 'Ghost', icon: '⬚', price: 50, rarity: 'uncommon', desc: 'The piece passes through blocks into the first gap below where it fits.' },
    drill:     { group: 'tool', name: 'Drill', icon: '⇣', price: 40, rarity: 'uncommon', desc: 'A bit that bores out its whole column.' },
    bomb:      { group: 'tool', name: 'Bomb', icon: '✹', price: 45, rarity: 'uncommon', desc: 'Clears a 13-block diamond where it lands.' },
    laser:     { group: 'tool', name: 'Laser', icon: '↯', price: 65, rarity: 'rare', desc: 'Clears every row the piece touches, full or not.' },
    blackhole: { group: 'tool', name: 'Black Hole', icon: '◎', price: 90, rarity: 'rare', desc: 'Swallows everything within three blocks of where it sets.' },
    flip:      { group: 'board', name: 'Mirror World', icon: '⇄', price: 20, rarity: 'common', desc: 'Flips the whole board left to right.' },
    rewind:    { group: 'board', name: 'Undo', plural: 'Undos', icon: '↶', price: 5, pack: 5, rarity: 'common', desc: 'Take back your last placement, and the lines it cleared. Puzzles use it too.' },
    trapdoor:  { group: 'board', name: 'Trapdoor', icon: '⤓', price: 40, rarity: 'uncommon', desc: 'The bottom row falls away, whatever it holds.' },
    tornado:   { group: 'board', name: 'Tornado', icon: '◌', price: 60, rarity: 'rare', desc: 'Shuffles the columns, holes and all.' },
    settle:    { group: 'board', name: 'Settle', icon: '⤋', price: 70, rarity: 'rare', desc: 'Every block falls straight down, closing every hole. Full rows clear.' },
    golden:    { group: 'luck', name: 'Golden Piece', icon: '✦', price: 50, rarity: 'uncommon', desc: 'Your next five clears pay double.' },
    double:    { group: 'luck', name: 'Double or Nothing', icon: '◐', price: 30, rarity: 'uncommon', desc: 'Next clear: double if a quad set by hand (not a Noodle, Giant or Blueprint), a T-spin or a mini; else nothing.' },
    net:       { group: 'luck', name: 'Safety Net', icon: '⊔', price: 105, rarity: 'rare', desc: 'Keeps your back-to-back streak through one ordinary clear.' },
  };
  const ITEM_ORDER = ITEM_GROUPS.flatMap((g) => Object.keys(ITEMS).filter((id) => ITEMS[id].group === g.id));
  /** How many one free grant of a power-up gives (the gift, play): its pack, or one. */
  const packOf = (id) => (ITEMS[id] && ITEMS[id].pack) || 1;
  /** A power-up in a quantity, in words: "Undo", "5 Undos". */
  const itemCount = (id, n) => { const it = ITEMS[id]; return n > 1 ? n + ' ' + (it.plural || it.name + 's') : it.name; };

  // Freebies: things the daily gift can hold beside power-ups, kept apart from the item bar (state.freebies[key]).
  // A free hint is a puzzle hint at no cost; it still halves the pay.
  const FREEBIES = {
    'free-hint': { key: 'hint', name: 'Hint', icon: 'hint', rarity: 'uncommon', desc: 'One puzzle hint at no cost. Still halves the pay.' },
  };

  // Colour slots: 1 I, 2 O, 3 T, 4 S, 5 Z, 6 J, 7 L, 8 garbage, 9–14 other shapes, 15 custom. Every palette keeps the
  // seven pieces apart by hue (or, for the one-hue palettes, by clear steps of value), and reads on both wells: the light
  // theme deepens any colour too pale for its paper well (render.js, forWell).
  const PALETTES = {
    classic:  { name: 'Classic', price: 0, colors: ['#000', '#4fd1e3', '#f7d154', '#b57ee6', '#6fd08c', '#f07178', '#5c9df2', '#f9a14e', '#6b7280', '#f06292', '#aed581', '#4db6ac', '#9575cd', '#ff8a65', '#90a4ae', '#b8c4d6'] },
    mist:     { name: 'Mist', price: 400, colors: ['#000', '#98d1dc', '#e9dcaa', '#b9a6dc', '#a3d0b0', '#e0a2ad', '#98b0de', '#e8bd98', '#68707e', '#d6b3c9', '#c3d6ae', '#a6d1c9', '#b5aee0', '#e3b8a6', '#aab3bf', '#eef1f5'] },
    sunset:   { name: 'Sunset', price: 600, colors: ['#000', '#ffb385', '#ffd66e', '#d9679d', '#f5946b', '#e8505b', '#9b6ad6', '#f7c087', '#5c4a6e', '#ff9aa2', '#ffcf99', '#c86b98', '#8f5fa8', '#ff7b54', '#b38fa8', '#fff2e0'] },
    aurora:   { name: 'Aurora', price: 850, colors: ['#000', '#56e0c6', '#c9ee78', '#9d7cf4', '#44c98f', '#e66fb2', '#5a96f0', '#f2b766', '#3c4660', '#c285f0', '#86e3b8', '#58c9e0', '#7d86f2', '#ef8fa0', '#8e9cc0', '#e9f6ff'] },
    ink:      { name: 'Ink', price: 1100, colors: ['#000', '#f2f2f0', '#c9c9c6', '#8e8e8b', '#adadaa', '#6f6f6c', '#dcdcd9', '#b9b9b6', '#4b4b4b', '#c2c2c2', '#a9a9a9', '#909090', '#777777', '#5f5f5f', '#b0b0b0', '#ffffff'] },
    handheld: { name: 'Handheld', price: 1400, colors: ['#000', '#9bbc0f', '#c4d66a', '#306230', '#8bac0f', '#4d7a2a', '#1e4a1e', '#b0c94a', '#0f380f', '#8bac0f', '#306230', '#9bbc0f', '#306230', '#8bac0f', '#0f380f', '#cadc9f'] },
    assembly: { name: 'Assembly Line', price: 0, reward: 'Build a second press in the factory', colors: ['#000', '#f2c14e', '#f78154', '#4d9078', '#b4436c', '#5fad56', '#2e86ab', '#f2a541', '#3d4451', '#e0a458', '#8bb174', '#5b8e7d', '#a1869e', '#d1495b', '#8d99ae', '#edf2f4'] },
    gold:     { name: 'Gold Leaf', price: 2800, colors: ['#000', '#f9e79f', '#f4d03f', '#c99a2e', '#efd27a', '#a8801c', '#e2b650', '#fcecc0', '#5a4a1f', '#f5cba7', '#e59866', '#dc7633', '#f0b27a', '#ca6f1e', '#b9a37a', '#fffaf0'] },
    prism:    { name: 'Prism', price: 5000, animated: true, colors: null },
  };

  const SKINS = {
    flat:    { name: 'Flat', price: 0 },
    bevel:   { name: 'Bevel', price: 350 },
    pixel:   { name: 'Pixel', price: 550 },
    bubble:  { name: 'Bubble', price: 750 },
    glass:   { name: 'Glass', price: 1000 },
    jelly:   { name: 'Gummy', price: 1250 },
    neon:    { name: 'Neon Tube', price: 1600 },
    gem:     { name: 'Gem', price: 2100 },
    lantern: { name: 'Lantern', price: 2800 },
    steel:   { name: 'Steel', price: 0, reward: 'Build all four factory presses' },
  };

  const FRAMES = {
    hairline: { name: 'Hairline', price: 0 },
    double:   { name: 'Inlay', price: 300 },
    glow:     { name: 'Glow', price: 650 },
    brass:    { name: 'Brass', price: 1200 },
    rainbow:  { name: 'Rainbow', price: 2500, animated: true },
    hazard:   { name: 'Hazard Tape', price: 0, reward: 'Build a third press in the factory' },
  };

  const BACKDROPS = {
    none:      { name: 'Plain', price: 0 },
    grid:      { name: 'Grid', price: 0 },
    blueprint: { name: 'Blueprint', price: 350 },
    dusk:      { name: 'Dusk', price: 700 },
    aurora:    { name: 'Aurora', price: 1200 },
    stars:     { name: 'Starfield', price: 1700 },
    belt:      { name: 'Conveyor', price: 0, reward: 'Collect 500 lines from the factory' },
  };

  const EFFECTS = {
    fade:     { name: 'Fade', price: 0 },
    sparkle:  { name: 'Sparkle', price: 450 },
    ripple:   { name: 'Ripple', price: 850 },
    bloom:    { name: 'Bloom', price: 1300 },
    sparks:   { name: 'Welding Sparks', price: 0, reward: 'Build the biggest factory crate' },
  };

  const GHOSTS = {
    outline: { name: 'Outline', price: 0 },
    soft:    { name: 'Soft', price: 200 },
    dotted:  { name: 'Dotted', price: 300 },
    glow:    { name: 'Glow', price: 450 },
    off:     { name: 'Off', price: 0 },
  };

  // Sound packs (the synth voices live in audio.js).
  const SOUNDS = {
    soft:    { name: 'Drift', price: 0 },
    chip:    { name: 'Chiptune', price: 450 },
    marimba: { name: 'Marimba', price: 650 },
    synth:   { name: 'Analog Synth', price: 900 },
    glass:   { name: 'Glass', price: 1200 },
    chimes:  { name: 'Wind Chimes', price: 1600 },
  };

  const COSMETICS = { palette: PALETTES, skin: SKINS, frame: FRAMES, backdrop: BACKDROPS, effect: EFFECTS, ghost: GHOSTS, sound: SOUNDS };
  const COSMETIC_LABELS = { palette: 'Palettes', skin: 'Mino skins', frame: 'Frames', backdrop: 'Backdrops', effect: 'Line clears', ghost: 'Ghosts', sound: 'Sounds' };

  const ACCENTS = ['#8fb3ff', '#7bd88f', '#f6c177', '#eb6f92', '#c4a7e7', '#9ccfd8', '#f5f5f5', '#ff9e64'];

  // ---- state --------------------------------------------------------------------------------------------------------

  function freshPuzzleDiff() { return { played: 0, solved: 0, firstTry: 0, attempts: 0, fails: 0, bestMs: 0, totalMs: 0, streak: 0, bestStreak: 0, hints: 0 }; }

  // Stats a board option keeps (Protect's per level, Battle's rounds and time): each registers its defaults (a part's
  // `stats` in js/recipe.js, or Store.addStats(def)), merged under state.stats wherever the defaults lack them.
  const STATS = [];
  /** Registers stats defaults ({ free: { guard: {…} } }, { battle: {…}, timeMs: { battle: 0 } }). */
  function addStats(def) { STATS.push(def); }
  function statDefaults() {
    const out = {};
    const put = (a, b) => { for (const [k, v] of Object.entries(b || {})) { if (v && typeof v === 'object' && !Array.isArray(v)) put(a[k] && typeof a[k] === 'object' ? a[k] : (a[k] = {}), v); else if (!(k in a)) a[k] = JSON.parse(JSON.stringify(v)); } };
    for (const d of STATS) put(out, typeof d === 'function' ? d() : d);
    if (L.Recipe) put(out, L.Recipe.stats());
    return out;
  }
  /** The stats defaults with every registered one added (never over one already there). */
  function withStats(stats) {
    const extra = statDefaults();
    const add = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') add(a[k], v); else if (!(k in a)) a[k] = v; } };
    add(stats, extra);
    return stats;
  }

  function defaults() {
    const now = Date.now();
    const st = {
      v: SAVE_VERSION,
      created: now,
      lines: 0,
      inventory: Object.fromEntries(ITEM_ORDER.map((k) => [k, 0])),
      freebies: { hint: 0 }, // free things the daily gift gave (FREEBIES): puzzle hints at no cost
      owned: { palette: ['classic'], skin: ['flat'], frame: ['hairline'], backdrop: ['none', 'grid'], effect: ['fade'], ghost: ['outline', 'off'], sound: ['soft'] },
      equipped: { palette: 'classic', skin: 'flat', frame: 'hairline', backdrop: 'grid', effect: 'fade', ghost: 'outline', sound: 'soft' },
      settings: {
        bg: 'glass', tint: 0.78, accent: ACCENTS[0], theme: 'dark', onTop: true, fadeAway: true,
        sound: true, volume: 0.35, das: 230, arr: 55, lowerRepeat: 70, mouse: true, preview: 5,
        motion: 'full', showKeys: true, music: true, musicVolume: 0.25, announcer: true, announcerRelaxed: false, announcerVolume: 0.35, ccwPuzzles: false, pauseAway: true,
        muted: false, // the top bar's mute (M): over everything, separate from the toggles and volumes above
        hints: true, // control hints (js/hints.js); they retire on their own either way
        // Touch (js/touch.js): gestures on, drag sensitivity 1–10, hard-drop swipe (0 Light, 1 Medium, 2 Firm), what a
        // tap turns ('sides': right clockwise, left counter-clockwise; 'cw': always clockwise), haptics where there are any.
        touch: true, touchSens: 5, touchFlick: 1, tapTurn: 'sides', haptics: true,
      },
      tab: 'play',
      free: null, // the Relaxed board in play (Game.toJSON)
      boards: { seq: 0, cur: null, list: [], retired: [] }, // the board library (js/library.js): shelved and retired boards, the last size and recipe chosen
      achievements: {},
      // Control hints (js/hints.js): pieces and board time toward retiring them all, times each was shown, good uses
      // of each control, the ones retired for good.
      hints: { pieces: 0, ms: 0, over: false, shown: {}, skill: {}, retired: {} },
      combos: {}, // Free Play combos found: id → { n: times, lines: paid, first: when }
      gift: { at: null, n: 0, log: [] }, // the daily gift: when it was last opened (ms), how many, the last few
      earn: { board: null, paid: 0 }, // power-ups earned by lines on one board (js/items.js, Earn): which board, how many paid
      // tries: seeds started on and not yet solved → { n: tries that set a piece, hint, undos } (what solving pays).
      puzzle: { diff: 'E', next: { E: 1, M: 1, H: 1 }, current: null, solved: {}, tries: {}, history: [], saved: [] },
      factory: Factory.create(),
      stats: {
        sessions: 0, days: 0, timeMs: { play: 0, classic: 0, puzzle: 0, factory: 0, total: 0 },
        classic: { games: 0, best: 0, bestLevel: 0, bestLines: 0, lines: 0, pieces: 0 },
        lines: { earned: 0, spent: 0, play: 0, puzzles: 0, factory: 0, achievements: 0, rewound: 0, combos: 0 },
        free: { boardLog: [], boards: 1, pieces: 0, lines: 0, score: 0, bestScore: 0, bestLines: 0, clears: [0, 0, 0, 0, 0, 0], tspins: 0, tspinLines: 0, perfect: 0, maxCombo: 0, maxB2B: 0, holds: 0, rotations: 0, moves: 0, lowers: 0, drops: 0, byType: {}, topouts: 0 },
        // firstRun: first-try solves in a row; dailyRun: Dailies solved on consecutive dates (runDay is the last one).
        puzzle: { E: freshPuzzleDiff(), M: freshPuzzleDiff(), H: freshPuzzleDiff(), mods: {}, daily: 0, lastDaily: null, firstRun: 0, bestFirstRun: 0, dailyRun: 0, bestDailyRun: 0, runDay: null },
        items: { bought: {}, used: {}, got: {} },
        cosmetics: { bought: 0, spent: 0 },
      },
      history: {},
    };
    withStats(st.stats);
    return st;
  }

  /** A save as loaded: every key the defaults have, filled in where the save lacks it, keeping everything it has. */
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

  const TRIES_MAX = 3000; // seeds whose tries are kept (the oldest goes first), as for solved seeds

  /** The puzzle tries kept with each seed (what solving it pays), made safe: whole counts, true or false. */
  function repairTries(t) {
    const out = {};
    if (!t || typeof t !== 'object' || Array.isArray(t)) return out;
    const int = (v) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
    for (const k of Object.keys(t).slice(-TRIES_MAX)) {
      const e = t[k];
      if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
      out[k] = { n: int(e.n), hint: e.hint === true, undos: int(e.undos) };
    }
    return out;
  }

  /** A parsed save made whole: the defaults filled in, and the factory checked (js/factory.js, repair). */
  function loadState(saved) {
    const st = merge(defaults(), saved);
    st.factory = Factory.repair(st.factory);
    if (st.puzzle && typeof st.puzzle === 'object') st.puzzle.tries = repairTries(st.puzzle.tries);
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
        try { this.state = loadState(JSON.parse(raw)); } catch (e) { this.state = defaults(); this.loadedFrom = 'corrupt'; }
      }
      this.state.stats.sessions++;
      return this.state;
    }

    serialize() { return JSON.stringify(this.state); }

    save() {
      // Replaced (Reset, Import): the page is on its way out, and nothing it still holds may be written over the new save.
      if (this.replaced) return;
      const json = this.serialize();
      this.dirty = false;
      if (native.available) native.post('save', { data: json });
      else {
        try { root.localStorage && root.localStorage.setItem(LS_KEY, json); } catch (e) { /* storage full or blocked */ }
      }
      this.emit('saved');
    }

    touch() { this.dirty = true; this.emit('change'); }

    /**
     * Replaces the whole save and starts the page over from it (Reset, Import). The new save is written at once — to
     * localStorage, or in the app to the save file, where the panel also rebuilds the save it hands the page and
     * reloads it — and from then on this page saves nothing: its boards, factory and timers still hold the old
     * progress, and its last saves on the way out (pagehide, a flush) would bring it back. In a browser the caller
     * reloads the page (`restart`).
     */
    replace(state) {
      this.state = state;
      this.dirty = false;
      this.replaced = true;
      const json = this.serialize();
      if (native.available) native.post('reset', { data: json });
      else {
        try { root.localStorage && root.localStorage.setItem(LS_KEY, json); } catch (e) { /* storage full or blocked */ }
      }
      return json;
    }

    /** After `replace`: a browser reloads the page itself; the app reloads it once the new save is on disk. */
    restart() {
      if (!native.available && root.location) root.location.reload();
    }

    /** Everything back to a new save, the settings kept. */
    reset() {
      const st = defaults();
      st.settings = this.state.settings;
      return this.replace(st);
    }

    importJSON(text) {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || parsed.v == null) throw new Error('Not a Lull save');
      return this.replace(loadState(parsed));
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

    /**
     * Lines into (or, negative, back out of) the wallet. The wallet keeps hundredths (a board narrower than Standard
     * pays part of a line: js/library.js, scale), so every total is kept to the hundredth and never drifts.
     */
    addLines(n, source) {
      if (!n) return;
      const s = this.state, r2 = (x) => Math.round(x * 100) / 100;
      s.lines = r2(s.lines + n);
      if (n > 0) {
        s.stats.lines.earned = r2(s.stats.lines.earned + n);
        if (source && s.stats.lines[source] != null) s.stats.lines[source] = r2(s.stats.lines[source] + n);
        const d = this.day();
        d.lines = r2(d.lines + n);
      } else {
        s.stats.lines.rewound = r2(s.stats.lines.rewound - n);
      }
      this.touch();
      this.emit('lines', n, source);
    }

    spend(n) {
      if (this.state.lines < n) return false;
      this.state.lines = Math.round((this.state.lines - n) * 100) / 100;
      this.state.stats.lines.spent = Math.round((this.state.stats.lines.spent + n) * 100) / 100;
      this.touch();
      this.emit('lines', -n, 'spend');
      return true;
    }

    /**
     * The daily gift (Relaxed tab): three different entries — power-ups, or a freebie — 24 hours after the last one
     * was opened (js/items.js, Gifts). The draw is fixed by the save and how many gifts it has opened; the claim is
     * booked and saved at once. Returns the ids, or null (not ready yet).
     */
    openGift(now) {
      const st = this.state;
      now = now == null ? Date.now() : now;
      if (!L.Gifts || !L.Gifts.ready(st, now)) return null;
      const ids = L.Gifts.forClaim(st.created, st.gift.n || 0);
      for (const id of ids) this.grant(id);
      st.gift.at = now; st.gift.n = (st.gift.n || 0) + 1;
      st.gift.log.unshift({ at: now, ids });
      if (st.gift.log.length > 14) st.gift.log.length = 14;
      this.save();
      return ids;
    }

    /** The inventory or the freebies changed: every place that shows a count (both tabs' Undo) redraws. */
    itemsChanged() { this.touch(); this.emit('items'); }

    /** Buys a power-up with lines (the Relaxed tab's item bar, and Puzzles' Undo): one at a time, never a pack. */
    buyItem(id, qty) {
      qty = qty || 1;
      const it = ITEMS[id];
      if (!it || !this.spend(it.price * qty)) return false;
      this.state.inventory[id] = (this.state.inventory[id] || 0) + qty;
      this.state.stats.items.bought[id] = (this.state.stats.items.bought[id] || 0) + qty;
      this.itemsChanged();
      return true;
    }

    /** Gives power-ups free (qty; by default the item's pack). */
    grantItem(id, qty) {
      if (!ITEMS[id]) return 0;
      qty = qty || packOf(id);
      this.state.inventory[id] = (this.state.inventory[id] || 0) + qty;
      const got = this.state.stats.items.got;
      got[id] = (got[id] || 0) + qty;
      this.itemsChanged();
      return qty;
    }

    /** One free entry of the gift or of play: a power-up's pack (Undo: five), or a freebie. Returns how many. */
    grant(id) {
      const f = FREEBIES[id];
      if (!f) return this.grantItem(id);
      const fb = this.state.freebies = this.state.freebies || {};
      fb[f.key] = (fb[f.key] || 0) + 1;
      const got = this.state.stats.items.got;
      got[id] = (got[id] || 0) + 1;
      this.itemsChanged();
      return 1;
    }

    /** Spends a freebie (a free hint: key 'hint'); false when there is none. */
    useFreebie(key) {
      const fb = this.state.freebies;
      if (!fb || !(fb[key] > 0)) return false;
      fb[key]--;
      const id = Object.keys(FREEBIES).find((k) => FREEBIES[k].key === key), used = this.state.stats.items.used;
      if (id) used[id] = (used[id] || 0) + 1;
      this.itemsChanged();
      return true;
    }

    useItem(id) {
      const inv = this.state.inventory;
      if (!inv[id]) return false;
      inv[id]--;
      this.state.stats.items.used[id] = (this.state.stats.items.used[id] || 0) + 1;
      this.itemsChanged();
      return true;
    }

    /**
     * Uses one held, or buys one at its price and uses it at once (Puzzles' Undo: the price is on the button, so no
     * question). Returns 'held', 'bought', or false (none held and the wallet short: nothing changes).
     */
    useOrBuy(id) {
      if (this.state.inventory[id] > 0) return this.useItem(id) ? 'held' : false;
      if (!this.buyItem(id)) return false;
      return this.useItem(id) ? 'bought' : false;
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

  Store.addStats = addStats;
  L.Store = Store;
  Object.assign(L, { addStats, SOUNDS, loadState, repairTries, TRIES_MAX, ITEMS, ITEM_ORDER, FREEBIES, packOf, itemCount, ITEM_GROUPS, PALETTES, SKINS, FRAMES, BACKDROPS, EFFECTS, GHOSTS, COSMETICS, COSMETIC_LABELS, ACCENTS, SAVE_VERSION, defaultState: defaults, mergeState: merge });
})(typeof globalThis !== 'undefined' ? globalThis : this);
