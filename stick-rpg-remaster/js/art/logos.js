// js/art/logos.js — owner: W2-Exterior. SR.art.logos: the brand glyphs painted on signs, facades and
// props (ART_AUDIO §5.2): the McSticks burger-on-a-stick mascot (an original character, not the
// original's logo), New Lines Inc.'s three stacked lines, the bank's "$" relief, the Silver Lining
// cloud, the pawn shop's three gold balls, Sticky's beer mug, the Five-O slushee, Fine Line's sofa,
// the depot's bus, U of S's mortarboard and City Hall's clock face.
// Node-loadable (CONTRACT §1): nothing is drawn at load time; colours are palette keys resolved when
// a glyph is drawn (SR.art.draw.color, CONTRACT D32).
(function () {
  'use strict';
  var SR = window.SR;

  function C(k) { return SR.art.draw.color(k); }
  function T(k, d) { return SR.art.draw.tone(C(k), d); }

  // Each glyph is drawn in a unit box of height 1 centred on the origin (x in ±aspect / 2, y in
  // ±0.5); `lw` is the ink width in those units. `paint(fill)` fills the current path unless the
  // glyph is drawn `mono` (a single-colour outline, e.g. a neon tube trace).
  var GLYPHS = {
    burger: { aspect: 0.8, draw: function (x, p) {
      // The mascot: a burger on a stick with a face, a paper-hat crown and little stick arms.
      p.line(function () { x.moveTo(0, 0.5); x.lineTo(0, 0.16); x.moveTo(-0.3, 0.02); x.lineTo(-0.38, 0.18); x.moveTo(0.3, 0.02); x.lineTo(0.4, -0.12); }, 'acc.board', 1.6);
      x.beginPath(); x.moveTo(-0.34, 0.1); x.lineTo(0.34, 0.1); x.quadraticCurveTo(0.34, 0.2, 0.24, 0.2); x.lineTo(-0.24, 0.2); x.quadraticCurveTo(-0.34, 0.2, -0.34, 0.1); p.fill('acc.tan');
      x.beginPath(); x.rect(-0.37, 0.0, 0.74, 0.1); p.fill('acc.coffee');
      x.beginPath(); x.moveTo(-0.38, 0.0); for (var i = 0; i <= 8; i++) x.lineTo(-0.38 + i * 0.095, i % 2 ? 0.05 : -0.01); x.lineTo(0.38, -0.04); x.lineTo(-0.38, -0.04); p.fill('prop.leaf');
      x.beginPath(); x.moveTo(-0.3, -0.04); x.lineTo(0.3, -0.04); x.lineTo(0.1, 0.06); x.closePath(); p.fill('acc.yellow');
      x.beginPath(); x.moveTo(-0.36, -0.04); x.bezierCurveTo(-0.36, -0.36, 0.36, -0.36, 0.36, -0.04); x.closePath(); p.fill('acc.tan');
      x.beginPath(); x.rect(-0.16, -0.44, 0.32, 0.1); p.fill('acc.paper');
      p.dots([[-0.12, -0.16, 0.035], [0.12, -0.16, 0.035]], 'ink');
      p.line(function () { x.moveTo(-0.12, -0.08); x.quadraticCurveTo(0, 0.0, 0.12, -0.08); }, 'ink', 1);
      p.dots([[-0.24, -0.22, 0.014], [0.22, -0.26, 0.014], [0, -0.3, 0.014], [0.28, -0.12, 0.014]], 'acc.paper');
    } },
    lines: { aspect: 1, draw: function (x, p) {
      // New Lines Inc.: three stacked lines, each a little longer, stepping to the right.
      [[-0.42, -0.3, 0.5], [-0.3, -0.04, 0.66], [-0.18, 0.22, 0.6]].forEach(function (b, i) {
        x.beginPath(); x.rect(b[0], b[1], b[2], 0.16); p.fill(i === 1 ? 'bld.nli.plate' : 'bld.nli.trim');
      });
    } },
    dollar: { aspect: 0.62, draw: function (x, p) {
      // A relief "$": a deep shade stroke under a highlight stroke, offset down-right.
      function path() {
        x.moveTo(0.2, -0.24); x.bezierCurveTo(0.12, -0.34, -0.22, -0.34, -0.22, -0.14);
        x.bezierCurveTo(-0.22, 0.04, 0.22, -0.02, 0.22, 0.16); x.bezierCurveTo(0.22, 0.36, -0.14, 0.36, -0.22, 0.24);
        x.moveTo(0, -0.46); x.lineTo(0, 0.46);
      }
      x.save(); x.translate(0.03, 0.03); p.line(path, p.opts.shade || 'bld.bank.shade', 5); x.restore();
      p.line(path, p.opts.colour || 'bld.bank.trim', 3.6);
    } },
    cloud: { aspect: 1.5, draw: function (x, p) {
      // The Silver Lining: a paper cloud with a silver rim along its underside.
      function bumps() {
        [[-0.42, 0.08, 0.2], [-0.16, -0.08, 0.28], [0.16, -0.14, 0.3], [0.44, 0.06, 0.22]].forEach(function (c) { x.moveTo(c[0] + c[2], c[1]); x.arc(c[0], c[1], c[2], 0, Math.PI * 2); });
        x.rect(-0.42, 0.04, 0.86, 0.24);
      }
      p.silhouette(bumps, 'cloud');
      p.line(function () { x.moveTo(-0.6, 0.28); x.lineTo(0.62, 0.28); }, 'acc.silver', 3.2);
      p.line(function () { x.arc(0.16, -0.14, 0.3, Math.PI * 1.15, Math.PI * 1.55); }, 'acc.silver', 2);
    } },
    balls: { aspect: 1, draw: function (x, p) {
      // The pawnbroker's sign: a bracket and three gold balls in a triangle.
      p.line(function () { x.moveTo(-0.44, -0.44); x.lineTo(0.44, -0.44); x.moveTo(-0.3, -0.44); x.lineTo(-0.2, -0.2); x.moveTo(0.3, -0.44); x.lineTo(0.2, -0.2); x.moveTo(0, -0.44); x.lineTo(0, 0.1); }, 'railing', 1.6);
      [[-0.22, -0.02], [0.22, -0.02], [0, 0.28]].forEach(function (b) {
        x.beginPath(); x.arc(b[0], b[1], 0.17, 0, Math.PI * 2); p.fill('acc.gold');
        x.beginPath(); x.arc(b[0] - 0.05, b[1] - 0.06, 0.05, 0, Math.PI * 2); p.fill('acc.goldHi', true);
      });
    } },
    mug: { aspect: 0.9, draw: function (x, p) {
      // Sticky's: a beer mug with a foam head and a handle.
      p.line(function () { x.moveTo(0.22, -0.16); x.bezierCurveTo(0.5, -0.16, 0.5, 0.22, 0.22, 0.22); }, 'kit.glass', 3);
      x.beginPath(); x.rect(-0.3, -0.24, 0.52, 0.66); p.fill('kit.beer');
      x.beginPath(); x.rect(-0.22, -0.12, 0.06, 0.46); p.fill('kit.foam', true);
      p.silhouette(function () { [[-0.26, -0.28, 0.1], [-0.08, -0.34, 0.12], [0.12, -0.3, 0.12], [0.24, -0.24, 0.08]].forEach(function (c) { x.moveTo(c[0] + c[2], c[1]); x.arc(c[0], c[1], c[2], 0, Math.PI * 2); }); }, 'kit.foam');
    } },
    slushee: { aspect: 0.66, draw: function (x, p) {
      // The Five-O slushee: a striped cup, a dome lid and a bent straw.
      p.line(function () { x.moveTo(0.02, -0.18); x.lineTo(0.1, -0.44); x.lineTo(0.26, -0.5); }, 'kit.slushB', 2.4);
      x.beginPath(); x.moveTo(-0.24, -0.12); x.lineTo(0.24, -0.12); x.lineTo(0.17, 0.46); x.lineTo(-0.17, 0.46); x.closePath(); p.fill('kit.slushA');
      x.beginPath(); x.moveTo(-0.2, 0.08); x.lineTo(0.2, 0.08); x.lineTo(0.19, 0.2); x.lineTo(-0.19, 0.2); x.closePath(); p.fill('kit.slushB', true);
      x.beginPath(); x.moveTo(-0.27, -0.12); x.bezierCurveTo(-0.24, -0.34, 0.24, -0.34, 0.27, -0.12); x.closePath(); p.fill('kit.fridge');
    } },
    sofa: { aspect: 1.6, draw: function (x, p) {
      // Fine Line Furnishings: a sofa (a nod to the original's furniture store).
      x.beginPath(); x.rect(-0.66, -0.3, 1.32, 0.42); p.fill('kit.fabric');
      x.beginPath(); x.rect(-0.78, -0.08, 0.2, 0.44); x.rect(0.58, -0.08, 0.2, 0.44); p.fill(T('kit.fabric', -1));
      x.beginPath(); x.rect(-0.58, 0.1, 0.56, 0.2); x.rect(0.02, 0.1, 0.56, 0.2); p.fill('kit.cushion');
      p.line(function () { x.moveTo(-0.6, 0.36); x.lineTo(-0.6, 0.48); x.moveTo(0.6, 0.36); x.lineTo(0.6, 0.48); }, 'kit.woodDark', 2);
    } },
    bus: { aspect: 0.9, draw: function (x, p) {
      // The depot: a bus seen from the front, the Sky Bus's cyan stripe.
      x.beginPath(); x.rect(-0.38, -0.44, 0.76, 0.8); p.fill('car.skybus');
      x.beginPath(); x.rect(-0.3, -0.34, 0.6, 0.32); p.fill('car.glass', true);
      x.beginPath(); x.rect(-0.38, 0.04, 0.76, 0.1); p.fill('car.skybusStripe', true);
      p.dots([[-0.24, 0.24, 0.06], [0.24, 0.24, 0.06]], 'car.lamp');
      x.beginPath(); x.rect(-0.34, 0.36, 0.16, 0.12); x.rect(0.18, 0.36, 0.16, 0.12); p.fill('car.tyre');
    } },
    mortarboard: { aspect: 1.2, draw: function (x, p) {
      // U of S: a mortarboard with its tassel.
      x.beginPath(); x.moveTo(-0.56, -0.12); x.lineTo(0, -0.38); x.lineTo(0.56, -0.12); x.lineTo(0, 0.14); x.closePath(); p.fill('acc.black');
      x.beginPath(); x.moveTo(-0.3, 0.02); x.lineTo(-0.3, 0.26); x.quadraticCurveTo(0, 0.44, 0.3, 0.26); x.lineTo(0.3, 0.02); x.lineTo(0, 0.14); x.closePath(); p.fill('acc.charcoal');
      p.line(function () { x.moveTo(0, -0.12); x.lineTo(0.42, 0.0); x.lineTo(0.42, 0.3); }, 'acc.gold', 1.6);
    } },
    clock: { aspect: 1, draw: function (x, p) {
      // City Hall's clock face: a brass ring, twelve ticks and the hands at opts.min (default 10:10).
      x.beginPath(); x.arc(0, 0, 0.48, 0, Math.PI * 2); p.fill('bld.cityhall.trim');
      x.beginPath(); x.arc(0, 0, 0.4, 0, Math.PI * 2); p.fill('acc.paper', true);
      p.line(function () { for (var i = 0; i < 12; i++) { var a = i * Math.PI / 6; x.moveTo(Math.sin(a) * 0.3, -Math.cos(a) * 0.3); x.lineTo(Math.sin(a) * 0.37, -Math.cos(a) * 0.37); } }, 'ink', 1);
      var m = typeof p.opts.min === 'number' ? p.opts.min : 610;
      var ha = ((m / 60) % 12) * Math.PI / 6, ma = (m % 60) * Math.PI / 30;
      p.line(function () { x.moveTo(0, 0); x.lineTo(Math.sin(ha) * 0.2, -Math.cos(ha) * 0.2); x.moveTo(0, 0); x.lineTo(Math.sin(ma) * 0.32, -Math.cos(ma) * 0.32); }, 'ink', 2);
    } },
  };

  /**
   * Draws a brand glyph centred on (x, y).
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} name a key of SR.art.logos.names()
   * @param {number} x centre x (ctx units)
   * @param {number} y centre y
   * @param {number} h glyph height (ctx units); its width is h × aspect(name)
   * @param {{lw: number, mono: string, colour: string, shade: string, min: number, outline: boolean}=} opts
   *   lw: the ink line width in ctx units (default h / 24); mono: draw every part as an outline in
   *   this palette key or colour (a neon trace); colour / shade: the "$" colours; min: the clock's
   *   minute; outline: false skips the ink outlines
   * @returns {boolean} false for an unknown glyph (nothing is drawn)
   */
  function draw(ctx, name, x, y, h, opts) {
    var g = GLYPHS[name];
    if (!g || !(h > 0)) return false;
    opts = opts || {};
    var lw = (opts.lw || h / 24) / h;
    var mono = opts.mono ? C(opts.mono) : null;
    var ink = C('ink');
    var inked = opts.outline !== false;
    var p = {
      opts: opts,
      /** Fills the current path (its colour a palette key or colour), then inks it (unless `plain`). */
      fill: function (c, plain) {
        if (mono) { ctx.strokeStyle = mono; ctx.lineWidth = lw; ctx.stroke(); return; }
        ctx.fillStyle = C(c);
        ctx.fill();
        if (inked && !plain) { ctx.save(); ctx.strokeStyle = ink; ctx.globalAlpha *= 0.9; ctx.lineWidth = lw; ctx.stroke(); ctx.restore(); }
      },
      /** Strokes a path built by fn, `k` ink widths wide. */
      line: function (fn, c, k) {
        ctx.beginPath(); fn();
        ctx.strokeStyle = mono || C(c);
        ctx.lineWidth = lw * (k || 1);
        ctx.stroke();
      },
      /** A union of overlapping shapes built by fn: inked on its outer silhouette only, then filled. */
      silhouette: function (fn, c) {
        if (mono) { ctx.beginPath(); fn(); ctx.strokeStyle = mono; ctx.lineWidth = lw; ctx.stroke(); return; }
        if (inked) { ctx.save(); ctx.beginPath(); fn(); ctx.strokeStyle = ink; ctx.globalAlpha *= 0.9; ctx.lineWidth = lw * 2; ctx.stroke(); ctx.restore(); }
        ctx.beginPath(); fn(); ctx.fillStyle = C(c); ctx.fill();
      },
      /** Fills small dots [[x, y, r], ...]. */
      dots: function (list, c) {
        ctx.beginPath();
        list.forEach(function (d) { ctx.moveTo(d[0] + d[2], d[1]); ctx.arc(d[0], d[1], d[2], 0, Math.PI * 2); });
        if (mono) { ctx.strokeStyle = mono; ctx.lineWidth = lw; ctx.stroke(); } else { ctx.fillStyle = C(c); ctx.fill(); }
      },
    };
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(h, h);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    g.draw(ctx, p);
    ctx.restore();
    return true;
  }

  SR.art.logos = {
    draw: draw,
    /** @returns {number} a glyph's width / height (1 for an unknown glyph). */
    aspect: function (name) { return GLYPHS[name] ? GLYPHS[name].aspect : 1; },
    /** @returns {string[]} the glyph names. */
    names: function () { return Object.keys(GLYPHS); },
    /** @returns {boolean} a glyph of that name exists. */
    has: function (name) { return Object.prototype.hasOwnProperty.call(GLYPHS, name); },
  };
})();
