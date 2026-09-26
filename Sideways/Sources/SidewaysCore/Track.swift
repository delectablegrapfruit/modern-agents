import Foundation

/// Which track, as the menus and the records know it. The seed is the whole track: `TrackGenerator` turns it into
/// the same road on every machine.
public struct TrackInfo: Hashable, Codable, Sendable {
    /// `daily-YYYYMMDD` or `circuit-N`; records are kept under it.
    public var id: String
    public var seed: UInt64
    public var name: String
    /// "Daily · 26 Sep" or "Circuit 3".
    public var subtitle: String

    public init(id: String, seed: UInt64, name: String, subtitle: String) {
        self.id = id
        self.seed = seed
        self.name = name
        self.subtitle = subtitle
    }

    public var isDaily: Bool { id.hasPrefix("daily-") }
}

public struct Box: Equatable, Sendable {
    public var min: Vec2
    public var max: Vec2
    public var size: Vec2 { max - min }
    public var center: Vec2 { (min + max) * 0.5 }
}

/// Where a point lies relative to the road.
public struct TrackPosition: Equatable, Sendable {
    /// The centerline segment the point projects onto, from `points[index]` to the next point.
    public var index: Int
    /// Arc length from the start line, 0 ..< `length`, increasing in the direction of travel.
    public var s: Double
    /// Signed distance from the centerline: positive on the left of the direction of travel.
    public var offset: Double
    /// The direction of travel there.
    public var tangent: Vec2
}

/// A closed road: a centerline sampled every few units, a constant width, walls on both edges. `points[0]` is on the
/// start/finish line and the road is driven in the order of the points.
public struct Track: Sendable {
    public static let sectorCount = 8

    public let info: TrackInfo
    public let points: [Vec2]
    public let tangents: [Vec2]
    /// Signed curvature (1/units, positive turning left), smoothed over a car length or so.
    public let curvature: [Double]
    public let spacing: Double
    public let length: Double
    public let halfWidth: Double
    /// The track's neon, 0…1 around the colour wheel.
    public let hue: Double
    public let bounds: Box

    public init(info: TrackInfo, centerline: [Vec2], halfWidth: Double, hue: Double) {
        precondition(centerline.count >= 8)
        self.info = info
        self.points = centerline
        self.halfWidth = halfWidth
        self.hue = hue
        let n = centerline.count
        var length = 0.0
        for i in 0..<n { length += centerline[i].distance(to: centerline[(i + 1) % n]) }
        self.length = length
        self.spacing = length / Double(n)
        let tangents = (0..<n).map { (i: Int) -> Vec2 in
            let ahead: Vec2 = centerline[(i + 1) % n], behind: Vec2 = centerline[(i + n - 1) % n]
            return (ahead - behind).normalized
        }
        self.tangents = tangents
        var raw = [Double](repeating: 0, count: n)
        for i in 0..<n {
            let turn = wrapAngle(tangents[(i + 1) % n].angle - tangents[(i + n - 1) % n].angle)
            raw[i] = turn / (2 * length / Double(n))
        }
        let k = 3
        self.curvature = (0..<n).map { i in
            var sum = 0.0
            for j in -k...k { sum += raw[(i + j + n) % n] }
            return sum / Double(2 * k + 1)
        }
        var lo = Vec2(.infinity, .infinity), hi = Vec2(-.infinity, -.infinity)
        for p in centerline {
            lo = Vec2(Swift.min(lo.x, p.x), Swift.min(lo.y, p.y))
            hi = Vec2(Swift.max(hi.x, p.x), Swift.max(hi.y, p.y))
        }
        let pad = Vec2(halfWidth, halfWidth)
        self.bounds = Box(min: lo - pad, max: hi + pad)
    }

    public var count: Int { points.count }

    /// Total turning over a lap in whole turns: 1 for a plain loop, more the more the road winds back and forth.
    public var twist: Double { curvature.reduce(0) { $0 + abs($1) } * spacing / (2 * .pi) }

    /// Separate bends whose tightest point has a radius under `radius`.
    public func corners(tighterThan radius: Double) -> Int {
        let limit = 1 / radius
        // Counted from a point outside any bend, so a bend across the start line counts once.
        let start = curvature.firstIndex { abs($0) <= limit } ?? 0
        var count = 0, inside = false
        for k in 0..<self.count {
            let tight = abs(curvature[(start + k) % self.count]) > limit
            if tight && !inside { count += 1 }
            inside = tight
        }
        return count
    }

    /// The left and right walls, in the order of the centerline.
    public var leftEdge: [Vec2] { (0..<count).map { points[$0] + tangents[$0].perp * halfWidth } }
    public var rightEdge: [Vec2] { (0..<count).map { points[$0] - tangents[$0].perp * halfWidth } }

    public func sector(atS s: Double) -> Int {
        clamp(Int(s / length * Double(Track.sectorCount)), 0, Track.sectorCount - 1)
    }

    /// The centerline point and direction `s` units along the road (wrapping).
    public func pose(atS s: Double) -> (point: Vec2, tangent: Vec2) {
        var s = s.truncatingRemainder(dividingBy: length)
        if s < 0 { s += length }
        let f = s / spacing
        let i = Int(f) % count, j = (i + 1) % count
        let t = f - Double(Int(f))
        return (Vec2.lerp(points[i], points[j], t), Vec2.lerp(tangents[i], tangents[j], t).normalized)
    }

    public func curvature(atS s: Double) -> Double {
        var s = s.truncatingRemainder(dividingBy: length)
        if s < 0 { s += length }
        return curvature[Int(s / spacing) % count]
    }

    /// Projects `p` onto the centerline. With a `hint` (the index from the last projection) only the nearby
    /// segments are searched, which is all a car can reach in a step; without one, all of them.
    public func project(_ p: Vec2, hint: Int? = nil) -> TrackPosition {
        let n = count
        var bestIndex = 0, bestT = 0.0, bestD2 = Double.infinity
        func consider(_ i: Int) {
            let a = points[i], b = points[(i + 1) % n], ab = b - a
            let t = clamp((p - a).dot(ab) / Swift.max(ab.lengthSquared, 1e-9), 0, 1)
            let d2 = (p - (a + ab * t)).lengthSquared
            if d2 < bestD2 { bestD2 = d2; bestIndex = i; bestT = t }
        }
        if let hint {
            for k in -14...14 { consider((hint + k + n) % n) }
        } else {
            for i in 0..<n { consider(i) }
        }
        let a = points[bestIndex], b = points[(bestIndex + 1) % n]
        let dir = (b - a).normalized
        let q = Vec2.lerp(a, b, bestT)
        let side = (p - q).dot(dir.perp) >= 0 ? 1.0 : -1.0
        let tangent = Vec2.lerp(tangents[bestIndex], tangents[(bestIndex + 1) % n], bestT).normalized
        return TrackPosition(index: bestIndex, s: (Double(bestIndex) + bestT) * spacing,
                             offset: side * bestD2.squareRoot(), tangent: tangent)
    }
}
