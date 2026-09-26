// The warping background: a lattice of point masses joined by springs, anchored to where they started.
// Explosions push it, bullets ripple it and gravity wells suck it in. The lattice is flat (no z bulge) and
// its colour never changes with displacement; it only looks brighter where lines bunch up.
'use strict';
(function () {
  const GW = window.GW;

  const K = 0.28, D = 0.06;   // spring stiffness and damping
  const DAMP = 0.98;          // velocity kept per pass
  const MAJOR_EVERY = 4;      // every 4th line is a brighter major line
  const GAP = 0.2;            // closest two neighbouring points may get, as a fraction of the spacing

  class Grid {
    constructor(w, h, spacing) {
      const cols = (this.cols = Math.round(w / spacing) + 1);
      const rows = (this.rows = Math.round(h / spacing) + 1);
      this.sx = w / (cols - 1);
      this.sy = h / (rows - 1);
      this.w = w;
      this.h = h;
      const n = (this.n = cols * rows);
      const F = () => new Float32Array(n);
      this.ox = F(); this.oy = F();
      this.px = F(); this.py = F();
      this.vx = F(); this.vy = F();
      this.ax = F(); this.ay = F();
      this.damp = F();
      this.pos = new Float32Array(n * 2); // interleaved x, y for the GPU upload

      // Springs only pull (never push) once stretched past 95% of the spacing.
      this.restX = this.sx * 0.95;
      this.restY = this.sy * 0.95;
      // Ripples travel one lattice step per pass; two passes per step keep them moving ~25 px per step.
      this.passes = 2;

      // Look (E2): every line the same width, major lines brighter.
      this.lineW = 2.6;
      this.every = MAJOR_EVERY;
      this.major = [0.08, 0.08, 0.38];
      this.minor = [0.04, 0.04, 0.18];

      const ai = [], ak = [], ad = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          this.ox[i] = this.px[i] = x * this.sx;
          this.oy[i] = this.py[i] = y * this.sy;
          this.damp[i] = DAMP;
          if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) { ai.push(i); ak.push(0.1); ad.push(0.1); }
          else if (x % MAJOR_EVERY === 0 && y % MAJOR_EVERY === 0) { ai.push(i); ak.push(0.002); ad.push(0.02); }
        }
      }
      this.ai = Int32Array.from(ai); this.ak = Float32Array.from(ak); this.ad = Float32Array.from(ad);
    }

    update() {
      for (let p = 0; p < this.passes; p++) this.pass();
      this.untangle();
    }

    // One spring + anchor + integration pass. Forces queued by the apply* calls are consumed by the first.
    pass() {
      const { px, py, vx, vy, ax, ay, damp, cols, rows } = this;

      // Row springs: point i to i + 1.
      let rl = this.restX, rl2 = rl * rl;
      for (let y = 0; y < rows; y++) {
        const end = y * cols + cols - 1;
        for (let a = y * cols; a < end; a++) {
          const b = a + 1;
          const dx = px[a] - px[b], dy = py[a] - py[b];
          const l2 = dx * dx + dy * dy;
          if (l2 <= rl2) continue;
          const len = Math.sqrt(l2);
          const f = (K * (len - rl)) / len;
          const fx = dx * f - (vx[b] - vx[a]) * D;
          const fy = dy * f - (vy[b] - vy[a]) * D;
          ax[a] -= fx; ay[a] -= fy;
          ax[b] += fx; ay[b] += fy;
        }
      }
      // Column springs: point i to i + cols.
      rl = this.restY; rl2 = rl * rl;
      for (let a = 0, end = this.n - cols; a < end; a++) {
        const b = a + cols;
        const dx = px[a] - px[b], dy = py[a] - py[b];
        const l2 = dx * dx + dy * dy;
        if (l2 <= rl2) continue;
        const len = Math.sqrt(l2);
        const f = (K * (len - rl)) / len;
        const fx = dx * f - (vx[b] - vx[a]) * D;
        const fy = dy * f - (vy[b] - vy[a]) * D;
        ax[a] -= fx; ay[a] -= fy;
        ax[b] += fx; ay[b] += fy;
      }

      const { ai, ak, ad, ox, oy } = this;
      for (let s = 0, n = ai.length; s < n; s++) {
        const i = ai[s], k = ak[s], d = ad[s];
        ax[i] += k * (ox[i] - px[i]) - vx[i] * d;
        ay[i] += k * (oy[i] - py[i]) - vy[i] * d;
      }

      for (let i = 0, n = this.n; i < n; i++) {
        let x = vx[i] + ax[i], y = vy[i] + ay[i];
        px[i] += x; py[i] += y;
        ax[i] = 0; ay[i] = 0;
        if (x * x + y * y < 1e-6) { x = 0; y = 0; }
        const dm = damp[i];
        vx[i] = x * dm; vy[i] = y * dm;
        damp[i] = DAMP;
      }
    }

    // Keeps every line from folding over itself: along a row x must keep increasing, down a column y must.
    // The springs only pull, so a strong blast (a death on this dense lattice) would otherwise throw inner
    // points past outer ones and leave a tangled ring. Each line is projected onto the nearest order with at
    // least GAP of the spacing between neighbours (the mean of a forward and a backward sweep, so neither
    // direction is favoured); moved points lose half their speed on that axis. Lines bunch up, and look
    // brighter, instead of crossing.
    untangle() {
      const { px, py, vx, vy, cols, rows } = this;
      const f = this._f || (this._f = new Float32Array(Math.max(cols, rows)));
      const g = this._g || (this._g = new Float32Array(Math.max(cols, rows)));
      const line = (p, v, start, stride, count, gap) => {
        let bad = false;
        for (let k = 1, i = start + stride; k < count; k++, i += stride) if (p[i] - p[i - stride] < gap) { bad = true; break; }
        if (!bad) return;
        f[0] = p[start];
        for (let k = 1, i = start + stride; k < count; k++, i += stride) f[k] = Math.max(p[i], f[k - 1] + gap);
        const last = count - 1;
        g[last] = p[start + last * stride];
        for (let k = last - 1, i = start + k * stride; k >= 0; k--, i -= stride) g[k] = Math.min(p[i], g[k + 1] - gap);
        for (let k = 0, i = start; k < count; k++, i += stride) {
          const q = 0.5 * (f[k] + g[k]);
          if (q !== p[i]) { p[i] = q; v[i] *= 0.5; }
        }
      };
      const gx = this.sx * GAP, gy = this.sy * GAP;
      for (let y = 0; y < rows; y++) line(px, vx, y * cols, 1, cols, gx);
      for (let x = 0; x < cols; x++) line(py, vy, x, cols, rows, gy);
    }

    // Column / row bounds of the points whose rest position lies within `radius` (plus a margin) of (x, y).
    bounds(x, y, radius) {
      const b = this._b || (this._b = [0, 0, 0, 0]);
      b[0] = Math.max(0, Math.floor((x - radius) / this.sx) - 1);
      b[1] = Math.min(this.cols - 1, Math.ceil((x + radius) / this.sx) + 1);
      b[2] = Math.max(0, Math.floor((y - radius) / this.sy) - 1);
      b[3] = Math.min(this.rows - 1, Math.ceil((y + radius) / this.sy) + 1);
      return b;
    }

    // Visits the points whose rest position lies within `radius` (plus a margin) of (x, y).
    range(x, y, radius, fn) {
      const [c0, c1, r0, r1] = this.bounds(x, y, radius);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) fn(r * this.cols + c);
    }

    // fz is accepted for compatibility and ignored: the lattice is flat.
    applyDirected(fx, fy, fz, x, y, radius) {
      const r2 = radius * radius, { px, py, ax, ay, cols } = this;
      const [c0, c1, r0, r1] = this.bounds(x, y, radius);
      for (let r = r0; r <= r1; r++) {
        for (let i = r * cols + c0, e = r * cols + c1; i <= e; i++) {
          const dx = x - px[i], dy = y - py[i];
          const d2 = dx * dx + dy * dy;
          if (d2 >= r2) continue;
          const k = 10 / (10 + Math.sqrt(d2));
          ax[i] += fx * k; ay[i] += fy * k;
        }
      }
    }

    applyImplosive(force, x, y, radius) {
      const r2 = radius * radius, { px, py, ax, ay, damp, cols } = this;
      const [c0, c1, r0, r1] = this.bounds(x, y, radius);
      for (let r = r0; r <= r1; r++) {
        for (let i = r * cols + c0, e = r * cols + c1; i <= e; i++) {
          const dx = x - px[i], dy = y - py[i];
          const d2 = dx * dx + dy * dy;
          if (d2 >= r2) continue;
          const k = (10 * force) / (100 + d2);
          ax[i] += dx * k; ay[i] += dy * k;
          damp[i] *= 0.6;
        }
      }
    }

    applyExplosive(force, x, y, radius) {
      const r2 = radius * radius, { px, py, ax, ay, damp, cols } = this;
      const [c0, c1, r0, r1] = this.bounds(x, y, radius);
      for (let r = r0; r <= r1; r++) {
        for (let i = r * cols + c0, e = r * cols + c1; i <= e; i++) {
          const dx = px[i] - x, dy = py[i] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r2) continue;
          const k = (100 * force) / (10000 + d2);
          ax[i] += dx * k; ay[i] += dy * k;
          damp[i] *= 0.6;
        }
      }
    }

    // Pushes the band of points a shockwave front of radius r is passing through.
    applyRing(x, y, r, band, force) {
      const outer = r + band, inner = Math.max(0, r - band), { px, py, ax, ay, cols } = this;
      const [c0, c1, r0, r1] = this.bounds(x, y, outer);
      for (let row = r0; row <= r1; row++) {
        for (let i = row * cols + c0, e = row * cols + c1; i <= e; i++) {
          const dx = px[i] - x, dy = py[i] - y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > outer || d < inner || d < 1) continue;
          const k = (force * (1 - Math.abs(d - r) / band)) / d;
          ax[i] += dx * k; ay[i] += dy * k;
        }
      }
    }

    // Draws into whatever layer is current (the game puts it in the unbloomed base layer). The GPU path
    // uploads the point positions and draws every segment from one instanced call; the JS path is the
    // fallback when that is unavailable. `hi` adds Catmull-Rom midpoints so tight bends stay smooth.
    draw(R, cx, cy, hi) {
      if (R.drawGrid && R.drawGrid(this, hi)) return;
      const { px, py, cols, rows, n, lineW, major, minor, every } = this;
      const seg = (j, i, step, c) => {
        if (hi) {
          const row = step === 1;
          const p0 = j - step >= 0 && (!row || j % cols > 0) ? j - step : j;
          const p3 = i + step < n && (!row || i % cols < cols - 1) ? i + step : i;
          const lx = 0.5 * (px[j] + px[i]), ly = 0.5 * (py[j] + py[i]);
          const mx = lx + 0.0625 * (px[j] - px[p0] + px[i] - px[p3]);
          const my = ly + 0.0625 * (py[j] - py[p0] + py[i] - py[p3]);
          if ((mx - lx) * (mx - lx) + (my - ly) * (my - ly) > 0.5) {
            R.line(px[j], py[j], mx, my, lineW, c[0], c[1], c[2], false);
            R.line(mx, my, px[i], py[i], lineW, c[0], c[1], c[2], false);
            return;
          }
        }
        R.line(px[j], py[j], px[i], py[i], lineW, c[0], c[1], c[2], false);
      };
      for (let y = 0; y < rows; y++) {
        const c = y % every === 0 ? major : minor;
        for (let x = 1; x < cols; x++) { const i = y * cols + x; seg(i - 1, i, 1, c); }
      }
      for (let x = 0; x < cols; x++) {
        const c = x % every === 0 ? major : minor;
        for (let y = 1; y < rows; y++) { const i = y * cols + x; seg(i - cols, i, cols, c); }
      }
    }
  }

  GW.Grid = Grid;
})();
