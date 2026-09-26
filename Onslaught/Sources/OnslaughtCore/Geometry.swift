import Foundation

/// A point or a direction in the arena, in arena units. y points up.
public struct Vec2: Codable, Equatable, Hashable, Sendable {
    public var x: Double
    public var y: Double

    public init(_ x: Double, _ y: Double) {
        self.x = x
        self.y = y
    }

    public static let zero = Vec2(0, 0)

    public static func + (a: Vec2, b: Vec2) -> Vec2 { Vec2(a.x + b.x, a.y + b.y) }
    public static func - (a: Vec2, b: Vec2) -> Vec2 { Vec2(a.x - b.x, a.y - b.y) }
    public static func * (a: Vec2, k: Double) -> Vec2 { Vec2(a.x * k, a.y * k) }
    public static func += (a: inout Vec2, b: Vec2) { a = a + b }
    public static func -= (a: inout Vec2, b: Vec2) { a = a - b }

    public var length: Double { (x * x + y * y).squareRoot() }
    public var lengthSquared: Double { x * x + y * y }
    public var angle: Double { atan2(y, x) }
    public var normalized: Vec2 {
        let l = length
        return l > 1e-9 ? self * (1 / l) : Vec2(0, 0)
    }

    public func dot(_ o: Vec2) -> Double { x * o.x + y * o.y }
    public func distance(to o: Vec2) -> Double { (self - o).length }
    public func distanceSquared(to o: Vec2) -> Double { (self - o).lengthSquared }

    public func rotated(_ a: Double) -> Vec2 {
        let c = cos(a), s = sin(a)
        return Vec2(x * c - y * s, x * s + y * c)
    }

    public static func polar(_ angle: Double, _ r: Double) -> Vec2 { Vec2(cos(angle) * r, sin(angle) * r) }
}

/// The playing field: 240 × 300 units, portrait, the boss in the upper part and the ship below it. The app scales
/// it to the panel, so one unit is one point at the medium size.
public enum Arena {
    public static let width = 240.0
    public static let height = 300.0
    /// The ship keeps to the lower two thirds; the top belongs to the boss.
    public static let shipCeiling = 196.0
    public static let margin = 7.0

    public static func clampShip(_ p: Vec2) -> Vec2 {
        Vec2(min(width - margin, max(margin, p.x)), min(shipCeiling, max(margin, p.y)))
    }

    /// Far enough outside that nothing coming back matters.
    static func isGone(_ p: Vec2, rising: Bool) -> Bool {
        p.x < -24 || p.x > width + 24 || p.y < -24 || p.y > (rising ? height + 160 : height + 30)
    }
}

/// The distance from `p` to the ray that starts at `origin` and runs along `angle`.
func distanceToRay(_ p: Vec2, origin: Vec2, angle: Double) -> Double {
    let d = Vec2.polar(angle, 1)
    let t = max(0, (p - origin).dot(d))
    return (origin + d * t).distance(to: p)
}

func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double { min(hi, max(lo, v)) }

/// The shortest signed turn from angle `a` to angle `b`.
func angleDelta(_ a: Double, _ b: Double) -> Double {
    var d = (b - a).truncatingRemainder(dividingBy: 2 * .pi)
    if d > .pi { d -= 2 * .pi }
    if d < -.pi { d += 2 * .pi }
    return d
}
