import XCTest
@testable import RoninCore

/// The development crowd rules (`Crowding`): each changes only what it says, and none is on in play.
final class CrowdingTests: XCTestCase {
    private func lane(stage: Int = 8, _ crowding: Crowding) -> Fight {
        var fight = Fight(stage: stage, seed: 42, mode: .bushido, roster: [.grunt])
        fight.arrived = fight.roster.count
        fight.hp = 50
        fight.crowding = crowding
        return fight
    }

    @discardableResult
    private func tick(_ fight: inout Fight, for seconds: Double) -> [FightEvent] {
        var all: [FightEvent] = []
        for _ in 0..<Int(seconds * 120) { all += fight.step(Tuning.step) }
        return all
    }

    func testPlayIsAQueueWithTheBruteKnockedBack() {
        XCTAssertTrue(Fight(stage: 1, seed: 1).crowding.isStandard)
        XCTAssertTrue(Crowding.standard.isStandard)
        XCTAssertFalse(Crowding(slipPast: true).isStandard)
    }

    func testPassingThroughEveryManReachesHisOwnStrikingDistance() {
        var fight = lane(Crowding(passThrough: true))
        fight.roster = [.grunt, .grunt]
        let a = fight.place(.grunt, at: 0.5), b = fight.place(.grunt, at: 0.6)
        let events = tick(&fight, for: 1.2)
        XCTAssertTrue(events.contains(.raised(foe: a)))
        XCTAssertTrue(events.contains(.raised(foe: b)), "the man behind walks through to strike too")
        XCTAssertEqual(fight.foe(b)!.distance, Kind.grunt.range, accuracy: 0.01)
    }

    func testTheQuickSlipPastAHeavyButNotPastAnother() {
        var fight = lane(Crowding(slipPast: true))
        fight.roster = [.brute, .runner, .grunt]
        fight.place(.brute, at: 0.3)
        let runner = fight.place(.runner, at: 0.45)
        tick(&fight, for: 1.0)
        XCTAssertLessThan(fight.foe(runner)!.distance, 0.3, "the runner slips past the brute")
        // A spearman is not small: he still queues behind the brute.
        var other = lane(Crowding(slipPast: true))
        other.roster = [.brute, .grunt]
        other.place(.brute, at: 0.3)
        let grunt = other.place(.grunt, at: 0.45)
        tick(&other, for: 1.0)
        XCTAssertGreaterThan(other.foe(grunt)!.distance, other.foes.first { $0.kind == .brute }!.distance)
    }

    func testTheBusyCanBePassed() {
        var fight = lane(Crowding(passBusy: true))
        fight.roster = [.grunt, .runner]
        let front = fight.place(.grunt, at: Kind.grunt.range + 0.001)
        let runner = fight.place(.runner, at: 0.5)
        // The spearman winds up; the runner behind him walks past.
        tick(&fight, for: 0.9)
        XCTAssertNotNil(fight.foe(front))
        XCTAssertLessThan(fight.foe(runner)!.distance, Kind.grunt.range, "past the man winding up")
    }

    func testTheBruteShovesLighterMenAside() {
        var fight = lane(Crowding(shove: true))
        fight.roster = [.runner, .brute]
        let runner = fight.place(.runner, at: 0.34)
        let brute = fight.place(.brute, at: 0.5)
        tick(&fight, for: 1.5)
        let b = fight.foe(brute)!
        XCTAssertLessThan(b.distance, 0.34, "the brute strides through")
        if let r = fight.foe(runner), r.phase != .windup {
            XCTAssertGreaterThan(r.distance, b.distance, "the man he walked into is pushed behind him")
        }
    }

    func testWithoutKnockbackTheBruteKeepsHisGroundAndHisBlow() {
        var fight = lane(Crowding(noBruteKnockback: true))
        fight.roster = [.brute]
        let id = fight.place(.brute, at: -0.2)
        let before = fight.foe(id)!.distance
        fight.strike(.left)
        XCTAssertEqual(fight.foe(id)!.distance, before, accuracy: 0.0001, "not knocked back")
        // Winding up, a cut doesn't break his blow.
        var winding = lane(Crowding(noBruteKnockback: true))
        winding.roster = [.brute]
        let w = winding.place(.brute, at: Kind.brute.range + 0.001)
        var raised = false
        for _ in 0..<240 where !raised {
            raised = winding.step(Tuning.step).contains(.raised(foe: w))
        }
        XCTAssertTrue(raised)
        winding.strike(Side.of(winding.foe(w)!.x))
        XCTAssertEqual(winding.foe(w)?.phase, .windup, "the cut does not break his swing")
        // In play he is knocked back.
        var standard = lane(.standard)
        standard.roster = [.brute]
        let s = standard.place(.brute, at: -0.2)
        standard.strike(.left)
        XCTAssertGreaterThan(standard.foe(s)!.distance, 0.2)
    }

    func testTheRulesArePlayedAndSaved() throws {
        var fight = Fight(stage: 3, seed: 9)
        fight.crowding = Crowding(slipPast: true, noBruteKnockback: true)
        let data = try JSONEncoder().encode(fight)
        XCTAssertEqual(try JSONDecoder().decode(Fight.self, from: data).crowding, fight.crowding)
    }
}
