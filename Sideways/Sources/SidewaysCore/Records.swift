import Foundation

/// A track's bests: the fastest lap (with its ghost), the most points in a lap, and laps driven.
public struct TrackRecord: Codable, Equatable, Sendable {
    public var bestLap: Double?
    public var ghost: Ghost?
    public var bestLapPoints = 0
    public var laps = 0

    public init() {}
}

/// Career rank, from every drift point ever banked. Each rank brings a paint colour.
public struct Rank: Equatable, Sendable {
    public var index: Int
    public var title: String
    public var threshold: Int

    public static let all: [Rank] = [
        ("Rookie", 0), ("Street", 20_000), ("Tuner", 100_000), ("Pro", 400_000),
        ("Ace", 1_500_000), ("Legend", 5_000_000), ("Drift King", 15_000_000),
    ].enumerated().map { Rank(index: $0.offset, title: $0.element.0, threshold: $0.element.1) }

    public static func of(points: Int) -> Rank { all.last { points >= $0.threshold } ?? all[0] }

    public var next: Rank? { index + 1 < Rank.all.count ? Rank.all[index + 1] : nil }

    /// 0…1 of the way from this rank to the next.
    public func progress(points: Int) -> Double {
        guard let next else { return 1 }
        return clamp(Double(points - threshold) / Double(next.threshold - threshold), 0, 1)
    }
}

/// Everything kept between launches: bests per track, the career total, the chosen track, paint and options.
public struct Records: Codable, Equatable, Sendable {
    public var tracks: [String: TrackRecord] = [:]
    public var careerPoints = 0
    public var careerLaps = 0
    public var trackID: String?
    public var paint = 0
    public var showGhost = true
    public var fadeWhenIdle = true
    public var size = 1
    public var seenHelp = false

    public init() {}

    public init(from decoder: Decoder) throws {
        // Every field optional on the way in, so records from an older version load.
        let c = try decoder.container(keyedBy: CodingKeys.self)
        tracks = try c.decodeIfPresent([String: TrackRecord].self, forKey: .tracks) ?? [:]
        careerPoints = try c.decodeIfPresent(Int.self, forKey: .careerPoints) ?? 0
        careerLaps = try c.decodeIfPresent(Int.self, forKey: .careerLaps) ?? 0
        trackID = try c.decodeIfPresent(String.self, forKey: .trackID)
        paint = try c.decodeIfPresent(Int.self, forKey: .paint) ?? 0
        showGhost = try c.decodeIfPresent(Bool.self, forKey: .showGhost) ?? true
        fadeWhenIdle = try c.decodeIfPresent(Bool.self, forKey: .fadeWhenIdle) ?? true
        size = try c.decodeIfPresent(Int.self, forKey: .size) ?? 1
        seenHelp = try c.decodeIfPresent(Bool.self, forKey: .seenHelp) ?? false
    }

    public var rank: Rank { Rank.of(points: careerPoints) }

    public subscript(track id: String) -> TrackRecord {
        get { tracks[id] ?? TrackRecord() }
        set { tracks[id] = newValue }
    }

    /// Files a finished lap; true when it is a new best time for the track.
    @discardableResult
    public mutating func add(_ lap: LapResult, track id: String) -> Bool {
        var record = self[track: id]
        record.laps += 1
        record.bestLapPoints = max(record.bestLapPoints, lap.points)
        let best = record.bestLap.map { lap.time < $0 } ?? true
        if best {
            record.bestLap = lap.time
            record.ghost = lap.ghost
        }
        self[track: id] = record
        careerLaps += 1
        return best
    }

    /// Past dailies other than the last week's are forgotten, so the file does not grow a record a day forever.
    public mutating func pruneDailies(keeping today: String) {
        let dailies = tracks.keys.filter { $0.hasPrefix("daily-") }.sorted()
        for id in dailies.dropLast(7) where id != today { tracks[id] = nil }
    }
}

/// Reads and writes `Records` as JSON, atomically.
public struct RecordStore: Sendable {
    public let url: URL

    public init(url: URL) { self.url = url }

    /// `~/Library/Application Support/Sideways/records.json`.
    public static var standard: RecordStore {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        return RecordStore(url: base.appendingPathComponent("Sideways", isDirectory: true).appendingPathComponent("records.json"))
    }

    public func load() -> Records {
        guard let data = try? Data(contentsOf: url), let records = try? JSONDecoder().decode(Records.self, from: data)
        else { return Records() }
        return records
    }

    public func save(_ records: Records) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(records).write(to: url, options: .atomic)
    }
}

public enum Format {
    /// 83.456 → "1:23.45"; 9.1 → "9.10".
    public static func lap(_ seconds: Double) -> String {
        let hundredths = Int((max(0, seconds) * 100).rounded(.down))
        let m = hundredths / 6000, s = hundredths / 100 % 60, h = hundredths % 100
        let frac = h < 10 ? "0\(h)" : "\(h)"
        if m > 0 { return "\(m):" + (s < 10 ? "0\(s)" : "\(s)") + "." + frac }
        return "\(s).\(frac)"
    }

    /// A gap to the best: "+0.42", "−1.03".
    public static func gap(_ seconds: Double) -> String {
        let hundredths = Int((abs(seconds) * 100).rounded())
        let text = "\(hundredths / 100)." + (hundredths % 100 < 10 ? "0" : "") + "\(hundredths % 100)"
        return (seconds < 0 ? "\u{2212}" : "+") + text
    }

    /// 1234567 → "1,234,567".
    public static func points(_ n: Int) -> String {
        let digits = String(abs(n))
        var out = ""
        for (i, c) in digits.enumerated() {
            if i > 0 && (digits.count - i) % 3 == 0 { out.append(",") }
            out.append(c)
        }
        return n < 0 ? "-" + out : out
    }
}
