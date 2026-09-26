import Foundation

/// Turns a seed into a road. A ring of control points at jittered angles and radii is threaded with a centripetal
/// Catmull-Rom spline (no cusps or loops between points), smoothed, scaled to a lap of about half a minute and
/// checked: every bend wide enough to drive, no two stretches of road closer than two widths plus a verge. A seed
/// that fails draws again from the same generator, so the result is still a function of the seed.
public enum TrackGenerator {
    public static let spacing = 5.0
    public static let lengthRange: ClosedRange<Double> = 3300...4500
    /// Tightest centerline radius allowed, beyond the half-width: the inner wall of a hairpin keeps this radius.
    public static let innerRadius = 26.0
    /// Clear ground between the walls of two stretches of road that pass each other.
    public static let verge = 34.0
    /// Roads that turn less than this over a lap (in whole turns) are plain loops, and are drawn again.
    public static let minTwist = 1.45

    public static func make(_ info: TrackInfo) -> Track {
        var rng = SeededRandom(seed: info.seed)
        for _ in 0..<200 {
            if let track = attempt(info, &rng) { return track }
        }
        // Unreachable in practice (every catalog and daily seed is tested); an oval is always valid.
        let oval = (0..<720).map { i -> Vec2 in
            let a = Double(i) / 720 * 2 * .pi
            return Vec2(cos(a) * 700, sin(a) * 420)
        }
        return Track(info: info, centerline: resample(oval, step: spacing), halfWidth: 36, hue: 0.55)
    }

    static func attempt(_ info: TrackInfo, _ rng: inout SeededRandom) -> Track? {
        let n = rng.int(10...15)
        let aspect = rng.double(0.7...1.4)
        let spin = rng.double(0...(2 * .pi))
        var controls: [Vec2] = []
        for i in 0..<n {
            let a = (Double(i) + rng.double(-0.3...0.3)) / Double(n) * 2 * .pi
            // Now and then a point pulled well in: that is where the hairpins and esses come from.
            let r = rng.double(0...1) < 0.3 ? rng.double(0.25...0.5) : rng.double(0.6...1.0)
            controls.append(Vec2(cos(a) * r * aspect, sin(a) * r / aspect).rotated(by: spin))
        }
        var line = spline(controls, samplesPerSegment: 48)
        line = resample(line, step: 0.004)
        for _ in 0..<3 { line = smooth(line) }
        let targetLength = rng.double(lengthRange)
        let scale = targetLength / polylineLength(line)
        line = resample(line.map { $0 * scale }, step: spacing)
        if rng.next() & 1 == 0 { line.reverse() }
        let halfWidth = rng.double(33...40)
        let hue = rng.double(0...1)

        let probe = Track(info: info, centerline: line, halfWidth: halfWidth, hue: hue)
        guard probe.twist >= minTwist, probe.curvature.allSatisfy({ abs($0) <= 1 / (halfWidth + innerRadius) }),
              isClear(line, halfWidth: halfWidth) else { return nil }
        // Start on the straightest stretch, so the line is crossed flat out rather than mid-corner.
        let window = 18, m = line.count
        var best = 0, bestBend = Double.infinity
        for i in 0..<m {
            var bend = 0.0
            for j in 0..<window { bend += abs(probe.curvature[(i + j) % m]) }
            if bend < bestBend { bestBend = bend; best = i }
        }
        let start = (best + window * 2 / 3) % m
        let rotated = Array(line[start...] + line[..<start])
        return Track(info: info, centerline: rotated, halfWidth: halfWidth, hue: hue)
    }

    /// No two points further apart along the road than a hairpin's arc may come closer than two half-widths
    /// and a verge.
    static func isClear(_ line: [Vec2], halfWidth: Double) -> Bool {
        let n = line.count
        let minGap = 2 * halfWidth + verge, minGap2 = minGap * minGap
        let skip = Int((.pi * (halfWidth + innerRadius + verge)) / spacing)
        guard n > 2 * skip else { return false }
        for i in 0..<n {
            let p = line[i]
            var j = i + skip
            while j <= i + n - skip && j < n {
                if (line[j] - p).lengthSquared < minGap2 { return false }
                j += 1
            }
        }
        return true
    }

    /// A closed centripetal Catmull-Rom spline through `controls`.
    static func spline(_ controls: [Vec2], samplesPerSegment: Int) -> [Vec2] {
        let n = controls.count
        var out: [Vec2] = []
        for i in 0..<n {
            let p0 = controls[(i + n - 1) % n], p1 = controls[i], p2 = controls[(i + 1) % n], p3 = controls[(i + 2) % n]
            let t0 = 0.0
            let t1 = t0 + max(p0.distance(to: p1).squareRoot(), 1e-6)
            let t2 = t1 + max(p1.distance(to: p2).squareRoot(), 1e-6)
            let t3 = t2 + max(p2.distance(to: p3).squareRoot(), 1e-6)
            for k in 0..<samplesPerSegment {
                let u = t1 + (t2 - t1) * Double(k) / Double(samplesPerSegment)
                let a1 = p0 * ((t1 - u) / (t1 - t0)) + p1 * ((u - t0) / (t1 - t0))
                let a2 = p1 * ((t2 - u) / (t2 - t1)) + p2 * ((u - t1) / (t2 - t1))
                let a3 = p2 * ((t3 - u) / (t3 - t2)) + p3 * ((u - t2) / (t3 - t2))
                let b1 = a1 * ((t2 - u) / (t2 - t0)) + a2 * ((u - t0) / (t2 - t0))
                let b2 = a2 * ((t3 - u) / (t3 - t1)) + a3 * ((u - t1) / (t3 - t1))
                out.append(b1 * ((t2 - u) / (t2 - t1)) + b2 * ((u - t1) / (t2 - t1)))
            }
        }
        return out
    }

    static func smooth(_ line: [Vec2]) -> [Vec2] {
        let n = line.count
        return (0..<n).map { (i: Int) -> Vec2 in
            let before: Vec2 = line[(i + n - 1) % n], after: Vec2 = line[(i + 1) % n]
            return (before + after + line[i] * 2) * 0.25
        }
    }

    static func polylineLength(_ line: [Vec2]) -> Double {
        var l = 0.0
        for i in 0..<line.count { l += line[i].distance(to: line[(i + 1) % line.count]) }
        return l
    }

    /// Points evenly spaced along the closed polyline, as close to `step` apart as divides the length evenly.
    static func resample(_ line: [Vec2], step: Double) -> [Vec2] {
        let total = polylineLength(line)
        let count = max(8, Int((total / step).rounded()))
        let d = total / Double(count)
        let n = line.count
        var out = [line[0]]
        out.reserveCapacity(count)
        var cur = line[0], i = 0, need = d
        while out.count < count && i < 2 * n {
            let next = line[(i + 1) % n]
            let seg = cur.distance(to: next)
            if seg >= need {
                cur = cur + (next - cur) * (need / seg)
                out.append(cur)
                need = d
            } else {
                need -= seg
                cur = next
                i += 1
            }
        }
        return out
    }
}

/// The tracks on offer: a fixed set of circuits, and one new road a day.
public enum TrackCatalog {
    static let firstNames = ["Midnight", "Neon", "Harbor", "Chrome", "Static", "Afterglow", "Overpass", "Redline",
                             "Sodium", "Tunnel", "Skyline", "Cinder", "Voltage", "Mirage", "Wharf", "Kanjo"]
    static let lastNames = ["Loop", "Pass", "Bends", "Circuit", "Run", "Hairpins", "Sprint", "Switchback", "Esses",
                            "Ring", "Line", "Link"]

    /// Seeds picked from `sideways-sim --scan` for variety, flowing to technical. Changing one changes a road that
    /// people hold records on, so add, never edit.
    static let circuitSeeds: [(seed: UInt64, name: String)] = [
        (86, "Harbor Loop"), (59, "Midnight Sweepers"), (43, "Neon Esses"), (75, "Kanjo Night"),
        (45, "Redline Ridge"), (65, "Sodium Switchback"), (135, "Afterglow Hairpins"), (47, "Chrome Canyon"),
    ]

    public static let circuits: [TrackInfo] = circuitSeeds.enumerated().map { index, circuit in
        TrackInfo(id: "circuit-\(index + 1)", seed: circuit.seed, name: circuit.name, subtitle: "Circuit \(index + 1)")
    }

    public static func name(for seed: UInt64) -> String {
        var rng = SeededRandom(seed: seed ^ 0x5157_4159_5353_5357)
        return rng.pick(firstNames) + " " + rng.pick(lastNames)
    }

    public static func daily(on date: Date, calendar: Calendar = .current) -> TrackInfo {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        let (y, m, d) = (c.year ?? 2026, c.month ?? 1, c.day ?? 1)
        let stamp = String(format: "%04d%02d%02d", y, m, d)
        let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        let seed = UInt64(y * 10_000 + m * 100 + d) &* 0x2545_F491_4F6C_DD1D
        return TrackInfo(id: "daily-" + stamp, seed: seed, name: name(for: seed),
                         subtitle: "Daily · \(d) \(months[clamp(m, 1, 12) - 1])")
    }

    /// The track a stored id names; a past daily comes back as that day's road.
    public static func info(id: String) -> TrackInfo? {
        if let circuit = circuits.first(where: { $0.id == id }) { return circuit }
        guard id.hasPrefix("daily-"), id.count == 14, let stamp = Int(id.dropFirst(6)) else { return nil }
        var c = DateComponents()
        c.year = stamp / 10_000
        c.month = stamp / 100 % 100
        c.day = stamp % 100
        c.hour = 12
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        guard let date = calendar.date(from: c) else { return nil }
        return daily(on: date, calendar: calendar)
    }
}
