// Ronin's core for the web page: the game's own Swift logic and art (RoninCore, RoninArt), compiled to WebAssembly
// (ronin.wasm, built by build.sh), behind a small JavaScript API. No dependencies: the few WASI calls the Swift
// runtime makes are answered here. Everything is documented in API.md.
//
//   import { loadCore } from './core.js';
//   const core = await loadCore('ronin.wasm');
//   core.newGame({ seed: 42 });
//   const events = core.advance(1 / 60);
//   const state = core.state();

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Loads and starts the core. `source`: a URL (string or URL), an ArrayBuffer, a typed array, or a compiled
 *  WebAssembly.Module. Options: `log(text)` and `error(text)` receive what the Swift runtime prints (default: the
 *  console). */
export async function loadCore(source, options = {}) {
  if (typeof WebAssembly !== 'object' || WebAssembly === null || typeof WebAssembly.instantiate !== 'function') {
    throw new Error('Ronin: this browser cannot run WebAssembly (it is missing, or turned off by a setting or policy).');
  }
  let module;
  if (source instanceof WebAssembly.Module) {
    module = source;
  } else {
    let bytes;
    if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
      bytes = source;
    } else {
      let response;
      try {
        response = await fetch(source);
      } catch (e) {
        throw new Error(`Ronin: could not fetch ${source}: ${e && e.message ? e.message : e}`);
      }
      if (!response.ok) throw new Error(`Ronin: could not fetch ${source}: HTTP ${response.status}`);
      bytes = await response.arrayBuffer();
    }
    try {
      module = await WebAssembly.compile(bytes);
    } catch (e) {
      throw new Error(`Ronin: the WebAssembly module did not compile (${e && e.message ? e.message : e}). ` +
        'Is WebAssembly blocked here (a Content-Security-Policy without \'wasm-unsafe-eval\'), or is the file not ronin.wasm?');
    }
  }
  const wasi = new WASIShim(options);
  const imports = {};
  // Every import the module asks for: the ones answered below, and for anything else a stub that says "not
  // supported" (the runtime never needs them to run the game).
  for (const { module: name, name: field, kind } of WebAssembly.Module.imports(module)) {
    if (kind !== 'function') continue;
    imports[name] ??= {};
    const own = name === 'wasi_snapshot_preview1' ? wasi.functions[field] : undefined;
    imports[name][field] = own ?? (() => ERRNO.NOSYS);
  }
  let instance;
  try {
    instance = await WebAssembly.instantiate(module, imports);
  } catch (e) {
    throw new Error(`Ronin: the WebAssembly module did not start: ${e && e.message ? e.message : e}`);
  }
  wasi.memory = instance.exports.memory;
  if (typeof instance.exports._initialize === 'function') instance.exports._initialize();
  return new Core(instance, wasi);
}

// MARK: The API

const SIDE = { left: -1, right: 1, '-1': -1, '1': 1 };

export class Core {
  constructor(instance, wasi) {
    this.exports = instance.exports;
    this.wasi = wasi;
    this._tuning = null;
    this._frames = new Map();
    this.ragdoll = new RagdollAPI(this);
  }

  // Plumbing: text into the input buffer, output read back.
  _input(text) {
    const bytes = encoder.encode(text);
    const ptr = this.exports.ronin_buffer(bytes.length);
    new Uint8Array(this.exports.memory.buffer, ptr, bytes.length).set(bytes);
    return bytes.length;
  }

  _outText(length) {
    const ptr = this.exports.ronin_out();
    return decoder.decode(new Uint8Array(this.exports.memory.buffer, ptr, length));
  }

  _call(request) {
    const length = this.exports.ronin_rpc(this._input(JSON.stringify(request)));
    const reply = JSON.parse(this._outText(length));
    if (!reply.ok) throw new Error(`Ronin core: ${reply.error}`);
    return reply.result;
  }

  // MARK: The career and the fight

  /** A new career (the old one is gone). `seed`: a number, bigint or decimal string (random when left out);
   *  `mode` optional. Keeps the rules and the autopilot. */
  newGame({ seed, mode } = {}) {
    return this._call({ op: 'newGame', seed: seed == null ? undefined : String(seed), mode });
  }

  /** Loads a save (the JSON text `saveJSON` gave, or the app's save.json). False if not even its career reads. */
  loadSave(json) {
    return this._call({ op: 'loadSave', json: String(json) });
  }

  /** The save: the career and the fight in progress, down to the step (the app's save.json). Keep it as text: it
   *  holds 64-bit seeds a JSON.parse would round. */
  saveJSON() {
    return this._call({ op: 'saveJSON' });
  }

  career() { return this._call({ op: 'career' }); }

  /** Starts play the way the menus do. `mode`: switch difficulty (as the Difficulty menu). `endless: true`: an
   *  endless run on `stage` (default the current). `endless: false`: back to the campaign. `stage` (not endless): jump
   *  the campaign there. Returns whether anything changed (a new fight). */
  begin({ mode, stage, endless } = {}) {
    return this._call({ op: 'begin', mode, stage, endless });
  }

  /** After an outcome: what clicking the banner does (the next stage after a win, the run's start after a fall). */
  next() { return this._call({ op: 'next' }); }
  /** The menu's Restart Stage (Next Stage / Start Over once the fight has ended). */
  restart() { return this._call({ op: 'restart' }); }
  /** The Difficulty menu. */
  choose(mode) { return this._call({ op: 'choose', mode }); }
  /** Reset Career (the mode kept). */
  reset({ seed } = {}) { return this._call({ op: 'reset', seed: seed == null ? undefined : String(seed) }); }
  /** The Endless menu: a run on an unlocked stage. */
  startEndless(stage) { return this._call({ op: 'startEndless', stage }); }
  /** The Endless menu's Campaign item. */
  leaveEndless() { return this._call({ op: 'leaveEndless' }); }
  /** Development: the campaign jumped to any stage. */
  jump(stage) { return this._call({ op: 'jump', stage }); }

  /** Crowd rules: the fields given are changed, the rest kept. Returns the rules now. */
  setRules(rules) { return this._call({ op: 'setRules', rules: rules || {} }); }
  rules() { return this._call({ op: 'rules' }); }
  standardRules() { return this._call({ op: 'standardRules' }); }
  /** Every side a queue, and the brute knocked back: the game before the crowd rules. */
  queueRules() { return this._call({ op: 'queueRules' }); }

  setAutopilot(on) { return this._call({ op: 'setAutopilot', on: !!on }); }

  /** Steps the fight `dt` seconds (fixed 1/120 s steps inside; the rest carries over). Returns the events. */
  advance(dt) {
    const length = this.exports.ronin_advance(+dt || 0);
    return length ? JSON.parse(this._outText(length)) : [];
  }

  /** A cut, 'left' or 'right' (or -1 / 1). Returns the events. */
  strike(side) {
    const s = SIDE[side];
    if (s === undefined) throw new Error(`Ronin core: strike('left' | 'right'), not ${side}`);
    const length = this.exports.ronin_strike(s);
    return length ? JSON.parse(this._outText(length)) : [];
  }

  /** Everything the scene reads from the fight and session this frame. */
  state() {
    return JSON.parse(this._outText(this.exports.ronin_state()));
  }

  /** A stage as the app describes it (setting, what it brings, its title card). Defaults: the fight's stage, the
   *  career's mode. */
  stage(stage, mode) { return this._call({ op: 'stage', stage, mode }); }

  /** The banner over a finished fight (null while it goes on). Also in career().banner. */
  banner() { return this.career().banner; }

  // For tests and the self-test: situations staged on the lane.
  raiseBruteClub(side = 'right') { return this._call({ op: 'raiseBruteClub', side }); }
  setWarlordGuard() { return this._call({ op: 'setWarlordGuard' }); }

  // MARK: The figures

  /** The constants the app uses (Tuning, kinds, modes, frame counts, Figure's canvas, the palette...). */
  get tuning() {
    if (!this._tuning) this._tuning = this._call({ op: 'tuning' });
    return this._tuning;
  }

  /** Figure.anchor: where the feet stand on a figure's canvas, as fractions of it (y up). */
  get anchor() { return this.tuning.Figure.anchor; }

  /** Figures.size: a figure's whole canvas on screen for a ronin `ronin` pixels tall. */
  figureSize(cast, ronin) {
    const c = this.tuning.Figure;
    const h = ronin * c.casts[castKey(cast)].height;
    return { width: c.canvas.width * h, height: c.canvas.height * h };
  }

  /** The frame keys drawn for a cast (Figure.frames(for:)). */
  frames(cast) {
    const key = castKey(cast);
    if (!this._frames.has(key)) this._frames.set(key, this._call({ op: 'frames', cast: key }));
    return this._frames.get(key).slice();
  }

  /** Figures.has: whether a cast has a frame drawn for it. */
  has(cast, frame) {
    this.frames(cast);
    return this._frames.get(castKey(cast)).includes(frame);
  }

  /** Figure.footing: where the ankles are, from the spot the figure stands on, in figure heights. */
  footing(cast, frame) { return this._call({ op: 'footing', cast: castKey(cast), frame }); }

  /** Footing, weapon tip, blade contact, anatomy and flags for a frame. */
  figure(cast, frame) { return this._call({ op: 'figure', cast: castKey(cast), frame }); }

  /** Figure.clashGap: how far apart (ronin heights) the ronin and the warlord stand for their blades to meet. */
  clashGap(heroFrame = 'clash(0)', warlordFrame = 'clash(0)') {
    return this._call({ op: 'clashGap', frame: heroFrame, warlordFrame });
  }

  /** Draws a frame: { width, height, anchor, rim, bounds, underlay, body, overlay, ... } (see API.md).
   *  `armed: false` leaves the weapon out. `sheathed: true` (the hero): the frame with the blade kept in its
   *  scabbard, as the app draws what befalls him before the stage's draw (a blow, winded, the fall). */
  sketch(cast, frame, { armed = true, sheathed = false } = {}) {
    const key = castKey(cast);
    const length = this.exports.ronin_sketch(this._input(`${key}|${frame}|${armed ? 1 : 0}|${sheathed ? 1 : 0}`));
    if (!length) throw new Error(`Ronin core: no sketch for ${key} / ${frame}`);
    const ptr = this.exports.ronin_out();
    const floats = new Float32Array(this.exports.memory.buffer.slice(ptr, ptr + length));
    const sketch = decodeSketch(floats, 0).sketch;
    sketch.cast = key;
    sketch.frame = frame;
    sketch.armed = armed;
    sketch.sheathed = sheathed;
    return sketch;
  }
}

function castKey(cast) {
  if (typeof cast !== 'string') throw new Error(`Ronin core: a cast is a string ('hero', 'grunt', ...), not ${cast}`);
  return cast.startsWith('foe:') ? cast.slice(4) : cast;
}

// MARK: Sketches

const HEADER = 20;

/** Reads one sketch from its floats (see API.md, "Sketch binary layout"). Returns it and where the next begins. */
export function decodeSketch(f, at = 0) {
  if (f[at] !== 1) throw new Error(`Ronin core: unknown sketch layout ${f[at]}`);
  const width = f[at + 1], height = f[at + 2];
  const counts = [f[at + 8], f[at + 9], f[at + 10]];
  const sketch = {
    width,
    height,
    rim: { color: [f[at + 3], f[at + 4], f[at + 5]], alpha: f[at + 6], radius: f[at + 7] },
    bounds: { x: f[at + 11], y: f[at + 12], width: f[at + 13], height: f[at + 14] },
    smeared: f[at + 15] === 1,
    unit: f[at + 16],
    anchor: { x: f[at + 17], y: f[at + 18] },
    anchorUnit: { x: f[at + 17] / width, y: f[at + 18] / height },
    pixelHeight: f[at + 19],
    underlay: [],
    body: [],
    overlay: [],
  };
  let p = at + HEADER;
  for (const [list, count] of [[sketch.underlay, counts[0]], [sketch.body, counts[1]], [sketch.overlay, counts[2]]]) {
    for (let k = 0; k < count; k++) {
      const flags = f[p + 1];
      const n = f[p + 11];
      const shape = {
        fill: flags & 1 ? [f[p + 2], f[p + 3], f[p + 4], f[p + 5]] : null,
        stroke: flags & 2 ? [f[p + 6], f[p + 7], f[p + 8], f[p + 9]] : null,
        width: f[p + 10],
        round: (flags & 4) !== 0,
      };
      const data = p + 12;
      if (f[p] === 1) shape.ellipse = { x: f[data], y: f[data + 1], w: f[data + 2], h: f[data + 3] };
      else shape.path = f.subarray(data, data + n);
      list.push(shape);
      p = data + n;
    }
  }
  return { sketch, next: p };
}

/** A Path2D for a shape, in the sketch's pixels (y up, as stored: flip when drawing, as `drawSketch` does). */
export function shapePath(shape) {
  const path = new Path2D();
  if (shape.ellipse) {
    const { x, y, w, h } = shape.ellipse;
    path.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    return path;
  }
  const d = shape.path;
  for (let i = 0; i < d.length;) {
    switch (d[i]) {
      case 0: path.moveTo(d[i + 1], d[i + 2]); i += 3; break;
      case 1: path.lineTo(d[i + 1], d[i + 2]); i += 3; break;
      case 2: path.quadraticCurveTo(d[i + 1], d[i + 2], d[i + 3], d[i + 4]); i += 5; break;
      case 3: path.closePath(); i += 1; break;
      default: throw new Error(`Ronin core: bad path command ${d[i]}`);
    }
  }
  return path;
}

function css([r, g, b, a = 1]) {
  const c = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgba(${c(r)},${c(g)},${c(b)},${a})`;
}

/** Draws a sketch as the app does (`Sketch.image(in:)`): the underlay, then the body as one layer with its rim of
 *  light (a soft glow of the rim colour, radius × 1.6 blur), then the overlay. Draws the sketch's own pixels, feet at
 *  `sketch.anchor`, y flipped to the canvas's y down; set up the transform first to place and scale it. `layer`: an
 *  offscreen canvas (and its context) the size of the sketch or larger, for the body's rim (made when left out). */
export function drawSketch(ctx, sketch, { rim = true, layer } = {}) {
  const w = sketch.width, h = sketch.height;
  ctx.save();
  ctx.transform(1, 0, 0, -1, 0, h); // y up, as the sketch is
  paint(ctx, sketch.underlay);
  if (rim && sketch.rim.alpha > 0 && sketch.body.length) {
    // The body drawn into a layer of its own, then that layer drawn with a shadow: the rim spreads around the
    // whole figure, not around each of its shapes.
    let canvas = layer;
    if (!canvas || canvas.width < w || canvas.height < h) {
      canvas = typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h });
    }
    const lc = canvas.getContext('2d');
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, w, h);
    lc.setTransform(1, 0, 0, -1, 0, h);
    paint(lc, sketch.body);
    ctx.save();
    ctx.transform(1, 0, 0, -1, 0, h); // back to y down, as the layer is stored
    // The shadow's blur is in device pixels: scale it with the transform.
    const m = ctx.getTransform();
    const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
    ctx.shadowColor = css([...sketch.rim.color, sketch.rim.alpha]);
    ctx.shadowBlur = sketch.rim.radius * 1.6 * scale;
    ctx.drawImage(canvas, 0, 0, w, h, 0, 0, w, h);
    ctx.restore();
  } else {
    paint(ctx, sketch.body);
  }
  paint(ctx, sketch.overlay);
  ctx.restore();
}

function paint(ctx, shapes) {
  for (const shape of shapes) {
    const path = shape.path2d || (shape.path2d = shapePath(shape));
    if (shape.fill) {
      ctx.fillStyle = css(shape.fill);
      ctx.fill(path);
    }
    if (shape.stroke) {
      ctx.strokeStyle = css(shape.stroke);
      ctx.lineWidth = shape.width;
      ctx.lineCap = shape.round ? 'round' : 'butt';
      ctx.lineJoin = shape.round ? 'round' : 'miter';
      ctx.stroke(path);
    }
  }
}

// MARK: Ragdolls

/** `core.ragdoll`: the dead, as the app's Carnage makes them (see API.md, "Ragdolls"). Dolls live in the core by id
 *  until removed. Points are in figure heights from the spot he stood on, x toward the way he faced, y up. */
class RagdollAPI {
  constructor(core) {
    this.core = core;
    this._joints = null;
  }

  _do(action, options = {}) {
    return this.core._call({ op: 'ragdoll', options: { ...options, action } });
  }

  _piece(request) {
    const core = this.core;
    const length = core.exports.ronin_piece(core._input(JSON.stringify(request)));
    if (!length) throw new Error(`Ronin core: no ${request.kind} sketch for ${JSON.stringify(request)}`);
    const ptr = core.exports.ronin_out();
    const floats = new Float32Array(core.exports.memory.buffer.slice(ptr, ptr + length));
    const { sketch, next } = decodeSketch(floats, 0);
    return { sketch, floats, next };
  }

  /** The joint indices: {low, high, head, frontKnee, frontFoot, backKnee, backFoot, frontElbow, frontHand, backElbow, backHand}. */
  get joints() {
    if (!this._joints) this._joints = this._do('joints');
    return this._joints;
  }

  /** Makes the dolls' rolls repeatable (they are random otherwise, as in the app). */
  seed(seed) { return this._do('seed', { seed: seed == null ? undefined : String(seed) }); }

  /** Carnage.sever: a foe cut apart by a killing cut. `severance`: 'falling' | 'rising' (kesa / gyaku-kesa, on a
   *  slant), 'level' (dō), 'legs' (sune-giri), 'head'. From `Figure.struck(cast, variant)`. `back`: the way the upper
   *  part is thrown along his own facing (the app passes away-from-the-ronin × his facing). Returns ids and timings:
   *  {upper, lower, standFor} | {body} (legs) | {body, standFor, head: variant} (head), and `weapon` {hand, turn, bow}. */
  sever(cast, severance = 'level', { variant = 0, back = -1, force = 1 } = {}) {
    return this._do('sever', { cast, severance, variant, back, force });
  }

  /** Carnage.fell: run through or shot, down whole from `frame` or `Figure.struck(cast, variant)` (default the
   *  stagger). Returns {body, weapon}. */
  fell(cast, { frame, variant, back = -1, force = 1 } = {}) {
    return this._do('fell', { cast, frame, variant, back, force });
  }

  /** A doll of your own: style 'plain' | 'felled' | 'hamstrung' | 'cut' (with `severed: {part: 'above'|'below'|'headless', at, slant}`). */
  create(cast, { frame, variant, style = 'plain', severed, back, force, lift } = {}) {
    return this._do('create', { cast, frame, variant, style, severed, back, force, lift });
  }

  /** A standing doll's knees go (and it reaches for the pose it was given, as the app does after `standFor`). */
  collapse(id) { return this._do('collapse', { id }); }
  /** Reach for a pose: 'wild' (any a blow throws a man into), 'thrown', 'struck' (+variant), or a frame key. */
  reach(id, target = 'wild', { variant, fling = false } = {}) {
    return this._do('reach', { id, target, targetVariant: variant, fling });
  }
  raise(id, dy) { return this._do('raise', { id, dy }); }
  push(id, joint, { x = 0, y = 0 } = {}) { return this._do('push', { id, joint, x, y }); }
  thrown(id, { x = 0, y = 0 } = {}, spin = 0) { return this._do('thrown', { id, x, y, spin }); }
  planted(id, on = true) { return this._do('planted', { id, on }); }
  wounded(id, joint, along = 0.5) { return this._do('wounded', { id, joint, along }); }
  stir(id, amount = 1) { return this._do('stir', { id, amount }); }

  /** Steps the dolls (all when `ids` is left out) `dt` seconds. Returns each one's
   *  {id, time, settled, resting, hip, moved, bleeding: {at, angle}, wounded, standing, points?}. `moved`: how far
   *  (figure heights) its joints have gone since it was last drawn — the app redraws a doll once that passes
   *  0.6 points on screen. */
  step(dt, ids, { points = false } = {}) {
    if (ids == null && !points) {
      const core = this.core;
      return JSON.parse(core._outText(core.exports.ronin_dolls_step(+dt || 0)));
    }
    return this._do('step', { dt, ids: ids == null ? undefined : [].concat(ids), points });
  }

  info(id) { return this._do('info', { id }); }
  remove(ids) { return this._do('remove', { ids: [].concat(ids) }); }
  clear() { return this._do('clear'); }
  count() { return this._do('count'); }

  /** Draws a doll as it now lies (`Figure.sketch(cast, pose: doll.framed().pose)`). `sketch.place` {x, y}: where the
   *  sketch's anchor (its feet on the canvas) goes, in the doll's terms: world = origin + facing·place.x·scale,
   *  origin.y + place.y·scale (scale: screen pixels per figure height = ronin × build height). */
  draw(id) {
    const core = this.core;
    const length = core.exports.ronin_doll_draw(id | 0);
    if (!length) throw new Error(`Ronin core: no ragdoll ${id}`);
    const ptr = core.exports.ronin_out();
    const floats = new Float32Array(core.exports.memory.buffer.slice(ptr, ptr + length));
    const { sketch, next } = decodeSketch(floats, 0);
    sketch.place = { x: floats[next], y: floats[next + 1] };
    return sketch;
  }

  /** Figures.struck: a foe frozen in the pose a killing blow throws him into (his cloth at rest), weapon in hand. */
  struck(cast, variant = 0, { armed = true } = {}) {
    return this._piece({ kind: 'struck', cast, variant, armed }).sketch;
  }

  /** Figures.head: the head struck off from `struck(cast, variant)`, where it was on the canvas, with `wound` (canvas
   *  pixels, y up: where the neck was cut) and `angle` (radians: the way blood leaves it). */
  head(cast, variant = 0) {
    const sketch = this._piece({ kind: 'head', cast, variant }).sketch;
    const { wound, angle } = this._do('head', { cast, variant });
    sketch.wound = wound;
    sketch.angle = angle;
    return sketch;
  }

  /** Figure.weapon: a foe's weapon on its own, lying level, its grip at the canvas's middle. */
  weapon(cast) { return this._piece({ kind: 'weapon', cast }).sketch; }
}

// MARK: WASI, as little of it as the Swift runtime needs

const ERRNO = { SUCCESS: 0, BADF: 8, INVAL: 28, NOENT: 44, NOSYS: 52, SPIPE: 70 };

class WASIShim {
  constructor(options) {
    this.memory = null;
    this.log = options.log || ((text) => console.log(text));
    this.error = options.error || ((text) => console.error(text));
    this.pending = { 1: '', 2: '' };
    const view = () => new DataView(this.memory.buffer);
    const bytes = () => new Uint8Array(this.memory.buffer);
    this.functions = {
      args_sizes_get: (argc, size) => { view().setUint32(argc, 0, true); view().setUint32(size, 0, true); return 0; },
      args_get: () => 0,
      environ_sizes_get: (count, size) => { view().setUint32(count, 0, true); view().setUint32(size, 0, true); return 0; },
      environ_get: () => 0,
      clock_res_get: (id, out) => { view().setBigUint64(out, 1000n, true); return 0; },
      clock_time_get: (id, precision, out) => {
        const now = id === 0
          ? BigInt(Date.now()) * 1000000n
          : BigInt(Math.round((typeof performance === 'object' ? performance.now() : Date.now()) * 1e6));
        view().setBigUint64(out, now, true);
        return 0;
      },
      random_get: (ptr, length) => {
        const b = bytes();
        for (let at = 0; at < length; at += 65536) {
          crypto.getRandomValues(b.subarray(ptr + at, ptr + Math.min(length, at + 65536)));
        }
        return 0;
      },
      fd_write: (fd, iovs, count, written) => {
        const v = view(), b = bytes();
        let total = 0;
        let text = '';
        for (let i = 0; i < count; i++) {
          const base = v.getUint32(iovs + i * 8, true), len = v.getUint32(iovs + i * 8 + 4, true);
          text += decoder.decode(b.subarray(base, base + len));
          total += len;
        }
        v.setUint32(written, total, true);
        if (fd === 1 || fd === 2) {
          const lines = (this.pending[fd] + text).split('\n');
          this.pending[fd] = lines.pop();
          for (const line of lines) (fd === 1 ? this.log : this.error)(line);
          return 0;
        }
        return ERRNO.BADF;
      },
      fd_read: (fd, iovs, count, read) => { view().setUint32(read, 0, true); return fd === 0 ? 0 : ERRNO.BADF; },
      fd_pread: (fd, iovs, count, offset, read) => { view().setUint32(read, 0, true); return ERRNO.BADF; },
      fd_close: () => 0,
      fd_sync: () => 0,
      fd_seek: (fd) => (fd <= 2 ? ERRNO.SPIPE : ERRNO.BADF),
      fd_fdstat_get: (fd, out) => {
        if (fd > 2) return ERRNO.BADF;
        const v = view();
        v.setUint8(out, 2); // a character device
        v.setUint16(out + 2, 0, true);
        v.setBigUint64(out + 8, 0xffffffffn, true);
        v.setBigUint64(out + 16, 0xffffffffn, true);
        return 0;
      },
      fd_fdstat_set_flags: () => 0,
      fd_filestat_get: () => ERRNO.BADF,
      fd_prestat_get: () => ERRNO.BADF, // no directories are open to it
      fd_prestat_dir_name: () => ERRNO.BADF,
      fd_readdir: () => ERRNO.BADF,
      path_open: () => ERRNO.NOENT,
      path_filestat_get: () => ERRNO.NOENT,
      poll_oneoff: () => ERRNO.NOSYS,
      sched_yield: () => 0,
      proc_exit: (code) => {
        throw new Error(`Ronin core: the WebAssembly module exited (${code})`);
      },
    };
  }
}
