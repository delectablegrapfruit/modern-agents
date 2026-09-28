#if os(WASI)
import FoundationEssentials
import WASILibc
#else
import Foundation
#endif

/// A run: stages won one after another, hearts carried, until the ronin falls. The campaign's climbs stage by stage
/// from the first stage after its last fall; an endless run plays the stage it started on over and over, a fresh roll
/// of it each time.
public struct Run: Codable, Equatable, Sendable {
    public var start: Int
    /// The stage the run is on; once it has ended, the stage it fell at. An endless run's is always its `start`.
    public var stage: Int
    /// The hearts carried into `stage` (nil: full), and the shards of a heart.
    public var hearts: Int?
    public var shards = 0
    /// Stages won in the run: in the campaign, the stages it climbed; in an endless run, the times in a row it cleared
    /// its stage.
    public var cleared = 0
    public var score = 0
    public var kills = 0
    public var bestCombo = 0

    public init(start: Int) {
        self.start = max(1, start)
        stage = self.start
    }

    /// Better than `other`: more stages cleared (in an endless run, more clears of its stage in a row), or as many for
    /// more points. A run that cleared nothing sets no record.
    public func beats(_ other: Run?) -> Bool {
        guard cleared > 0 else { return false }
        guard let other else { return true }
        return cleared != other.cleared ? cleared > other.cleared : score > other.score
    }
}

/// An endless run is a run; the name it had before the campaign kept runs too.
public typealias Endless = Run

/// Everything that outlasts a stage.
///
/// The campaign goes stage by stage and the ronin's hearts (and any shards of one) carry from one to the next; every
/// stage holds one gourd of medicine for a single heart, and a man cut down as his blow comes gives a shard. Fall, and
/// the campaign starts again from stage 1: that run is over, and kept if it was the mode's best. Walking away from a
/// fight (Restart Stage, another difficulty, into or out of endless) keeps the hearts it cost and counts its kills, so
/// it is never better than playing on. Stages reached stay unlocked, and an endless run can be played on any of them:
/// the one stage over and over, fresh each time, hearts carried, until the ronin falls. Every foe cut down counts
/// toward your rank. Each mode keeps its own campaign.
///
/// A save must never lose the career: it reads field by field (see `init(from:)`), so a new field needs only a
/// default.
public struct Career: Codable, Equatable, Sendable {
    public var seed: UInt64
    public var mode = Mode.bushido
    /// By mode: the campaign's stage, the hearts carried into it (nil: full) and the shards of a heart, the furthest
    /// stage reached, and the highest stage cleared.
    public var stages: [String: Int] = [:]
    public var hearts: [String: Int] = [:]
    public var shards: [String: Int] = [:]
    public var reached: [String: Int] = [:]
    public var highest: [String: Int] = [:]
    /// The endless run in progress, if that is what is being played, and the most clears in a row an endless run has
    /// made in each mode (on whatever stage).
    public var endless: Run?
    public var bestEndless: [String: Int] = [:]
    /// By mode, the campaign's run since its last fall.
    public var runs: [String: Run] = [:]
    /// The best runs: the campaign's by mode ("bushido"), endless ones by mode and stage ("bushido/10").
    public var bestRuns: [String: Run] = [:]
    /// Tries at this stage in this run, counting this one.
    public var attempt = 1
    /// Foes cut down in all, and by the mode they fell in (a save from before modes were told apart has more in all).
    public var kills = 0
    public var killsByMode: [String: Int] = [:]
    public var falls = 0
    public var flawless = 0
    public var bestCombo = 0
    /// The best score of a single stage, and every finished stage's added up.
    public var bestScore = 0
    public var score = 0
    /// Stages won in a row without a fall.
    public var streak = 0
    /// The run that just ended, for its summary, and whether it set its record (strictly: a tie does not).
    public var lastRun: Run?
    public var lastRunIsBest = false

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

    /// Stages an endless run may be played on: every stage reached (the campaign's, or the next after one won).
    public var unlocked: ClosedRange<Int> { 1...max(1, reached[mode.rawValue] ?? 1) }

    /// The hearts carried into the next campaign stage.
    public var carried: Int {
        get { hearts[mode.rawValue] ?? mode.hearts }
        set { hearts[mode.rawValue] = newValue }
    }

    /// The shards of a heart carried into the next campaign stage.
    public var carriedShards: Int {
        get { shards[mode.rawValue] ?? 0 }
        set { shards[mode.rawValue] = newValue == 0 ? nil : newValue }
    }

    public var isEndless: Bool { endless != nil }

    /// The stage the next fight is: the endless run's, or the campaign's.
    public var current: Int { endless?.stage ?? stage }

    /// The run in progress: the endless run, or the campaign's since its last fall (from where it stands, for a
    /// campaign older than runs).
    public var run: Run { endless ?? runs[mode.rawValue] ?? Run(start: stage) }

    /// The campaign's best run in this mode.
    public var bestCampaignRun: Run? { bestRuns[mode.rawValue] }

    /// The best endless run on a stage (its most clears in a row), in this mode.
    public func bestRun(from start: Int) -> Run? { bestRuns[mode.rawValue + "/\(start)"] }

    /// Switches modes. Each keeps its own campaign; an endless run is left, and kept if it was a record.
    public mutating func choose(_ mode: Mode) {
        guard mode != self.mode else { return }
        leaveRun()
        self.mode = mode
        attempt = 1
    }

    /// Starts an endless run on an unlocked stage. A run already going is left, and kept if it was a record.
    public mutating func startEndless(at stage: Int) {
        leaveRun()
        endless = Run(start: min(max(1, stage), unlocked.upperBound))
        attempt = 1
    }

    /// Back to the campaign, where it was left. The endless run is kept if it was a record.
    public mutating func leaveEndless() {
        leaveRun()
        attempt = 1
    }

    /// Kills, weighed by the mode they were made in: what the rank counts.
    public var merit: Int { Rank.merit(kills: kills, byMode: killsByMode) }
    public var rank: String { Rank.title(kills: merit) }
    public var nextRank: (kills: Int, title: String)? { Rank.next(kills: merit) }

    /// The fight at the next stage. The career, the stage, the try at it, the mode, the kind of run and how many
    /// runs have ended in a fall name the roll, with the kills so far mixed in: a new run meets every stage afresh, and
    /// an endless run (with its clears mixed in too) meets its stage afresh each time.
    public func makeFight() -> Fight {
        let fallen = UInt64(truncatingIfNeeded: falls) << 41
        let salt = UInt64(truncatingIfNeeded: attempt) & 0xFFFF_FFFF | UInt64(mode.level) << 32 | (isEndless ? 1 << 40 : 0) | fallen
        let base = mixSeed(seed, UInt64(truncatingIfNeeded: kills))
        if let endless {
            let roll = mixSeed(mixSeed(base, UInt64(endless.stage), salt), UInt64(truncatingIfNeeded: endless.cleared))
            return Fight(stage: endless.stage, seed: roll, mode: mode, hearts: endless.hearts, shards: endless.shards)
        }
        return Fight(stage: stage, seed: mixSeed(base, UInt64(stage), salt), mode: mode, hearts: hearts[mode.rawValue],
                     shards: carriedShards)
    }

    /// Books a finished fight. Returns the rank it earned, if it earned one.
    @discardableResult
    public mutating func record(_ fight: Fight) -> String? {
        guard let outcome = fight.outcome else { return nil }
        let before = rank
        tally(fight)
        bestScore = max(bestScore, fight.score)
        score += fight.score
        if outcome == .victory, fight.stats.damage == 0 { flawless += 1 }
        let key = mode.rawValue
        highest[key] = max(highest[key] ?? 0, outcome == .victory ? fight.stage : 0)
        reached[key] = max(reached[key] ?? 1, outcome == .victory ? fight.stage + 1 : fight.stage)
        lastRunIsBest = false

        let inEndless = endless != nil
        var run = endless ?? runs[key] ?? Run(start: fight.stage)
        run.kills += fight.stats.kills
        run.score += fight.score
        run.bestCombo = max(run.bestCombo, fight.stats.bestCombo)
        switch outcome {
        case .victory:
            streak += 1
            attempt = 1
            run.cleared += 1
            run.hearts = fight.hp
            run.shards = fight.shards
            if inEndless {
                // The same stage again, rolled afresh.
                run.stage = fight.stage
                endless = run
            } else {
                run.stage = fight.stage + 1
                stage = fight.stage + 1
                hearts[key] = fight.hp
                carriedShards = fight.shards
                runs[key] = run
            }
        case .defeat:
            falls += 1
            streak = 0
            attempt += 1
            run.stage = fight.stage
            if inEndless {
                // The run is over; the next begins where this one did.
                endless = Run(start: run.start)
            } else {
                // Fall, and the campaign begins again from the first stage, hearts whole (and no shards).
                stages[key] = 1
                hearts[key] = nil
                shards[key] = nil
                runs[key] = nil
            }
            lastRunIsBest = close(run, endless: inEndless)
            lastRun = run
        }
        return rank != before ? rank : nil
    }

    /// Books a fight walked away from before it ended (Restart Stage, another difficulty, an endless run started or
    /// left). Its kills count toward rank, and the hearts it cost stay lost: the campaign, or the endless run, goes on
    /// with no more than the fight had left, hearts and shards counted together (a gourd drunk in it, or a heart or
    /// shards made in it, are lost too). A fight that has ended was booked by `record(_:)`, so this leaves it alone.
    /// Returns the rank it earned, if it earned one.
    @discardableResult
    public mutating func abandon(_ fight: Fight) -> String? {
        guard fight.outcome == nil, fight.mode == mode, fight.stage == current else { return nil }
        let before = rank
        tally(fight)
        func less(_ hearts: Int, _ shards: Int) -> Bool {
            fight.hp * Tuning.shardsPerHeart + fight.shards < hearts * Tuning.shardsPerHeart + shards
        }
        if var run = endless {
            if less(run.hearts ?? fight.maxHP, run.shards) {
                run.hearts = fight.hp
                run.shards = fight.shards
            }
            endless = run
        } else if less(carried, carriedShards) {
            hearts[mode.rawValue] = fight.hp
            carriedShards = fight.shards
        }
        return rank != before ? rank : nil
    }

    /// What any fight adds to the career however it ends: its kills and its best combo.
    private mutating func tally(_ fight: Fight) {
        kills += fight.stats.kills
        killsByMode[fight.mode.rawValue, default: 0] += fight.stats.kills
        bestCombo = max(bestCombo, fight.stats.bestCombo)
    }

    /// Leaves the endless run in progress, if there is one, keeping its record.
    private mutating func leaveRun() {
        if let run = endless { close(run, endless: true) }
        endless = nil
    }

    /// Books a run that has ended or been left: the most stages a run has cleared in the mode, and the record for its
    /// kind of run. Returns whether it set that record.
    @discardableResult
    private mutating func close(_ run: Run, endless: Bool) -> Bool {
        let key = mode.rawValue
        if endless, run.cleared > 0 { bestEndless[key] = max(bestEndless[key] ?? 0, run.cleared) }
        let slot = endless ? key + "/\(run.start)" : key
        guard run.beats(bestRuns[slot]) else { return false }
        bestRuns[slot] = run
        return true
    }
}

/// The save file: the career and the fight in progress, down to the step.
///
/// The career outlasts every update: it reads field by field, and a field it lacks (an older save) or cannot read
/// takes its default, so a new career field needs only a default, never a new version. Bump `currentVersion` when
/// what a saved fight means changes: a save of another version keeps its career and rolls its stage afresh, as does
/// one whose fight no longer reads.
public struct SaveGame: Codable, Equatable, Sendable {
    public static let currentVersion = 3

    public var version = SaveGame.currentVersion
    public var career: Career
    public var fight: Fight

    public init(career: Career, fight: Fight) {
        self.career = career
        self.fight = fight
    }

    /// Reads a save file: the fight in progress if it still reads, else a fresh roll of the career's stage at the
    /// hearts carried. Nil only when not even the career can be read.
    public static func load(_ data: Data) -> SaveGame? {
        struct Header: Decodable {
            var version: Int?
            var career: Career
        }
        struct Saved: Decodable { var fight: Fight }
        let decoder = JSONDecoder()
        guard let header = try? decoder.decode(Header.self, from: data) else { return nil }
        if header.version == currentVersion, let saved = try? decoder.decode(Saved.self, from: data) {
            return SaveGame(career: header.career, fight: saved.fight)
        }
        return SaveGame(career: header.career, fight: header.career.makeFight())
    }
}

extension KeyedDecodingContainer {
    /// A saved value, or the fallback when the save has none (it is older) or one this build cannot read.
    func saved<T: Decodable>(_ key: Key, or fallback: T) -> T {
        (try? decodeIfPresent(T.self, forKey: key)) ?? fallback
    }
}

extension Run {
    /// Only the start is required.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(start: try c.decode(Int.self, forKey: .start))
        stage = max(1, c.saved(.stage, or: start))
        hearts = c.saved(.hearts, or: nil)
        shards = c.saved(.shards, or: 0)
        cleared = c.saved(.cleared, or: 0)
        score = c.saved(.score, or: 0)
        kills = c.saved(.kills, or: 0)
        bestCombo = c.saved(.bestCombo, or: 0)
    }
}

extension Career {
    /// Only the seed is required: every other field an older save lacks, or this build cannot read, takes its
    /// default, so no update ever costs the career. Every stored field must be read here (a test checks it).
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(seed: try c.decode(UInt64.self, forKey: .seed))
        mode = c.saved(.mode, or: .bushido)
        stages = c.saved(.stages, or: [:])
        hearts = c.saved(.hearts, or: [:])
        shards = c.saved(.shards, or: [:])
        reached = c.saved(.reached, or: [:])
        highest = c.saved(.highest, or: [:])
        endless = c.saved(.endless, or: nil)
        bestEndless = c.saved(.bestEndless, or: [:])
        runs = c.saved(.runs, or: [:])
        bestRuns = c.saved(.bestRuns, or: [:])
        attempt = c.saved(.attempt, or: 1)
        kills = c.saved(.kills, or: 0)
        killsByMode = c.saved(.killsByMode, or: [:])
        falls = c.saved(.falls, or: 0)
        flawless = c.saved(.flawless, or: 0)
        bestCombo = c.saved(.bestCombo, or: 0)
        bestScore = c.saved(.bestScore, or: 0)
        score = c.saved(.score, or: 0)
        streak = c.saved(.streak, or: 0)
        lastRun = c.saved(.lastRun, or: nil)
        lastRunIsBest = c.saved(.lastRunIsBest, or: false)
        // An endless run saved when they climbed stage by stage, and has climbed: it is booked as it stands (a record
        // from its start if it is one), and play goes on as a run on the stage it had reached, with its hearts, so the
        // fight in progress is still its.
        if let run = endless, run.stage != run.start {
            close(run, endless: true)
            var going = Run(start: run.stage)
            going.hearts = run.hearts
            going.shards = run.shards
            endless = going
        }
        // A campaign from before the frontier was kept has reached at least its stage and the stage after its best.
        for key in Set(stages.keys).union(highest.keys) where reached[key] == nil {
            reached[key] = max(stages[key] ?? 1, (highest[key] ?? 0) + 1)
        }
    }
}
