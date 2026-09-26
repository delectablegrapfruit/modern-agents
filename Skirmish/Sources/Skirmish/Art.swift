import AppKit
import SpriteKit
import SkirmishCore

/// A colour kept as its components, so it can be mixed and dimmed without a trip through colour spaces.
struct RGB {
    var r: CGFloat
    var g: CGFloat
    var b: CGFloat

    init(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) {
        self.r = r
        self.g = g
        self.b = b
    }

    func color(_ alpha: CGFloat = 1) -> SKColor { SKColor(red: r, green: g, blue: b, alpha: alpha) }
    func mix(_ other: RGB, _ t: CGFloat) -> RGB { RGB(r + (other.r - r) * t, g + (other.g - g) * t, b + (other.b - b) * t) }
    func scaled(_ k: CGFloat) -> RGB { RGB(r * k, g * k, b * k) }
}

enum Palette {
    static let background = RGB(0.027, 0.035, 0.063)
    static let header = RGB(0.055, 0.067, 0.105)
    static let ink = RGB(0.86, 0.90, 0.96)
    static let gold = RGB(1.0, 0.80, 0.30)

    static func faction(_ faction: Int) -> RGB {
        switch faction {
        case Side.neutral: return RGB(0.42, 0.47, 0.56)
        case Side.player: return RGB(0.16, 0.86, 1.0)
        case 2: return RGB(1.0, 0.24, 0.30)
        case 3: return RGB(1.0, 0.66, 0.12)
        default: return RGB(0.70, 0.40, 1.0)
        }
    }
}

/// Textures drawn once at launch: soft glows, sparks, the ship chevron, the vignette. No image files.
@MainActor
enum Art {
    static let headingFont = "AvenirNextCondensed-Heavy"
    static let numberFont = "AvenirNext-Bold"
    static let textFont = "AvenirNext-DemiBold"

    static let glow = radial(128, [(0, 1), (0.22, 0.55), (0.55, 0.14), (1, 0)])
    static let spark = radial(32, [(0, 1), (0.3, 0.85), (1, 0)])
    static let vignette = radial(256, [(0, 0), (0.62, 0), (1, 0.75)], white: 0)
    static let ship = chevron()

    static func radial(_ size: Int, _ stops: [(CGFloat, CGFloat)], white: CGFloat = 1) -> SKTexture {
        let space = CGColorSpaceCreateDeviceRGB()
        guard let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return SKTexture() }
        let colors = stops.map { CGColor(red: white, green: white, blue: white, alpha: $0.1) } as CFArray
        let locations = stops.map { $0.0 }
        guard let gradient = CGGradient(colorsSpace: space, colors: colors, locations: locations) else { return SKTexture() }
        let centre = CGPoint(x: CGFloat(size) / 2, y: CGFloat(size) / 2)
        context.drawRadialGradient(gradient, startCenter: centre, startRadius: 0, endCenter: centre, endRadius: CGFloat(size) / 2, options: [])
        guard let image = context.makeImage() else { return SKTexture() }
        return SKTexture(cgImage: image)
    }

    /// A swept arrowhead pointing along +x.
    static func chevron() -> SKTexture {
        let w = 48, h = 32
        let space = CGColorSpaceCreateDeviceRGB()
        guard let context = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return SKTexture() }
        let path = CGMutablePath()
        path.move(to: CGPoint(x: 46, y: 16))
        path.addLine(to: CGPoint(x: 3, y: 30))
        path.addLine(to: CGPoint(x: 13, y: 16))
        path.addLine(to: CGPoint(x: 3, y: 2))
        path.closeSubpath()
        context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.addPath(path)
        context.fillPath()
        guard let image = context.makeImage() else { return SKTexture() }
        return SKTexture(cgImage: image)
    }

    static func circle(_ r: CGFloat) -> CGPath { CGPath(ellipseIn: CGRect(x: -r, y: -r, width: 2 * r, height: 2 * r), transform: nil) }

    static func polygon(sides: Int, radius r: CGFloat, rotation: CGFloat = 0) -> CGPath {
        let path = CGMutablePath()
        for k in 0..<sides {
            let a = rotation + CGFloat(k) * 2 * .pi / CGFloat(sides)
            let p = CGPoint(x: cos(a) * r, y: sin(a) * r)
            if k == 0 { path.move(to: p) } else { path.addLine(to: p) }
        }
        path.closeSubpath()
        return path
    }

    // MARK: Effects

    /// A one-shot spray of sparks that removes itself.
    static func burst(_ color: RGB, count: Int, speed: CGFloat, size: CGFloat, life: CGFloat, spread: CGFloat = .pi * 2, angle: CGFloat = 0) -> SKEmitterNode {
        let e = SKEmitterNode()
        e.particleTexture = spark
        e.particleBirthRate = CGFloat(count) * 60
        e.numParticlesToEmit = count
        e.particleLifetime = life
        e.particleLifetimeRange = life * 0.6
        e.emissionAngle = angle
        e.emissionAngleRange = spread
        e.particleSpeed = speed
        e.particleSpeedRange = speed * 0.8
        e.particleAlpha = 1
        e.particleAlphaSpeed = -1 / life
        e.particleScale = size / 32
        e.particleScaleRange = size / 64
        e.particleScaleSpeed = -size / 32 / life
        e.particleColor = color.color()
        e.particleColorBlendFactor = 1
        e.particleBlendMode = .add
        e.run(.sequence([.wait(forDuration: TimeInterval(life * 2.2)), .removeFromParent()]))
        return e
    }

    /// The exhaust a fleet leaves behind; its particles live in `target`, so they stay where they were dropped.
    static func trail(_ color: RGB, scale: CGFloat, target: SKNode) -> SKEmitterNode {
        let e = SKEmitterNode()
        e.particleTexture = spark
        e.particleBirthRate = 70
        e.particleLifetime = 0.45
        e.particleLifetimeRange = 0.15
        e.particleSpeed = 0
        e.particlePositionRange = CGVector(dx: 3 * scale, dy: 3 * scale)
        e.particleAlpha = 0.55
        e.particleAlphaSpeed = -1.3
        e.particleScale = 0.2 * scale
        e.particleScaleSpeed = -0.35 * scale
        e.particleColor = color.color()
        e.particleColorBlendFactor = 1
        e.particleBlendMode = .add
        e.targetNode = target
        return e
    }

    /// An expanding ring that fades out.
    static func shockwave(_ color: RGB, radius: CGFloat, grow: CGFloat, width: CGFloat, duration: TimeInterval) -> SKShapeNode {
        let ring = SKShapeNode(path: circle(radius))
        ring.strokeColor = color.color()
        ring.fillColor = .clear
        ring.lineWidth = width
        ring.glowWidth = 0
        ring.run(.sequence([
            .group([.scale(to: grow, duration: duration), .fadeOut(withDuration: duration)]).easedOut(),
            .removeFromParent(),
        ]))
        return ring
    }

    /// A soft flash of light.
    static func flash(_ color: RGB, size: CGFloat, duration: TimeInterval, alpha: CGFloat = 0.9) -> SKSpriteNode {
        let sprite = SKSpriteNode(texture: glow)
        sprite.size = CGSize(width: size, height: size)
        sprite.color = color.color()
        sprite.colorBlendFactor = 1
        sprite.blendMode = .add
        sprite.alpha = alpha
        sprite.setScale(0.6)
        sprite.run(.sequence([
            .group([.scale(to: 1.4, duration: duration), .fadeOut(withDuration: duration)]).easedOut(),
            .removeFromParent(),
        ]))
        return sprite
    }

    static func label(_ font: String, size: CGFloat, color: SKColor, align: SKLabelHorizontalAlignmentMode = .center) -> SKLabelNode {
        let label = SKLabelNode(fontNamed: font)
        label.fontSize = size
        label.fontColor = color
        label.horizontalAlignmentMode = align
        label.verticalAlignmentMode = .center
        return label
    }
}

extension SKAction {
    func easedOut() -> SKAction {
        timingMode = .easeOut
        return self
    }
}

/// Animates a value from 0 to 1 over `duration`, calling `update` each frame.
func tween(_ duration: TimeInterval, _ update: @escaping (CGFloat) -> Void) -> SKAction {
    SKAction.customAction(withDuration: duration) { _, elapsed in
        update(min(1, elapsed / CGFloat(max(duration, 0.0001))))
    }
}
