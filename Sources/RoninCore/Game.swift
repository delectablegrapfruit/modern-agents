import Foundation

/// Everything that outlasts a stage. Stages come in order; a win moves you on, a fall sends you back into the same
/// stage on a fresh roll. Kills count toward your rank either way.
public struct Career: Codable, Equatable, Sendable {
    public var seed: UInt64
    /// The stage being fought.
    public var stage = 1
    /// Tries at this stage, counting this one.
    public var attempt = 1
    public var cleared = 0
    public var kills = 0
    public var falls = 0
    public var flawless = 0
    public var bestCombo = 0
    public var bestScore = 0
    public var score = 0
    /// Stages won in a row without a fall.
    public var streak = 0

    public init(seed: UInt64) { self.seed = seed }

    public var rank: String { Rank.title(kills: kills) }
    public var nextRank: (kills: Int, title: String)? { Rank.next(kills: kills) }

    public func makeFight() -> Fight {
        Fight(stage: stage, seed: mixSeed(seed, UInt64(stage), UInt64(attempt)))
    }

    /// Books a finished fight. Returns the rank it earned, if it earned one.
    @discardableResult
    public mutating func record(_ fight: Fight) -> String? {
        guard let outcome = fight.outcome else { return nil }
        let before = rank
        kills += fight.stats.kills
        bestCombo = max(bestCombo, fight.stats.bestCombo)
        bestScore = max(bestScore, fight.score)
        score += fight.score
        switch outcome {
        case .victory:
            cleared = max(cleared, fight.stage)
            if fight.stats.damage == 0 { flawless += 1 }
            streak += 1
            stage = fight.stage + 1
            attempt = 1
        case .defeat:
            falls += 1
            streak = 0
            attempt += 1
        }
        return rank != before ? rank : nil
    }
}

/// The save file: the career and the fight in progress, down to the step.
public struct SaveGame: Codable, Equatable, Sendable {
    public static let currentVersion = 1

    public var version = SaveGame.currentVersion
    public var career: Career
    public var fight: Fight

    public init(career: Career, fight: Fight) {
        self.career = career
        self.fight = fight
    }
}
