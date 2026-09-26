import Foundation

/// Everything that outlasts a stage. Stages come in order; a win moves you on, a fall sends you back into the same
/// stage on a fresh roll. Kills count toward your rank either way.
public struct Career: Codable, Equatable, Sendable {
    public var seed: UInt64
    public var mode = Mode.bushido
    /// The stage each mode has reached, and the highest each has cleared (by mode name).
    public var stages: [String: Int] = [:]
    public var highest: [String: Int] = [:]
    /// Tries at this stage, counting this one.
    public var attempt = 1
    public var kills = 0
    public var falls = 0
    public var flawless = 0
    public var bestCombo = 0
    public var bestScore = 0
    public var score = 0
    /// Stages won in a row without a fall.
    public var streak = 0

    public init(seed: UInt64) { self.seed = seed }

    /// The stage being fought, in the current mode.
    public var stage: Int {
        get { stages[mode.rawValue] ?? 1 }
        set { stages[mode.rawValue] = max(1, newValue) }
    }

    /// The highest stage cleared in the current mode.
    public var cleared: Int {
        get { highest[mode.rawValue] ?? 0 }
        set { highest[mode.rawValue] = newValue }
    }

    /// Switches modes. Each keeps its own stage; the next fight is a fresh roll.
    public mutating func choose(_ mode: Mode) {
        guard mode != self.mode else { return }
        self.mode = mode
        attempt = 1
    }

    public var rank: String { Rank.title(kills: kills) }
    public var nextRank: (kills: Int, title: String)? { Rank.next(kills: kills) }

    public func makeFight() -> Fight {
        Fight(stage: stage, seed: mixSeed(seed, UInt64(stage), UInt64(attempt) | UInt64(mode.level) << 32), mode: mode)
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
    public static let currentVersion = 2

    public var version = SaveGame.currentVersion
    public var career: Career
    public var fight: Fight

    public init(career: Career, fight: Fight) {
        self.career = career
        self.fight = fight
    }
}
