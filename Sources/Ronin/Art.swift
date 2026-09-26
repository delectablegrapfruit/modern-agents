import AppKit
import SpriteKit
import RoninCore

/// A colour kept as its components, so it can be mixed and dimmed without a trip through colour spaces.
struct RGB: Equatable {
    var r: CGFloat
    var g: CGFloat
    var b: CGFloat

    init(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) {
        self.r = r
        self.g = g
        self.b = b
    }

    func color(_ alpha: CGFloat = 1) -> SKColor { SKColor(red: r, green: g, blue: b, alpha: alpha) }
    func cg(_ alpha: CGFloat = 1) -> CGColor { CGColor(red: r, green: g, blue: b, alpha: alpha) }
    func mix(_ other: RGB, _ t: CGFloat) -> RGB { RGB(r + (other.r - r) * t, g + (other.g - g) * t, b + (other.b - b) * t) }
    func scaled(_ k: CGFloat) -> RGB { RGB(r * k, g * k, b * k) }

    static let white = RGB(1, 1, 1)
    static let black = RGB(0, 0, 0)
}

enum Palette {
    static let background = RGB(0.035, 0.025, 0.03)
    static let header = RGB(0.07, 0.05, 0.055)
    static let ink = RGB(0.95, 0.92, 0.88)
    static let gold = RGB(1.0, 0.80, 0.30)
    static let blood = RGB(0.92, 0.07, 0.10)
    static let steel = RGB(0.90, 0.94, 1.0)
    static let silhouette = RGB(0.025, 0.02, 0.03)
    static let shade = RGB(0.13, 0.11, 0.13)
}

/// How a setting is painted: its sky, its sun or moon, its hills and landmarks, and its weather.
struct Look {
    enum Weather { case embers, leaves, ash, snow, rain, petals }
    enum Landmark { case torii, bamboo, pagoda, pines, bridge, village, temple, banners }

    var top: RGB
    var horizon: RGB
    var sun: RGB
    /// The disc's radius and the height of its centre above the ground, as shares of the field's height.
    var sunSize: CGFloat
    var sunHeight: CGFloat
    var far: RGB
    var near: RGB
    var ground: RGB
    var weather: Weather
    var landmark: Landmark
    var accent: RGB

    static func of(_ setting: Setting) -> Look {
        switch setting {
        case .crimsonDusk:
            return Look(top: RGB(0.16, 0.02, 0.06), horizon: RGB(1.0, 0.42, 0.16), sun: RGB(1.0, 0.86, 0.55), sunSize: 0.34, sunHeight: 0.36,
                        far: RGB(0.62, 0.16, 0.12), near: RGB(0.26, 0.04, 0.05), ground: RGB(0.06, 0.015, 0.02), weather: .embers,
                        landmark: .torii, accent: RGB(1.0, 0.45, 0.2))
        case .bambooGrove:
            return Look(top: RGB(0.02, 0.08, 0.07), horizon: RGB(0.62, 0.86, 0.52), sun: RGB(0.93, 1.0, 0.85), sunSize: 0.28, sunHeight: 0.48,
                        far: RGB(0.24, 0.46, 0.30), near: RGB(0.06, 0.16, 0.10), ground: RGB(0.02, 0.05, 0.035), weather: .leaves,
                        landmark: .bamboo, accent: RGB(0.55, 0.95, 0.55))
        case .bloodMoon:
            return Look(top: RGB(0.03, 0.0, 0.02), horizon: RGB(0.66, 0.08, 0.10), sun: RGB(1.0, 0.24, 0.16), sunSize: 0.42, sunHeight: 0.44,
                        far: RGB(0.30, 0.03, 0.05), near: RGB(0.13, 0.01, 0.03), ground: RGB(0.04, 0.0, 0.01), weather: .ash,
                        landmark: .pagoda, accent: RGB(1.0, 0.22, 0.22))
        case .frozenPass:
            return Look(top: RGB(0.04, 0.07, 0.16), horizon: RGB(0.74, 0.85, 0.97), sun: RGB(1, 1, 1), sunSize: 0.26, sunHeight: 0.5,
                        far: RGB(0.46, 0.56, 0.72), near: RGB(0.20, 0.26, 0.38), ground: RGB(0.05, 0.06, 0.09), weather: .snow,
                        landmark: .pines, accent: RGB(0.6, 0.85, 1.0))
        case .stormBridge:
            return Look(top: RGB(0.03, 0.04, 0.07), horizon: RGB(0.42, 0.50, 0.62), sun: RGB(0.82, 0.88, 0.97), sunSize: 0.22, sunHeight: 0.52,
                        far: RGB(0.20, 0.24, 0.32), near: RGB(0.08, 0.10, 0.14), ground: RGB(0.03, 0.035, 0.05), weather: .rain,
                        landmark: .bridge, accent: RGB(0.6, 0.8, 1.0))
        case .burningVillage:
            return Look(top: RGB(0.12, 0.03, 0.0), horizon: RGB(1.0, 0.60, 0.12), sun: RGB(1.0, 0.93, 0.6), sunSize: 0.30, sunHeight: 0.30,
                        far: RGB(0.62, 0.22, 0.05), near: RGB(0.22, 0.06, 0.02), ground: RGB(0.07, 0.02, 0.0), weather: .embers,
                        landmark: .village, accent: RGB(1.0, 0.6, 0.15))
        case .sakuraTemple:
            return Look(top: RGB(0.16, 0.04, 0.16), horizon: RGB(1.0, 0.66, 0.74), sun: RGB(1.0, 0.94, 0.95), sunSize: 0.30, sunHeight: 0.42,
                        far: RGB(0.64, 0.32, 0.46), near: RGB(0.30, 0.10, 0.22), ground: RGB(0.07, 0.02, 0.05), weather: .petals,
                        landmark: .temple, accent: RGB(1.0, 0.55, 0.75))
        case .ashFields:
            return Look(top: RGB(0.07, 0.07, 0.08), horizon: RGB(0.76, 0.70, 0.62), sun: RGB(0.98, 0.92, 0.80), sunSize: 0.30, sunHeight: 0.45,
                        far: RGB(0.42, 0.39, 0.36), near: RGB(0.18, 0.16, 0.15), ground: RGB(0.05, 0.045, 0.04), weather: .ash,
                        landmark: .banners, accent: RGB(0.95, 0.82, 0.6))
        }
    }
}

/// Textures drawn once at launch: glows, sparks, the cut's crescent, arrows, the sky. No image files.
@MainActor
enum Art {
    static let headingFont = "AvenirNextCondensed-Heavy"
    static let numberFont = "AvenirNextCondensed-Bold"
    static let textFont = "AvenirNext-DemiBold"

    static let glow = radial(128, [(0, 1), (0.22, 0.55), (0.55, 0.14), (1, 0)])
    static let spark = radial(32, [(0, 1), (0.3, 0.85), (1, 0)])
    static let dot = radial(24, [(0, 1), (0.7, 1), (1, 0)])
    static let vignette = radial(256, [(0, 0), (0.58, 0), (1, 0.8)], white: 0)
    static let crescent = makeCrescent()
    static let streak = makeStreak()
    static let arrow = makeArrow()
    static let petal = makePetal()
    static let raindrop = makeRaindrop()

    static func bitmap(_ w: Int, _ h: Int) -> CGContext? {
        CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    }

    static func texture(_ context: CGContext?) -> SKTexture {
        guard let image = context?.makeImage() else { return SKTexture() }
        return SKTexture(cgImage: image)
    }

    static func radial(_ size: Int, _ stops: [(CGFloat, CGFloat)], white: CGFloat = 1) -> SKTexture {
        guard let context = bitmap(size, size) else { return SKTexture() }
        let colors = stops.map { CGColor(red: white, green: white, blue: white, alpha: $0.1) } as CFArray
        guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: stops.map { $0.0 })
        else { return SKTexture() }
        let centre = CGPoint(x: CGFloat(size) / 2, y: CGFloat(size) / 2)
        context.drawRadialGradient(gradient, startCenter: centre, startRadius: 0, endCenter: centre, endRadius: CGFloat(size) / 2, options: [])
        return texture(context)
    }

    /// A vertical gradient: the sky, from `top` down to `bottom`.
    static func gradient(_ top: RGB, _ bottom: RGB, glow: RGB? = nil) -> SKTexture {
        let w = 4, h = 256
        guard let context = bitmap(w, h) else { return SKTexture() }
        var colors = [bottom.cg(), bottom.mix(top, 0.45).cg(), top.cg()]
        var stops: [CGFloat] = [0, 0.35, 1]
        if let glow {
            colors.insert(glow.cg(), at: 0)
            stops = [0, 0.08, 0.4, 1]
        }
        guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors as CFArray, locations: stops)
        else { return SKTexture() }
        context.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 0, y: h), options: [])
        return texture(context)
    }

    /// The cut: a crescent sweeping upward, bright at its belly, fading to its tips.
    private static func makeCrescent() -> SKTexture {
        let s = 160
        guard let context = bitmap(s, s) else { return SKTexture() }
        let c = CGFloat(s) / 2, r = CGFloat(s) * 0.40
        context.setShadow(offset: .zero, blur: 7, color: CGColor(red: 1, green: 1, blue: 1, alpha: 0.9))
        context.beginTransparencyLayer(auxiliaryInfo: nil)
        context.addEllipse(in: CGRect(x: c - r, y: c - r, width: 2 * r, height: 2 * r))
        context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.fillPath()
        context.setBlendMode(.clear)
        let inner = r * 0.96
        context.addEllipse(in: CGRect(x: c - inner - r * 0.2, y: c - inner + r * 0.02, width: 2 * inner, height: 2 * inner))
        context.fillPath()
        context.endTransparencyLayer()
        return texture(context)
    }

    /// A soft horizontal bar, bright in the middle: dashes and trails.
    private static func makeStreak() -> SKTexture {
        let w = 128, h = 16
        guard let context = bitmap(w, h) else { return SKTexture() }
        let colors = [CGColor(red: 1, green: 1, blue: 1, alpha: 0), CGColor(red: 1, green: 1, blue: 1, alpha: 1),
                      CGColor(red: 1, green: 1, blue: 1, alpha: 0)] as CFArray
        guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.8, 1])
        else { return SKTexture() }
        context.clip(to: CGRect(x: 0, y: CGFloat(h) * 0.3, width: CGFloat(w), height: CGFloat(h) * 0.4))
        context.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: w, y: 0), options: [])
        return texture(context)
    }

    /// An arrow pointing along +x, tip at the right edge.
    private static func makeArrow() -> SKTexture {
        let w = 56, h = 12
        guard let context = bitmap(w, h) else { return SKTexture() }
        let y = CGFloat(h) / 2
        context.setStrokeColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.setLineWidth(1.6)
        context.move(to: CGPoint(x: 6, y: y))
        context.addLine(to: CGPoint(x: 46, y: y))
        context.strokePath()
        context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.move(to: CGPoint(x: 56, y: y))
        context.addLine(to: CGPoint(x: 44, y: y + 4))
        context.addLine(to: CGPoint(x: 46, y: y))
        context.addLine(to: CGPoint(x: 44, y: y - 4))
        context.closePath()
        context.fillPath()
        for dy in [CGFloat(3.5), -3.5] {
            context.move(to: CGPoint(x: 1, y: y + dy))
            context.addLine(to: CGPoint(x: 11, y: y))
            context.addLine(to: CGPoint(x: 5, y: y + dy))
            context.closePath()
            context.fillPath()
        }
        return texture(context)
    }

    private static func makePetal() -> SKTexture {
        guard let context = bitmap(16, 10) else { return SKTexture() }
        context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.fillEllipse(in: CGRect(x: 1, y: 1, width: 14, height: 8))
        return texture(context)
    }

    private static func makeRaindrop() -> SKTexture {
        guard let context = bitmap(4, 32) else { return SKTexture() }
        let colors = [CGColor(red: 1, green: 1, blue: 1, alpha: 0), CGColor(red: 1, green: 1, blue: 1, alpha: 1)] as CFArray
        guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])
        else { return SKTexture() }
        context.drawLinearGradient(gradient, start: CGPoint(x: 0, y: 32), end: .zero, options: [])
        return texture(context)
    }

    static func circle(_ r: CGFloat) -> CGPath { CGPath(ellipseIn: CGRect(x: -r, y: -r, width: 2 * r, height: 2 * r), transform: nil) }

    static func diamond(_ r: CGFloat) -> CGPath {
        let path = CGMutablePath()
        path.move(to: CGPoint(x: 0, y: r))
        path.addLine(to: CGPoint(x: r * 0.8, y: 0))
        path.addLine(to: CGPoint(x: 0, y: -r))
        path.addLine(to: CGPoint(x: -r * 0.8, y: 0))
        path.closeSubpath()
        return path
    }

    // MARK: Effects

    /// A one-shot spray of particles that removes itself. `gravity` pulls them down (points a second squared).
    static func burst(_ color: RGB, count: Int, speed: CGFloat, size: CGFloat, life: CGFloat, spread: CGFloat = .pi * 2,
                      angle: CGFloat = 0, gravity: CGFloat = 0, additive: Bool = true, texture: SKTexture? = nil) -> SKEmitterNode {
        let e = SKEmitterNode()
        e.particleTexture = texture ?? spark
        e.particleBirthRate = CGFloat(count) * 60
        e.numParticlesToEmit = count
        e.particleLifetime = life
        e.particleLifetimeRange = life * 0.6
        e.emissionAngle = angle
        e.emissionAngleRange = spread
        e.particleSpeed = speed
        e.particleSpeedRange = speed * 0.8
        e.yAcceleration = -gravity
        e.particleAlpha = 1
        e.particleAlphaSpeed = -1 / life
        e.particleScale = size / 32
        e.particleScaleRange = size / 64
        e.particleScaleSpeed = -size / 32 / life * 0.6
        e.particleColor = color.color()
        e.particleColorBlendFactor = 1
        e.particleBlendMode = additive ? .add : .alpha
        e.run(.sequence([.wait(forDuration: TimeInterval(life * 2.2)), .removeFromParent()]))
        return e
    }

    /// An expanding ring that fades out.
    static func shockwave(_ color: RGB, radius: CGFloat, grow: CGFloat, width: CGFloat, duration: TimeInterval) -> SKShapeNode {
        let ring = SKShapeNode(path: circle(radius))
        ring.strokeColor = color.color()
        ring.fillColor = .clear
        ring.lineWidth = width
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

    // MARK: Weather

    /// Falling snow, petals, leaves or ash, rising embers, or driving rain, across a field `size` wide and tall.
    static func weather(_ kind: Look.Weather, size: CGSize, tint: RGB) -> SKEmitterNode {
        let e = SKEmitterNode()
        e.particleColorBlendFactor = 1
        e.particlePositionRange = CGVector(dx: size.width * 1.2, dy: 0)
        e.position = CGPoint(x: size.width / 2, y: size.height + 6)
        e.emissionAngle = -.pi / 2
        let area = size.width / 400
        switch kind {
        case .embers:
            e.particleTexture = spark
            e.position = CGPoint(x: size.width / 2, y: -4)
            e.emissionAngle = .pi / 2
            e.emissionAngleRange = 0.5
            e.particleBirthRate = 16 * area
            e.particleSpeed = 22
            e.particleSpeedRange = 14
            e.particleLifetime = 5
            e.particleScale = 0.1
            e.particleScaleRange = 0.06
            e.particleColor = RGB(1.0, 0.55, 0.15).color()
            e.particleBlendMode = .add
            e.particleAlphaSequence = SKKeyframeSequence(keyframeValues: [0, 1, 0.8, 0], times: [0, 0.1, 0.6, 1])
            e.xAcceleration = 3
        case .leaves:
            e.particleTexture = petal
            e.particleBirthRate = 3 * area
            e.particleSpeed = 16
            e.particleSpeedRange = 8
            e.emissionAngleRange = 0.6
            e.particleLifetime = 11
            e.particleScale = 0.45
            e.particleScaleRange = 0.2
            e.particleRotationRange = .pi * 2
            e.particleRotationSpeed = 1.6
            e.particleColor = RGB(0.10, 0.28, 0.14).color()
            e.particleAlpha = 0.9
            e.xAcceleration = 4
        case .ash:
            e.particleTexture = spark
            e.particleBirthRate = 10 * area
            e.particleSpeed = 10
            e.particleSpeedRange = 6
            e.emissionAngleRange = 0.7
            e.particleLifetime = 14
            e.particleScale = 0.1
            e.particleScaleRange = 0.06
            e.particleColor = tint.mix(RGB.white, 0.3).color()
            e.particleAlpha = 0.55
            e.particleAlphaRange = 0.3
            e.particleBlendMode = .alpha
            e.xAcceleration = -2
        case .snow:
            e.particleTexture = spark
            e.particleBirthRate = 22 * area
            e.particleSpeed = 16
            e.particleSpeedRange = 10
            e.emissionAngleRange = 0.5
            e.particleLifetime = 10
            e.particleScale = 0.12
            e.particleScaleRange = 0.08
            e.particleColor = SKColor.white
            e.particleAlpha = 0.85
            e.particleAlphaRange = 0.3
            e.xAcceleration = -5
        case .rain:
            e.particleTexture = raindrop
            e.particleBirthRate = 70 * area
            e.particleSpeed = 330
            e.particleSpeedRange = 60
            e.emissionAngle = -.pi / 2 - 0.22
            e.particleRotation = -0.22
            e.particleLifetime = 0.8
            e.particleScale = 0.55
            e.particleScaleRange = 0.2
            e.particleColor = RGB(0.72, 0.82, 1.0).color()
            e.particleAlpha = 0.28
            e.particleAlphaRange = 0.12
            e.particleBlendMode = .add
            e.particlePositionRange = CGVector(dx: size.width * 1.5, dy: 0)
            e.position.x += size.width * 0.15
        case .petals:
            e.particleTexture = petal
            e.particleBirthRate = 5 * area
            e.particleSpeed = 18
            e.particleSpeedRange = 8
            e.emissionAngleRange = 0.8
            e.particleLifetime = 11
            e.particleScale = 0.35
            e.particleScaleRange = 0.15
            e.particleRotationRange = .pi * 2
            e.particleRotationSpeed = 2
            e.particleColor = RGB(1.0, 0.78, 0.86).color()
            e.particleAlpha = 0.9
            e.xAcceleration = 6
        }
        e.advanceSimulationTime(TimeInterval(e.particleLifetime))
        return e
    }

    // MARK: Scenery

    /// A seeded mountain ridge across `width`, between `low` and `high` above `base`, closed down to `base`.
    static func ridge(width: CGFloat, base: CGFloat, low: CGFloat, high: CGFloat, seed: UInt64, jag: Int) -> CGPath {
        var rng = SeededRNG(seed: seed)
        let path = CGMutablePath()
        path.move(to: CGPoint(x: -4, y: base))
        let count = max(3, jag)
        var x: CGFloat = -4
        let step = (width + 8) / CGFloat(count)
        path.addLine(to: CGPoint(x: x, y: base + low + (high - low) * CGFloat(rng.unit()) * 0.5))
        for _ in 0..<count {
            let peak = base + low + (high - low) * CGFloat(rng.unit())
            let mid = x + step * CGFloat(rng.range(0.35, 0.65))
            path.addLine(to: CGPoint(x: mid, y: peak))
            x += step
            path.addLine(to: CGPoint(x: x, y: base + low + (peak - base - low) * CGFloat(rng.range(0.1, 0.5))))
        }
        path.addLine(to: CGPoint(x: width + 4, y: base))
        path.closeSubpath()
        return path
    }

    /// The landmark silhouettes that frame a setting, keeping the middle clear for the fight.
    static func landmark(_ kind: Look.Landmark, width w: CGFloat, height h: CGFloat, ground g: CGFloat, seed: UInt64) -> CGPath {
        let path = CGMutablePath()
        var rng = SeededRNG(seed: seed)
        func rect(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat) {
            path.addRect(CGRect(x: x, y: y, width: width, height: height))
        }
        func torii(_ cx: CGFloat, _ s: CGFloat) {
            let span = s * 0.9, post = s * 0.07
            rect(cx - span / 2, g, post, s)
            rect(cx + span / 2 - post, g, post, s)
            rect(cx - span * 0.62, g + s * 0.78, span * 1.24, s * 0.07)
            // The top beam sweeps up at its ends.
            path.move(to: CGPoint(x: cx - span * 0.72, y: g + s * 0.98))
            path.addQuadCurve(to: CGPoint(x: cx + span * 0.72, y: g + s * 0.98), control: CGPoint(x: cx, y: g + s * 0.86))
            path.addLine(to: CGPoint(x: cx + span * 0.66, y: g + s * 1.06))
            path.addQuadCurve(to: CGPoint(x: cx - span * 0.66, y: g + s * 1.06), control: CGPoint(x: cx, y: g + s * 0.95))
            path.closeSubpath()
            rect(cx - post / 2, g + s * 0.78, post, s * 0.2)
        }
        func pine(_ cx: CGFloat, _ s: CGFloat) {
            rect(cx - s * 0.03, g, s * 0.06, s * 0.3)
            for k in 0..<4 {
                let y = g + s * (0.18 + 0.2 * CGFloat(k)), half = s * (0.3 - 0.06 * CGFloat(k))
                path.move(to: CGPoint(x: cx - half, y: y))
                path.addLine(to: CGPoint(x: cx + half, y: y))
                path.addLine(to: CGPoint(x: cx, y: y + s * 0.3))
                path.closeSubpath()
            }
        }
        func roofed(_ cx: CGFloat, _ width: CGFloat, _ height: CGFloat, _ y: CGFloat) {
            rect(cx - width * 0.4, y, width * 0.8, height * 0.6)
            path.move(to: CGPoint(x: cx - width * 0.62, y: y + height * 0.55))
            path.addQuadCurve(to: CGPoint(x: cx, y: y + height), control: CGPoint(x: cx - width * 0.25, y: y + height * 0.6))
            path.addQuadCurve(to: CGPoint(x: cx + width * 0.62, y: y + height * 0.55), control: CGPoint(x: cx + width * 0.25, y: y + height * 0.6))
            path.closeSubpath()
        }
        switch kind {
        case .torii:
            torii(w * 0.14, h * 0.5)
            torii(w * 0.9, h * 0.32)
        case .bamboo:
            for side in [0, 1] {
                for _ in 0..<9 {
                    let x = side == 0 ? CGFloat(rng.range(-0.02, 0.2)) * w : CGFloat(rng.range(0.8, 1.02)) * w
                    let thick = CGFloat(rng.range(0.012, 0.022)) * h * 4
                    let lean = CGFloat(rng.range(-0.04, 0.04)) * h
                    let top = h * 1.2
                    path.move(to: CGPoint(x: x, y: g))
                    path.addLine(to: CGPoint(x: x + thick, y: g))
                    path.addLine(to: CGPoint(x: x + thick + lean, y: top))
                    path.addLine(to: CGPoint(x: x + lean, y: top))
                    path.closeSubpath()
                    var y = g + CGFloat(rng.range(0.1, 0.25)) * h
                    while y < top {
                        let t = (y - g) / (top - g)
                        rect(x + lean * t - thick * 0.25, y, thick * 1.5, max(1, thick * 0.22))
                        y += CGFloat(rng.range(0.16, 0.24)) * h
                    }
                }
            }
        case .pagoda:
            let cx = w * 0.86, base = h * 0.2
            rect(cx - base * 0.9, g, base * 1.8, base * 0.8)
            for k in 0..<4 {
                let y = g + base * (0.8 + 0.85 * CGFloat(k)), half = base * (1.55 - 0.22 * CGFloat(k))
                path.move(to: CGPoint(x: cx - half, y: y))
                path.addQuadCurve(to: CGPoint(x: cx + half, y: y), control: CGPoint(x: cx, y: y + base * 0.28))
                path.addLine(to: CGPoint(x: cx + half * 0.6, y: y + base * 0.34))
                path.addLine(to: CGPoint(x: cx - half * 0.6, y: y + base * 0.34))
                path.closeSubpath()
                rect(cx - half * 0.5, y + base * 0.3, half, base * 0.6)
            }
            rect(cx - base * 0.05, g + base * 4.1, base * 0.1, base * 0.9)
            torii(w * 0.1, h * 0.36)
        case .pines:
            for (x, s) in [(0.04, 0.62), (0.13, 0.45), (0.2, 0.3), (0.83, 0.34), (0.92, 0.55), (1.0, 0.4)] as [(CGFloat, CGFloat)] {
                pine(w * x, h * s)
            }
        case .bridge:
            let rail = g + h * 0.2
            rect(-4, rail, w + 8, h * 0.028)
            rect(-4, g + h * 0.1, w + 8, h * 0.018)
            var x: CGFloat = 6
            while x < w {
                rect(x, g, h * 0.035, h * 0.25)
                path.addEllipse(in: CGRect(x: x - h * 0.012, y: g + h * 0.24, width: h * 0.06, height: h * 0.05))
                x += w / 9
            }
        case .village:
            for (x, s) in [(0.05, 0.34), (0.16, 0.26), (0.84, 0.3), (0.95, 0.38)] as [(CGFloat, CGFloat)] {
                roofed(w * x, h * s * 1.3, h * s, g)
            }
        case .temple:
            torii(w * 0.9, h * 0.44)
            // A cherry tree: a leaning trunk and a crown of blossom.
            let tx = w * 0.1
            path.move(to: CGPoint(x: tx - h * 0.04, y: g))
            path.addQuadCurve(to: CGPoint(x: tx + h * 0.06, y: g + h * 0.5), control: CGPoint(x: tx + h * 0.08, y: g + h * 0.2))
            path.addLine(to: CGPoint(x: tx + h * 0.1, y: g + h * 0.5))
            path.addQuadCurve(to: CGPoint(x: tx + h * 0.04, y: g), control: CGPoint(x: tx + h * 0.12, y: g + h * 0.2))
            path.closeSubpath()
            for _ in 0..<7 {
                let r = CGFloat(rng.range(0.1, 0.17)) * h
                let cx = tx + CGFloat(rng.range(-0.15, 0.35)) * h, cy = g + CGFloat(rng.range(0.5, 0.72)) * h
                path.addEllipse(in: CGRect(x: cx - r * 1.3, y: cy - r, width: r * 2.6, height: r * 2))
            }
        case .banners:
            for (x, s) in [(0.05, 0.75), (0.12, 0.62), (0.19, 0.5), (0.82, 0.55), (0.9, 0.7), (0.97, 0.6)] as [(CGFloat, CGFloat)] {
                let px = w * x, top = g + h * s
                rect(px, g, h * 0.018, top - g)
                let flag = h * 0.09
                path.move(to: CGPoint(x: px + h * 0.018, y: top - h * 0.02))
                path.addLine(to: CGPoint(x: px + h * 0.018 + flag, y: top - h * 0.03))
                path.addLine(to: CGPoint(x: px + h * 0.018 + flag * 0.8, y: top - h * 0.32))
                path.addLine(to: CGPoint(x: px + h * 0.018 + flag * 0.5, y: top - h * 0.28))
                path.addLine(to: CGPoint(x: px + h * 0.018, y: top - h * 0.34))
                path.closeSubpath()
                rect(px - flag * 0.1, top - h * 0.03, flag * 1.2, h * 0.012)
            }
        }
        return path
    }
}

extension SKAction {
    func easedOut() -> SKAction {
        timingMode = .easeOut
        return self
    }

    func easedIn() -> SKAction {
        timingMode = .easeIn
        return self
    }
}
