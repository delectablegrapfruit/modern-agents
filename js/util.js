// Shared helpers. Everything hangs off the GW namespace; scripts are classic (no modules) so the game
// runs straight from file:// as well as from any static server.
'use strict';
(function () {
  const GW = (window.GW = window.GW || {});
  const TAU = Math.PI * 2;

  GW.TAU = TAU;
  GW.rand = (a, b) => a + Math.random() * (b - a);
  GW.randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  GW.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  GW.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  GW.lerp = (a, b, t) => a + (b - a) * t;
  GW.wrapAngle = (a) => {
    a = (a + Math.PI) % TAU;
    if (a < 0) a += TAU;
    return a - Math.PI;
  };

  GW.hex = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  GW.mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // h in [0, 6)
  GW.hsv = (h, s, v) => {
    const c = v * s, x = c * (1 - Math.abs((h % 2) - 1)), m = v - c;
    const i = Math.floor(h) % 6;
    const t = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][i];
    return [t[0] + m, t[1] + m, t[2] + m];
  };
  GW.css = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

  GW.fmt = (n) => Math.floor(n).toLocaleString('en-US');

  // Weighted choice from [[item, weight], ...]; null when every weight is zero.
  GW.weighted = (entries) => {
    let total = 0;
    for (const e of entries) total += Math.max(0, e[1]);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const e of entries) {
      r -= Math.max(0, e[1]);
      if (r <= 0) return e[0];
    }
    return entries[entries.length - 1][0];
  };

  GW.store = {
    get(key, def) {
      try {
        const v = localStorage.getItem('gwre.' + key);
        return v == null ? def : JSON.parse(v);
      } catch (e) {
        return def;
      }
    },
    set(key, val) {
      try {
        localStorage.setItem('gwre.' + key, JSON.stringify(val));
      } catch (e) { /* storage unavailable: settings last for the session only */ }
    },
  };
})();
