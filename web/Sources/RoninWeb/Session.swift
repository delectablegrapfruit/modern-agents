#if os(WASI)
import FoundationEssentials
#else
import Foundation
#endif
import RoninCore

/// The career and the fight in progress: the app's `GameSession` (Sources/Ronin/Session.swift), action for action,
/// with the save left to the page (`saveJSON`, when `saveDue` says the app would have saved).
struct WebSession {
    var career: Career
    var fight: Fight
    /// The rank the last finished fight earned, if it earned one.
    var promotion: String?
    /// The crowd rules the fight is played under (the app's `Settings.crowding`): the game's unless changed.
    var rules = Crowding.standard
    /// Seconds played since the last save, and whether the app would have saved by now.
    var unsaved = 0.0
    var saveDue = false

    init(seed: UInt64?) {
        let career = Career(seed: seed ?? WebSession.randomSeed())
        self.career = career
        fight = career.makeFight()
    }

    init(save: SaveGame) {
        career = save.career
        fight = save.fight
    }

    static func randomSeed() -> UInt64 { UInt64.random(in: 1...UInt64.max) }

    var autopilot: Bool {
        get { fight.autopilot }
        set { fight.autopilot = newValue }
    }

    /// The run's score so far: every stage of it, this one included. After a fall, the run that just ended.
    var runScore: Int {
        switch fight.outcome {
        case nil:
            return career.run.score + fight.score
        case .victory?:
            return max(career.run.score, fight.score)
        case .defeat?:
            guard let run = career.lastRun, run.stage == fight.stage, run.score >= fight.score else { return fight.score }
            return run.score
        }
    }

    /// Runs the fight forward under the rules chosen. A fight that ends is booked on the spot.
    mutating func advance(_ dt: Double) -> [FightEvent] {
        fight.crowding = rules
        let events = fight.step(dt)
        unsaved += max(0, dt)
        conclude(events)
        if unsaved > 10 { saveDue = true }
        return events
    }

    mutating func strike(_ side: Side) -> [FightEvent] {
        fight.crowding = rules
        let events = fight.strike(side)
        conclude(events)
        return events
    }

    private mutating func conclude(_ events: [FightEvent]) {
        guard fight.outcome != nil, events.contains(where: { if case .ended = $0 { return true } else { return false } }) else { return }
        promotion = career.record(fight)
        saveDue = true
    }

    /// The next fight: the next stage after a win, stage 1 after a fall (in an endless run, its stage afresh either way).
    mutating func next() {
        promotion = nil
        let autopilot = fight.autopilot
        fight = career.makeFight()
        fight.autopilot = autopilot
        saveDue = true
    }

    /// Walks away from this fight for a fresh roll of the same stage (hearts lost stay lost, kills count). A finished
    /// fight goes on, as its card does.
    mutating func restart() {
        if fight.outcome == nil {
            career.abandon(fight)
            career.attempt += 1
        }
        next()
    }

    /// Switches the difficulty, to the mode's own campaign.
    mutating func choose(_ mode: Mode) {
        guard mode != career.mode else { return }
        career.abandon(fight)
        career.choose(mode)
        next()
    }

    /// A new career (the mode kept), with a new seed unless one is given.
    mutating func reset(seed: UInt64? = nil) {
        let mode = career.mode
        career = Career(seed: seed ?? WebSession.randomSeed())
        career.choose(mode)
        next()
    }

    /// Starts an endless run on an unlocked stage. The fight in progress is left as a restart leaves it.
    mutating func startEndless(at stage: Int) {
        career.abandon(fight)
        career.startEndless(at: stage)
        next()
    }

    /// Back to the campaign, where it was left.
    mutating func leaveEndless() {
        guard career.isEndless else { return }
        career.abandon(fight)
        career.leaveEndless()
        next()
    }

    /// Jumps the career to a stage (the app's self-test and development use). The campaign's run starts there.
    mutating func jump(to stage: Int) {
        career.stage = max(1, stage)
        career.runs[career.mode.rawValue] = nil
        career.attempt = 1
        next()
    }

    /// For testing: a brute at his striking distance on `side`, his club raised and glaring (the app's self-test).
    @discardableResult
    mutating func raiseBruteClub(on side: Side) -> Int {
        let id = fight.place(.brute, at: side.sign * Kind.brute.range)
        fight.roster.insert(.brute, at: fight.arrived)
        if let bearer = fight.bearerIndex, bearer >= fight.arrived { fight.bearerIndex = bearer + 1 }
        fight.arrived += 1
        if let i = fight.foes.firstIndex(where: { $0.id == id }) {
            fight.foes[i].phase = .windup
            fight.foes[i].span = fight.foes[i].windup
            fight.foes[i].timer = Tuning.parryWindow * 0.8
        }
        return id
    }

    /// For testing: the warlord's guard set before him now (the app's self-test).
    mutating func setWarlordGuard() {
        guard let i = fight.foes.firstIndex(where: { $0.kind == .warlord }) else { return }
        fight.foes[i].phase = .guarding
        fight.foes[i].span = Tuning.guardRise + 0.6
        fight.foes[i].timer = 0.6
    }

    /// The save file's JSON: exactly what the app's `Store` writes.
    mutating func saveJSON() -> String {
        unsaved = 0
        saveDue = false
        let encoder = JSONEncoder()
        guard let data = try? encoder.encode(SaveGame(career: career, fight: fight)) else { return "" }
        return String(decoding: data, as: UTF8.self)
    }
}
