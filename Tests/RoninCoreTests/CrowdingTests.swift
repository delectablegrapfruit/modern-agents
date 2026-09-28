import XCTest
@testable import RoninCore

/// The crowd rules (`Crowding`): each changes only what it says, and the game plays its standard set.
final class CrowdingTests: XCTestCase {
    private func lane(stage: Int = 8, _ crowding: Crowding) -> Fight {
        var fight = Fight(stage: stage, seed: 42, mode: .bushido, roster: [.grunt])
        fight.arrived = fight.roster.count
        fight.hp = 50
        fight.crowding = crowding
        return fight
    }

    /// Steps one tick at a time until `until` holds (or `seconds` pass). Returns every event on the way.
    @discardableResult
    private func tick(_ fight: inout Fight, for seconds: Double, until: (Fight, [FightEvent]) -> Bool = { _, _ in false }) -> [FightEvent] {
        var all: [FightEvent] = []
        for _ in 0..<Int(seconds * 120) {
            let events = fight.step(Tuning.step)
            all += events
            if until(fight, events) { break }
        }
        return all
    }

    func testPlayPassesTheBusyAndTheHeavyAndTheBruteIsNotKnockedBack() {
        XCTAssertTrue(Fight(stage: 1, seed: 1).crowding.isStandard)
        let standard = Crowding.standard
        XCTAssertEqual(standard, Crowding(slipPast: true, runnersPassAll: true, passBusy: true, shove: true, noBruteKnockback: true))
        XCTAssertFalse(standard.passThrough)
        XCTAssertTrue(standard.passes)
        XCTAssertFalse(Crowding.queue.passes)
        XCTAssertFalse(Crowding.queue.noBruteKnockback)
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
        // With knock-back (the queue's rules) he is knocked back.
        var standard = lane(.queue)
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
        // Rules saved before runners passed everyone read as they were, the rule off.
        let old = try JSONDecoder().decode(Crowding.self, from: Data(#"{"passThrough":false,"slipPast":true,"passBusy":false,"shove":true,"noBruteKnockback":false}"#.utf8))
        XCTAssertEqual(old, Crowding(slipPast: true, shove: true))
    }

    func testAFightSavedBeforeTheseRulesResumes() throws {
        // Saved by the build before: its rules without runners passing everyone, its stats without turned blows, its
        // pilot without brutes weighed or presses timed. The fight resumes where it was, not rolled afresh.
        var fight = Fight(stage: 9, seed: 21)
        fight.pilot = .human(seed: 3)
        fight.crowding = Crowding(slipPast: true, shove: true)
        for _ in 0..<(120 * 20) where (fight.pilot?.queue.isEmpty ?? true) || fight.time < 8 { _ = fight.step(Tuning.step) }
        XCTAssertFalse(fight.pilot?.queue.isEmpty ?? true, "a press on its way, to be read back")
        let save = SaveGame(career: Career(seed: 5), fight: fight)
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(save)) as? [String: Any])
        var saved = try XCTUnwrap(json["fight"] as? [String: Any])
        var crowding = try XCTUnwrap(saved["crowding"] as? [String: Any])
        XCTAssertNotNil(crowding.removeValue(forKey: "runnersPassAll"))
        saved["crowding"] = crowding
        var stats = try XCTUnwrap(saved["stats"] as? [String: Any])
        XCTAssertNotNil(stats.removeValue(forKey: "turned"))
        saved["stats"] = stats
        var pilot = try XCTUnwrap(saved["pilot"] as? [String: Any])
        XCTAssertNotNil(pilot.removeValue(forKey: "clubs"))
        let queue = try XCTUnwrap(pilot["queue"] as? [[String: Any]])
        pilot["queue"] = queue.map { press in
            var old = press
            old["timed"] = nil
            return old
        }
        saved["pilot"] = pilot
        json["fight"] = saved
        let loaded = try XCTUnwrap(SaveGame.load(JSONSerialization.data(withJSONObject: json)))
        var expected = fight
        expected.pilot?.clubs = []
        if var p = expected.pilot {
            p.queue = p.queue.map { press in
                var old = press
                old.timed = false
                return old
            }
            expected.pilot = p
        }
        XCTAssertEqual(loaded.fight, expected, "the fight in progress resumes, not rolled afresh")
    }

    // MARK: Runners pass everyone

    func testRunnersPassEveryoneButTheWarlord() {
        for front in [Kind.grunt, .brute, .archer, .dancer, .runner] {
            var fight = lane(Crowding(runnersPassAll: true))
            fight.roster = [front, .runner]
            let man = fight.place(front, at: 0.36)
            let runner = fight.place(.runner, at: 0.5)
            tick(&fight, for: 0.8)
            XCTAssertLessThan(fight.foe(runner)!.distance, fight.foe(man)!.distance, "a runner walks past a \(front)")
            XCTAssertEqual(fight.foe(runner)!.distance, Kind.runner.range, accuracy: 0.01, "to strike from his own distance")
        }
        // Nobody walks through the warlord, not even with every rule on.
        for crowding in [Crowding(runnersPassAll: true), Crowding(passThrough: true), .standard] {
            var fight = lane(stage: 10, crowding)
            fight.roster = [.warlord, .runner]
            let lord = fight.place(.warlord, at: Kind.warlord.range)
            fight.foes[0].guardRest = 100
            let runner = fight.place(.runner, at: 0.5)
            tick(&fight, for: 0.6)
            XCTAssertGreaterThan(fight.foe(runner)!.distance, fight.foe(lord)!.distance)
        }
        // Without the rule a runner waits behind a spearman (the quick slip only past the heavy).
        var slip = lane(Crowding(slipPast: true))
        slip.roster = [.grunt, .runner]
        let grunt = slip.place(.grunt, at: 0.36)
        let runner = slip.place(.runner, at: 0.5)
        tick(&slip, for: 0.3)
        XCTAssertGreaterThan(slip.foe(runner)!.distance, slip.foe(grunt)!.distance)
    }

    func testOnlyRunnersPassEveryone() {
        var fight = lane(Crowding(runnersPassAll: true))
        fight.roster = [.grunt, .dancer]
        let grunt = fight.place(.grunt, at: 0.36)
        let dancer = fight.place(.dancer, at: 0.5)
        tick(&fight, for: 0.3)
        XCTAssertGreaterThan(fight.foe(dancer)!.distance, fight.foe(grunt)!.distance, "a dancer is no runner")
    }

    func testNobodyCutsInFrontOfTheGourdBearerOnHisDart() {
        var bearer = Foe(id: 1, kind: .grunt, x: 0.3, hp: 2, speed: 0.3, windup: 0.7)
        bearer.bearer = true
        bearer.enter(.windup, for: 0.3)
        bearer.darting = true
        let runner = Foe(id: 2, kind: .runner, x: 0.5, hp: 1, speed: 0.6, windup: 0.4)
        for crowding in [Crowding.standard, Crowding(passThrough: true), Crowding(passBusy: true), Crowding(runnersPassAll: true)] {
            XCTAssertTrue(crowding.blocks(bearer, runner))
        }
        bearer.darting = false
        XCTAssertFalse(Crowding.standard.blocks(bearer, runner), "waiting at his spot, a runner may pass him")
    }

    // MARK: The brute's club

    /// A brute on the left `left` seconds from his blow, with `hp` cuts in him.
    private func windingBrute(_ fight: inout Fight, left: Double, hp: Int = 3) -> Int {
        fight.roster += [.brute]
        let id = fight.place(.brute, at: -Kind.brute.range, hp: hp)
        let i = fight.foes.count - 1
        fight.foes[i].enter(.windup, for: fight.foes[i].windup)
        fight.foes[i].timer = left
        return id
    }

    func testACutAsHisClubGlaresTurnsHisBlowAside() {
        var fight = lane(stage: 3, .standard)
        fight.hp = 5
        let id = windingBrute(&fight, left: 0.6)
        // Before the glare a cut wounds him, and his blow comes on.
        XCTAssertFalse(fight.foe(id)!.clubGlares)
        XCTAssertEqual(fight.strike(.left), [.cut(.left, foe: id, killed: false)])
        XCTAssertEqual(fight.foe(id)!.hp, 2)
        XCTAssertEqual(fight.foe(id)!.phase, .windup)
        tick(&fight, for: 0.6 - Tuning.parryWindow + 0.05)
        XCTAssertTrue(fight.foe(id)!.clubGlares)
        XCTAssertTrue(fight.turns(fight.foe(id)!))
        // In the glare the club is met: the blow turned aside, no wound, and he is thrown off balance where he stands.
        let before = fight.foe(id)!.distance, score = fight.score
        XCTAssertEqual(fight.strike(.left), [.turned(.left, foe: id)])
        let turned = fight.foe(id)!
        XCTAssertEqual(turned.hp, 2, "steel met steel: he is not wounded")
        XCTAssertEqual(turned.phase, .recoil)
        XCTAssertEqual(turned.timer, Tuning.bruteStagger, accuracy: 1e-9)
        XCTAssertEqual(turned.distance, before, accuracy: 1e-9, "no knock-back")
        XCTAssertEqual(fight.stats.turned, 1)
        XCTAssertEqual(fight.combo, 1, "it counts to the combo (the wound before it did not)")
        XCTAssertGreaterThan(fight.score, score)
        let events = tick(&fight, for: Tuning.bruteStagger - 0.05)
        XCTAssertFalse(events.contains { if case .wounded = $0 { return true } else { return false } }, "the blow never lands")
        XCTAssertFalse(events.contains(.raised(foe: id)), "and he cannot strike while he reels")
        // Cut while he reels, he stays off balance, and falls to the cuts he has left.
        XCTAssertEqual(fight.strike(.left), [.cut(.left, foe: id, killed: false)])
        XCTAssertEqual(fight.foe(id)!.phase, .recoil)
        tick(&fight, for: Tuning.cooldown + Tuning.step)
        XCTAssertEqual(fight.strike(.left).first, .cut(.left, foe: id, killed: true))
        XCTAssertEqual(fight.hp, 5)
    }

    func testACutThatCanFellHimFellsHimRatherThanTurningTheBlow() {
        // One cut from falling, the glare is no parry: the cut fells him, and in the last moment of it (the gold) gives
        // a shard.
        var fight = lane(stage: 3, .standard)
        let id = windingBrute(&fight, left: Tuning.parryWindow - 0.02, hp: 1)
        XCTAssertTrue(fight.foe(id)!.clubGlares)
        XCTAssertFalse(fight.turns(fight.foe(id)!))
        XCTAssertEqual(fight.strike(.left), [.cut(.left, foe: id, killed: true)])
        var late = lane(stage: 3, .standard)
        let other = windingBrute(&late, left: Tuning.senNoSen - 0.02, hp: 1)
        XCTAssertEqual(late.strike(.left), [.cut(.left, foe: other, killed: true), .shard(foe: other, count: 1)])
        // Two cuts left, in the last moment: turned, and no shard (nobody fell).
        var two = lane(stage: 3, .standard)
        let third = windingBrute(&two, left: Tuning.senNoSen - 0.02, hp: 2)
        XCTAssertEqual(two.strike(.left), [.turned(.left, foe: third)])
        XCTAssertEqual(two.shards, 0)
    }

    func testWithKnockbackThereIsNoGlareToMeet() {
        var fight = lane(stage: 3, .queue)
        let id = windingBrute(&fight, left: 0.1)
        XCTAssertTrue(fight.foe(id)!.clubGlares)
        XCTAssertFalse(fight.turns(fight.foe(id)!))
        XCTAssertEqual(fight.strike(.left), [.cut(.left, foe: id, killed: false)])
        XCTAssertEqual(fight.foe(id)!.phase, .recoil, "the cut breaks his blow, as it always did")
    }

    func testTheGlareIsTheSameEveryTimeAndLongEnoughToMeetOnSight() {
        // Every brute's wind-up, on every stage and mode, glares for the same last stretch (the whole of it, if it is
        // shorter): a fixed window, well over the time it takes to see the glare and cut.
        XCTAssertGreaterThanOrEqual(Tuning.parryWindow, 0.25)
        XCTAssertGreaterThan(Tuning.parryWindow, Tuning.senNoSen)
        for mode in Mode.allCases {
            for stage in [3, 10, 25, 50] {
                var fight = lane(stage: stage, .standard)
                fight.hp = 50
                let id = fight.place(.brute, at: -Kind.brute.range)
                var raisedAt: Double?, glareAt: Double?, blowAt: Double?
                tick(&fight, for: 4) { fight, events in
                    if raisedAt == nil, events.contains(.raised(foe: id)) { raisedAt = fight.time }
                    if glareAt == nil, fight.foe(id)?.clubGlares == true { glareAt = fight.time }
                    if events.contains(where: { if case .wounded = $0 { return true } else { return false } }) { blowAt = fight.time }
                    return blowAt != nil
                }
                guard let raisedAt, let glareAt, let blowAt else { XCTFail("\(mode) \(stage)"); continue }
                XCTAssertEqual(blowAt - glareAt, min(Tuning.parryWindow, blowAt - raisedAt), accuracy: 2 * Tuning.step, "\(mode) \(stage)")
            }
        }
    }

    func testThePilotsMeetTheClub() {
        // A brute raising his club with more cuts in him than a human-like hand can land before it: it waits for the
        // glare and turns the blow, then cuts him down as he reels. The perfect pilot never lets a brute's blow land.
        for stage in [8, 20, 40] {
            var fight = lane(stage: stage, .standard)
            fight.hp = 5
            fight.pilot = .human(slips: 0, timing: 0.02, daring: 0, seed: 7)
            let id = windingBrute(&fight, left: fight.difficulty.windup * Kind.brute.windup)
            let events = tick(&fight, for: 3) { fight, _ in fight.foe(id) == nil }
            XCTAssertTrue(events.contains(.turned(.left, foe: id)), "stage \(stage)")
            XCTAssertNil(fight.foe(id), "stage \(stage): cut down as he reeled")
            XCTAssertEqual(fight.hp, 5, "stage \(stage)")

            var perfect = lane(stage: stage, .standard)
            perfect.hp = 5
            perfect.pilot = .perfect
            let other = windingBrute(&perfect, left: perfect.difficulty.windup * Kind.brute.windup)
            tick(&perfect, for: 3) { fight, _ in fight.foe(other) == nil }
            XCTAssertNil(perfect.foe(other))
            XCTAssertEqual(perfect.hp, 5)
        }
    }
}
