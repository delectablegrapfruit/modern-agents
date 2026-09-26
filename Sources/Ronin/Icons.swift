import AppKit
import SpriteKit
import RoninCore

/// Small pictograms drawn in code. At 10–16 points they say what a line of tiny text would: kills, time, combo,
/// the mode, which mouse button cuts which way, paused, on to the next stage.
@MainActor
enum Icons {
    private static func shape(_ path: CGPath, fill: SKColor? = nil, stroke: SKColor? = nil, width: CGFloat = 1.5) -> SKShapeNode {
        let node = SKShapeNode(path: path)
        node.fillColor = fill ?? .clear
        node.strokeColor = stroke ?? .clear
        node.lineWidth = width
        node.lineCap = .round
        node.lineJoin = .round
        node.isAntialiased = true
        return node
    }

    /// A skull: kills.
    static func skull(_ s: CGFloat, _ color: SKColor) -> SKNode {
        let node = SKNode()
        node.addChild(shape(CGPath(ellipseIn: CGRect(x: -s * 0.45, y: -s * 0.2, width: s * 0.9, height: s * 0.75), transform: nil), fill: color))
        node.addChild(shape(CGPath(roundedRect: CGRect(x: -s * 0.26, y: -s * 0.45, width: s * 0.52, height: s * 0.32),
                                   cornerWidth: s * 0.06, cornerHeight: s * 0.06, transform: nil), fill: color))
        for x in [-0.19, 0.19] as [CGFloat] {
            node.addChild(shape(CGPath(ellipseIn: CGRect(x: x * s - s * 0.12, y: s * 0.02, width: s * 0.24, height: s * 0.24), transform: nil),
                                fill: Palette.background.color()))
        }
        return node
    }

    /// A clock face: time.
    static func clock(_ s: CGFloat, _ color: SKColor) -> SKNode {
        let node = shape(CGPath(ellipseIn: CGRect(x: -s * 0.45, y: -s * 0.45, width: s * 0.9, height: s * 0.9), transform: nil),
                         stroke: color, width: max(1.4, s * 0.12))
        let hands = CGMutablePath()
        hands.move(to: CGPoint(x: 0, y: s * 0.28))
        hands.addLine(to: .zero)
        hands.addLine(to: CGPoint(x: s * 0.2, y: -s * 0.08))
        node.addChild(shape(hands, stroke: color, width: max(1.4, s * 0.12)))
        return node
    }

    /// Crossed blades: the combo.
    static func swords(_ s: CGFloat, _ color: SKColor) -> SKNode {
        let path = CGMutablePath()
        path.move(to: CGPoint(x: -s * 0.45, y: -s * 0.45))
        path.addLine(to: CGPoint(x: s * 0.45, y: s * 0.45))
        path.move(to: CGPoint(x: s * 0.45, y: -s * 0.45))
        path.addLine(to: CGPoint(x: -s * 0.45, y: s * 0.45))
        path.move(to: CGPoint(x: -s * 0.42, y: -s * 0.14))
        path.addLine(to: CGPoint(x: -s * 0.14, y: -s * 0.42))
        path.move(to: CGPoint(x: s * 0.42, y: -s * 0.14))
        path.addLine(to: CGPoint(x: s * 0.14, y: -s * 0.42))
        return shape(path, stroke: color, width: max(1.5, s * 0.13))
    }

    /// The mode: one to four slanted blade strokes.
    static func mode(_ mode: Mode, _ s: CGFloat) -> SKNode {
        let path = CGMutablePath()
        let n = mode.level + 1
        for k in 0..<n {
            let x = (CGFloat(k) - CGFloat(n - 1) / 2) * s * 0.34
            path.move(to: CGPoint(x: x - s * 0.14, y: -s * 0.45))
            path.addLine(to: CGPoint(x: x + s * 0.14, y: s * 0.45))
        }
        return shape(path, stroke: Icons.color(of: mode).color(), width: max(1.6, s * 0.16))
    }

    static func color(of mode: Mode) -> RGB {
        switch mode {
        case .shoshin: return RGB(0.55, 0.9, 0.55)
        case .bushido: return RGB(0.95, 0.92, 0.85)
        case .shura: return RGB(1.0, 0.6, 0.2)
        case .oni: return RGB(1.0, 0.2, 0.2)
        }
    }

    /// The warlord's golden crescent.
    static func crest(_ s: CGFloat) -> SKNode {
        let path = CGMutablePath()
        path.move(to: CGPoint(x: -s * 0.5, y: s * 0.3))
        path.addQuadCurve(to: CGPoint(x: s * 0.5, y: s * 0.3), control: CGPoint(x: 0, y: -s * 0.55))
        return shape(path, stroke: Palette.gold.color(), width: max(1.8, s * 0.2))
    }

    /// A mouse with one button lit: which button cuts which way.
    static func mouse(_ s: CGFloat, lit side: Side, _ color: SKColor) -> SKNode {
        let w = s * 0.62, h = s
        let node = shape(CGPath(roundedRect: CGRect(x: -w / 2, y: -h / 2, width: w, height: h), cornerWidth: w * 0.48, cornerHeight: w * 0.48,
                                transform: nil), stroke: color, width: max(1.3, s * 0.08))
        let button = CGMutablePath()
        let x0: CGFloat = side == .left ? -w / 2 : 0
        button.move(to: CGPoint(x: x0 + (side == .left ? w * 0.08 : 0), y: h * 0.06))
        button.addLine(to: CGPoint(x: x0 + (side == .left ? w / 2 : w / 2 - w * 0.08), y: h * 0.06))
        button.addLine(to: CGPoint(x: x0 + (side == .left ? w / 2 : w / 2 - w * 0.12), y: h * 0.42))
        button.addLine(to: CGPoint(x: x0 + (side == .left ? w * 0.12 : 0), y: h * 0.42))
        button.closeSubpath()
        node.addChild(shape(button, fill: color))
        let split = CGMutablePath()
        split.move(to: CGPoint(x: -w / 2, y: h * 0.06))
        split.addLine(to: CGPoint(x: w / 2, y: h * 0.06))
        split.move(to: CGPoint(x: 0, y: h * 0.06))
        split.addLine(to: CGPoint(x: 0, y: h / 2))
        node.addChild(shape(split, stroke: color, width: max(1.2, s * 0.07)))
        return node
    }

    static func pause(_ s: CGFloat, _ color: SKColor) -> SKNode {
        let path = CGMutablePath()
        path.addRoundedRect(in: CGRect(x: -s * 0.4, y: -s * 0.5, width: s * 0.28, height: s), cornerWidth: s * 0.06, cornerHeight: s * 0.06)
        path.addRoundedRect(in: CGRect(x: s * 0.12, y: -s * 0.5, width: s * 0.28, height: s), cornerWidth: s * 0.06, cornerHeight: s * 0.06)
        return shape(path, fill: color)
    }

    /// ▶: go on.
    static func play(_ s: CGFloat, _ color: SKColor) -> SKNode {
        let path = CGMutablePath()
        path.move(to: CGPoint(x: -s * 0.35, y: -s * 0.45))
        path.addLine(to: CGPoint(x: s * 0.45, y: 0))
        path.addLine(to: CGPoint(x: -s * 0.35, y: s * 0.45))
        path.closeSubpath()
        return shape(path, fill: color)
    }

    /// ↻: again.
    static func again(_ s: CGFloat, _ color: SKColor) -> SKNode {
        let path = CGMutablePath()
        path.addArc(center: .zero, radius: s * 0.38, startAngle: .pi * 0.35, endAngle: .pi * 2.05, clockwise: false)
        let node = shape(path, stroke: color, width: max(1.6, s * 0.14))
        let head = CGMutablePath()
        let tip = CGPoint(x: s * 0.38 * cos(.pi * 0.35), y: s * 0.38 * sin(.pi * 0.35))
        head.move(to: CGPoint(x: tip.x + s * 0.2, y: tip.y + s * 0.06))
        head.addLine(to: CGPoint(x: tip.x - s * 0.06, y: tip.y + s * 0.22))
        head.addLine(to: CGPoint(x: tip.x - s * 0.02, y: tip.y - s * 0.14))
        head.closeSubpath()
        node.addChild(shape(head, fill: color))
        return node
    }

    /// ✕: a miss.
    static func cross(_ s: CGFloat, _ color: SKColor) -> SKNode {
        let path = CGMutablePath()
        path.move(to: CGPoint(x: -s * 0.4, y: -s * 0.4))
        path.addLine(to: CGPoint(x: s * 0.4, y: s * 0.4))
        path.move(to: CGPoint(x: s * 0.4, y: -s * 0.4))
        path.addLine(to: CGPoint(x: -s * 0.4, y: s * 0.4))
        return shape(path, stroke: color, width: max(2, s * 0.2))
    }

    /// A heart, as a diamond (full, or an outline once lost).
    static func heart(_ s: CGFloat) -> SKShapeNode {
        let node = SKShapeNode(path: Art.diamond(s / 2))
        node.lineWidth = max(1, s * 0.14)
        node.isAntialiased = true
        return node
    }

    /// A rounded dark plate for text to sit on.
    static func plate(_ size: CGSize, alpha: CGFloat = 0.62) -> SKShapeNode {
        let node = SKShapeNode(rect: CGRect(x: -size.width / 2, y: -size.height / 2, width: size.width, height: size.height),
                               cornerRadius: min(size.height / 2, 8))
        node.fillColor = SKColor(white: 0, alpha: alpha)
        node.strokeColor = SKColor(white: 1, alpha: 0.08)
        node.lineWidth = 1
        return node
    }
}
