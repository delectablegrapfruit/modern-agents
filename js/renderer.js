// WebGL2 vector renderer: every shape is a batch of soft-edged line quads drawn additively into one of two
// HDR layers. The 'glow' layer is bloomed (two blur octaves); the 'base' layer (grid, border, stars) is added
// crisp and unbloomed when the two are composited to the screen. The warping grid is drawn on the GPU from
// its uploaded point positions with a single instanced call.
'use strict';
(function () {
  const GW = window.GW;

  const LINE_VS = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_edge;
layout(location=2) in vec3 a_col;
uniform vec4 u_view;
out vec2 v_edge;
out vec3 v_col;
void main() {
  v_edge = a_edge;
  v_col = a_col;
  gl_Position = vec4(a_pos * u_view.xy + u_view.zw, 0.0, 1.0);
}`;

  const LINE_FS = `#version 300 es
precision mediump float;
in vec2 v_edge;
in vec3 v_col;
out vec4 o;
void main() {
  float a = 1.0 - smoothstep(v_edge.y, 1.0, abs(v_edge.x));
  o = vec4(v_col * a, 1.0);
}`;

  // Draws the grid with no vertex data at all: quad q = gl_VertexID / 4 (indexed through the shared quad index
  // buffer) is one grid segment, or one Catmull-Rom piece of one. The lattice's point positions live in an
  // RG32F texture (cols x rows); the shader fetches the segment's endpoints (and, when curved, their outer
  // neighbours), so nothing per segment is built in JS. Output matches LINE_VS for LINE_FS.
  const GRID_VS = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D u_pos;
uniform ivec2 u_dim;     // cols, rows
uniform int u_hcount;    // number of row segments, (cols - 1) * rows
uniform int u_sub;       // pieces per segment: 1 straight, 2+ Catmull-Rom
uniform int u_every;     // major line period
uniform int u_first;     // quad index of this draw's first quad
uniform vec4 u_view;
uniform vec2 u_line;     // half-width in world units (incl. the 1-px feather), inner edge
uniform vec3 u_major;
uniform vec3 u_minor;
out vec2 v_edge;
out vec3 v_col;
vec2 P(ivec2 c) { return texelFetch(u_pos, clamp(c, ivec2(0), u_dim - 1), 0).xy; }
vec2 cr(vec2 p0, vec2 p1, vec2 p2, vec2 p3, float t) {
  float t2 = t * t, t3 = t2 * t;
  return 0.5 * (2.0 * p1 + (p2 - p0) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 + (3.0 * p1 - p0 - 3.0 * p2 + p3) * t3);
}
void main() {
  int quad = u_first + (gl_VertexID >> 2), corner = gl_VertexID & 3;
  int seg = quad / u_sub;
  int part = quad - seg * u_sub;
  ivec2 a, dir;
  int line;
  if (seg < u_hcount) {
    int w = u_dim.x - 1;
    int y = seg / w;
    a = ivec2(seg - y * w, y); dir = ivec2(1, 0); line = y;
  } else {
    int s = seg - u_hcount, h = u_dim.y - 1;
    int x = s / h;
    a = ivec2(x, s - x * h); dir = ivec2(0, 1); line = x;
  }
  vec2 p1 = P(a), p2 = P(a + dir), q1 = p1, q2 = p2;
  if (u_sub > 1) {
    vec2 p0 = P(a - dir), p3 = P(a + 2 * dir);
    float fs = float(u_sub);
    if (part > 0) q1 = cr(p0, p1, p2, p3, float(part) / fs);
    if (part < u_sub - 1) q2 = cr(p0, p1, p2, p3, float(part + 1) / fs);
  }
  vec2 d = q2 - q1;
  float len = length(d);
  d = len > 1e-6 ? d / len : vec2(1.0, 0.0);
  float side = (corner & 1) == 0 ? 1.0 : -1.0;
  vec2 pos = ((corner & 2) == 0 ? q1 : q2) + vec2(-d.y, d.x) * (u_line.x * side);
  v_edge = vec2(side, u_line.y);
  v_col = (line % u_every) == 0 ? u_major : u_minor;
  gl_Position = vec4(pos * u_view.xy + u_view.zw, 0.0, 1.0);
}`;

  const QUAD_VS = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  const DOWN_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
out vec4 o;
void main() {
  vec3 c = texture(u_tex, v_uv + u_texel * vec2(-1.0, -1.0)).rgb
         + texture(u_tex, v_uv + u_texel * vec2( 1.0, -1.0)).rgb
         + texture(u_tex, v_uv + u_texel * vec2(-1.0,  1.0)).rgb
         + texture(u_tex, v_uv + u_texel * vec2( 1.0,  1.0)).rgb;
  o = vec4(c * 0.25, 1.0);
}`;

  const BLUR_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_dir;
out vec4 o;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb * 0.2270270270;
  c += texture(u_tex, v_uv + u_dir * 1.3846153846).rgb * 0.3162162162;
  c += texture(u_tex, v_uv - u_dir * 1.3846153846).rgb * 0.3162162162;
  c += texture(u_tex, v_uv + u_dir * 3.2307692308).rgb * 0.0702702703;
  c += texture(u_tex, v_uv - u_dir * 3.2307692308).rgb * 0.0702702703;
  o = vec4(c, 1.0);
}`;

  const COMPOSITE_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_base;
uniform sampler2D u_b1;
uniform sampler2D u_b2;
uniform float u_k1;
uniform float u_k2;
out vec4 o;
void main() {
  vec3 c = texture(u_scene, v_uv).rgb + texture(u_base, v_uv).rgb
         + texture(u_b1, v_uv).rgb * u_k1 + texture(u_b2, v_uv).rgb * u_k2;
  float m = max(c.r, max(c.g, c.b));
  c += vec3(max(m - 1.0, 0.0) * 0.18);            // over-bright spots burn toward white
  vec3 over = max(c - vec3(0.8), vec3(0.0));
  c = min(c, vec3(0.8)) + 0.2 * (vec3(1.0) - exp(-over / 0.2));
  o = vec4(c, 1.0);
}`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  const STRIDE = 7; // x, y, edge, inner, r, g, b
  const MAXQ = 60000;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl2', {
        antialias: false, alpha: false, depth: false, stencil: false,
        premultipliedAlpha: false, powerPreference: 'high-performance',
      });
      if (!gl) throw new Error('This browser does not support WebGL 2.');
      this.gl = gl;
      this.hdr = !!gl.getExtension('EXT_color_buffer_float');

      this.verts = new Float32Array(MAXQ * 4 * STRIDE);
      this.nq = 0;
      const idx = new Uint32Array(MAXQ * 6);
      for (let i = 0, v = 0; i < idx.length; i += 6, v += 4) {
        idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2;
        idx[i + 3] = v + 2; idx[i + 4] = v + 1; idx[i + 5] = v + 3;
      }
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      this.vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, this.verts.byteLength, gl.DYNAMIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      const S = STRIDE * 4;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, S, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, S, 8);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, S, 16);
      gl.bindVertexArray(null);
      this.quadVao = gl.createVertexArray();
      // Attribute-less VAO sharing the quad index buffer, for the grid.
      this.gridVao = gl.createVertexArray();
      gl.bindVertexArray(this.gridVao);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bindVertexArray(null);

      this.pLine = program(gl, LINE_VS, LINE_FS);
      this.pDown = program(gl, QUAD_VS, DOWN_FS);
      this.pBlur = program(gl, QUAD_VS, BLUR_FS);
      this.pComp = program(gl, QUAD_VS, COMPOSITE_FS);

      // GPU grid: needs vertex texture fetch from a float texture (core in WebGL 2, but be careful anyway).
      this.gridGL = null;
      try {
        if (gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0) this.gridGL = { prog: program(gl, GRID_VS, LINE_FS), tex: null, cols: 0, rows: 0 };
      } catch (err) {
        this.gridGL = null;
      }

      this.bloom = 2; // 0 off, 1 low, 2 high
      this.w = 0;
      this.h = 0;
      this.zoom = 1;
      this.px = 1; // world units per device pixel
    }

    target(w, h) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (this.hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && this.hdr) {
        // Float targets advertised but not renderable here: fall back to 8-bit everywhere.
        gl.deleteFramebuffer(fb);
        gl.deleteTexture(tex);
        this.hdr = false;
        return this.target(w, h);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fb, w, h };
    }

    freeTargets() {
      if (!this.t) return;
      const gl = this.gl;
      for (const k in this.t) {
        gl.deleteFramebuffer(this.t[k].fb);
        gl.deleteTexture(this.t[k].tex);
      }
      this.t = null;
    }

    resize(w, h) {
      if (w === this.w && h === this.h && this.t) return;
      this.w = w;
      this.h = h;
      this.canvas.width = w;
      this.canvas.height = h;
      this.freeTargets();
      const d = (n, f) => Math.max(1, Math.floor(n / f));
      this.t = {
        scene: this.target(w, h),
        base: this.target(w, h),
        half: this.target(d(w, 2), d(h, 2)),
        q1a: this.target(d(w, 4), d(h, 4)),
        q1b: this.target(d(w, 4), d(h, 4)),
        q2a: this.target(d(w, 8), d(h, 8)),
        q2b: this.target(d(w, 8), d(h, 8)),
      };
    }

    // Camera: world point (cx, cy) at the centre of the screen, `zoom` device pixels per world unit.
    begin(cx, cy, zoom) {
      const gl = this.gl;
      this.zoom = zoom;
      this.px = 1 / zoom;
      const hw = this.w / (2 * zoom), hh = this.h / (2 * zoom);
      const m = 40;
      this.vx0 = cx - hw - m; this.vx1 = cx + hw + m;
      this.vy0 = cy - hh - m; this.vy1 = cy + hh + m;
      this.view = [2 * zoom / this.w, -2 * zoom / this.h, -cx * 2 * zoom / this.w, cy * 2 * zoom / this.h];
      gl.viewport(0, 0, this.w, this.h);
      gl.clearColor(0, 0, 0, 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.t.base.fb);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.t.scene.fb);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.cur = 'glow';
      this.nq = 0;
    }

    // Switches the layer subsequent drawing goes to: 'base' (crisp, not bloomed) or 'glow' (bloomed).
    layer(name) {
      this.flush();
      this.cur = name === 'base' ? 'base' : 'glow';
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.cur === 'base' ? this.t.base.fb : this.t.scene.fb);
      gl.viewport(0, 0, this.w, this.h);
    }

    // Draws a GW.Grid entirely on the GPU. Returns false (and draws nothing) when that path is unavailable,
    // so the caller can fall back to per-segment lines.
    drawGrid(grid, hi) {
      const G = this.gridGL;
      if (!G) return false;
      const gl = this.gl;
      const { cols, rows, n, px, py, pos } = grid;
      try {
        if (!G.tex || G.cols !== cols || G.rows !== rows) {
          if (G.tex) gl.deleteTexture(G.tex);
          G.tex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, G.tex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG32F, cols, rows);
          G.cols = cols; G.rows = rows;
          if (gl.getError() !== gl.NO_ERROR) throw new Error('grid texture');
        }
      } catch (err) {
        if (G.tex) gl.deleteTexture(G.tex);
        this.gridGL = null;
        return false;
      }
      for (let i = 0, j = 0; i < n; i++, j += 2) { pos[j] = px[i]; pos[j + 1] = py[i]; }
      this.flush();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, G.tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RG, gl.FLOAT, pos);

      // Same width rule as line(): never thinner than one device pixel (dimmed instead).
      let wp = grid.lineW * this.zoom, k = 1;
      if (wp < 1) { k = wp; wp = 1; }
      const hp = wp * 0.5 + 1;
      const sub = hi ? 2 : 1;
      const hcount = (cols - 1) * rows, vcount = cols * (rows - 1);
      const u = G.prog.u;
      gl.useProgram(G.prog.p);
      gl.uniform1i(u.u_pos, 0);
      gl.uniform2i(u.u_dim, cols, rows);
      gl.uniform1i(u.u_hcount, hcount);
      gl.uniform1i(u.u_sub, sub);
      gl.uniform1i(u.u_every, grid.every);
      gl.uniform4fv(u.u_view, this.view);
      gl.uniform2f(u.u_line, hp * this.px, (wp * 0.5) / hp);
      gl.uniform3f(u.u_major, grid.major[0] * k, grid.major[1] * k, grid.major[2] * k);
      gl.uniform3f(u.u_minor, grid.minor[0] * k, grid.minor[1] * k, grid.minor[2] * k);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(this.gridVao);
      const total = (hcount + vcount) * sub;
      for (let q = 0; q < total; q += MAXQ) {
        gl.uniform1i(u.u_first, q);
        gl.drawElements(gl.TRIANGLES, Math.min(MAXQ, total - q) * 6, gl.UNSIGNED_INT, 0);
      }
      gl.bindVertexArray(null);
      return true;
    }

    // Segment in world units; w is the width in world units (never thinner than one device pixel).
    // cap = false leaves the ends square at the endpoints (no half-width overhang), so consecutive segments of
    // one polyline do not overlap and double up under additive blending (the CPU grid path relies on this).
    line(x1, y1, x2, y2, w, r, g, b, cap = true) {
      if ((x1 < this.vx0 && x2 < this.vx0) || (x1 > this.vx1 && x2 > this.vx1) ||
          (y1 < this.vy0 && y2 < this.vy0) || (y1 > this.vy1 && y2 > this.vy1)) return;
      let wp = w * this.zoom;
      if (wp < 1) { r *= wp; g *= wp; b *= wp; wp = 1; }
      if (r + g + b < 0.004) return;
      if (this.nq >= MAXQ) this.flush();
      const hp = wp * 0.5 + 1;
      const hw = hp * this.px;
      const e = (wp * 0.5) / hp;
      let dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 1e-6) { dx /= len; dy /= len; } else { dx = 1; dy = 0; }
      const nx = -dy * hw, ny = dx * hw;
      const ex = cap ? dx * hw * 0.5 : 0, ey = cap ? dy * hw * 0.5 : 0;
      const v = this.verts;
      let o = this.nq * 4 * STRIDE;
      const ax = x1 - ex, ay = y1 - ey, bx = x2 + ex, by = y2 + ey;
      v[o] = ax + nx; v[o + 1] = ay + ny; v[o + 2] = 1; v[o + 3] = e; v[o + 4] = r; v[o + 5] = g; v[o + 6] = b; o += STRIDE;
      v[o] = ax - nx; v[o + 1] = ay - ny; v[o + 2] = -1; v[o + 3] = e; v[o + 4] = r; v[o + 5] = g; v[o + 6] = b; o += STRIDE;
      v[o] = bx + nx; v[o + 1] = by + ny; v[o + 2] = 1; v[o + 3] = e; v[o + 4] = r; v[o + 5] = g; v[o + 6] = b; o += STRIDE;
      v[o] = bx - nx; v[o + 1] = by - ny; v[o + 2] = -1; v[o + 3] = e; v[o + 4] = r; v[o + 5] = g; v[o + 6] = b;
      this.nq++;
    }

    circle(x, y, rad, w, r, g, b, seg = 24, a0 = 0, arc = GW.TAU) {
      const closed = arc >= GW.TAU - 1e-6;
      const n = seg;
      let px = x + Math.cos(a0) * rad, py = y + Math.sin(a0) * rad;
      for (let i = 1; i <= n; i++) {
        const a = a0 + (arc * i) / n;
        const qx = x + Math.cos(a) * rad, qy = y + Math.sin(a) * rad;
        this.line(px, py, qx, qy, w, r, g, b);
        px = qx; py = qy;
      }
      return closed;
    }

    flush() {
      if (!this.nq) return;
      const gl = this.gl;
      gl.useProgram(this.pLine.p);
      gl.uniform4fv(this.pLine.u.u_view, this.view);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.verts, 0, this.nq * 4 * STRIDE);
      gl.drawElements(gl.TRIANGLES, this.nq * 6, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
      this.nq = 0;
    }

    pass(prog, dst, setup) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
      gl.viewport(0, 0, dst ? dst.w : this.w, dst ? dst.h : this.h);
      gl.useProgram(prog.p);
      setup(prog.u);
      gl.bindVertexArray(this.quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    bindTex(unit, t) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
    }

    down(src, dst) {
      this.pass(this.pDown, dst, (u) => {
        this.bindTex(0, src);
        this.gl.uniform1i(u.u_tex, 0);
        this.gl.uniform2f(u.u_texel, 1 / src.w, 1 / src.h);
      });
    }

    blur(src, dst, dx, dy) {
      this.pass(this.pBlur, dst, (u) => {
        this.bindTex(0, src);
        this.gl.uniform1i(u.u_tex, 0);
        this.gl.uniform2f(u.u_dir, dx / src.w, dy / src.h);
      });
    }

    end() {
      this.flush();
      const gl = this.gl;
      gl.disable(gl.BLEND);
      const t = this.t;
      const on = this.bloom > 0;
      if (on) {
        this.down(t.scene, t.half);
        this.down(t.half, t.q1a);
        const iters = this.bloom > 1 ? 2 : 1;
        for (let i = 0; i < iters; i++) {
          this.blur(t.q1a, t.q1b, 1, 0);
          this.blur(t.q1b, t.q1a, 0, 1);
        }
        this.down(t.q1a, t.q2a);
        for (let i = 0; i < iters; i++) {
          this.blur(t.q2a, t.q2b, 1, 0);
          this.blur(t.q2b, t.q2a, 0, 1);
        }
      }
      this.pass(this.pComp, null, (u) => {
        this.bindTex(0, t.scene);
        this.bindTex(1, t.q1a);
        this.bindTex(2, t.q2a);
        this.bindTex(3, t.base);
        gl.uniform1i(u.u_scene, 0);
        gl.uniform1i(u.u_b1, 1);
        gl.uniform1i(u.u_b2, 2);
        gl.uniform1i(u.u_base, 3);
        gl.uniform1f(u.u_k1, on ? (this.bloom > 1 ? 1.0 : 0.8) : 0);
        gl.uniform1f(u.u_k2, on ? (this.bloom > 1 ? 0.9 : 0.55) : 0);
      });
    }
  }

  // Draws a closed (or open) polyline given in local coordinates, rotated by `ang` and scaled by (sx, sy).
  GW.poly = function (R, pts, x, y, ang, sx, sy, w, r, g, b, closed = true) {
    const c = Math.cos(ang), s = Math.sin(ang);
    let fx = 0, fy = 0, lx = 0, ly = 0;
    for (let i = 0; i < pts.length; i++) {
      const px = pts[i][0] * sx, py = pts[i][1] * sy;
      const X = x + px * c - py * s, Y = y + px * s + py * c;
      if (i === 0) { fx = X; fy = Y; } else R.line(lx, ly, X, Y, w, r, g, b);
      lx = X; ly = Y;
    }
    if (closed) R.line(lx, ly, fx, fy, w, r, g, b);
  };

  GW.Renderer = Renderer;
})();
