// js/art/palette.js — owner: W1-A. SR.art.palette: every canvas colour of the game (ART_AUDIO §2,
// §5.2, §9; UI.md §2.1 mirrored as .ui; BALANCE B-04c karma bands). The only file under js/ that may
// hold a colour literal (ARCHITECTURE §21). Data and art files name colours by **palette key**, the
// dotted path of an entry ('bld.bank.walls', 'int.mcsticks.floorB', 'karma.good.3', 'fighter.7',
// 'city.gusty.tower'; CONTRACT D32); SR.art.draw.color(key) resolves one.
// Node-loadable: plain data, no DOM, canvas or browser API at load time (the validator walks it).
//
// Conventions
// - A leaf is a CSS colour string: '#RRGGBB', or '#RRGGBBAA' when the entry carries its alpha.
// - Groups are plain objects; the karma bands, fighters and sky keyframes are arrays (numeric
//   segments index them: 'karma.evil.9', 'fighter.12', 'sky.3.top').
// - .sky holds the ART_AUDIO §2.2 keyframes { h, top, horizon, ambient, light }: h (hour) and
//   light (the emissive factor) are numbers, the rest colours. Everything else is colour only.
// - .ui mirrors css/tokens.css under the token names without the leading dashes ('ui.ink-900',
//   'ui.money-ink'); camelCase aliases ('ui.ink900', 'ui.moneyInk') resolve too but are not
//   enumerable, so walkers (the art bible, the validator) see every colour once.
// - int.<id>.* : each interior's set. W1-A pre-seeds a neutral set per building (wall, wallHi,
//   wallShade, trim, floorA, floorB, counter, accent, light) plus every entry ART_AUDIO names;
//   an interior's owner adds entries through a request (ART_AUDIO §9).
(function () {
  'use strict';
  var SR = window.SR;

  /** Builds a neutral interior set: wall, wallHi, wallShade, trim, floorA, floorB, counter, accent, light. */
  function room(wall, wallHi, wallShade, trim, floorA, floorB, counter, accent, light) {
    return { wall: wall, wallHi: wallHi, wallShade: wallShade, trim: trim, floorA: floorA,
      floorB: floorB, counter: counter, accent: accent, light: light };
  }

  var palette = {
    // ---- ART_AUDIO §2.1 World ------------------------------------------------------------------
    grass: '#6CC84A', grassShade: '#4FA83A', grassHi: '#8BD86D',
    parkGrass: '#7BD35A',
    asphalt: '#54575F', asphaltSpeck: '#62656E',
    lanePaint: '#FFD23F',
    zebra: '#F4F1EA',
    sidewalk: '#C3C7CF', sidewalkJoint: '#9EA3AD',
    path: '#D9CDB5',
    plaza: '#CDBFA3', plazaJoint: '#B8A987',
    paperEdge: '#F3EBDD', strata1: '#D9C9A8', strata2: '#B79A6B', fibre: '#FFFFFFB3',
    paperBack: '#E4DED3', backPrint: '#B9B2A640',
    water: '#4FB6E8', waterHi: '#9ADCF7',
    glass: '#8FD6FF', glassLit: '#FFE08A',
    ink: '#1B1D2B',
    railing: '#3F4254',
    stone: '#A7A9B4', stoneShade: '#8A8C98',
    // Derived world entries (ART_AUDIO §1.1: ink outlines at 90 %, stacked-paper shadows at 18 % ink).
    inkLine: '#1B1D2BE6',
    shadow: '#1B1D2B2E',
    white: '#FFFFFF',
    cloud: '#FFFFFF', cloudLine: '#C9CED8', cloudShadow: '#1B1D2B1A',
    sawhorse: '#F3EBDD', sawhorseStripe: '#E5484D',

    // ---- ART_AUDIO §2.2 Sky keyframes (interpolated per game minute by the renderer) -----------
    sky: [
      { h: 0, top: '#0E1433', horizon: '#26305E', ambient: '#3A4275', light: 1.0 },
      { h: 5, top: '#1B2150', horizon: '#4B3F6E', ambient: '#464A7E', light: 1.0 },
      { h: 6, top: '#3E4C8A', horizon: '#F29E7A', ambient: '#C99488', light: 0.6 },
      { h: 7, top: '#7FB6E8', horizon: '#F7D3A8', ambient: '#F2DCC4', light: 0.15 },
      { h: 9, top: '#5DB8FF', horizon: '#D6F0FF', ambient: '#FFFFFF', light: 0 },
      { h: 16, top: '#5DB8FF', horizon: '#D6F0FF', ambient: '#FFFFFF', light: 0 },
      { h: 17, top: '#78BDEB', horizon: '#FFE2B0', ambient: '#FFEBD0', light: 0 },
      { h: 19, top: '#5A7FC2', horizon: '#F7A05E', ambient: '#F0AE7A', light: 0.3 },
      { h: 20, top: '#34407A', horizon: '#B0668A', ambient: '#9A7AA8', light: 0.7 },
      { h: 21, top: '#121A40', horizon: '#2E3868', ambient: '#3F477A', light: 1.0 },
      { h: 23, top: '#121A40', horizon: '#2E3868', ambient: '#3F477A', light: 1.0 },
    ],
    // Weather lerp targets (ART_AUDIO §2.2): Cloudy 30 % toward cloudy, Rain 50 % toward rain, Fog veil.
    weather: { cloudy: '#9AA6B8', rain: '#7D8794', fog: '#D8DEE6', streak: '#DDE6F2A6', lightning: '#E8F0FF' },
    // Emissive colours (ART_AUDIO §3).
    light: {
      lamp: '#FFE6A8', lampPool: '#FFE6A88C', window: '#FFE08A',
      head: '#FFF4CC', headCone: '#FFF4CC59', tail: '#FF3B30', brake: '#FF1F1F',
      fountain: '#9ADCF7', pinprick: '#FFE08A', star: '#FFFFFF', moon: '#FFF6DA',
      neonPink: '#FF4FA3', neonBlue: '#4FD3FF', neonGreen: '#7CFF6B', neonYellow: '#FFE14F', neonRed: '#FF4040',
      policeRed: '#FF2D2D', policeBlue: '#2D7BFF',
    },

    // ---- ART_AUDIO §2.3 Characters ----------------------------------------------------------------
    // Karma bands: BALANCE B-04c (the original's palettes). Only the player's head (and side-view
    // torso) uses them. Index i = clamp(ceil(|karma| / 10) - 1, 0, 9) (tuning.karma).
    karma: {
      good: ['#0066CC', '#017CF8', '#218FFE', '#45A2FE', '#70B7FE', '#8FC8FE', '#BFDFFF', '#DFEFFF', '#EEF7FF', '#FFFFFF'],
      evil: ['#0066CC', '#0110C9', '#6500CA', '#9700CA', '#BA01C9', '#C9018D', '#CA005B', '#CA001A', '#CA0000', '#CA0000'],
    },
    // NPC head colours (never inside the karma hues).
    npc: {
      sage: '#9DBF8E', mustard: '#E3B94B', sand: '#D8C29A', grey: '#A7A9B4', mint: '#9ED9C3', olive: '#A4A45A',
      peach: '#F2B98E', clay: '#C9A27E', moss: '#7FA36B', stone: '#B5B0A1', butter: '#F1DE8A', taupe: '#9C8F80',
    },
    // Character strokes: limbs are ink; the player's 1.5 u under-stroke is white.
    stick: { limb: '#1B1D2B', under: '#FFFFFF', face: '#1B1D2B', cheek: '#E5484D59', shadow: '#1B1D2B2E', bone: '#F3EBDD' },
    // Accessory colours (ART_AUDIO §7): hats, coats, props held in hands.
    acc: {
      red: '#D94B3D', crimson: '#B3261E', navy: '#2E3F73', denim: '#3F6FB0', sky: '#7FB6E8', gold: '#E8B730',
      goldHi: '#FFE27A', brown: '#8A5A3A', tan: '#C8A57A', khaki: '#B5A67A', tweed: '#8E7B5C', black: '#2A2C38',
      charcoal: '#4A4D5C', grey: '#8C8F9C', silver: '#C8CCD6', white: '#FFFFFF', cream: '#F3EBDD', paper: '#FFFDF8',
      green: '#3C8D5A', olive: '#6E7A3A', army: '#56663A', teal: '#1E9C9A', purple: '#7A4FB5', pink: '#E78AB0',
      orange: '#EE8A2F', yellow: '#FFD23F', lens: '#20242F', lensHi: '#8FD6FF', cup: '#F3EBDD', coffee: '#7A4A2A',
      board: '#C8A57A', wheel: '#3F4254', medal: '#E8B730', ribbon: '#D94B3D', sash: '#D94B3D', towel: '#FFFFFF',
      apron: '#FFFFFF', chain: '#E8B730', clip: '#C8A57A', notepad: '#FFF6C8', glow: '#7CFF6B', umbrella: '#E5484D',
    },
    // Fight ladder (GDD §6.3; data/fighters.js names 'fighter.<n>'): the head fill of fighter n.
    // [0] is the Underground Ring's masked regulars.
    fighter: ['#9C8F80', '#C9D67A', '#D8A45A', '#B8BAC4', '#F2C14E', '#8FAF6A', '#E8B98E',
      '#B8864B', '#C8B98A', '#7FA38F', '#6F8A4E', '#D98E4A', '#E6E0CF'],

    // ---- ART_AUDIO §5.2 Building identity (walls / shade / roof / trim) -------------------------
    bld: {
      home_apt: { walls: '#C98F5B', shade: '#A87142', roof: '#7A4A2A', trim: '#F3EBDD', skylight: '#8FD6FF' },
      home_mansion: { walls: '#D8B48A', shade: '#B8936A', roof: '#8A5A3A', trim: '#FFFFFF', gate: '#3F4254' },
      home_castle: { walls: '#A7A9B4', shade: '#8A8C98', roof: '#5B6ED8', trim: '#FFD23F', moat: '#4FB6E8' },
      home_pent: { walls: '#6FB7C8', shade: '#3F7F99', roof: '#2E4F66', trim: '#E6F4F8', garden: '#6CC84A' },
      bank: { walls: '#A61B1B', shade: '#7E1414', roof: '#5A0E0E', trim: '#FFD23F' },
      nli: { walls: '#9AA3B5', shade: '#767F92', roof: '#4B5263', trim: '#5BC8F5', plate: '#FFD23F' },
      uofs: { walls: '#E6D27A', shade: '#C7B25A', roof: '#A8923A', trim: '#FFFFFF', ivy: '#4FA83A' },
      cityhall: { walls: '#E6DCC6', shade: '#C9BDA3', roof: '#22335C', trim: '#C9A34A', dome: '#22335C' },
      furniture: { walls: '#EEEEEE', shade: '#CFCFCF', roof: '#9E9E9E', trim: '#1B1D2B' },
      mcsticks: { walls: '#C9A227', shade: '#A8861A', roof: '#7A6212', trim: '#D92D20' },
      bar: { walls: '#6E8B1E', shade: '#566D16', roof: '#3C4C0F', trim: '#FFC83F' },
      casino: { walls: '#2F6BFF', shade: '#1F4FD6', roof: '#15379A', trim: '#FFFFFF', bulb: '#FFE08A' },
      store: { walls: '#FFB000', shade: '#E09000', roof: '#B07000', trim: '#FF3FA4' },
      pawn: { walls: '#8A2BE2', shade: '#6D1FB5', roof: '#4E1585', trim: '#FFD23F' },
      bus: { walls: '#1CB5F5', shade: '#1590C4', roof: '#0F6A91', trim: '#FFFFFF' },
      skybus: { walls: '#F3EBDD', shade: '#D9CDB5', roof: '#E4DED3', trim: '#1CB5F5', stripe: '#1CB5F5' },
      default: { walls: '#D9CDB5', shade: '#B8A987', roof: '#8A7F6A', trim: '#FFFFFF' },
    },

    // ---- ART_AUDIO §9 Interiors (a neutral set per building; McSticks as ART_AUDIO names it) ----
    int: {
      default: room('#E9E2D2', '#F5F0E4', '#CFC6B2', '#B8A987', '#EFE6D4', '#D9CDB5', '#C8A57A', '#2F6BFF', '#FFF3C4'),
      home: room('#E4D5BC', '#F1E6D2', '#C9B89C', '#A88B63', '#C8A57A', '#B08A5E', '#C8A57A', '#3D8BFD', '#FFF1CC'),
      apt: room('#DCCFB8', '#EDE3D0', '#BFB097', '#9C8466', '#B8946A', '#A58158', '#B8946A', '#6E8B1E', '#FFF1CC'),
      apt2: room('#E8DCC4', '#F4EBD8', '#CDBFA3', '#8A6A4A', '#C8A57A', '#B08A5E', '#C8A57A', '#1CB5F5', '#FFF1CC'),
      pent: room('#DDE8EC', '#EEF5F7', '#BCCBD1', '#2E4F66', '#E6E0D6', '#CFC6B8', '#6FB7C8', '#FFD23F', '#FFF6E0'),
      mansion: room('#EFE2C8', '#FAF1DE', '#D6C6A6', '#B8936A', '#8A5A3A', '#7A4A2A', '#D8B48A', '#B3261E', '#FFF1CC'),
      castle: room('#A7A9B4', '#BDBFC8', '#8A8C98', '#5B6ED8', '#8A8C98', '#767886', '#8A5A3A', '#D94B3D', '#FFE6A8'),
      mcsticks: { wall: '#F3E3B0', wallHi: '#FAF0CF', wallShade: '#D9C58E', trim: '#D92D20', floorA: '#F4F1EA',
        floorB: '#D92D20', counter: '#C9A227', accent: '#D92D20', light: '#FFF3C4' },
      store: room('#FFF1D6', '#FFF8E8', '#EBD7B0', '#FF3FA4', '#F4F1EA', '#E6DFD0', '#FFB000', '#4FD3FF', '#F2FFFF'),
      pawn: room('#D9CBE8', '#E8DEF2', '#BBA8D0', '#4E1585', '#8A7F6A', '#766B57', '#8A5A3A', '#FFD23F', '#FFF1CC'),
      furniture: room('#F4F4F4', '#FFFFFF', '#DADADA', '#1B1D2B', '#E8E4DC', '#D8D2C6', '#EEEEEE', '#D94B3D', '#FFFAEE'),
      bank: room('#F1E4D0', '#FAF1E2', '#D9C8AE', '#A61B1B', '#E6DCC6', '#C9BDA3', '#7E1414', '#FFD23F', '#FFF6E0'),
      nli: room('#DDE2EA', '#EDF0F5', '#C0C7D3', '#4B5263', '#C3C7CF', '#B1B6C0', '#9AA3B5', '#5BC8F5', '#F2FAFF'),
      uofs: room('#EFE6C2', '#F8F1D8', '#D6CBA2', '#A8923A', '#B8946A', '#A58158', '#8A5A3A', '#3C8D5A', '#FFF6D8'),
      cityhall: room('#EDE5D2', '#F8F2E4', '#D3C8AE', '#C9A34A', '#CDBFA3', '#B8A987', '#8A5A3A', '#22335C', '#FFF6E0'),
      bar: room('#5E6B3A', '#728049', '#4A552C', '#FFC83F', '#6B4A33', '#5A3D2A', '#8A5A3A', '#FF4FA3', '#FFD9A0'),
      casino: room('#23315E', '#2F4077', '#1A2548', '#FFD23F', '#8E1B2E', '#6F1523', '#2F6BFF', '#FFE08A', '#FFF1C4'),
      bus: room('#D9EEF7', '#EAF6FB', '#B9DCEB', '#0F6A91', '#C3C7CF', '#AEB3BD', '#1CB5F5', '#FFD23F', '#F2FAFF'),
      jail: room('#B5B0A1', '#C6C2B5', '#9C978A', '#3F4254', '#8A8C98', '#7A7C88', '#6E6A60', '#FFD23F', '#FFF6D8'),
      hospital: room('#E6F2EF', '#F3FAF8', '#C8DDD8', '#1E9C9A', '#E8ECEC', '#D8DEDE', '#FFFFFF', '#E5484D', '#F4FFFF'),
      trip: room('#F4F0E6', '#FFFDF8', '#E2D6BE', '#1B1D2B', '#EFE6D4', '#E2D6BE', '#C8A57A', '#1CB5F5', '#FFF6E0'),
      news: room('#F4F0E6', '#FFFDF8', '#E2D6BE', '#1B1D2B', '#EFE6D4', '#E2D6BE', '#C8A57A', '#1B1D2B', '#FFF6E0'),
    },
    // Interior kit materials (props of js/art/interiors/kit.js; an interior may override per prop).
    kit: {
      wood: '#B8864B', woodDark: '#7A4A2A', woodLight: '#D8B48A', metal: '#B8BCC6', metalDark: '#6E7280',
      chrome: '#DDE1E8', fabric: '#6E8BC2', cushion: '#E78AB0', linen: '#FFFDF8', blanket: '#3D8BFD',
      screen: '#20242F', screenGlow: '#8FD6FF', paper: '#FFFDF8', poster: '#FFD23F', plant: '#4FA83A',
      plantHi: '#8BD86D', pot: '#C9744A', brass: '#C9A34A', felt: '#2E7D4F', rope: '#E5484D', chalk: '#F4F1EA',
      board: '#2F4A3A', glass: '#8FD6FF', glassDark: '#5BA8D8', bulb: '#FFE08A', red: '#D94B3D', gold: '#E8B730',
      water: '#4FB6E8', steam: '#FFFFFFB3', neon: '#FF4FA3', fridge: '#F2FFFF', slushA: '#FF3FA4',
      slushB: '#4FD3FF', rug: '#B3261E', rugTrim: '#E8B730', vault: '#8A8C98', flagA: '#D94B3D',
      flagB: '#FFFFFF', flagC: '#2E3F73', ballot: '#F3EBDD', lamp: '#FFE08A', cabinet: '#3F4254',
      mat: '#4A4D5C', skin: '#1B1D2B', fish: '#FF8A3D', counterTop: '#F3EBDD', bar: '#5A3D2A', tap: '#C9A34A',
      beer: '#F2B33D', foam: '#FFFDF8', dartA: '#1B1D2B', dartB: '#F3EBDD', dartC: '#D94B3D', dartD: '#3C8D5A',
    },
    // Five materials in three tones for the art bible (tones come from SR.art.draw.tone).
    mat: { paper: '#F3EBDD', wood: '#B8864B', brick: '#C0583E', metal: '#A7A9B4', fabric: '#3D8BFD' },

    // ---- Vehicles (ART_AUDIO §8) -------------------------------------------------------------------
    car: {
      compact: '#6FB7C8', sedan: '#9C8F80', taxi: '#FFD23F', van: '#E6E0CF', police: '#FFFFFF',
      policeStripe: '#1B1D2B', junker: '#F2C14E', junkerDoor: '#7FA36B', junkerRust: '#B8864B',
      sports: '#E5484D', skybus: '#F3EBDD', skybusStripe: '#1CB5F5', plane: '#FFFDF8', planeFold: '#E4DED3',
      glass: '#8FD6FF', glassDark: '#4E7F9E', tyre: '#2A2C38', hub: '#C8CCD6', chrome: '#DDE1E8',
      seat: '#8A5A3A', lamp: '#FFF4CC', tail: '#FF3B30', sign: '#FFFFFF', signText: '#1B1D2B', skid: '#1B1D2B59',
    },

    // ---- Distant islands (ART_AUDIO §4; data/cities.js names 'city.<id>.*') ----------------------
    city: {
      crayonburg: { ground: '#EDE3C8', base: '#F7E7B0', tower: '#F2A93B', roof: '#E5484D', accent: '#3D8BFD', trim: '#FFD23F', window: '#FFE08A' },
      rustbelt: { ground: '#D9CDB5', base: '#B8A987', tower: '#9C5B3B', roof: '#5E3A2A', accent: '#7D8794', trim: '#C8A57A', window: '#FFE08A' },
      glitter: { ground: '#EDE6F2', base: '#D8C8E6', tower: '#E8C5F0', roof: '#C77DDB', accent: '#FFD23F', trim: '#FFFFFF', window: '#FFE08A' },
      gusty: { ground: '#DCE8D0', base: '#C9D6BC', tower: '#F3EBDD', roof: '#6E8B1E', accent: '#9AA6B8', trim: '#3F4254', window: '#FFE08A' },
      eraser: { ground: '#F4E4E8', base: '#EBCFD6', tower: '#F5A7B8', roof: '#3D6FD6', accent: '#FFFFFF', trim: '#B9B2A6', window: '#FFE08A' },
      pegas: { ground: '#EAE2D2', base: '#D8C8AE', tower: '#C9A27E', roof: '#8A5A3A', accent: '#E3B94B', trim: '#3F4254', window: '#FFE08A' },
    },

    // ---- Props (ART_AUDIO §6; pre-seeded for js/art/props.js) --------------------------------------
    prop: {
      trunk: '#8A5A3A', leaf: '#4FA83A', leafHi: '#8BD86D', leafShade: '#3C8D2E', poplar: '#5DB84A',
      lampPost: '#3F4254', lampGlass: '#FFE6A8', bench: '#B8864B', benchIron: '#3F4254', hydrant: '#E5484D',
      bin: '#6E7A3A', planter: '#C9744A', shelter: '#8FD6FF', mailbox: '#2E3F73', newsbox: '#1CB5F5',
      billboard: '#FFFDF8', railingPost: '#3F4254', plinth: '#E6DCC6', statue: '#FFFFFF', pond: '#4FB6E8',
      duck: '#FFFFFF', duckBill: '#F2A93B', chess: '#F3EBDD', chessDark: '#1B1D2B', bowl: '#C3C7CF',
      binocular: '#3F4254', flag: '#D94B3D', pigeon: '#A7A9B4',
    },

    // ---- Effects (ART_AUDIO §12) -------------------------------------------------------------------
    fx: {
      coin: '#E8B730', coinHi: '#FFE27A', coinShade: '#B8861A', dust: '#D9CDB5', scrap: '#FFFDF8',
      spark: '#FFE14F', hit: '#FFFFFF', blot: '#1B1D2B', star: '#FFD23F', wisp: '#FFFFFFB3',
      confetti: ['#E5484D', '#FFD23F', '#3D8BFD', '#19A35B', '#D946EF', '#F07A2A', '#FFFFFF'],
      stampInk: '#B42318D9', floatOutline: '#1B1D2B', vignette: '#1B1D2B66', flash: '#FFFFFF',
      halftone: '#1B1D2B', newsprint: '#F4F0E6',
    },

    // ---- UI.md §2.1 tokens mirrored for canvas (css/tokens.css is the DOM's copy) -----------------
    ui: {
      'paper-0': '#FFFDF8', 'paper-1': '#F7F2E8', 'paper-2': '#EFE6D4', 'paper-3': '#E2D6BE',
      'ink-900': '#1B1D2B', 'ink-700': '#3F4254', 'ink-500': '#5C6070', 'ink-300': '#A8ABB8',
      'primary-100': '#DCE7FF', 'primary-500': '#2F6BFF', 'primary-600': '#1F4FD6', 'primary-ink': '#FFFFFF',
      focus: '#FFD23F',
      money: '#19A35B', 'money-ink': '#0E7A41', 'money-100': '#DDF5E8',
      hp: '#E5484D', 'hp-ink': '#B42318', 'hp-100': '#FDE2E2',
      str: '#F07A2A', 'str-ink': '#963F07', 'str-100': '#FDE9DA',
      int: '#3D8BFD', 'int-ink': '#1F5FC4', 'int-100': '#DEEBFF',
      cha: '#D946EF', 'cha-ink': '#A21CAF', 'cha-100': '#FBE3FD',
      time: '#0E9FB5', 'time-ink': '#0B6F80', 'time-100': '#D9F3F7',
      heat: '#FF6A00', 'heat-ink': '#B54708', 'heat-100': '#FFE7D6',
      'karma-zero': '#0066CC', 'karma-good': '#FFFFFF', 'karma-evil': '#CA0000',
      ok: '#12B76A', warn: '#F79009', danger: '#D92D20', 'danger-ink': '#B42318', info: '#3D8BFD',
      scrim: '#1B1D2B73',
      // css/tokens.css additions (W1-D request 3): the karma bands are .karma above
      white: '#FFFFFF', gold: '#C98A00', newsprint: '#F4F0E6',
    },
  };

  // camelCase aliases for the ui mirror ('ink-900' → ink900, 'money-ink' → moneyInk), not enumerable.
  Object.keys(palette.ui).forEach(function (k) {
    var alias = k.replace(/-([a-z0-9])/g, function (m, c) { return c.toUpperCase(); });
    if (alias !== k && !Object.prototype.hasOwnProperty.call(palette.ui, alias)) {
      Object.defineProperty(palette.ui, alias, { value: palette.ui[k], enumerable: false });
    }
  });

  SR.art.palette = palette;
})();
