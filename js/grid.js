// The warping background: a lattice of point masses joined by springs, anchored to where they started.
// Explosions push it, bullets ripple it, gravity wells suck it in, and a z-offset gives it a 3D bulge.
'use strict';
(function () {
  const GW = window.GW;

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
      this.px = F(); this.py = F(); this.pz = F();
      this.vx = F(); this.vy = F(); this.vz = F();
      this.ax = F(); this.ay = F(); this.az = F();
      this.damp = F(); this.inv = F();
      this.qx = F(); this.qy = F(); this.glow = F();

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          this.ox[i] = this.px[i] = x * this.sx;
          this.oy[i] = this.py[i] = y * this.sy;
          this.inv[i] = 1;
          this.damp[i] = 0.98;
        }
      }

      const sa = [], sb = [], st = [], sk = [], sd = [];
      const ai = [], ak = [], ad = [];
      const K = 0.28, D = 0.06;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) { ai.push(i); ak.push(0.1); ad.push(0.1); }
          else if (x % 3 === 0 && y % 3 === 0) { ai.push(i); ak.push(0.002); ad.push(0.02); }
          if (x > 0) { sa.push(i - 1); sb.push(i); st.push(this.sx * 0.95); sk.push(K); sd.push(D); }
          if (y > 0) { sa.push(i - cols); sb.push(i); st.push(this.sy * 0.95); sk.push(K); sd.push(D); }
        }
      }
      this.sa = Int32Array.from(sa); this.sb = Int32Array.from(sb);
      this.st = Float32Array.from(st); this.sk = Float32Array.from(sk); this.sd = Float32Array.from(sd);
      this.ai = Int32Array.from(ai); this.ak = Float32Array.from(ak); this.ad = Float32Array.from(ad);
    }

    update() {
      const { px, py, pz, vx, vy, vz, ax, ay, az, inv, damp } = this;
      const { sa, sb, st, sk, sd } = this;
      for (let s = 0, n = sa.length; s < n; s++) {
        const a = sa[s], b = sb[s];
        const dx = px[a] - px[b], dy = py[a] - py[b], dz = pz[a] - pz[b];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len <= st[s]) continue;
        const f = (len - st[s]) / len, k = sk[s], d = sd[s];
        const fx = k * dx * f - (vx[b] - vx[a]) * d;
        const fy = k * dy * f - (vy[b] - vy[a]) * d;
        const fz = k * dz * f - (vz[b] - vz[a]) * d;
        ax[a] -= fx * inv[a]; ay[a] -= fy * inv[a]; az[a] -= fz * inv[a];
        ax[b] += fx * inv[b]; ay[b] += fy * inv[b]; az[b] += fz * inv[b];
      }
      const { ai, ak, ad, ox, oy } = this;
      for (let s = 0, n = ai.length; s < n; s++) {
        const i = ai[s], k = ak[s], d = ad[s];
        ax[i] += k * (ox[i] - px[i]) - vx[i] * d;
        ay[i] += k * (oy[i] - py[i]) - vy[i] * d;
        az[i] += k * -pz[i] - vz[i] * d;
      }
      for (let i = 0, n = this.n; i < n; i++) {
        let x = vx[i] + ax[i], y = vy[i] + ay[i], z = vz[i] + az[i];
        px[i] += x; py[i] += y; pz[i] += z;
        ax[i] = ay[i] = az[i] = 0;
        if (x * x + y * y + z * z < 1e-6) { x = y = z = 0; }
        const dm = damp[i];
        vx[i] = x * dm; vy[i] = y * dm; vz[i] = z * dm;
        damp[i] = 0.98;
      }
    }

    // Visits the points whose rest position lies within `radius` (plus a margin) of (x, y).
    range(x, y, radius, fn) {
      const c0 = Math.max(0, Math.floor((x - radius) / this.sx) - 1);
      const c1 = Math.min(this.cols - 1, Math.ceil((x + radius) / this.sx) + 1);
      const r0 = Math.max(0, Math.floor((y - radius) / this.sy) - 1);
      const r1 = Math.min(this.rows - 1, Math.ceil((y + radius) / this.sy) + 1);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) fn(r * this.cols + c);
    }

    applyDirected(fx, fy, fz, x, y, radius) {
      const r2 = radius * radius;
      this.range(x, y, radius, (i) => {
        const dx = x - this.px[i], dy = y - this.py[i], dz = this.pz[i];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r2) return;
        const k = (10 / (10 + Math.sqrt(d2))) * this.inv[i];
        this.ax[i] += fx * k; this.ay[i] += fy * k; this.az[i] += fz * k;
      });
    }

    applyImplosive(force, x, y, radius) {
      const r2 = radius * radius;
      this.range(x, y, radius, (i) => {
        const dx = x - this.px[i], dy = y - this.py[i], dz = -this.pz[i];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r2) return;
        const k = ((10 * force) / (100 + d2)) * this.inv[i];
        this.ax[i] += dx * k; this.ay[i] += dy * k; this.az[i] += dz * k;
        this.damp[i] *= 0.6;
      });
    }

    applyExplosive(force, x, y, radius, z = 0) {
      const r2 = radius * radius;
      this.range(x, y, radius, (i) => {
        const dx = this.px[i] - x, dy = this.py[i] - y, dz = this.pz[i] - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r2) return;
        const k = ((100 * force) / (10000 + d2)) * this.inv[i];
        this.ax[i] += dx * k; this.ay[i] += dy * k; this.az[i] += dz * k;
        this.damp[i] *= 0.6;
      });
    }

    // Pushes the band of points a shockwave front of radius r is passing through.
    applyRing(x, y, r, band, force) {
      const outer = r + band, inner = Math.max(0, r - band);
      this.range(x, y, outer, (i) => {
        const dx = this.px[i] - x, dy = this.py[i] - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > outer || d < inner || d < 1) return;
        const k = force * (1 - Math.abs(d - r) / band) / d;
        this.ax[i] += dx * k; this.ay[i] += dy * k; this.az[i] -= force * 3;
      });
    }

    draw(R, cx, cy, hi) {
      const { px, py, pz, ox, oy, qx, qy, glow, cols, rows } = this;
      for (let i = 0, n = this.n; i < n; i++) {
        const f = (pz[i] + 2000) / 2000;
        qx[i] = (px[i] - cx) * f + cx;
        qy[i] = (py[i] - cy) * f + cy;
        const dx = px[i] - ox[i], dy = py[i] - oy[i];
        glow[i] = Math.min(1, Math.sqrt(dx * dx + dy * dy) / 32 + Math.abs(pz[i]) / 140);
      }
      const base = [0.028, 0.026, 0.13], hot = [0.14, 0.18, 0.55];
      const n = this.n;
      let lineW = 1;
      // Segment from point j to its next neighbour i along a row (step 1) or a column (step cols).
      const seg = (j, i, step) => {
        const g = (glow[i] + glow[j]) * 0.5;
        const r = base[0] + hot[0] * g, gg = base[1] + hot[1] * g, b = base[2] + hot[2] * g;
        if (hi) {
          // Catmull-Rom midpoint so tight bends stay smooth.
          const row = step === 1;
          const p0 = j - step >= 0 && (!row || j % cols > 0) ? j - step : j;
          const p3 = i + step < n && (!row || i % cols < cols - 1) ? i + step : i;
          const lx = 0.5 * (qx[j] + qx[i]), ly = 0.5 * (qy[j] + qy[i]);
          const mx = lx + 0.0625 * (qx[j] - qx[p0] + qx[i] - qx[p3]);
          const my = ly + 0.0625 * (qy[j] - qy[p0] + qy[i] - qy[p3]);
          if ((mx - lx) * (mx - lx) + (my - ly) * (my - ly) > 0.5) {
            R.line(qx[j], qy[j], mx, my, lineW, r, gg, b);
            R.line(mx, my, qx[i], qy[i], lineW, r, gg, b);
            return;
          }
        }
        R.line(qx[j], qy[j], qx[i], qy[i], lineW, r, gg, b);
      };
      for (let y = 0; y < rows; y++) {
        lineW = y % 3 === 0 ? 1.8 : 0.9;
        for (let x = 1; x < cols; x++) { const i = y * cols + x; seg(i - 1, i, 1); }
      }
      for (let x = 0; x < cols; x++) {
        lineW = x % 3 === 0 ? 1.8 : 0.9;
        for (let y = 1; y < rows; y++) { const i = y * cols + x; seg(i - cols, i, cols); }
      }
    }
  }

  GW.Grid = Grid;
})();
