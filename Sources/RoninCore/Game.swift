import Foundation

/// A run of endless mode: stages one after another from a chosen start, hearts carried, until the ronin falls.
public struct Endless: Codable, Equatable, Sendable {
    public var start: Int
    public var stage: Int
    public var hearts: Int?
    public var cleared = 0
    public var score = 0
    public var kills = 0

    public init(start: Int) {
        self.start = max(1, start)
        stage = self.start
    }
}

/// Everything that outlasts a stage.
///
/// The campaign goes stage by stage and the ronin's hearts carry from one to the next; one stage in each holds a
/// gourd of medicine for a single heart. Fall, and the campaign starts again from stage 1. Stages reached stay
/// unlocked, and endless mode can start from any of them. Kills count toward your rank either way. Each mode keeps
/// its own campaign.
public struct Career: Codable, Equatable, Sendable {
    public var seed: UInt64
    public var mode = Mode.bushido
    /// By mode: the campaign's stage, the hearts carried into it (nil: full), and the furthest stage reached.
    public var stages: [String: Int] = [:]
    public var hearts: [String: Int] = [:]
    public var reached: [String: Int] = [:]
    public var highest: [String: Int] = [:]
    /// The endless run in progress, if that is what is being played, and the best run in each mode.
    public var endless: Endless?
    public var bestEndless: [String: Int] = [:]
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

    /// The campaign's stage, in the current mode.
    public var stage: Int {
        get { stages[mode.rawValue] ?? 1 }
        set {
            stages[mode.rawValue] = max(1, newValue)
            reached[mode.rawValue] = max(reached[mode.rawValue] ?? 1, max(1, newValue))
        }
    }

    /// The highest stage cleared in the current mode.
    public var cleared: Int {
        get { highest[mode.rawValue] ?? 0 }
        set { highest[mode.rawValue] = newValue }
    }

    /// Stages endless mode may start from: every stage the campaign (or an endless run) has reached.
    public var unlocked: ClosedRange<Int> { 1...max(1, reached[mode.rawValue] ?? 1) }

    /// The hearts carried into the next campaign stage.
    public var carried: Int {
        get { hearts[mode.rawValue] ?? mode.hearts }
        set { hearts[mode.rawValue] = newValue }
    }

    public var isEndless: Bool { endless != nil }

    /// The stage the next fight is: the endless run's, or the campaign's.
    public var current: Int { endless?.stage ?? stage }

    /// Switches modes. Each keeps its own campaign; an endless run is left.
    public mutating func choose(_ mode: Mode) {
        guard mode != self.mode else { return }
        self.mode = mode
        endless = nil
        attempt = 1
    }

    /// Starts an endless run from an unlocked stage.
    public mutating func startEndless(at stage: Int) {
        endless = Endless(start: min(max(1, stage), unlocked.upperBound))
        attempt = 1
    }

    /// Back to the campaign, where it was left.
    public mutating func leaveEndless() {
        endless = nil
        attempt = 1
    }

    public var rank: String { Rank.title(kills: kills) }
    public var nextRank: (kills: Int, title: String)? { Rank.next(kills: kills) }

    public func makeFight() -> Fight {
        let salt = UInt64(attempt) | UInt64(mode.level) << 32 | (isEndless ? 1 << 40 : 0)
        if let endless {
            return Fight(stage: endless.stage, seed: mixSeed(seed, UInt64(endless.stage), salt), mode: mode, hearts: endless.hearts)
        }
        return Fight(stage: stage, seed: mixSeed(seed, UInt64(stage), salt), mode: mode, hearts: hearts[mode.rawValue])
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
        if outcome == .victory, fight.stats.damage == 0 { flawless += 1 }
        let key = mode.rawValue
        highest[key] = max(highest[key] ?? 0, outcome == .victory ? fight.stage : 0)
        reached[key] = max(reached[key] ?? 1, outcome == .victory ? fight.stage + 1 : fight.stage)

        if var run = endless {
            run.kills += fight.stats.kills
            run.score += fight.score
            switch outcome {
            case .victory:
                run.cleared += 1
                run.stage = fight.stage + 1
                run.hearts = fight.hp
                streak += 1
                attempt = 1
                endless = run
            case .defeat:
                // The run is over; the next begins where this one did.
                bestEndless[key] = max(bestEndless[key] ?? 0, run.cleared)
                falls += 1
                streak = 0
                attempt += 1
                endless = Endless(start: run.start)
                lastRun = run
            }
            return rank != before ? rank : nil
        }

        switch outcome {
        case .victory:
            streak += 1
            stage = fight.stage + 1
            hearts[key] = fight.hp
            attempt = 1
        case .defeat:
            // Fall, and the campaign begins again from the first stage, hearts whole.
            falls += 1
            streak = 0
            attempt += 1
            stages[key] = 1
            hearts[key] = nil
        }
        return rank != before ? rank : nil
    }

    /// The endless run that just ended, for its summary.
    public var lastRun: Endless?
}

/// The save file: the career and the fight in progress, down to the step.
public struct SaveGame: Codable, Equatable, Sendable {
    public static let currentVersion = 3

    public var version = SaveGame.currentVersion
    public var career: Career
    public var fight: Fight

    public init(career: Career, fight: Fight) {
        self.career = career
        self.fight = fight
    }
}
