import Foundation

/// A lap as a translucent car to race: the pose twenty times a second, and how far along the road it was, which
/// gives the live gap to it at any point of the lap. Stored as packed little-endian floats, about 13 KB a lap.
public struct Ghost: Codable, Equatable, Sendable {
    public static let interval = 0.05

    public var lapTime: Double
    public var x: [Float] = []
    public var y: [Float] = []
    public var heading: [Float] = []
    /// Arc length from the line at each sample.
    public var s: [Float] = []

    public init(lapTime: Double = 0) { self.lapTime = lapTime }

    enum CodingKeys: String, CodingKey { case lapTime, samples }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        lapTime = try c.decode(Double.self, forKey: .lapTime)
        let data = try c.decode(Data.self, forKey: .samples)
        let floats: [Float] = data.withUnsafeBytes { raw in
            (0..<(raw.count / 4)).map { Float(bitPattern: UInt32(littleEndian: raw.loadUnaligned(fromByteOffset: $0 * 4, as: UInt32.self))) }
        }
        let n = floats.count / 4
        for i in 0..<n {
            x.append(floats[i * 4])
            y.append(floats[i * 4 + 1])
            heading.append(floats[i * 4 + 2])
            s.append(floats[i * 4 + 3])
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(lapTime, forKey: .lapTime)
        var data = Data(capacity: count * 16)
        for i in 0..<count {
            for f in [x[i], y[i], heading[i], s[i]] {
                withUnsafeBytes(of: f.bitPattern.littleEndian) { data.append(contentsOf: $0) }
            }
        }
        try c.encode(data, forKey: .samples)
    }

    public var count: Int { x.count }

    mutating func append(_ car: Car, s along: Double) {
        x.append(Float(car.position.x))
        y.append(Float(car.position.y))
        heading.append(Float(car.heading))
        s.append(Float(along))
    }

    /// Where the ghost was `t` seconds into its lap; nil once it has finished.
    public func pose(at t: Double) -> (position: Vec2, heading: Double)? {
        guard count > 1, t >= 0 else { return nil }
        let f = t / Ghost.interval
        let i = Int(f)
        guard i + 1 < count else { return nil }
        let k = f - Double(i)
        let p = Vec2.lerp(Vec2(Double(x[i]), Double(y[i])), Vec2(Double(x[i + 1]), Double(y[i + 1])), k)
        let h0 = Double(heading[i]), h1 = Double(heading[i + 1])
        return (p, h0 + wrapAngle(h1 - h0) * k)
    }

    /// How many seconds into its lap the ghost first got `along` units down the road.
    public func time(atS along: Double) -> Double? {
        guard count > 1, along >= 0 else { return nil }
        let target = Float(along)
        var lo = 0, hi = count - 1
        guard s[hi] >= target else { return nil }
        while lo < hi {
            let mid = (lo + hi) / 2
            if s[mid] < target { lo = mid + 1 } else { hi = mid }
        }
        guard lo > 0 else { return 0 }
        let a = s[lo - 1], b = s[lo]
        let k = b > a ? Double((target - a) / (b - a)) : 0
        return (Double(lo - 1) + clamp(k, 0, 1)) * Ghost.interval
    }
}

struct GhostRecorder {
    private(set) var ghost = Ghost()
    private var next = 0.0

    mutating func record(t: Double, car: Car, s: Double) {
        while t >= next {
            ghost.append(car, s: s)
            next += Ghost.interval
        }
    }
}
