// main.js: boot: fonts, the core (core.js and ronin.wasm, beside the page), the panel, and the frame loop.

/** The app has no sound (README: "Sound: None"); this is where it would wake after the first input. */
const Sound = { wake() {} };

const els = {
  root: document.getElementById('ronin'),
  wrap: document.getElementById('panel-wrap'),
  canvas: document.getElementById('lane'),
  menu: document.getElementById('menu'),
  menuButton: document.getElementById('menu-button'),
  hidden: document.getElementById('shown-hidden'),
  showButton: document.getElementById('show-button'),
  status: document.getElementById('status'),
  fail: document.getElementById('fail'),
  failText: document.getElementById('fail-text'),
};

function fail(title, detail) {
  els.fail.hidden = false;
  els.failText.textContent = '';
  const h = document.createElement('strong');
  h.textContent = title;
  els.failText.appendChild(h);
  if (detail) {
    const p = document.createElement('span');
    p.textContent = ' ' + detail;
    els.failText.appendChild(p);
  }
  els.wrap.hidden = true;
  els.status.hidden = true;
}

/** Whether this viewer lets a page compile WebAssembly (a strict CSP without 'wasm-unsafe-eval' does not). */
async function wasmAllowed() {
  if (typeof WebAssembly !== 'object' || typeof WebAssembly.instantiate !== 'function') return false;
  try {
    // The smallest module there is.
    await WebAssembly.instantiate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    return true;
  } catch {
    return false;
  }
}

async function fontsReady() {
  try {
    await Promise.race([
      Promise.all([
        // (With the letters beyond ASCII the cards use, so their subsets come too: BUSHIDŌ, ×, —.)
        document.fonts.load(fontCSS(Fonts.heading, 20), 'STAGE 1 ×8 ▲ ŌĀ'),
        document.fonts.load(fontCSS(Fonts.text, 20), 'BUSHIDŌ · SHURA'),
        document.fonts.load(fontCSS(Fonts.italic, 20), 'CUT — ×2 Ō'),
        document.fonts.load(fontCSS(Fonts.seal, 20), '初武修鬼先'),
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch { /* the fallback faces will do */ }
  R.fontEpoch++;
  // A face (or a subset of one) that comes in later redraws the text set before it.
  try { document.fonts.addEventListener('loadingdone', () => { R.fontEpoch++; }); } catch { /* no font loading API */ }
}

async function loadTheCore() {
  const url = window.RONIN_CORE_URL || './core.js';
  const mod = await import(url);
  const loadCore = mod.loadCore || mod.default;
  const wasm = window.RONIN_WASM_URL || './ronin.wasm';
  return await loadCore(wasm);
}

async function boot() {
  els.status.textContent = 'Loading…';
  if (!(await wasmAllowed())) {
    fail('WebAssembly is blocked in this viewer.', 'Ronin runs its game in WebAssembly; open the page where it is allowed.');
    return;
  }
  let core;
  try {
    [core] = await Promise.all([loadTheCore(), fontsReady()]);
  } catch (err) {
    const blocked = /CompileError|wasm|WebAssembly|unsafe-eval|Content Security/i.test(String(err && (err.name + ' ' + err.message)));
    if (blocked) fail('WebAssembly is blocked in this viewer.', String(err.message || err));
    else fail('The game could not be loaded.', String((err && err.message) || err));
    console.error(err);
    return;
  }
  if (core.tuning) Object.assign(Tuning, core.tuning);
  Figures.core = core;
  buildArt();
  let session;
  try {
    session = new Session(core);
  } catch (err) {
    fail('The game could not start.', String((err && err.message) || err));
    console.error(err);
    return;
  }
  els.status.hidden = true;
  els.wrap.hidden = false;
  const panel = new Panel(session, els);
  // For tests: `manual` stops the clock, and `step(dt)` draws one frame `dt` seconds on.
  window.ronin = { panel, session, core, R, Figures, manual: false, step: (dt) => { panel.frame(dt); preloadStep(panel, 4); } };
  els.menuButton.addEventListener('click', () => panel.toggleMenu());
  els.showButton.addEventListener('click', () => panel.show());
  document.addEventListener('pointerdown', (e) => {
    if (panel.menuOpen && !els.menu.contains(e.target) && e.target !== els.menuButton && !els.menuButton.contains(e.target)) panel.closeMenu();
  });
  startPreload(panel);
  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    try {
      if (!window.ronin.manual) {
        panel.frame(dt);
        preloadStep(panel, 4);
      }
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// MARK: Preloading

let preloadQueue = [];

/** The frames to draw ahead: the ronin's first (his stance, the draw and his cuts), then the foes of the stage in
 *  play, then everyone else's, a few milliseconds a frame. */
function startPreload(panel) {
  const hero = [...Figures.frames('hero')];
  const first = (f) => (/^(iai|idle|cut\(nukitsuke)/.test(f) ? 0 : /^(cut|recover|chain)/.test(f) ? 1 : 2);
  hero.sort((a, b) => first(a) - first(b));
  const stage = panel.session.fight.stage;
  const kinds = ['grunt'];
  if (stage >= 2) kinds.push('runner');
  if (stage >= 3) kinds.push('brute');
  if (stage >= 4) kinds.push('archer');
  if (stage >= 6) kinds.push('dancer');
  if (stage % 5 === 0) kinds.push('warlord');
  const rest = Kinds.filter((k) => !kinds.includes(k));
  preloadQueue = [];
  const frame = (cast, f) => () => Figures.piece(cast, f).raster(Figures.scale(cast, panel.scene.ronin));
  // What a foe freezes in at a killing blow, and what the ronin may show before his first draw (HeroSprite.preload).
  const struck = (cast) => { for (let v = 0; v < FrameCounts.struckVariants; v++) preloadQueue.push(() => struckPiece(cast, v).raster(Figures.scale(cast, panel.scene.ronin))); };
  const sheathed = (f) => () => HeroSprite.sheathedPiece(f).raster(Figures.scale('hero', panel.scene.ronin));
  for (const f of hero) preloadQueue.push(frame('hero', f));
  for (const k of kinds) { for (const f of Figures.frames(k)) preloadQueue.push(frame(k, f)); struck(k); }
  for (let k = 0; k < FrameCounts.hurt; k++) preloadQueue.push(sheathed(F.hurt(k)));
  for (let v = 0; v < FrameCounts.windedCycles; v++) for (let k = 0; k < FrameCounts.winded; k++) preloadQueue.push(sheathed(F.winded(v, k)));
  for (let k = 0; k < FrameCounts.fall; k++) preloadQueue.push(sheathed(F.fall(k)));
  for (const k of rest) { for (const f of Figures.frames(k)) preloadQueue.push(frame(k, f)); struck(k); }
}

function preloadStep(panel, budgetMs) {
  if (!preloadQueue.length) return;
  const start = performance.now();
  while (preloadQueue.length && performance.now() - start < budgetMs) {
    const job = preloadQueue.shift();
    try { job(); } catch (err) { console.warn(err); }
  }
}

boot();
