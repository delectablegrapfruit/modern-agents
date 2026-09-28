import Foundation
import XCTest
@testable import RoninCore

/// The career and its saves: what outlasts a stage, and what outlasts an update.
final class CareerTests: XCTestCase {
    /// A save written by the build before the gourd-bearer learned to hover (2f9a3b9), in the middle of Bushidō's
    /// stage 7. Its foes lack fields this build keeps.
    static let oldSave = #"""
        {"career":{"attempt":1,"bestCombo":0,"bestEndless":{},"bestScore":9999,"falls":0,"flawless":0,
        "hearts":{"bushido":3},"highest":{},"kills":1234,"mode":"bushido","reached":{"bushido":7},"score":0,"seed":42,
        "stages":{"bushido":7},"streak":0},"fight":{"accumulator":1.384309333829492e-15,"arrived":5,"arrows":[],
        "bearerIndex":21,"bonus":0,"combo":3,"cooldown":0,"defeated":3,"difficulty":{"boss":false,"crowd":7,
        "interval":0.88,"mode":"bushido","pace":1.24,"pairs":0.18,"stage":7,"windup":0.832},"facing":-1,
        "foes":[{"bearer":false,"chained":false,"guardRest":0,"hits":0,"hp":1,"id":4,"kind":"grunt","leapFrom":0,
        "leapTo":0,"maxHP":1,"phase":"advancing","span":0,"speed":0.3995774281992145,"summons":0,"timer":0,
        "windup":0.51584,"x":0.48063385770117584},{"bearer":false,"chained":false,"guardRest":0,"hits":0,"hp":3,"id":5,
        "kind":"brute","leapFrom":0,"leapTo":0,"maxHP":3,"phase":"advancing","span":0,"speed":0.2373592362927918,
        "summons":0,"timer":0,"windup":0.7155199999999999,"x":0.9890122927544274}],"healed":false,"hp":3,"maxHP":5,
        "mode":"bushido","nextID":6,"pilot":{"queue":[],"rate":60,"reaction":0,"ready":5.816666666666745,
        "rng":{"state":727774},"slips":0},"rng":{"state":14642984654715713570},"roster":["grunt","grunt","grunt",
        "grunt","brute","runner","grunt","grunt","brute","grunt","grunt","grunt","grunt","dancer","grunt","grunt",
        "grunt","grunt","archer","brute","archer","runner","grunt","dancer","dancer","runner","dancer","runner","grunt",
        "brute","runner","archer","dancer","grunt","grunt","runner","grunt","grunt","grunt","grunt"],"score":300,
        "seed":17484311787514059616,"spawnTimer":0.6224611041732079,"stage":7,"stats":{"arrowKills":0,"bestCombo":3,
        "cuts":3,"damage":0,"deflects":0,"kills":3,"parried":0,"whiffs":0,"wounds":0},"stumble":0,
        "time":6.2500000000001},"version":3}
        """#

    // MARK: Saves

    func testAnOldSaveKeepsItsCareerAndRollsItsStageAfresh() throws {
        let data = Data(CareerTests.oldSave.utf8)
        let save = try XCTUnwrap(SaveGame.load(data), "the career must survive")
        XCTAssertEqual(save.career.kills, 1234)
        XCTAssertEqual(save.career.stage, 7)
        XCTAssertEqual(save.career.carried, 3)
        XCTAssertEqual(save.career.bestScore, 9999)
        XCTAssertEqual(save.career.unlocked, 1...7)
        XCTAssertEqual(save.fight.stage, 7)
        XCTAssertEqual(save.fight.mode, .bushido)
        XCTAssertEqual(save.fight.hp, 3)
        XCTAssertNil(save.fight.outcome)
        if (try? JSONDecoder().decode(SaveGame.self, from: data)) == nil {
            XCTAssertEqual(save.fight, save.career.makeFight(), "a fight that no longer reads is rolled afresh")
        }
    }

    func testASaveOfThisVersionResumesExactly() throws {
        var fight = Fight(stage: 9, seed: 12)
        fight.pilot = .human(seed: 1)
        _ = fight.step(12.34)
        let save = SaveGame(career: full(), fight: fight)
        let loaded = try XCTUnwrap(SaveGame.load(JSONEncoder().encode(save)))
        XCTAssertEqual(loaded, save)
    }

    func testASaveOfAnotherVersionKeepsItsCareerAndRollsItsStageAfresh() throws {
        var fight = Fight(stage: 4, seed: 3)
        fight.pilot = .human(seed: 2)
        _ = fight.step(8)
        let career = full()
        for version in [SaveGame.currentVersion - 1, SaveGame.currentVersion + 1] {
            var save = SaveGame(career: career, fight: fight)
            save.version = version
            let loaded = try XCTUnwrap(SaveGame.load(JSONEncoder().encode(save)))
            XCTAssertEqual(loaded.career, career)
            XCTAssertEqual(loaded.fight, career.makeFight())
            XCTAssertEqual(loaded.version, SaveGame.currentVersion)
        }
    }

    func testOnlyASaveWithoutACareerIsRefused() throws {
        XCTAssertNil(SaveGame.load(Data("not a save".utf8)))
        XCTAssertNil(SaveGame.load(Data()))
        XCTAssertNil(SaveGame.load(Data(#"{"version":3,"career":{}}"#.utf8)), "a career needs its seed")
        let bare = try XCTUnwrap(SaveGame.load(Data(#"{"career":{"seed":8}}"#.utf8)))
        XCTAssertEqual(bare.career, Career(seed: 8))
        XCTAssertEqual(bare.fight, Career(seed: 8).makeFight())
    }

    func testACareerMissingAnyFieldStillReads() throws {
        let career = full()
        guard case .object(let saved) = try json(career), case .object(let blank) = try json(Career(seed: 7)) else {
            return XCTFail("a career is an object")
        }
        for key in saved.keys where key != "seed" {
            var older = saved
            older[key] = nil
            let read = try JSONDecoder().decode(Career.self, from: JSONEncoder().encode(JSON.object(older)))
            guard case .object(let back) = try json(read) else { return XCTFail() }
            for other in saved.keys where other != key {
                XCTAssertEqual(back[other], saved[other], "\(other) was lost when \(key) was missing")
            }
            if key == "reached" {
                XCTAssertEqual(read.reached, ["shura": 6, "bushido": 12], "the frontier is worked out from the stages")
            } else {
                XCTAssertEqual(back[key], blank[key], "\(key) takes its default")
            }
        }
    }

    func testEveryCareerFieldIsReadBack() throws {
        // Every stored field set away from its default, so a field `init(from:)` forgets fails the round trip.
        let career = full()
        guard case .object(let saved) = try json(career), case .object(let blank) = try json(Career(seed: career.seed)) else {
            return XCTFail("a career is an object")
        }
        for child in Mirror(reflecting: career).children {
            guard let label = child.label, label != "seed" else { continue }
            XCTAssertNotEqual(saved[label], blank[label], "set \(label) in full() so its round trip is checked")
        }
        let run = try XCTUnwrap(career.endless)
        guard case .object(let runSaved) = try json(run), case .object(let runBlank) = try json(Run(start: 1)) else {
            return XCTFail("a run is an object")
        }
        for child in Mirror(reflecting: run).children {
            guard let label = child.label else { continue }
            XCTAssertNotEqual(runSaved[label], runBlank[label], "set \(label) in full() so its round trip is checked")
        }
        XCTAssertEqual(try JSONDecoder().decode(Career.self, from: JSONEncoder().encode(career)), career)
        let bare = try JSONDecoder().decode(Run.self, from: Data(#"{"start":4}"#.utf8))
        XCTAssertEqual(bare, Run(start: 4))
    }

    func testAnOldCareerHasItsFrontierWorkedOut() throws {
        let career = try JSONDecoder().decode(Career.self, from: Data(#"{"seed":5,"stages":{"bushido":4},"highest":{"bushido":6}}"#.utf8))
        XCTAssertEqual(career.stage, 4)
        XCTAssertEqual(career.unlocked, 1...7)
        let unknown = try JSONDecoder().decode(Career.self, from: Data(#"{"seed":5,"mode":"kami","kills":"many"}"#.utf8))
        XCTAssertEqual(unknown, Career(seed: 5), "what this build cannot read takes its default")
    }

    func testAnEndlessRunThatClimbedStagesBeforeGoesOnWhereItIs() throws {
        // Saved when endless runs climbed: started at 3, now on stage 5 with two cleared and two hearts. It is booked as
        // it stands (a record from stage 3), and play goes on as a run on stage 5, hearts kept, the fight in progress
        // still its own.
        let json = #"""
            {"seed":5,"mode":"bushido","reached":{"bushido":6},"stages":{"bushido":4},
             "endless":{"start":3,"stage":5,"hearts":2,"shards":1,"cleared":2,"score":900,"kills":40,"bestCombo":12}}
            """#
        let career = try JSONDecoder().decode(Career.self, from: Data(json.utf8))
        let run = try XCTUnwrap(career.endless)
        XCTAssertEqual(run.start, 5)
        XCTAssertEqual(run.stage, 5)
        XCTAssertEqual(run.hearts, 2)
        XCTAssertEqual(run.shards, 1)
        XCTAssertEqual(run.cleared, 0)
        XCTAssertEqual(career.bestRun(from: 3)?.cleared, 2, "the run as it stood, kept as the best from its start")
        XCTAssertEqual(career.bestEndless["bushido"], 2)
        let fight = career.makeFight()
        XCTAssertEqual(fight.stage, 5)
        XCTAssertEqual(fight.hp, 2)
        var going = career
        XCTAssertNil(going.abandon(fight), "the fight in progress is the run's")
        // Read again, it is as it was: a run on its own stage is left alone.
        XCTAssertEqual(try JSONDecoder().decode(Career.self, from: JSONEncoder().encode(career)), career)
    }

    // MARK: Walking away

    func testWalkingAwayKeepsTheWoundsAndCountsTheKills() {
        var career = Career(seed: 7)
        var fight = career.makeFight()
        fight.pilot = .perfect
        while fight.stats.kills < 2, fight.outcome == nil { _ = fight.step(0.05) }
        fight.pilot = nil
        while fight.hp == Mode.bushido.hearts, fight.outcome == nil { _ = fight.step(0.05) }
        XCTAssertNil(fight.outcome)
        XCTAssertLessThan(fight.hp, Mode.bushido.hearts)

        // Restart Stage: a fresh roll of the same stage, at the hearts he has left.
        XCTAssertNil(career.abandon(fight))
        career.attempt += 1
        XCTAssertEqual(career.kills, fight.stats.kills, "a fight walked away from still counts its kills")
        XCTAssertEqual(career.bestCombo, fight.stats.bestCombo)
        XCTAssertEqual(career.stage, 1)
        XCTAssertEqual(career.falls, 0)
        XCTAssertEqual(career.score, 0, "only a finished stage scores")
        let again = career.makeFight()
        XCTAssertEqual(again.hp, fight.hp, "walking away never heals")
        XCTAssertNotEqual(again.seed, fight.seed)

        // Another difficulty and back.
        career.abandon(again)
        career.choose(.shoshin)
        let easy = career.makeFight()
        XCTAssertEqual(easy.hp, Mode.shoshin.hearts)
        career.abandon(easy)
        career.choose(.bushido)
        XCTAssertEqual(career.makeFight().hp, fight.hp)

        // A gourd drunk and then walked away from is lost too.
        var healed = career.makeFight()
        healed.hp = Mode.bushido.hearts
        career.abandon(healed)
        XCTAssertEqual(career.carried, fight.hp)

        // An endless run keeps its wounds from one try to the next.
        career.startEndless(at: 1)
        var run = career.makeFight()
        XCTAssertEqual(run.hp, Mode.bushido.hearts)
        while run.hp == Mode.bushido.hearts, run.outcome == nil { _ = run.step(0.05) }
        career.abandon(run)
        career.attempt += 1
        XCTAssertEqual(career.endless?.hearts, run.hp)
        XCTAssertEqual(career.makeFight().hp, run.hp)
        career.leaveEndless()
        XCTAssertEqual(career.makeFight().hp, fight.hp, "the campaign kept its own hearts")
    }

    func testAFinishedFightIsNotBookedTwice() {
        var career = Career(seed: 3)
        var fight = career.makeFight()
        fight.pilot = .perfect
        while fight.outcome == nil { _ = fight.step(0.1) }
        career.record(fight)
        let booked = career
        XCTAssertNil(career.abandon(fight))
        XCTAssertEqual(career, booked)
        var stale = Fight(stage: 9, seed: 1)
        _ = stale.step(3)
        career.abandon(stale)
        XCTAssertEqual(career, booked, "a fight that is not the career's is not its to book")
    }

    func testLeavingAnEndlessRunKeepsItsRecord() {
        var career = Career(seed: 5)
        career.startEndless(at: 1)
        play(&career, win: true)
        play(&career, win: true)
        career.leaveEndless()
        XCTAssertEqual(career.bestEndless[Mode.bushido.rawValue], 2)
        XCTAssertEqual(career.bestRun(from: 1)?.cleared, 2)
        XCTAssertNil(career.endless)

        career.startEndless(at: 1)
        play(&career, win: true)
        career.startEndless(at: 1)
        XCTAssertEqual(career.bestEndless[Mode.bushido.rawValue], 2, "a shorter run left does not lower the record")
        XCTAssertEqual(career.bestRun(from: 1)?.cleared, 2)

        for _ in 0..<3 { play(&career, win: true) }
        career.choose(.oni)
        XCTAssertEqual(career.bestEndless[Mode.bushido.rawValue], 3, "booked under the mode it was played in")
        XCTAssertNil(career.bestEndless[Mode.oni.rawValue])
        XCTAssertNil(career.bestRun(from: 1))
        career.choose(.bushido)
        XCTAssertEqual(career.bestRun(from: 1)?.cleared, 3)
    }

    // MARK: Runs

    func testEveryRunRollsItsStagesAfresh() {
        var career = Career(seed: 0xABCDEF)
        play(&career, win: true)
        let fallen = play(&career, win: false)
        XCTAssertEqual(fallen.stage, 2)
        XCTAssertEqual(play(&career, win: true).stage, 1)
        let again = career.makeFight()
        XCTAssertEqual(again.stage, 2)
        XCTAssertNotEqual(again.seed, fallen.seed, "a new run is a new roll, stage by stage")
        XCTAssertNotEqual(again.roster, fallen.roster)

        career.startEndless(at: 1)
        let first = [play(&career, win: true), play(&career, win: false)]
        let second = [play(&career, win: true), play(&career, win: false)]
        XCTAssertEqual(first.map(\.stage), second.map(\.stage))
        XCTAssertNotEqual(first[1].seed, second[1].seed, "so is a new endless run")

        var fresh = Career(seed: 0xABCDEF)
        let lost = play(&fresh, win: false)
        fresh.choose(.oni)
        fresh.choose(.bushido)
        XCTAssertNotEqual(fresh.makeFight().seed, lost.seed, "a fall is not undone by a mode switched away from and back")
    }

    func testRunsAreTalliedAndTheBestIsKept() {
        var career = Career(seed: 11)
        let won = [play(&career, win: true), play(&career, win: true)]
        XCTAssertEqual(career.run.start, 1)
        XCTAssertEqual(career.run.cleared, 2)
        XCTAssertEqual(career.run.stage, 3)
        XCTAssertEqual(career.run.score, won.map(\.score).reduce(0, +))
        XCTAssertEqual(career.run.kills, won.map(\.stats.kills).reduce(0, +))
        XCTAssertEqual(career.run.bestCombo, won.map(\.stats.bestCombo).max())
        XCTAssertFalse(career.lastRunIsBest)

        let fell = play(&career, win: false)
        let run = career.lastRun
        XCTAssertEqual(run?.cleared, 2)
        XCTAssertEqual(run?.stage, 3, "the stage it fell at")
        XCTAssertEqual(run?.score, won.map(\.score).reduce(0, +) + fell.score)
        XCTAssertTrue(career.lastRunIsBest)
        XCTAssertEqual(career.bestCampaignRun, run)
        XCTAssertEqual(career.run, Run(start: 1), "the next run starts from nothing")

        play(&career, win: true)
        play(&career, win: false)
        XCTAssertEqual(career.lastRun?.cleared, 1)
        XCTAssertFalse(career.lastRunIsBest)
        XCTAssertEqual(career.bestCampaignRun, run)

        // Endless keeps a record for each starting stage.
        career.startEndless(at: 2)
        let endless = [play(&career, win: true), play(&career, win: false)]
        XCTAssertEqual(career.lastRun?.start, 2)
        XCTAssertEqual(career.lastRun?.cleared, 1)
        XCTAssertEqual(career.lastRun?.bestCombo, endless.map(\.stats.bestCombo).max())
        XCTAssertTrue(career.lastRunIsBest)
        XCTAssertEqual(career.bestRun(from: 2), career.lastRun)
        XCTAssertNil(career.bestRun(from: 1))
        XCTAssertEqual(career.bestCampaignRun, run, "endless runs keep their own records")
    }

    func testTheBetterRunClearedMoreOrScoredMore() {
        var a = Run(start: 1), b = Run(start: 1)
        XCTAssertFalse(a.beats(nil), "a run that cleared nothing is no record")
        a.cleared = 2
        a.score = 100
        XCTAssertTrue(a.beats(nil))
        b.cleared = 2
        b.score = 100
        XCTAssertFalse(a.beats(b), "a tie is not a record")
        a.score = 101
        XCTAssertTrue(a.beats(b))
        b.cleared = 3
        XCTAssertFalse(a.beats(b))
    }

    // MARK: Rank

    func testRanksWeighTheHarderModesAndTakeHours() {
        XCTAssertEqual(Rank.title(kills: 1499), "Blademaster")
        XCTAssertEqual(Rank.title(kills: 1500), "Kensei")
        XCTAssertEqual(Rank.title(kills: 25_000), "Legend")
        XCTAssertNil(Rank.next(kills: 25_000))
        XCTAssertEqual(Rank.merit(kills: 100, byMode: [:]), 100)
        XCTAssertEqual(Rank.merit(kills: 100, byMode: ["shoshin": 60, "bushido": 40]), 100)
        XCTAssertEqual(Rank.merit(kills: 100, byMode: ["shura": 100]), 125)
        XCTAssertEqual(Rank.merit(kills: 100, byMode: ["oni": 100]), 150)
        XCTAssertEqual(Rank.kills(from: 0, to: 40, on: .oni), 27)
        XCTAssertEqual(Rank.kills(from: 30, to: 40, on: .bushido), 10)

        var career = Career(seed: 1)
        career.choose(.oni)
        career.kills = 38
        var fight = Fight(stage: 1, seed: 1, mode: .oni, roster: [.grunt])
        fight.place(.grunt, at: 0.2)
        fight.strike(.right)
        XCTAssertEqual(fight.outcome, .victory)
        XCTAssertNil(career.record(fight), "38 and one Oni kill (worth one and a half) is 39")
        XCTAssertEqual(career.killsByMode, ["oni": 1])
        XCTAssertEqual(career.merit, 39)
        XCTAssertEqual(career.record(fight), "Swordsman", "and another is 41")
        XCTAssertEqual(career.merit, 41)
    }

    // MARK: Helpers

    /// Plays the career's next fight to its end, won with the perfect pilot or lost with nobody cutting, and books it.
    @discardableResult
    private func play(_ career: inout Career, win: Bool) -> Fight {
        var fight = career.makeFight()
        if win { fight.pilot = .perfect }
        while fight.outcome == nil, fight.time < 900 { _ = fight.step(0.1) }
        XCTAssertEqual(fight.outcome, win ? .victory : .defeat)
        career.record(fight)
        return fight
    }

    /// A career with every field away from its default.
    private func full() -> Career {
        var run = Run(start: 3)
        run.stage = 5
        run.hearts = 2
        run.shards = 1
        run.cleared = 2
        run.score = 4321
        run.kills = 55
        run.bestCombo = 21
        var career = Career(seed: 7)
        career.mode = .shura
        career.stages = ["shura": 4, "bushido": 9]
        career.hearts = ["shura": 2]
        career.shards = ["shura": 2]
        career.reached = ["shura": 6, "bushido": 12]
        career.highest = ["shura": 5, "bushido": 11]
        // (An endless run stays on its stage.)
        var endless = run
        endless.stage = endless.start
        career.endless = endless
        career.bestEndless = ["shura": 4]
        career.runs = ["bushido": run]
        career.bestRuns = ["shura/3": run]
        career.attempt = 3
        career.kills = 777
        career.killsByMode = ["shura": 500]
        career.falls = 6
        career.flawless = 2
        career.bestCombo = 44
        career.bestScore = 12345
        career.score = 98765
        career.streak = 4
        career.lastRun = run
        career.lastRunIsBest = true
        return career
    }

    private func json<T: Encodable>(_ value: T) throws -> JSON {
        try JSONDecoder().decode(JSON.self, from: JSONEncoder().encode(value))
    }
}

/// Any JSON, to take a save apart and put it back together.
private enum JSON: Codable, Equatable {
    case null
    case int(Int)
    case double(Double)
    case bool(Bool)
    case string(String)
    case array([JSON])
    case object([String: JSON])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Int.self) { self = .int(v) }
        else if let v = try? c.decode(Double.self) { self = .double(v) }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSON].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSON].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .int(let v): try c.encode(v)
        case .double(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }
}
