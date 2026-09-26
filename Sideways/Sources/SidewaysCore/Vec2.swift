import Foundation

/// A point or direction in the world plane. The world is y-up with angles counter-clockwise from +x, the same
/// orientation as an unflipped AppKit view, so the renderer maps it with a plain scale and translation.
public struct Vec2: Equatable, Hashable, Codable, Sendable {
    public var x: Double
    public var y: Double

    public init(_ x: Double, _ y: Double) {
        self.x = x
        self.y = y
    }

    public static let zero = Vec2(0, 0)

    /// The unit vector at `angle` radians.
    public init(angle: Double) {
        self.init(cos(angle), sin(angle))
    }

    public var length: Double { (x * x + y * y).squareRoot() }
    public var lengthSquared: Double { x * x + y * y }
    public var angle: Double { atan2(y, x) }
    /// Rotated a quarter turn counter-clockwise: the left-hand side of a direction.
    public var perp: Vec2 { Vec2(-y, x) }

    public var normalized: Vec2 {
        let l = length
        return l > 1e-12 ? Vec2(x / l, y / l) : .zero
    }

    public func dot(_ o: Vec2) -> Double { x * o.x + y * o.y }
    /// The z of the 3D cross product: positive when `o` lies counter-clockwise of `self`.
    public func cross(_ o: Vec2) -> Double { x * o.y - y * o.x }
    public func distance(to o: Vec2) -> Double { (self - o).length }

    public func rotated(by a: Double) -> Vec2 {
        let c = cos(a), s = sin(a)
        return Vec2(x * c - y * s, x * s + y * c)
    }

    public static func + (a: Vec2, b: Vec2) -> Vec2 { Vec2(a.x + b.x, a.y + b.y) }
    public static func - (a: Vec2, b: Vec2) -> Vec2 { Vec2(a.x - b.x, a.y - b.y) }
    public static prefix func - (a: Vec2) -> Vec2 { Vec2(-a.x, -a.y) }
    public static func * (a: Vec2, k: Double) -> Vec2 { Vec2(a.x * k, a.y * k) }
    public static func * (k: Double, a: Vec2) -> Vec2 { Vec2(a.x * k, a.y * k) }
    public static func / (a: Vec2, k: Double) -> Vec2 { Vec2(a.x / k, a.y / k) }
    public static func += (a: inout Vec2, b: Vec2) { a = a + b }
    public static func -= (a: inout Vec2, b: Vec2) { a = a - b }
    public static func *= (a: inout Vec2, k: Double) { a = a * k }

    public static func lerp(_ a: Vec2, _ b: Vec2, _ t: Double) -> Vec2 { a + (b - a) * t }
}

/// `a` wrapped into -π…π.
@inline(__always)
public func wrapAngle(_ a: Double) -> Double {
    var r = a.truncatingRemainder(dividingBy: 2 * .pi)
    if r > .pi { r -= 2 * .pi } else if r < -.pi { r += 2 * .pi }
    return r
}

@inline(__always)
public func clamp<T: Comparable>(_ v: T, _ lo: T, _ hi: T) -> T { min(max(v, lo), hi) }

/// Moves `value` toward `target` by at most `step`.
@inline(__always)
public func approach(_ value: Double, _ target: Double, _ step: Double) -> Double {
    value < target ? min(value + step, target) : max(value - step, target)
}

/// SplitMix64: a tiny deterministic generator, so a seed makes the same track on every Mac and on Linux.
public struct SeededRandom: RandomNumberGenerator, Sendable {
    private var state: UInt64

    public init(seed: UInt64) { state = seed }

    public mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    /// Uniform in `range`, built from the top 53 bits so it is the same on every platform.
    public mutating func double(_ range: ClosedRange<Double>) -> Double {
        let unit = Double(next() >> 11) / Double(1 << 53)
        return range.lowerBound + (range.upperBound - range.lowerBound) * unit
    }

    public mutating func int(_ range: ClosedRange<Int>) -> Int {
        range.lowerBound + Int(next() % UInt64(range.count))
    }

    public mutating func pick<T>(_ items: [T]) -> T { items[int(0...(items.count - 1))] }
}
