import AppKit
import SpriteKit
import OnslaughtCore

/// A colour kept as its components, so it can be mixed and dimmed without a trip through colour spaces.
struct RGB: Hashable {
    var r: CGFloat
    var g: CGFloat
    var b: CGFloat

    init(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) {
        self.r = r
        self.g = g
        self.b = b
    }

    /// From hue, saturation and brightness, all 0…1.
    static func hsb(_ h: Double, _ s: Double, _ v: Double) -> RGB {
        let h6 = (h - floor(h)) * 6
        let i = Int(h6) % 6
        let f = h6 - floor(h6)
        let p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f))
        let c: (Double, Double, Double)
        switch i {
        case 0: c = (v, t, p)
        case 1: c = (q, v, p)
        case 2: c = (p, v, t)
        case 3: c = (p, q, v)
        case 4: c = (t, p, v)
        default: c = (v, p, q)
        }
        return RGB(CGFloat(c.0), CGFloat(c.1), CGFloat(c.2))
    }

    func color(_ alpha: CGFloat = 1) -> SKColor { SKColor(red: r, green: g, blue: b, alpha: alpha) }
    func cg(_ alpha: CGFloat = 1) -> CGColor { CGColor(red: r, green: g, blue: b, alpha: alpha) }
    func mix(_ other: RGB, _ t: CGFloat) -> RGB { RGB(r + (other.r - r) * t, g + (other.g - g) * t, b + (other.b - b) * t) }
    func scaled(_ k: CGFloat) -> RGB { RGB(r * k, g * k, b * k) }

    static let white = RGB(1, 1, 1)
}

enum Palette {
    static let background = RGB(0.02, 0.025, 0.05)
    static let header = RGB(0.045, 0.05, 0.085)
    static let ink = RGB(0.86, 0.90, 0.96)
    static let player = RGB(0.16, 0.9, 1.0)
    static let gold = RGB(1.0, 0.8, 0.28)
    static let danger = RGB(1.0, 0.22, 0.26)

    static func boss(_ design: BossDesign) -> RGB { .hsb(design.hue, 0.85, 1) }
    static func accent(_ design: BossDesign) -> RGB { .hsb(design.accentHue, 0.7, 1) }

    static func tint(_ tint: Bullet.Tint, _ design: BossDesign) -> RGB {
        switch tint {
        case .primary: return boss(design)
        case .accent: return accent(design)
        case .hot: return RGB.hsb(design.hue + 0.06, 0.35, 1)
        }
    }
}

/// Every texture is drawn here, once, in code. No image files.
@MainActor
enum Art {
    static let headingFont = "AvenirNextCondensed-Heavy"
    static let numberFont = "AvenirNextCondensed-Bold"
    static let textFont = "AvenirNext-DemiBold"

    static let glow = radial(128, [(0, 1), (0.22, 0.55), (0.55, 0.14), (1, 0)])
    static let spark = radial(32, [(0, 1), (0.3, 0.85), (1, 0)])
    static let vignette = radial(256, [(0, 0), (0.6, 0), (1, 0.8)], white: 0)
    static let ring = radial(128, [(0, 0), (0.78, 0), (0.9, 1), (0.95, 0.5), (1, 0)])
    static let ship = drawShip()
    static let bolt = bullet(.needle, core: .white, rim: Palette.player)
    static let missile = bullet(.pellet, core: .white, rim: Palette.gold)
    static let droneShot = bullet(.pellet, core: .white, rim: Palette.player.mix(.white, 0.3))
    static let drone = drawDrone()

    private static var bulletCache: [String: SKTexture] = [:]

    static func context(_ w: Int, _ h: Int) -> CGContext? {
        CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    }

    static func texture(_ context: CGContext?) -> SKTexture {
        guard let image = context?.makeImage() else { return SKTexture() }
        return SKTexture(cgImage: image)
    }

    static func radial(_ size: Int, _ stops: [(CGFloat, CGFloat)], white: CGFloat = 1) -> SKTexture {
        guard let ctx = context(size, size) else { return SKTexture() }
        let colors = stops.map { CGColor(red: white, green: white, blue: white, alpha: $0.1) } as CFArray
        guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: stops.map { $0.0 })
        else { return SKTexture() }
        let c = CGPoint(x: CGFloat(size) / 2, y: CGFloat(size) / 2)
        ctx.drawRadialGradient(gradient, startCenter: c, startRadius: 0, endCenter: c, endRadius: CGFloat(size) / 2, options: [])
        return texture(ctx)
    }

    /// A bullet: a white-hot core in a coloured rim and glow, so it reads against anything.
    static func bullet(_ kind: Bullet.Kind, core: RGB, rim: RGB) -> SKTexture {
        let (w, h): (Int, Int) = kind == .needle ? (24, 64) : kind == .mine ? (64, 64) : (48, 48)
        guard let ctx = context(w, h) else { return SKTexture() }
        let space = CGColorSpaceCreateDeviceRGB()
        let c = CGPoint(x: CGFloat(w) / 2, y: CGFloat(h) / 2)
        if kind == .mine {
            let colors = [rim.cg(0.9), rim.cg(0.35), rim.cg(0)] as CFArray
            if let g = CGGradient(colorsSpace: space, colors: colors, locations: [0, 0.45, 1]) {
                ctx.drawRadialGradient(g, startCenter: c, startRadius: 0, endCenter: c, endRadius: 32, options: [])
            }
            ctx.setFillColor(rim.scaled(0.25).cg())
            ctx.fillEllipse(in: CGRect(x: c.x - 13, y: c.y - 13, width: 26, height: 26))
            ctx.setStrokeColor(core.mix(rim, 0.3).cg())
            ctx.setLineWidth(3)
            ctx.strokeEllipse(in: CGRect(x: c.x - 13, y: c.y - 13, width: 26, height: 26))
            for k in 0..<6 {
                let a = CGFloat(k) * .pi / 3
                ctx.move(to: CGPoint(x: c.x + cos(a) * 14, y: c.y + sin(a) * 14))
                ctx.addLine(to: CGPoint(x: c.x + cos(a) * 21, y: c.y + sin(a) * 21))
            }
            ctx.strokePath()
            ctx.setFillColor(core.cg())
            ctx.fillEllipse(in: CGRect(x: c.x - 4, y: c.y - 4, width: 8, height: 8))
            return texture(ctx)
        }
        ctx.translateBy(x: c.x, y: c.y)
        if kind == .needle { ctx.scaleBy(x: 1, y: CGFloat(h) / CGFloat(w)) }
        let r = CGFloat(w) / 2
        let colors = [core.cg(), core.cg(), rim.cg(), rim.cg(0.35), rim.cg(0)] as CFArray
        if let g = CGGradient(colorsSpace: space, colors: colors, locations: [0, 0.2, 0.42, 0.62, 1]) {
            ctx.drawRadialGradient(g, startCenter: .zero, startRadius: 0, endCenter: .zero, endRadius: r, options: [])
        }
        return texture(ctx)
    }

    static func bullet(_ kind: Bullet.Kind, tint: Bullet.Tint, design: BossDesign) -> SKTexture {
        let key = "\(kind.rawValue)-\(tint.rawValue)-\(design.hue)-\(design.accentHue)"
        if let cached = bulletCache[key] { return cached }
        let rim = Palette.tint(tint, design)
        let made = bullet(kind, core: tint == .hot ? RGB(1, 1, 0.92) : .white, rim: rim)
        if bulletCache.count > 64 { bulletCache.removeAll() }
        bulletCache[key] = made
        return made
    }

    /// The interceptor, pointing up: a swept delta with a spine.
    static func drawShip() -> SKTexture {
        let w = 56, h = 64
        guard let ctx = context(w, h) else { return SKTexture() }
        let body = CGMutablePath()
        body.move(to: CGPoint(x: 28, y: 62))
        body.addLine(to: CGPoint(x: 38, y: 30))
        body.addLine(to: CGPoint(x: 54, y: 10))
        body.addLine(to: CGPoint(x: 36, y: 16))
        body.addLine(to: CGPoint(x: 28, y: 6))
        body.addLine(to: CGPoint(x: 20, y: 16))
        body.addLine(to: CGPoint(x: 2, y: 10))
        body.addLine(to: CGPoint(x: 18, y: 30))
        body.closeSubpath()
        ctx.addPath(body)
        ctx.setFillColor(Palette.player.scaled(0.35).cg())
        ctx.fillPath()
        ctx.addPath(body)
        ctx.setStrokeColor(Palette.player.mix(.white, 0.35).cg())
        ctx.setLineWidth(3)
        ctx.setLineJoin(.round)
        ctx.strokePath()
        let spine = CGMutablePath()
        spine.move(to: CGPoint(x: 28, y: 54))
        spine.addLine(to: CGPoint(x: 31, y: 24))
        spine.addLine(to: CGPoint(x: 28, y: 14))
        spine.addLine(to: CGPoint(x: 25, y: 24))
        spine.closeSubpath()
        ctx.addPath(spine)
        ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        ctx.fillPath()
        return texture(ctx)
    }

    static func drawDrone() -> SKTexture {
        guard let ctx = context(32, 32) else { return SKTexture() }
        let path = CGMutablePath()
        path.move(to: CGPoint(x: 16, y: 30))
        path.addLine(to: CGPoint(x: 29, y: 8))
        path.addLine(to: CGPoint(x: 16, y: 14))
        path.addLine(to: CGPoint(x: 3, y: 8))
        path.closeSubpath()
        ctx.addPath(path)
        ctx.setFillColor(Palette.player.mix(.white, 0.5).cg())
        ctx.fillPath()
        return texture(ctx)
    }

    /// An SF Symbol as a white texture (nil when the system has no such symbol).
    static func symbol(_ name: String, points: CGFloat) -> SKTexture? {
        let config = NSImage.SymbolConfiguration(pointSize: points, weight: .bold)
        guard let base = NSImage(systemSymbolName: name, accessibilityDescription: nil)?.withSymbolConfiguration(config) else { return nil }
        let scale: CGFloat = 2
        let w = Int(ceil(base.size.width * scale)), h = Int(ceil(base.size.height * scale))
        guard w > 0, h > 0, let ctx = context(w, h) else { return nil }
        var rect = CGRect(x: 0, y: 0, width: base.size.width, height: base.size.height)
        guard let cg = base.cgImage(forProposedRect: &rect, context: nil, hints: nil) else { return nil }
        let bounds = CGRect(x: 0, y: 0, width: w, height: h)
        ctx.clip(to: bounds, mask: cg)
        ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        ctx.fill(bounds)
        let made = Art.texture(ctx)
        made.filteringMode = .linear
        return made
    }

    static func circle(_ r: CGFloat) -> CGPath { CGPath(ellipseIn: CGRect(x: -r, y: -r, width: 2 * r, height: 2 * r), transform: nil) }

    static func polygon(sides: Int, radius r: CGFloat, rotation: CGFloat = 0) -> CGPath {
        let path = CGMutablePath()
        for k in 0..<max(3, sides) {
            let a = rotation + CGFloat(k) * 2 * .pi / CGFloat(max(3, sides))
            let p = CGPoint(x: cos(a) * r, y: sin(a) * r)
            if k == 0 { path.move(to: p) } else { path.addLine(to: p) }
        }
        path.closeSubpath()
        return path
    }

    static func star(points: Int, outer: CGFloat, inner: CGFloat, rotation: CGFloat = 0) -> CGPath {
        let path = CGMutablePath()
        let n = max(3, points) * 2
        for k in 0..<n {
            let a = rotation + CGFloat(k) * 2 * .pi / CGFloat(n)
            let r = k % 2 == 0 ? outer : inner
            let p = CGPoint(x: cos(a) * r, y: sin(a) * r)
            if k == 0 { path.move(to: p) } else { path.addLine(to: p) }
        }
        path.closeSubpath()
        return path
    }

    // MARK: Effects

    /// A one-shot spray of sparks that removes itself.
    static func burst(_ color: RGB, count: Int, speed: CGFloat, size: CGFloat, life: CGFloat,
                      spread: CGFloat = .pi * 2, angle: CGFloat = 0) -> SKEmitterNode {
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

    /// An expanding ring that fades out.
    static func shockwave(_ color: RGB, radius: CGFloat, grow: CGFloat, duration: TimeInterval, alpha: CGFloat = 0.9) -> SKSpriteNode {
        let sprite = SKSpriteNode(texture: ring)
        sprite.size = CGSize(width: radius * 2, height: radius * 2)
        sprite.color = color.color()
        sprite.colorBlendFactor = 1
        sprite.blendMode = .add
        sprite.alpha = alpha
        sprite.run(.sequence([
            .group([.scale(to: grow, duration: duration), .fadeOut(withDuration: duration)]).easedOut(),
            .removeFromParent(),
        ]))
        return sprite
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

    static func glowSprite(_ color: RGB, size: CGFloat, alpha: CGFloat) -> SKSpriteNode {
        let sprite = SKSpriteNode(texture: glow)
        sprite.size = CGSize(width: size, height: size)
        sprite.color = color.color()
        sprite.colorBlendFactor = 1
        sprite.blendMode = .add
        sprite.alpha = alpha
        return sprite
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

func roman(_ n: Int) -> String { ["I", "II", "III", "IV"][max(0, min(3, n - 1))] }

func grouped(_ n: Int) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.groupingSeparator = ","
    return formatter.string(from: NSNumber(value: n)) ?? "\(n)"
}
