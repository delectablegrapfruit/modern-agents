// icons.js: the app's Icons.swift: small pictograms drawn in code (skull, clock, crossed swords, steps, crest, mouse,
// pause, play, again, cross, blocked, heart, shard, gourd, infinity, the mode's seal, the band text sits on, a rule).

const Icons = {
  shape(path, { fill = null, stroke = null, width = 1.5 } = {}) {
    const s = new Shape(path);
    s.fillColor = fill;
    s.strokeColor = stroke;
    s.lineWidth = width;
    s.lineCap = 'round';
    s.lineJoin = 'round';
    return s;
  },

  skull(s, color) {
    const node = new Node();
    node.add(Icons.shape(ellipsePath(-s * 0.45, -s * 0.2, s * 0.9, s * 0.75), { fill: color }));
    const jaw = new Path2D();
    jaw.roundRect(-s * 0.26, -s * 0.45, s * 0.52, s * 0.32, s * 0.06);
    node.add(Icons.shape(jaw, { fill: color }));
    for (const x of [-0.19, 0.19]) {
      node.add(Icons.shape(ellipsePath(x * s - s * 0.12, s * 0.02, s * 0.24, s * 0.24), { fill: Palette.background.css() }));
    }
    return node;
  },

  clock(s, color) {
    const node = Icons.shape(ellipsePath(-s * 0.45, -s * 0.45, s * 0.9, s * 0.9), { stroke: color, width: Math.max(1.4, s * 0.12) });
    const hands = new Path2D();
    hands.moveTo(0, s * 0.28); hands.lineTo(0, 0); hands.lineTo(s * 0.2, -s * 0.08);
    node.add(Icons.shape(hands, { stroke: color, width: Math.max(1.4, s * 0.12) }));
    return node;
  },

  swords(s, color) {
    const p = new Path2D();
    p.moveTo(-s * 0.45, -s * 0.45); p.lineTo(s * 0.45, s * 0.45);
    p.moveTo(s * 0.45, -s * 0.45); p.lineTo(-s * 0.45, s * 0.45);
    p.moveTo(-s * 0.42, -s * 0.14); p.lineTo(-s * 0.14, -s * 0.42);
    p.moveTo(s * 0.42, -s * 0.14); p.lineTo(s * 0.14, -s * 0.42);
    return Icons.shape(p, { stroke: color, width: Math.max(1.5, s * 0.13) });
  },

  steps(s, color) {
    const p = new Path2D();
    const w = s * 0.3;
    for (let k = 0; k < 3; k++) p.rect(-s * 0.45 + k * w, -s * 0.45, w * 0.8, s * (0.3 + 0.3 * k));
    return Icons.shape(p, { fill: color });
  },

  crest(s) {
    const p = new Path2D();
    p.moveTo(-s * 0.5, s * 0.3);
    p.quadraticCurveTo(0, -s * 0.55, s * 0.5, s * 0.3);
    return Icons.shape(p, { stroke: Palette.gold.css(), width: Math.max(1.8, s * 0.2) });
  },

  mouse(s, side, color) {
    const w = s * 0.62, h = s;
    const body = new Path2D();
    body.roundRect(-w / 2, -h / 2, w, h, w * 0.48);
    const node = Icons.shape(body, { stroke: color, width: Math.max(1.3, s * 0.08) });
    const left = side === 'left';
    const x0 = left ? -w / 2 : 0;
    const b = new Path2D();
    b.moveTo(x0 + (left ? w * 0.08 : 0), h * 0.06);
    b.lineTo(x0 + (left ? w / 2 : w / 2 - w * 0.08), h * 0.06);
    b.lineTo(x0 + (left ? w / 2 : w / 2 - w * 0.12), h * 0.42);
    b.lineTo(x0 + (left ? w * 0.12 : 0), h * 0.42);
    b.closePath();
    node.add(Icons.shape(b, { fill: color }));
    const split = new Path2D();
    split.moveTo(-w / 2, h * 0.06); split.lineTo(w / 2, h * 0.06);
    split.moveTo(0, h * 0.06); split.lineTo(0, h / 2);
    node.add(Icons.shape(split, { stroke: color, width: Math.max(1.2, s * 0.07) }));
    return node;
  },

  buttons(s, color, arrows) {
    const node = new Node();
    for (const side of ['left', 'right']) {
      const sign = side === 'left' ? -1 : 1;
      node.add(Icons.mouse(s, side, color)).at(sign * s * 0.55, 0);
      const arrow = node.add(Icons.play(s * 0.55, arrows)).at(sign * s * 1.25, 0);
      arrow.xScale = sign;
    }
    return node;
  },

  pause(s, color) {
    const p = new Path2D();
    p.roundRect(-s * 0.4, -s * 0.5, s * 0.28, s, s * 0.06);
    p.roundRect(s * 0.12, -s * 0.5, s * 0.28, s, s * 0.06);
    return Icons.shape(p, { fill: color });
  },

  play(s, color) {
    const p = new Path2D();
    p.moveTo(-s * 0.35, -s * 0.45); p.lineTo(s * 0.45, 0); p.lineTo(-s * 0.35, s * 0.45); p.closePath();
    return Icons.shape(p, { fill: color });
  },

  again(s, color) {
    const p = new Path2D();
    p.arc(0, 0, s * 0.38, Math.PI * 0.35, Math.PI * 2.05, false);
    const node = Icons.shape(p, { stroke: color, width: Math.max(1.6, s * 0.14) });
    const tip = { x: s * 0.38 * Math.cos(Math.PI * 0.35), y: s * 0.38 * Math.sin(Math.PI * 0.35) };
    const head = new Path2D();
    head.moveTo(tip.x + s * 0.2, tip.y + s * 0.06);
    head.lineTo(tip.x - s * 0.06, tip.y + s * 0.22);
    head.lineTo(tip.x - s * 0.02, tip.y - s * 0.14);
    head.closePath();
    node.add(Icons.shape(head, { fill: color }));
    return node;
  },

  cross(s, color) {
    const p = new Path2D();
    p.moveTo(-s * 0.4, -s * 0.4); p.lineTo(s * 0.4, s * 0.4);
    p.moveTo(s * 0.4, -s * 0.4); p.lineTo(-s * 0.4, s * 0.4);
    return Icons.shape(p, { stroke: color, width: Math.max(2, s * 0.2) });
  },

  blocked(s, color) {
    const p = new Path2D();
    const a = s * 0.25;
    p.moveTo(-a, -a); p.lineTo(a, a);
    p.moveTo(a, -a); p.lineTo(-a, a);
    p.moveTo(s * 0.46, 0);
    p.ellipse(0, 0, s * 0.46, s * 0.46, 0, 0, TAU);
    return Icons.shape(p, { stroke: color, width: Math.max(1.8, s * 0.13) });
  },

  heartPath(s) {
    const p = new Path2D();
    p.moveTo(0, s / 2); p.lineTo(s * 0.26, 0); p.lineTo(0, -s / 2); p.lineTo(-s * 0.26, 0); p.closePath();
    return p;
  },

  /** A heart, as a slender lozenge (full, or an outline once lost). */
  heart(s) {
    const node = new Shape(Icons.heartPath(s));
    node.lineWidth = Math.max(0.8, s * 0.09);
    return node;
  },

  shard(s, piece) {
    const h = s / 2, w = s * 0.26, gap = Math.max(0.35, s * 0.035);
    const edge = (y) => w * (1 - Math.abs(y) / h);
    const low = -h / 3, high = h / 3;
    let pts;
    if (piece === 0) {
      const y = low - gap;
      pts = [[0, -h], [edge(y), y], [-edge(y), y]];
    } else if (piece === 1) {
      const a = low + gap, b = high - gap;
      pts = [[-edge(a), a], [edge(a), a], [w, 0], [edge(b), b], [-edge(b), b], [-w, 0]];
    } else {
      const y = high + gap;
      pts = [[-edge(y), y], [edge(y), y], [0, h]];
    }
    const p = new Path2D();
    p.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts.slice(1)) p.lineTo(q[0], q[1]);
    p.closePath();
    const node = new Shape(p);
    node.lineWidth = Math.max(0.7, s * 0.07);
    node.lineJoin = 'round';
    return node;
  },

  gourd(s, color) {
    const node = new Node();
    node.add(Icons.shape(ellipsePath(-s * 0.3, -s * 0.5, s * 0.6, s * 0.56), { fill: color }));
    node.add(Icons.shape(ellipsePath(-s * 0.19, 0, s * 0.38, s * 0.36), { fill: color }));
    const stopper = new Path2D();
    stopper.rect(-s * 0.07, s * 0.32, s * 0.14, s * 0.16);
    node.add(Icons.shape(stopper, { fill: color }));
    const cord = new Path2D();
    cord.moveTo(-s * 0.2, s * 0.03);
    cord.quadraticCurveTo(0, -s * 0.08, s * 0.2, s * 0.03);
    node.add(Icons.shape(cord, { stroke: rgb(0.9, 0.2, 0.15).css(), width: Math.max(1, s * 0.09) }));
    return node;
  },

  infinity(s, color) {
    const p = new Path2D();
    const a = s * 0.5;
    for (let i = 0; i <= 48; i++) {
      const t = i / 48 * TAU;
      const d = 1 + Math.sin(t) * Math.sin(t);
      const x = a * Math.cos(t) / d, y = a * Math.sin(t) * Math.cos(t) / d * 1.25;
      if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
    p.closePath();
    return Icons.shape(p, { stroke: color, width: Math.max(1.3, s * 0.12) });
  },

  /** The mode as a hanko: a vermilion seal with one character. */
  seal(mode, s) {
    const p = new Path2D();
    p.roundRect(-s / 2, -s / 2, s, s, s * 0.12);
    const node = new Shape(p);
    node.fillColor = rgb(0.72, 0.1, 0.08).css();
    node.strokeColor = rgb(0.95, 0.4, 0.3).css(0.6);
    node.lineWidth = Math.max(0.8, s * 0.05);
    const glyph = new Label(Fonts.seal, s * 0.74, rgb(0.98, 0.93, 0.85).css());
    glyph.set((ModeInfo[mode] || ModeInfo.bushido).seal);
    glyph.at(0, -s * 0.02);
    node.add(glyph);
    return node;
  },

  /** A band for text to sit on: dark, fading out at both ends, with a fine gold rule above and below. */
  band(w, h, alpha = 0.7) {
    const node = new Node();
    const fill = node.add(tintedSprite(Art.band, RGB.black, w, h));
    fill.alpha = alpha;
    for (const y of [h / 2, -h / 2]) {
      const rule = node.add(tintedSprite(Art.band, Palette.gold, w * 0.9, 1)).at(0, y);
      rule.alpha = 0.55;
      rule.z = 0.01;
    }
    return node;
  },

  /** A fine rule with a lozenge at its centre. */
  rule(width, color, alpha = 1) {
    const node = new Node();
    const line = node.add(tintedSprite(Art.band, color, width, 1));
    line.alpha = alpha;
    const mark = node.add(Icons.heart(7));
    mark.fillColor = color.css(alpha);
    mark.rotation = Math.PI / 2;
    return node;
  },
};
