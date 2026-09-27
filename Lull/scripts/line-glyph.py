#!/usr/bin/env python3
"""Builds Lull's line glyph: a one-glyph font for the currency, a cleared line swallowed by a small black hole.

    python3 Lull/scripts/line-glyph.py        # rewrites the @font-face between the markers in Game/css/lull.css

The glyph is a thin ring (the hole's edge) with a horizontal line running into it from both sides, tapering as it
goes out, and nothing in the middle. It is drawn at U+29B5 (CIRCLE WITH HORIZONTAL BAR, the closest Unicode has, and
never an emoji). The font's unicode-range holds only that one, so every other character keeps the system font. Needs
fontTools.
"""
import base64, io, math, os, re
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen

UPM = 1000
ADV = 1000               # a little under an em wide
CX, CY = 500, 330        # centred on the digits' middle
R_OUT, R_IN = 215, 150   # the ring
LINE_IN, LINE_OUT = 66, 14   # half-thickness of the line where it meets the ring, and at its far ends
X0, X1 = 30, 970         # where the line ends


def circle(pen, r, ccw):
    """A circle from four cubic arcs, counter-clockwise (an outer contour) or clockwise (a hole)."""
    k = 0.5523 * r
    pts = [(CX + r, CY), (CX, CY + r), (CX - r, CY), (CX, CY - r)]
    if not ccw:
        pts = pts[::-1]
    pen.moveTo(pts[0])
    for i in range(4):
        a, b = pts[i], pts[(i + 1) % 4]
        # tangent directions at a and b for a circle about the centre
        ta = (-(a[1] - CY), a[0] - CX) if ccw else ((a[1] - CY), -(a[0] - CX))
        tb = (-(b[1] - CY), b[0] - CX) if ccw else ((b[1] - CY), -(b[0] - CX))
        s = k / r
        pen.curveTo((a[0] + ta[0] * s, a[1] + ta[1] * s), (b[0] - tb[0] * s, b[1] - tb[1] * s), b)
    pen.closePath()


def arm(pen, x_far, x_near):
    """One side of the line: from a thin rounded far end to the ring, widening, its near end tucked into the ring."""
    d = 1 if x_near > x_far else -1
    xn = x_near + d * (R_OUT - R_IN) * 0.5
    t, T, b = LINE_OUT, LINE_IN, LINE_OUT * 1.1
    if d > 0:  # left arm, counter-clockwise: top of the far end, round it, along the bottom, up the near end
        pen.moveTo((x_far, CY + t))
        pen.curveTo((x_far - b, CY + t), (x_far - b, CY - t), (x_far, CY - t))
        pen.lineTo((xn, CY - T)); pen.lineTo((xn, CY + T))
    else:      # right arm: bottom of the near end, out along the bottom, round the far end, back along the top
        pen.moveTo((xn, CY - T)); pen.lineTo((x_far, CY - t))
        pen.curveTo((x_far + b, CY - t), (x_far + b, CY + t), (x_far, CY + t))
        pen.lineTo((xn, CY + T))
    pen.closePath()


def glyph():
    pen = T2CharStringPen(ADV, None)
    circle(pen, R_OUT, True)
    circle(pen, R_IN, False)
    arm(pen, X0, CX - R_OUT)
    arm(pen, X1, CX + R_OUT)
    return pen.getCharString()


def build():
    fb = FontBuilder(UPM, isTTF=False)
    names = ['.notdef', 'space', 'line']
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap({0x20: 'space', 0x29B5: 'line'})
    empty = T2CharStringPen(500, None).getCharString()
    space = T2CharStringPen(250, None).getCharString()
    fb.setupCFF('LullLine', {'FullName': 'Lull Line'}, {'.notdef': empty, 'space': space, 'line': glyph()}, {})
    fb.setupHorizontalMetrics({'.notdef': (500, 0), 'space': (250, 0), 'line': (ADV, X0 - LINE_OUT)})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({'familyName': 'Lull Line', 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
    fb.setupPost()
    buf = io.BytesIO()
    fb.save(buf)
    return buf.getvalue()


def main():
    data = base64.b64encode(build()).decode('ascii')
    face = ('@font-face { font-family: "Lull Line"; font-display: block; unicode-range: U+29B5;\n'
            '  src: url(data:font/otf;base64,' + data + ') format("opentype"); }')
    css_path = os.path.join(os.path.dirname(__file__), '..', 'Game', 'css', 'lull.css')
    css = open(css_path, encoding='utf-8').read()
    new, n = re.subn(r'(/\* line-glyph:start[^\n]*\*/\n).*?(/\* line-glyph:end \*/)', lambda m: m.group(1) + face + '\n' + m.group(2), css, flags=re.S)
    if not n:
        raise SystemExit('markers not found in lull.css')
    open(css_path, 'w', encoding='utf-8').write(new)
    print('wrote', len(data), 'base64 bytes into', os.path.normpath(css_path))


if __name__ == '__main__':
    main()
