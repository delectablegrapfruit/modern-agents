import XCTest
@testable import RoninCore

final class RoninCoreTests: XCTestCase {
    /// An empty lane (nothing will arrive) to stage situations on.
    private func lane(stage: Int = 1) -> Fight {
        var fight = Fight(stage: stage, seed: 42, roster: [.grunt])
        fight.arrived = fight.roster.count
        return fight
    }

    private func run(_ fight: inout Fight, _ seconds: Double) -> [FightEvent] {
        fight.step(seconds)
    }

    // MARK: Cuts

    func testACutFellsTheNearestFoeInReach() {
        var fight = lane()
        fight.roster = [.grunt, .grunt]
        let near = fight.place(.grunt, at: -0.25)
        let far = fight.place(.grunt, at: -0.28)
        let events = fight.strike(.left)
        XCTAssertEqual(events.first, .cut(.left, foe: near, killed: true))
        XCTAssertNil(fight.foe(near))
        XCTAssertNotNil(fight.foe(far))
        XCTAssertEqual(fight.combo, 1)
        XCTAssertEqual(fight.stats.kills, 1)
        XCTAssertEqual(fight.score, Kind.grunt.bounty)
    }

    func testACutAtNothingStumblesAndBreaksTheCombo() {
        var fight = lane()
        fight.roster = [.grunt, .grunt, .grunt]
        fight.place(.grunt, at: 0.2)
        fight.place(.grunt, at: -0.6)
        fight.strike(.right)
        XCTAssertEqual(fight.combo, 1)
        _ = run(&fight, 0.2)
        let events = fight.strike(.left)
        XCTAssertEqual(events, [.whiff(.left)])
        XCTAssertTrue(fight.isStumbling)
        XCTAssertEqual(fight.combo, 0)
        // Presses while off balance are lost, even with a foe in reach.
        fight.place(.grunt, at: 0.2)
        XCTAssertEqual(fight.strike(.right), [])
        _ = run(&fight, Tuning.stumble + 0.02)
        XCTAssertFalse(fight.isStumbling)
        XCTAssertEqual(fight.strike(.right).first.map { if case .cut = $0 { return true } else { return false } }, true)
    }

    func testAPressDuringTheCooldownIsHeldAndMadeOnTime() {
        var fight = lane()
        fight.roster = [.grunt, .grunt, .grunt]
        fight.place(.grunt, at: 0.2)
        fight.place(.grunt, at: -0.2)
        fight.strike(.right)
        XCTAssertEqual(fight.strike(.left), [])
        XCTAssertEqual(fight.held, .left)
        let events = run(&fight, Tuning.cooldown + 0.02)
        XCTAssertTrue(events.contains { if case .cut(.left, _, true) = $0 { return true } else { return false } })
        XCTAssertEqual(fight.combo, 2)
    }

    func testReachIsMeasuredToTheFoesNearEdge() {
        var fight = lane()
        let x = Tuning.reach + Kind.grunt.width / 2
        fight.place(.grunt, at: x - 0.001)
        XCTAssertNotNil(fight.target(.right))
        var fight2 = lane()
        fight2.place(.grunt, at: x + 0.01)
        XCTAssertNil(fight2.target(.right))
    }

    // MARK: Foes

    func testAFoeThatReachesTheRoninWindsUpThenStrikes() {
        var fight = lane()
        let id = fight.place(.grunt, at: 0.4)
        var raised = false, wounded = false
        for _ in 0..<600 where !wounded {
            for event in fight.step(Tuning.step) {
                if event == .raised(foe: id) { raised = true }
                if case .wounded(let foe, 1) = event, foe == id { wounded = true }
            }
        }
        XCTAssertTrue(raised)
        XCTAssertTrue(wounded)
        XCTAssertEqual(fight.hp, Tuning.heroHP - 1)
        XCTAssertEqual(fight.stats.wounds, 1)
    }

    func testFoesQueueBehindTheOneInFront() {
        var fight = lane()
        let a = fight.place(.grunt, at: 0.5)
        let b = fight.place(.grunt, at: 0.6)
        _ = run(&fight, 1.8)
        let front = fight.foe(a)!, back = fight.foe(b)!
        XCTAssertEqual(front.phase, .windup)
        XCTAssertGreaterThanOrEqual(back.distance - front.distance, Kind.grunt.width)
    }

    func testABruteTakesThreeCutsAndIsKnockedBack() {
        var fight = lane()
        fight.roster = [.brute]
        let id = fight.place(.brute, at: -0.2)
        fight.strike(.left)
        let after = fight.foe(id)!
        XCTAssertEqual(after.hp, 2)
        XCTAssertGreaterThan(after.distance, 0.2)
        XCTAssertEqual(after.phase, .recoil)
        _ = run(&fight, 0.1)
        fight.strike(.left)
        _ = run(&fight, 0.1)
        let events = fight.strike(.left)
        XCTAssertEqual(events.first, .cut(.left, foe: id, killed: true))
        XCTAssertEqual(fight.outcome, .victory)
    }

    func testADancerLeapsToTheOtherSide() {
        var fight = lane()
        let id = fight.place(.dancer, at: 0.2, hp: 2)
        let events = fight.strike(.right)
        XCTAssertTrue(events.contains(.leapt(foe: id)))
        XCTAssertNil(fight.target(.right))
        XCTAssertNil(fight.target(.left), "a leaper can't be cut in the air")
        var landed = false
        for _ in 0..<120 where !landed { landed = fight.step(Tuning.step).contains(.landed(foe: id)) }
        XCTAssertTrue(landed)
        XCTAssertEqual(fight.foe(id)?.side, .left)
        XCTAssertEqual(fight.target(.left), .foe(id))
    }

    func testADeflectedArrowFlysBackAndFellsTheArcher() {
        var fight = lane(stage: 4)
        fight.roster = [.archer]
        let archer = fight.place(.archer, at: 0.7)
        var arrow: Int?
        for _ in 0..<1200 where arrow == nil {
            for case .loosed(archer, let id) in fight.step(Tuning.step) { arrow = id }
        }
        XCTAssertNotNil(arrow)
        // Wait until it is in reach, then cut it.
        for _ in 0..<600 where fight.target(.right) != .arrow(arrow!) { _ = fight.step(Tuning.step) }
        XCTAssertEqual(fight.strike(.right), [.deflected(.right, arrow: arrow!)])
        var pierced = false
        for _ in 0..<240 where !pierced {
            pierced = fight.step(Tuning.step).contains(.pierced(foe: archer, arrow: arrow!, killed: true))
        }
        XCTAssertTrue(pierced)
        XCTAssertEqual(fight.stats.arrowKills, 1)
        XCTAssertEqual(fight.hp, Tuning.heroHP)
        XCTAssertEqual(fight.outcome, .victory)
    }

    func testAnArrowLeftAloneWounds() {
        var fight = lane(stage: 4)
        fight.place(.archer, at: -0.7)
        var wounded = false
        for _ in 0..<1200 where !wounded {
            wounded = fight.step(Tuning.step).contains(.wounded(foe: nil, damage: 1))
        }
        XCTAssertTrue(wounded)
    }

    func testBloodlustLengthensReach() {
        var fight = lane()
        fight.combo = Tuning.bloodlust - 1
        let x = Tuning.reach + Kind.grunt.width / 2 + 0.03
        fight.place(.grunt, at: -0.1)
        let far = fight.place(.grunt, at: x)
        XCTAssertNil(fight.target(.right))
        let events = fight.strike(.left)
        XCTAssertTrue(events.contains(.bloodlust(true)))
        XCTAssertTrue(fight.inBloodlust)
        XCTAssertEqual(fight.target(.right), .foe(far))
    }

    // MARK: Stages

    func testTheFirstStageIsSpearmenAndEveryFifthEndsWithAWarlord() {
        for seed in 0..<6 as Range<UInt64> {
            XCTAssertEqual(Set(Fight(stage: 1, seed: seed).roster), [.grunt])
            for stage in [5, 10, 15] {
                let roster = Fight(stage: stage, seed: seed).roster
                XCTAssertEqual(roster.last, .warlord)
                XCTAssertEqual(roster.filter { $0 == .warlord }.count, 1)
            }
            XCTAssertFalse(Fight(stage: 7, seed: seed).roster.contains(.warlord))
            XCTAssertTrue(Fight(stage: 4, seed: seed).roster.contains(.archer))
        }
    }

    func testTheSameSeedPlaysTheSameFight() {
        var a = Fight(stage: 6, seed: 99), b = Fight(stage: 6, seed: 99)
        a.pilot = .human(seed: 3)
        b.pilot = .human(seed: 3)
        for _ in 0..<400 {
            XCTAssertEqual(a.step(0.05), b.step(0.05))
        }
        XCTAssertEqual(a, b)
        XCTAssertGreaterThan(a.stats.kills, 0)
    }

    func testThePerfectPilotClearsTheFirstTenStagesUntouched() {
        for stage in 1...10 {
            var fight = Fight(stage: stage, seed: mixSeed(7, UInt64(stage)))
            fight.pilot = .perfect
            while fight.outcome == nil, fight.time < 400 { _ = fight.step(0.1) }
            XCTAssertEqual(fight.outcome, .victory, "stage \(stage)")
            XCTAssertEqual(fight.stats.whiffs, 0, "stage \(stage)")
            XCTAssertEqual(fight.stats.kills, fight.roster.count, "stage \(stage)")
            XCTAssertGreaterThan(fight.bonus, 0)
        }
    }

    func testAFallEndsTheFight() {
        var fight = Fight(stage: 3, seed: 5)
        while fight.outcome == nil, fight.time < 600 { _ = fight.step(0.1) }
        XCTAssertEqual(fight.outcome, .defeat)
        XCTAssertEqual(fight.hp, 0)
        XCTAssertEqual(fight.step(1), [])
    }

    // MARK: The career

    func testAWinMovesOnAndAFallRetriesTheStage() {
        var career = Career(seed: 1)
        var fight = career.makeFight()
        fight.pilot = .perfect
        while fight.outcome == nil { _ = fight.step(0.1) }
        career.record(fight)
        XCTAssertEqual(career.stage, 2)
        XCTAssertEqual(career.attempt, 1)
        XCTAssertEqual(career.cleared, 1)
        XCTAssertEqual(career.flawless, 1)
        XCTAssertEqual(career.kills, fight.roster.count)

        var lost = career.makeFight()
        while lost.outcome == nil { _ = lost.step(0.1) }
        let before = career.kills
        career.record(lost)
        XCTAssertEqual(career.stage, 2)
        XCTAssertEqual(career.attempt, 2)
        XCTAssertEqual(career.falls, 1)
        XCTAssertEqual(career.streak, 0)
        XCTAssertEqual(career.kills, before + lost.stats.kills)
        XCTAssertNotEqual(career.makeFight().seed, lost.seed, "a retry is a fresh roll")
    }

    func testRanksClimbWithKills() {
        XCTAssertEqual(Rank.title(kills: 0), "Wanderer")
        XCTAssertEqual(Rank.title(kills: 130), "Ronin")
        XCTAssertEqual(Rank.next(kills: 130)?.title, "Duelist")
        XCTAssertNil(Rank.next(kills: 99999))
        var career = Career(seed: 1)
        career.kills = 39
        var fight = Fight(stage: 1, seed: 1, roster: [.grunt])
        fight.place(.grunt, at: 0.2)
        fight.strike(.right)
        XCTAssertEqual(fight.outcome, .victory)
        XCTAssertEqual(career.record(fight), "Swordsman")
    }

    func testASavedFightResumesExactly() throws {
        var fight = Fight(stage: 9, seed: 12)
        fight.pilot = .human(seed: 1)
        _ = fight.step(12.34)
        let save = SaveGame(career: Career(seed: 3), fight: fight)
        let data = try JSONEncoder().encode(save)
        var loaded = try JSONDecoder().decode(SaveGame.self, from: data)
        XCTAssertEqual(loaded, save)
        var original = fight
        XCTAssertEqual(loaded.fight.step(20), original.step(20))
        XCTAssertEqual(loaded.fight, original)
    }
}
