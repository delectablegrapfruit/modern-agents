// Small helpers shared by every part of the game: numbers, randomness, and a game clock whose waits can be cancelled.

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
// Frame-rate independent approach of `current` toward `target`.
export const damp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));
export const TAU = Math.PI * 2;

export class RNG {
  constructor(seed = Date.now()) {
    this.state = seed >>> 0 || 1;
  }
  next() {
    // mulberry32
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p) {
    return this.next() < p;
  }
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }
  gauss() {
    let u = 0;
    while (u === 0) u = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * this.next());
  }
  shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  weighted(entries) {
    // entries: [[value, weight], ...]
    const total = entries.reduce((s, e) => s + Math.max(0, e[1]), 0);
    let r = this.next() * total;
    for (const [value, weight] of entries) {
      r -= Math.max(0, weight);
      if (r <= 0) return value;
    }
    return entries[entries.length - 1][0];
  }
}

export const rng = new RNG((Date.now() ^ (Math.random() * 1e9)) >>> 0);

// Fills {placeholders} from an object; unknown keys are left as they are.
export const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export class Cancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

// A cancellation handle for a running sequence (an act, a line of speech).
export class Token {
  constructor(parent) {
    this.cancelled = false;
    this.listeners = new Set();
    if (parent) {
      if (parent.cancelled) this.cancelled = true;
      else parent.listeners.add(() => this.cancel());
    }
  }
  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;
    for (const fn of this.listeners) fn();
    this.listeners.clear();
  }
  check() {
    if (this.cancelled) throw new Cancelled();
  }
}

// Game time: advances only while the game runs, and scaled by the speed setting.
export class Clock {
  constructor() {
    this.time = 0;
    this.waits = [];
  }
  update(dt) {
    this.time += dt;
    if (!this.waits.length) return;
    const due = [];
    this.waits = this.waits.filter((w) => {
      if (w.done) return false;
      if ((w.until !== undefined && this.time >= w.until) || (w.test && w.test())) {
        due.push(w);
        return false;
      }
      return true;
    });
    for (const w of due) w.finish();
  }
  // Resolves after `seconds` of game time; rejects with Cancelled if the token is cancelled first.
  wait(seconds, token) {
    return this._wait({ until: this.time + Math.max(0, seconds) }, token);
  }
  // Resolves once test() is true (checked every frame), or after `timeout` seconds; resolves to whether test passed.
  waitFor(test, token, timeout = Infinity) {
    return this._wait({ test, until: Number.isFinite(timeout) ? this.time + timeout : undefined }, token).then(() => !!test());
  }
  _wait(w, token) {
    return new Promise((resolve, reject) => {
      if (token && token.cancelled) return reject(new Cancelled());
      const onCancel = () => {
        w.done = true;
        reject(new Cancelled());
      };
      w.finish = () => {
        w.done = true;
        if (token) token.listeners.delete(onCancel);
        resolve();
      };
      if (token) token.listeners.add(onCancel);
      this.waits.push(w);
    });
  }
}

// Swallows only cancellations, so a stopped sequence ends quietly while real errors still surface.
export const quietly = (promise) =>
  promise.catch((e) => {
    if (!(e instanceof Cancelled)) console.error(e);
  });

export const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: settings last for this visit only */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
