import Foundation

/// How hard a stage is. Stage 1 is spearmen alone; each stage after brings more foes, faster, from a wider cast.
/// Every fifth stage ends with a warlord.
public struct Difficulty: Codable, Equatable, Sendable {
    public var stage: Int
    /// Multiplies every foe's speed.
    public var pace: Double
    /// Multiplies every wind-up: below 1 is quicker.
    public var windup: Double
    /// Mean seconds between arrivals.
    public var interval: Double
    /// The most foes on the lane at once.
    public var crowd: Int
    /// Chance that an arrival brings a second one close behind.
    public var pairs: Double
    public var boss: Bool

    public init(stage: Int) {
        let s = Double(max(1, stage) - 1)
        self.stage = max(1, stage)
        pace = min(1.75, 1 + 0.04 * s)
        windup = max(0.55, 1 - 0.028 * s)
        interval = max(0.34, 1.3 - 0.07 * s)
        crowd = min(10, 3 + (self.stage + 1) / 2)
        pairs = min(0.35, s * 0.03)
        boss = self.stage % 5 == 0
    }

    /// The warlord's cuts: 7 at stage 5, two more every boss after, at most 15.
    public var warlordHP: Int { min(15, Kind.warlord.baseHP + 2 * (stage / 5 - 1)) }

    /// Blade dancers take a third cut from stage 12.
    public var dancerHP: Int { stage >= 12 ? 3 : 2 }

    /// Who comes, in order.
    public func roster(rng: inout SeededRNG) -> [Kind] {
        let count = min(72, 12 + 4 * stage)
        var weights: [(Kind, Double)] = [(.grunt, 1)]
        if stage >= 2 { weights.append((.runner, 0.30 + 0.02 * Double(stage))) }
        if stage >= 3 { weights.append((.brute, min(0.40, 0.16 + 0.012 * Double(stage)))) }
        if stage >= 4 { weights.append((.archer, min(0.30, 0.12 + 0.01 * Double(stage)))) }
        if stage >= 6 { weights.append((.dancer, min(0.45, 0.14 + 0.015 * Double(stage)))) }
        let total = weights.reduce(0) { $0 + $1.1 }
        var roster: [Kind] = []
        // A stage opens with a few spearmen whatever else it holds, and a new kind first shows up alone.
        let opening = min(3, count)
        for _ in 0..<opening { roster.append(.grunt) }
        if let newcomer = Difficulty.introduces(stage), newcomer != .warlord { roster.append(newcomer) }
        while roster.count < count {
            var roll = rng.unit() * total
            var pick = Kind.grunt
            for (kind, weight) in weights {
                roll -= weight
                if roll < 0 { pick = kind; break }
            }
            roster.append(pick)
        }
        if boss { roster.append(.warlord) }
        return roster
    }

    /// The kind a stage brings in for the first time.
    public static func introduces(_ stage: Int) -> Kind? {
        switch stage {
        case 2: return .runner
        case 3: return .brute
        case 4: return .archer
        case 5: return .warlord
        case 6: return .dancer
        default: return nil
        }
    }
}
