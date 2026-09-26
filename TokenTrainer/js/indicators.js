// Technical indicators over plain number arrays. Values before an indicator has enough data are null.
(function (root) {
  const TT = (root.TT = root.TT || {});

  function sma(a, n) {
    const out = new Array(a.length).fill(null);
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i];
      if (i >= n) sum -= a[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  }

  // Wilder's RSI.
  function rsi(c, n = 14) {
    const out = new Array(c.length).fill(null);
    let gain = 0, loss = 0;
    for (let i = 1; i < c.length; i++) {
      const d = c[i] - c[i - 1];
      const g = Math.max(d, 0), l = Math.max(-d, 0);
      if (i <= n) {
        gain += g / n; loss += l / n;
        if (i < n) continue;
      } else {
        gain = (gain * (n - 1) + g) / n;
        loss = (loss * (n - 1) + l) / n;
      }
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
    return out;
  }

  // Wilder's average true range.
  function atr(h, l, c, n = 14) {
    const out = new Array(c.length).fill(null);
    let v = 0;
    for (let i = 0; i < c.length; i++) {
      const tr = i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
      if (i < n) { v += tr / n; if (i === n - 1) out[i] = v; continue; }
      v = (v * (n - 1) + tr) / n;
      out[i] = v;
    }
    return out;
  }

  // Attaches indicator arrays to a series {t,o,h,l,c,v}.
  function withIndicators(s) {
    s.ind = {
      sma20: sma(s.c, 20),
      sma50: sma(s.c, 50),
      rsi: rsi(s.c, 14),
      atr: atr(s.h, s.l, s.c, 14),
      vol20: sma(s.v, 20),
    };
    return s;
  }

  TT.ind = { sma, rsi, atr, withIndicators };
})(typeof window !== 'undefined' ? window : globalThis);
