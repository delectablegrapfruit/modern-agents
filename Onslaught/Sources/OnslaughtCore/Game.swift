import Foundation

/// A run: bosses one after another until your hull gives out. Hull carries over (a kill patches one point), and
/// after every boss you pick one of three upgrades.
public struct Run: Codable, Equatable, Sendable {
    public var number: Int
    public var seed: Int
    public var wave = 1
    /// Bosses destroyed this run.
    public var cleared = 0
    public var hull = 3
    public var loadout = Loadout()
    public var score = 0
    public var offer: [Mod] = []
    public var over = false

    public init(number: Int, seed: Int) {
        self.number = number
        self.seed = seed
    }
}

/// Everything that outlasts a run: the rank comes from bosses destroyed over all of them, so no break is wasted.
public struct Career: Codable, Equatable, Sendable {
    public var seed: Int
    public var runs = 1
    public var kills = 0
    public var flawless = 0
    public var bestWave = 0
    public var bestScore = 0

    public init(seed: Int) { self.seed = seed }

    public var rank: String { Rank.title(kills: kills) }
    public var nextRank: (kills: Int, title: String)? { Rank.next(kills: kills) }
}

/// The whole save: career, run, and the fight in progress.
public struct Game: Codable, Equatable, Sendable {
    public static let currentVersion = 1

    public enum Stage: String, Codable, Sendable {
        /// A boss is up.
        case fighting
        /// It went down: pick an upgrade.
        case armory
        /// You went down: the run's summary, then a new run.
        case debrief
    }

    public var version = Game.currentVersion
    public var career: Career
    public var run: Run
    public var fight: Fight
    public var stage = Stage.fighting

    public init(seed: Int) {
        career = Career(seed: seed)
        run = Run(number: 1, seed: mixSeed(seed, 1))
        fight = Fight(wave: 1, seed: run.seed, loadout: run.loadout, hull: run.hull)
    }

    /// The run's score so far, counting the fight in progress.
    public var score: Int { run.score + (stage == .fighting ? fight.score : 0) }

    public var autopilot: Bool {
        get { fight.autopilot }
        set { fight.autopilot = newValue }
    }

    public mutating func advance(_ dt: Double) -> [FightEvent] {
        guard stage == .fighting else { return [] }
        let events = fight.step(dt)
        if let outcome = fight.outcome, events.contains(.ended(outcome)) { conclude(outcome) }
        return events
    }

    public mutating func detonate() -> [FightEvent] {
        guard stage == .fighting else { return [] }
        return fight.detonate()
    }

    mutating func conclude(_ outcome: Outcome) {
        run.score += fight.score
        switch outcome {
        case .victory:
            career.kills += 1
            if fight.stats.hitsTaken == 0 { career.flawless += 1 }
            run.cleared += 1
            career.bestWave = max(career.bestWave, fight.wave)
            run.hull = min(run.loadout.maxHull, fight.ship.hull + 1)
            var rng = RNG(seed: mixSeed(run.seed, fight.wave, 0xA2))
            run.offer = Armory.offer(run.loadout, rng: &rng)
            stage = .armory
            if run.offer.isEmpty { choose(nil) }
        case .defeat:
            run.hull = 0
            run.over = true
            career.bestScore = max(career.bestScore, run.score)
            stage = .debrief
        }
    }

    /// Takes an upgrade (or none) and sends in the next boss.
    public mutating func choose(_ mod: Mod?) {
        guard stage == .armory else { return }
        if let mod, run.offer.contains(mod) {
            run.loadout.add(mod)
            if mod == .plating { run.hull = min(run.loadout.maxHull, run.hull + 1) }
        }
        run.offer = []
        run.wave += 1
        let autopilot = fight.autopilot
        fight = Fight(wave: run.wave, seed: run.seed, loadout: run.loadout, hull: run.hull)
        fight.autopilot = autopilot
        stage = .fighting
    }

    /// Starts over at wave 1 with a bare ship. The career keeps everything.
    public mutating func newRun() {
        career.bestScore = max(career.bestScore, run.score)
        career.runs += 1
        run = Run(number: career.runs, seed: mixSeed(career.seed, career.runs))
        let autopilot = fight.autopilot
        fight = Fight(wave: 1, seed: run.seed, loadout: run.loadout, hull: run.hull)
        fight.autopilot = autopilot
        stage = .fighting
    }

    /// Ends the run where it stands, as if shot down.
    public mutating func abandon() {
        guard stage != .debrief else { return }
        if stage == .fighting { run.score += fight.score }
        run.over = true
        run.offer = []
        career.bestScore = max(career.bestScore, run.score)
        stage = .debrief
    }
}
