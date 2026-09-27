import XCTest
@testable import RoninCore

final class RoninCoreTests: XCTestCase {
    /// An empty lane (nothing will arrive) to stage situations on.
    private func lane(stage: Int = 1, mode: Mode = .bushido) -> Fight {
        var fight = Fight(stage: stage, seed: 42, mode: mode, roster: [.grunt])
        fight.arrived = fight.roster.count
        return fight
    }

    private func run(_ fight: inout Fight, _ seconds: Double) -> [FightEvent] {
        fight.step(seconds)
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

    private func isWhiff(_ event: FightEvent) -> Bool { if case .whiff = event { return true } else { return false } }

    private func wounded(_ events: [FightEvent], by id: Int) -> Bool {
        events.contains { if case .wounded(let foe, _) = $0 { return foe == id } else { return false } }
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

    func testAHeldSecondCutWithNothingLeftToCutIsLetGo() {
        // A double tap on a spearman: the first press fells him, the second finds nobody and is let go.
        var fight = lane()
        fight.roster = [.grunt, .grunt]
        fight.place(.grunt, at: 0.2)
        fight.combo = Tuning.bloodlust
        fight.strike(.right)
        _ = run(&fight, 0.04)
        XCTAssertEqual(fight.strike(.right), [])
        let events = run(&fight, Tuning.cooldown + 0.02)
        XCTAssertFalse(events.contains(where: isWhiff))
        XCTAssertNil(fight.held)
        XCTAssertFalse(fight.isStumbling)
        XCTAssertEqual(fight.combo, Tuning.bloodlust + 1, "bloodlust kept")

        // A brute knocked out of reach by the first cut: the second is let go too.
        var brute = lane()
        brute.roster = [.brute]
        brute.place(.brute, at: 0.3 + Kind.brute.width / 2)
        brute.strike(.right)
        XCTAssertNil(brute.target(.right))
        XCTAssertEqual(brute.strike(.right), [])
        _ = run(&brute, Tuning.cooldown + 0.02)
        XCTAssertEqual(brute.stats.whiffs, 0)
        XCTAssertFalse(brute.isStumbling)
        // Past the cooldown, a cut at nothing is a whiff as ever.
        XCTAssertEqual(brute.strike(.right), [.whiff(.right)])

        // Pressing both ways at once is no hedge: the other side, empty, still whiffs.
        var both = lane()
        both.roster = [.grunt, .grunt]
        both.place(.grunt, at: 0.2)
        both.strike(.right)
        XCTAssertEqual(both.strike(.left), [])
        XCTAssertTrue(run(&both, Tuning.cooldown + 0.02).contains(.whiff(.left)))
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

    func testModesScaleTheStumbleOfAWhiffAndOfAParriedCut() {
        for mode in Mode.allCases {
            var fight = lane(stage: 5, mode: mode)
            fight.strike(.left)
            XCTAssertEqual(fight.stumble, Tuning.stumble * mode.stumble, accuracy: 1e-9)

            var parried = lane(stage: 5, mode: mode)
            parried.roster = [.warlord]
            parried.place(.warlord, at: -0.24)
            parried.foes[0].enter(.guarding, for: 1)
            parried.foes[0].timer -= Tuning.guardRise + Tuning.step
            parried.strike(.left)
            XCTAssertEqual(parried.stumble, Tuning.parried * mode.stumble, accuracy: 1e-9)
        }
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
        XCTAssertEqual(fight.hp, Mode.bushido.hearts - 1)
        XCTAssertEqual(fight.stats.wounds, 1)
    }

    func testFoesQueueBehindTheOneInFront() {
        var fight = lane()
        let a = fight.place(.grunt, at: 0.5)
        let b = fight.place(.grunt, at: 0.6)
        _ = run(&fight, 1.0)
        let front = fight.foe(a)!, back = fight.foe(b)!
        XCTAssertEqual(front.phase, .windup)
        XCTAssertEqual(front.distance, Kind.grunt.range, accuracy: 0.001, "a spearman strikes from the length of his spear")
        XCTAssertGreaterThanOrEqual(back.distance - front.distance, Kind.grunt.width)
    }

    func testOnlyTheManInFrontStrikes() {
        // A spearman stopped behind a runner is at his spear's length, but waits his turn.
        var fight = lane(stage: 8)
        fight.roster = [.runner, .grunt]
        fight.hp = 50
        fight.place(.runner, at: 0.2)
        let grunt = fight.place(.grunt, at: 0.4)
        let before = tick(&fight, for: 0.6)
        XCTAssertFalse(before.contains(.raised(foe: grunt)))
        XCTAssertEqual(fight.foe(grunt)!.distance, Kind.grunt.range, accuracy: 0.01)
        XCTAssertNotEqual(fight.foe(grunt)!.phase, .windup)
        // The runner cut down, the spearman is at the front and raises his spear.
        XCTAssertTrue(fight.strike(.right).contains { if case .cut(.right, _, true) = $0 { return true } else { return false } })
        XCTAssertTrue(tick(&fight, for: 0.1).contains(.raised(foe: grunt)))
    }

    func testNobodyRaisesHisWeaponWithAComradeComingDownInFront() {
        var fight = lane(stage: 8)
        fight.roster = [.dancer, .grunt]
        fight.hp = 50
        let dancer = fight.place(.dancer, at: -0.2, hp: 3)
        let grunt = fight.place(.grunt, at: 0.3)
        XCTAssertTrue(fight.strike(.left).contains(.leapt(foe: dancer)))
        let events = tick(&fight, for: 1) { _, events in events.contains(.landed(foe: dancer)) }
        XCTAssertTrue(events.contains(.landed(foe: dancer)))
        XCTAssertFalse(events.contains(.raised(foe: grunt)), "no spear raised under the leaper")
        XCTAssertNotEqual(fight.foe(grunt)?.phase, .windup)
        XCTAssertLessThan(fight.foe(dancer)!.distance, fight.foe(grunt)!.distance)
    }

    func testALeaperComesDownBehindABlowAlreadyComing() {
        var fight = lane(stage: 8)
        fight.roster = [.dancer, .grunt]
        fight.hp = 50
        let dancer = fight.place(.dancer, at: -0.2, hp: 3)
        let grunt = fight.place(.grunt, at: Kind.grunt.range)
        fight.foes[1].enter(.windup, for: 1)
        fight.strike(.left)
        let landing = abs(fight.foe(dancer)!.leapTo)
        XCTAssertGreaterThanOrEqual(landing - fight.foe(grunt)!.distance, (Kind.dancer.width + Kind.grunt.width) / 2)
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
        XCTAssertEqual(Kind.brute.damage, 2)
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

    func testDancersTakeAThirdCutFromStage12AndAnArrowDoesNotSendThemLeaping() {
        XCTAssertEqual(Difficulty(stage: 11).dancerHP, 2)
        XCTAssertEqual(Difficulty(stage: 12).dancerHP, 3)
        var fight = lane(stage: 12)
        fight.roster = [.dancer]
        let id = fight.place(.dancer, at: 0.5, hp: 3)
        fight.arrows.append(Arrow(id: 99, from: 0, x: 0.3, velocity: Tuning.deflectSpeed, deflected: true))
        let events = tick(&fight, for: 0.3) { fight, _ in fight.arrows.isEmpty }
        XCTAssertTrue(events.contains(.pierced(foe: id, arrow: 99, killed: false)))
        XCTAssertEqual(fight.foe(id)?.phase, .recoil)
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
        XCTAssertEqual(fight.hp, Mode.bushido.hearts)
        XCTAssertEqual(fight.outcome, .victory)
    }

    func testADeflectedArrowFellsTheFirstFoeInItsPath() {
        var fight = lane(stage: 4)
        fight.roster = [.grunt, .archer]
        fight.hp = 50
        let grunt = fight.place(.grunt, at: 0.45)
        let archer = fight.place(.archer, at: 0.8)
        fight.arrows.append(Arrow(id: 99, from: archer, x: 0.2, velocity: Tuning.deflectSpeed, deflected: true))
        let events = tick(&fight, for: 0.3) { fight, _ in fight.arrows.isEmpty }
        XCTAssertTrue(events.contains(.pierced(foe: grunt, arrow: 99, killed: true)))
        XCTAssertNotNil(fight.foe(archer))
        XCTAssertEqual(fight.stats.arrowKills, 1)
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

    func testArchersStopAtTheirRangeAndNeverTwoToASide() {
        var fight = lane(stage: 6)
        fight.hp = 100
        let archer = fight.place(.archer, at: 0.95)
        tick(&fight, for: 2)
        XCTAssertEqual(fight.foe(archer)!.distance, Tuning.archerRange, accuracy: 0.001)

        var arrivals = Fight(stage: 6, seed: 3, roster: [.archer, .archer, .archer])
        arrivals.hp = 100
        tick(&arrivals, for: 12)
        XCTAssertEqual(arrivals.arrived, 2, "the third waits while each side has one")
        XCTAssertEqual(Set(arrivals.foes.map { Side.of($0.x) }), [.left, .right])
    }

    func testTheCrowdCapHoldsArrivals() {
        var fight = Fight(stage: 1, seed: 7, roster: Array(repeating: .grunt, count: 20))
        fight.hp = 1000
        var most = 0
        for _ in 0..<(120 * 30) {
            _ = fight.step(Tuning.step)
            most = max(most, fight.foes.filter(\.alive).count)
        }
        XCTAssertEqual(most, fight.difficulty.crowd)
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

    // MARK: Scoring

    func testTheComboMultipliesMarksMilestonesAndEndsBloodlustWhenBroken() {
        var fight = lane()
        for (combo, multiplier) in [(0, 1), (9, 1), (10, 2), (70, 8), (200, 8)] {
            fight.combo = combo
            XCTAssertEqual(fight.multiplier, multiplier, "combo \(combo)")
        }
        fight.combo = 24
        fight.roster = [.grunt, .grunt]
        fight.place(.grunt, at: 0.2)
        XCTAssertTrue(fight.strike(.right).contains(.milestone(25)))
        _ = run(&fight, 0.2)
        XCTAssertTrue(fight.strike(.left).contains(.bloodlust(false)))
        XCTAssertEqual(fight.combo, 0)
    }

    func testAClearedStagePaysABonusAndMoreUntouched() {
        var clean = lane(stage: 3)
        clean.place(.grunt, at: 0.2)
        clean.strike(.right)
        XCTAssertEqual(clean.outcome, .victory)
        XCTAssertEqual(clean.bonus, 250 * 3 + 150 * clean.hp + 500 * 3)

        var hurt = lane(stage: 3)
        hurt.stats.damage = 1
        hurt.hp -= 1
        hurt.place(.grunt, at: 0.2)
        hurt.strike(.right)
        XCTAssertEqual(hurt.bonus, 250 * 3 + 150 * hurt.hp)
    }

    func testHeartsBroughtInAreKeptInBounds() {
        XCTAssertEqual(Fight(stage: 1, seed: 1, hearts: 0).hp, 1)
        XCTAssertEqual(Fight(stage: 1, seed: 1, hearts: 99).hp, Mode.bushido.hearts)
        XCTAssertEqual(Fight(stage: 1, seed: 1, mode: .oni, hearts: 2).hp, 2)
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

    func testPastStage25TheLaneOnlyQuickens() {
        XCTAssertEqual(Difficulty(stage: 25).pace, Difficulty(stage: 20).pace)
        XCTAssertGreaterThan(Difficulty(stage: 40).pace, Difficulty(stage: 25).pace)
        XCTAssertEqual(Difficulty(stage: 50).pace, Difficulty(stage: 60).pace, "it stops at stage 50")
        XCTAssertEqual(Difficulty(stage: 50).pace, 2.0, accuracy: 1e-9)
        XCTAssertEqual(Difficulty(stage: 40).windup, Difficulty(stage: 25).windup, "every blow can still be met")
        XCTAssertEqual(Difficulty(stage: 40).interval, Difficulty(stage: 25).interval)
        // Runners stop taking over the roster at stage 25.
        func runners(_ stage: Int) -> Double {
            var count = 0, total = 0
            for seed in 0..<40 as Range<UInt64> {
                let roster = Fight(stage: stage, seed: seed).roster
                count += roster.filter { $0 == .runner }.count
                total += roster.count
            }
            return Double(count) / Double(total)
        }
        XCTAssertEqual(runners(60), runners(26), accuracy: 0.04)
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

    func testAPilotCarriedIntoTheNextFightKeepsCutting() {
        var first = Fight(stage: 1, seed: 1)
        first.pilot = .perfect
        while first.outcome == nil { _ = first.step(0.1) }
        var next = Fight(stage: 2, seed: 2)
        next.pilot = first.pilot
        while next.outcome == nil, next.time < 400 { _ = next.step(0.1) }
        XCTAssertEqual(next.outcome, .victory)
        XCTAssertEqual(next.stats.damage, 0)
    }

    func testAFallEndsTheFight() {
        var fight = Fight(stage: 3, seed: 5)
        while fight.outcome == nil, fight.time < 600 { _ = fight.step(0.1) }
        XCTAssertEqual(fight.outcome, .defeat)
        XCTAssertEqual(fight.hp, 0)
        XCTAssertEqual(fight.step(1), [])
    }

    // MARK: The career

    func testHeartsCarryFromStageToStageAndAFallStartsOver() {
        var career = Career(seed: 1)
        var fight = career.makeFight()
        fight.pilot = .perfect
        fight.hp = 2
        while fight.outcome == nil { _ = fight.step(0.1) }
        XCTAssertEqual(fight.outcome, .victory)
        career.record(fight)
        XCTAssertEqual(career.stage, 2)
        XCTAssertEqual(career.attempt, 1)
        XCTAssertEqual(career.cleared, 1)
        XCTAssertEqual(career.kills, fight.roster.count)
        XCTAssertEqual(career.carried, fight.hp)
        XCTAssertEqual(career.makeFight().hp, fight.hp, "the hearts left are the hearts brought")

        var lost = career.makeFight()
        while lost.outcome == nil { _ = lost.step(0.1) }
        let before = career.kills
        career.record(lost)
        XCTAssertEqual(career.stage, 1, "a fall starts the campaign over")
        XCTAssertEqual(career.carried, Mode.bushido.hearts)
        XCTAssertEqual(career.makeFight().hp, Mode.bushido.hearts)
        XCTAssertEqual(career.unlocked, 1...2, "stages reached stay open")
        XCTAssertEqual(career.falls, 1)
        XCTAssertEqual(career.streak, 0)
        XCTAssertEqual(career.kills, before + lost.stats.kills)
        XCTAssertNotEqual(career.makeFight().seed, lost.seed, "a retry is a fresh roll")
    }

    func testEndlessStartsFromAnUnlockedStageAndRunsOn() {
        var career = Career(seed: 5)
        func play(_ win: Bool) -> Fight {
            var fight = career.makeFight()
            if win { fight.pilot = .perfect }
            while fight.outcome == nil { _ = fight.step(0.1) }
            career.record(fight)
            return fight
        }
        _ = play(true)
        _ = play(true)
        XCTAssertEqual(career.unlocked, 1...3)
        career.startEndless(at: 9)
        XCTAssertEqual(career.endless?.start, 3, "only unlocked stages")
        XCTAssertEqual(career.makeFight().stage, 3)
        let won = play(true)
        XCTAssertEqual(career.endless?.stage, 4)
        XCTAssertEqual(career.endless?.cleared, 1)
        XCTAssertEqual(career.endless?.hearts, won.hp)
        XCTAssertEqual(career.unlocked, 1...4)
        XCTAssertEqual(career.stage, 3, "the campaign waits where it was")
        _ = play(false)
        XCTAssertEqual(career.lastRun?.cleared, 1)
        XCTAssertEqual(career.bestEndless[Mode.bushido.rawValue], 1)
        XCTAssertEqual(career.endless, Endless(start: 3), "the next run begins where this one did")
        career.leaveEndless()
        XCTAssertEqual(career.makeFight().stage, 3)
    }

    func testEachModeKeepsItsOwnStage() {
        var career = Career(seed: 9)
        func win() {
            var fight = career.makeFight()
            XCTAssertEqual(fight.mode, career.mode)
            fight.pilot = .perfect
            while fight.outcome == nil { _ = fight.step(0.1) }
            XCTAssertEqual(fight.outcome, .victory)
            career.record(fight)
        }
        win()
        XCTAssertEqual(career.stage, 2)
        career.choose(.oni)
        XCTAssertEqual(career.stage, 1)
        XCTAssertEqual(career.cleared, 0)
        win()
        win()
        XCTAssertEqual(career.stage, 3)
        career.choose(.bushido)
        XCTAssertEqual(career.stage, 2)
        XCTAssertEqual(career.cleared, 1)
        XCTAssertNotEqual(Career(seed: 9).makeFight().seed, { var c = Career(seed: 9); c.choose(.oni); return c.makeFight().seed }())
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

    // MARK: The gourd

    func testTheGourdBearerGivesBackOneHeartOnce() {
        var fight = lane()
        fight.roster = [.grunt, .grunt, .grunt]
        fight.hp = 2
        let bearer = fight.place(.grunt, at: -0.2)
        fight.foes[fight.foes.count - 1].bearer = true
        XCTAssertTrue(fight.strike(.left).contains(.healed(foe: bearer, restored: true)))
        XCTAssertEqual(fight.hp, 3)
        _ = run(&fight, 0.2)
        fight.place(.grunt, at: 0.2)
        fight.foes[fight.foes.count - 1].bearer = true
        _ = fight.strike(.right)
        XCTAssertEqual(fight.hp, 3, "one gourd a stage")

        // Left alone, he keeps out of reach, darts in twice, and makes off with the gourd.
        var chase = lane()
        chase.roster = [.runner]
        let carrier = chase.place(.runner, at: -0.9, hp: 2)
        chase.foes[0].bearer = true
        var closest = 1.0, hovered = false, fled = false
        for _ in 0..<(120 * 14) where !fled {
            let events = chase.step(Tuning.step)
            if events.contains(.fled(foe: carrier)) { fled = true }
            if let f = chase.foe(carrier) {
                closest = min(closest, f.distance)
                if f.phase == .advancing, !f.darting, f.gap > chase.reach, f.distance < 0.6 { hovered = true }
            }
        }
        XCTAssertTrue(hovered, "he waits out of reach")
        XCTAssertLessThanOrEqual(closest, Kind.runner.range + 0.001, "he darts in to strike")
        XCTAssertTrue(fled)
        XCTAssertTrue(chase.healed, "the chance is gone")
        XCTAssertEqual(chase.hp, Mode.bushido.hearts - 2, "he struck twice")
        XCTAssertEqual(chase.defeated, 1)

        var stage = Fight(stage: 4, seed: 3)
        XCTAssertNotNil(stage.bearerIndex)
        stage.pilot = .perfect
        var heals = 0
        while stage.outcome == nil { heals += stage.step(0.1).filter { if case .healed = $0 { return true } else { return false } }.count }
        XCTAssertEqual(heals, 1)
    }

    func testTheGourdBearerIsNoOpenerAndTakesTwoCuts() {
        for stage in 1...30 {
            for seed in 0..<12 as Range<UInt64> {
                let fight = Fight(stage: stage, seed: seed)
                guard let i = fight.bearerIndex else { continue }
                XCTAssertGreaterThanOrEqual(i, 4)
                XCTAssertTrue([Kind.grunt, .runner].contains(fight.roster[i]))
            }
        }
        XCTAssertNotNil(Fight(stage: 1, seed: 1).bearerIndex, "the first stage has one")
        var fight = Fight(stage: 1, seed: 1)
        fight.pilot = .perfect
        tick(&fight, for: 60) { fight, _ in fight.foes.contains(where: \.bearer) }
        let bearer = fight.foes.first(where: \.bearer)
        XCTAssertEqual(bearer?.hp, 2)
        XCTAssertEqual(bearer?.maxHP, 2)
        XCTAssertGreaterThan(bearer?.hover ?? 0, 0)
    }

    func testTheGourdBearerMustBeCaughtOnTwoDarts() {
        var fight = lane()
        fight.roster = [.runner]
        fight.hp = 3
        let id = fight.place(.runner, at: -0.9, hp: 2)
        fight.foes[0].bearer = true
        var cuts = 0, healed = false
        for _ in 0..<(120 * 12) where !healed {
            _ = fight.step(Tuning.step)
            guard let f = fight.foe(id) else { break }
            let spot = fight.reach + Kind.runner.width / 2 + 0.09
            if !f.darting, f.phase == .advancing, abs(f.distance - spot) < 0.01 {
                XCTAssertNil(fight.target(.left), "never in reach where he waits")
            }
            guard f.darting, fight.target(.left) == .foe(id), fight.cooldown == 0 else { continue }
            let events = fight.strike(.left)
            cuts += 1
            if events.contains(.healed(foe: id, restored: true)) {
                healed = true
            } else {
                XCTAssertTrue(events.contains(.leapt(foe: id)), "cut once, he springs back")
                XCTAssertNil(fight.target(.left))
                XCTAssertEqual(fight.strike(.left), [], "a second press is held...")
            }
        }
        XCTAssertTrue(healed)
        XCTAssertEqual(cuts, 2, "...and let go: the second cut has to catch him on another dart")
        XCTAssertEqual(fight.stats.whiffs, 0)
        XCTAssertEqual(fight.hp, 4)
        XCTAssertEqual(fight.stats.wounds, 0)
    }

    func testTheGourdBearersDartCanBeMetOnSight() {
        for mode in Mode.allCases {
            for stage in [1, 10, 20, 40] {
                for kind in [Kind.grunt, .runner] {
                    let label = "\(mode) stage \(stage) \(kind)"
                    var fight = Fight(stage: stage, seed: 42, mode: mode, roster: [kind])
                    fight.arrived = 1
                    let id = fight.place(kind, at: -0.9, hp: 2)
                    fight.foes[0].bearer = true
                    var dart: Double?, blow: Double?, windup = 0.0
                    for _ in 0..<(120 * 12) where blow == nil {
                        let events = fight.step(Tuning.step)
                        if dart == nil, fight.foe(id)?.darting == true { dart = fight.time }
                        if events.contains(.raised(foe: id)) { windup = fight.foe(id)!.span }
                        if wounded(events, by: id) { blow = fight.time }
                    }
                    guard let dart, let blow else { XCTFail(label); continue }
                    XCTAssertGreaterThanOrEqual(windup, Tuning.dartWindup, label)
                    XCTAssertGreaterThanOrEqual(blow - dart, 0.3, label)

                    // A cut made 0.22 s after he goes catches him before his blow.
                    var again = Fight(stage: stage, seed: 42, mode: mode, roster: [kind])
                    again.arrived = 1
                    again.place(kind, at: -0.9, hp: 2)
                    again.foes[0].bearer = true
                    tick(&again, for: 12) { fight, _ in fight.foe(id)?.darting == true }
                    tick(&again, for: 0.22)
                    XCTAssertEqual(again.stats.wounds, 0, label)
                    XCTAssertEqual(again.strike(.left).first, .cut(.left, foe: id, killed: false), label)
                }
            }
        }
    }

    func testTheGourdBearerWaitsBehindTheManInFront() {
        var fight = lane()
        fight.roster = [.grunt, .grunt]
        fight.hp = 50
        let front = fight.place(.grunt, at: Kind.grunt.range)
        let bearer = fight.place(.grunt, at: 0.9)
        fight.foes[1].bearer = true
        fight.foes[1].hover = 0.2
        for _ in 0..<(120 * 3) {
            _ = fight.step(Tuning.step)
            let a = fight.foe(front)!, b = fight.foe(bearer)!
            XCTAssertNotEqual(b.phase, .windup, "he never strikes past the man in front")
            if b.distance < 0.5 { XCTAssertGreaterThanOrEqual(b.distance - a.distance, Kind.grunt.width - 1e-6) }
        }
        fight.foes.removeAll { $0.id == front }
        let events = tick(&fight, for: 3) { _, events in events.contains(.raised(foe: bearer)) }
        XCTAssertTrue(events.contains(.raised(foe: bearer)), "the way clear, he darts in")
        XCTAssertEqual(fight.foe(bearer)!.distance, Kind.grunt.range, accuracy: 0.001)
    }

    func testTheGourdBearerLeavesIfHeLingers() {
        var fight = lane()
        fight.roster = [.grunt]
        let id = fight.place(.grunt, at: -0.9, hp: 2)
        fight.foes[0].bearer = true
        fight.foes[0].hover = 100
        let events = tick(&fight, for: 12) { _, events in events.contains(.fled(foe: id)) }
        XCTAssertTrue(events.contains(.fled(foe: id)))
        XCTAssertGreaterThan(fight.time, 9)
        XCTAssertLessThan(fight.time, 11)
        XCTAssertEqual(fight.stats.wounds, 0)
        XCTAssertTrue(fight.healed)
    }

    func testTheGourdIsWorthItsBonusWithNoHeartMissing() {
        for mode in Mode.allCases {
            var fight = lane(mode: mode)
            fight.roster = [.grunt, .grunt]
            let id = fight.place(.grunt, at: 0.2)
            fight.foes[0].bearer = true
            XCTAssertTrue(fight.strike(.right).contains(.healed(foe: id, restored: false)))
            XCTAssertEqual(fight.gourdBonus, Int((Double(Tuning.gourdPoints) * mode.score).rounded()))
            XCTAssertEqual(fight.score, Int((Double(Kind.grunt.bounty) * mode.score).rounded()) + fight.gourdBonus)
        }
    }

    // MARK: The warlord

    func testTheWarlordTurnsAsideACutOnGuard() {
        var fight = lane(stage: 5)
        fight.roster = [.warlord]
        let id = fight.place(.warlord, at: -0.24)
        fight.foes[0].enter(.guarding, for: 1)
        fight.foes[0].timer -= Tuning.guardRise + Tuning.step
        XCTAssertTrue(fight.foes[0].guardSet)
        fight.combo = 5
        let events = fight.strike(.left)
        XCTAssertTrue(events.contains(.parried(.left, foe: id)))
        XCTAssertEqual(fight.foe(id)?.hp, Kind.warlord.baseHP)
        XCTAssertTrue(fight.isStumbling)
        XCTAssertEqual(fight.stats.parried, 1)
        XCTAssertEqual(fight.combo, 0)
    }

    func testACutIntoAGuardStillComingUpGlancesOff() {
        var fight = lane(stage: 5)
        fight.roster = [.warlord]
        let id = fight.place(.warlord, at: -0.24)
        fight.foes[0].enter(.guarding, for: 1)
        fight.foes[0].timer -= Tuning.guardRise * 0.5
        XCTAssertFalse(fight.foes[0].guardSet)
        fight.combo = 5
        XCTAssertEqual(fight.strike(.left), [.parried(.left, foe: id)])
        XCTAssertEqual(fight.foe(id)?.hp, Kind.warlord.baseHP)
        XCTAssertEqual(fight.foe(id)?.phase, .guarding, "his guard goes on up")
        XCTAssertFalse(fight.isStumbling)
        XCTAssertEqual(fight.combo, 5)
        XCTAssertEqual(fight.stats.parried, 0)
        XCTAssertEqual(fight.stats.glanced, 1)
        XCTAssertGreaterThan(fight.cooldown, 0)
        // A second press on its heels is let go rather than thrown against the guard.
        XCTAssertEqual(fight.strike(.left), [])
        tick(&fight, for: Tuning.cooldown + 0.02)
        XCTAssertEqual(fight.stats.parried, 0)
        // Once set, the guard turns a cut aside.
        tick(&fight, for: Tuning.guardRise)
        XCTAssertTrue(fight.foe(id)!.guardSet)
        XCTAssertTrue(fight.strike(.left).contains(.parried(.left, foe: id)))
        XCTAssertTrue(fight.isStumbling)
        XCTAssertEqual(fight.stats.parried, 1)
    }

    func testTheParryIsAnsweredWithASingleBlowFromHisContact() {
        for mode in Mode.allCases {
            for stage in [5, 10, 20, 30] {
                for seed in 0..<8 as Range<UInt64> {
                    let label = "\(mode) stage \(stage) seed \(seed)"
                    var fight = Fight(stage: stage, seed: seed, mode: mode, roster: [.warlord])
                    fight.arrived = 1
                    let id = fight.place(.warlord, at: -(Kind.warlord.range + 0.06), hp: 40)
                    fight.foes[0].enter(.guarding, for: 2)
                    fight.foes[0].timer -= Tuning.guardRise + Tuning.step
                    XCTAssertTrue(fight.strike(.left).contains(.raised(foe: id)), label)
                    let events = tick(&fight, for: 2) { fight, events in self.wounded(events, by: id) }
                    XCTAssertTrue(wounded(events, by: id), label)
                    XCTAssertEqual(fight.hp, mode.hearts - Kind.warlord.damage, label)
                    XCTAssertEqual(fight.foe(id)?.phase, .recoil, "never a second blow straight on: " + label)
                    XCTAssertEqual(fight.foe(id)!.distance, Kind.warlord.range + 0.05, accuracy: 1e-6,
                                   "struck from his contact, then stepped back: " + label)
                }
            }
        }
    }

    func testTheWarlordRaisesHisGuardAsHeClosesIn() {
        var fight = lane(stage: 5)
        fight.roster = [.warlord]
        let id = fight.place(.warlord, at: 0.8)
        fight.hp = 50
        let events = tick(&fight, for: 6) { _, events in events.contains(.guarded(foe: id)) }
        XCTAssertTrue(events.contains(.guarded(foe: id)))
        let warlord = fight.foe(id)!
        XCTAssertLessThan(warlord.gap, fight.reach + 0.12)
        XCTAssertFalse(warlord.guardSet, "it takes a moment to come up")
        XCTAssertGreaterThan(warlord.span, Tuning.guardRise)
    }

    func testTheWarlordStrikesTheMomentHisGuardDropsCloseIn() {
        var fight = lane(stage: 5)
        fight.roster = [.warlord]
        fight.hp = 50
        let id = fight.place(.warlord, at: -Kind.warlord.range)
        fight.foes[0].enter(.guarding, for: 0.5)
        let events = tick(&fight, for: 1) { _, events in events.contains(.raised(foe: id)) }
        XCTAssertTrue(events.contains(.raised(foe: id)))
        let warlord = fight.foe(id)!
        XCTAssertEqual(warlord.phase, .windup)
        XCTAssertLessThan(warlord.span, warlord.windup, "quicker than his usual blow")
        XCTAssertGreaterThanOrEqual(warlord.span, Tuning.quickBlow)
    }

    func testTheWarlordSometimesComesDownCutting() {
        var found = false
        for seed in 0..<80 as Range<UInt64> where !found {
            var fight = Fight(stage: 10, seed: seed, roster: [.warlord])
            fight.arrived = 1
            fight.hp = 50
            let id = fight.place(.warlord, at: -0.22, hp: 40)
            guard fight.strike(.left).contains(.leapt(foe: id)) else { continue }
            let events = tick(&fight, for: 1) { _, events in events.contains(.landed(foe: id)) }
            XCTAssertTrue(events.contains(.landed(foe: id)))
            guard events.contains(.raised(foe: id)) else { continue }
            found = true
            let warlord = fight.foe(id)!
            XCTAssertEqual(warlord.phase, .windup)
            XCTAssertGreaterThanOrEqual(warlord.span, Tuning.quickBlow)
            XCTAssertGreaterThan(warlord.distance, warlord.contact, "he lands a step out...")
            let blow = tick(&fight, for: 2) { fight, events in self.wounded(events, by: id) }
            XCTAssertTrue(wounded(blow, by: id))
            XCTAssertLessThanOrEqual(fight.foe(id)!.distance, warlord.contact + 0.05 + 1e-6, "...and steps in to strike")
        }
        XCTAssertTrue(found)
    }

    func testNoWarlordBlowComesQuickerThanAQuickBlow() {
        for mode in Mode.allCases {
            for stage in [5, 20, 40] {
                for hurt in [false, true] {
                    for seed in 0..<3 as Range<UInt64> {
                        var fight = Fight(stage: stage, seed: seed, mode: mode, roster: [.warlord])
                        fight.arrived = 1
                        fight.hp = 1000
                        let id = fight.place(.warlord, at: 0.6, hp: 40)
                        if hurt { fight.foes[0].hp = 1 }
                        var blows = 0
                        for _ in 0..<(120 * 20) {
                            let events = fight.step(Tuning.step)
                            if events.contains(.raised(foe: id)) {
                                blows += 1
                                XCTAssertGreaterThanOrEqual(fight.foe(id)!.span, Tuning.quickBlow - 1e-9, "\(mode) \(stage)")
                            }
                        }
                        XCTAssertGreaterThan(blows, 5)
                    }
                }
            }
        }
    }

    func testTheWarlordFollowsUpAndNeverAfterAKillingBlow() {
        // He follows a blow straight on with a second, now and then, and the second is never followed in turn.
        var chains = 0
        for seed in 0..<40 as Range<UInt64> {
            var fight = Fight(stage: 10, seed: seed, roster: [.warlord])
            fight.arrived = 1
            fight.hp = 50
            let id = fight.place(.warlord, at: -Kind.warlord.range)
            fight.foes[0].enter(.windup, for: 0.1)
            tick(&fight, for: 0.2) { fight, events in self.wounded(events, by: id) }
            guard let warlord = fight.foe(id), warlord.phase == .windup else { continue }
            chains += 1
            XCTAssertTrue(warlord.chained)
            XCTAssertGreaterThanOrEqual(warlord.span, Tuning.quickBlow)
            tick(&fight, for: 1) { fight, events in self.wounded(events, by: id) }
            XCTAssertEqual(fight.foe(id)?.phase, .recoil)
        }
        XCTAssertGreaterThan(chains, 5)
        XCTAssertLessThan(chains, 35)

        // A blow that fells the ronin is swung through: no second blow is drawn back over the fallen.
        for seed in 0..<40 as Range<UInt64> {
            var fight = Fight(stage: 10, seed: seed, roster: [.warlord])
            fight.arrived = 1
            fight.hp = 2
            let id = fight.place(.warlord, at: -Kind.warlord.range)
            fight.foes[0].enter(.windup, for: 0.1)
            tick(&fight, for: 1) { fight, _ in fight.outcome != nil }
            XCTAssertEqual(fight.outcome, .defeat)
            XCTAssertEqual(fight.foe(id)?.phase, .recoil)
        }
    }

    func testACutWarlordForgetsHisBrokenChain() {
        var fight = lane(stage: 5)
        fight.roster = [.warlord]
        let id = fight.place(.warlord, at: -0.2)
        fight.foes[0].chained = true
        fight.foes[0].enter(.windup, for: 0.2)
        _ = fight.strike(.left)
        XCTAssertEqual(fight.foe(id)?.hp, Kind.warlord.baseHP - 1)
        XCTAssertEqual(fight.foe(id)?.chained, false)
    }

    func testTheWarlordGrowsFuriousAsHeIsCutDown() {
        var calm = lane(stage: 5)
        calm.roster = [.warlord]
        calm.hp = 50
        let a = calm.place(.warlord, at: -0.5, hp: 12)
        var furious = lane(stage: 5)
        furious.roster = [.warlord]
        furious.hp = 50
        let b = furious.place(.warlord, at: -0.5, hp: 12)
        furious.foes[0].hp = 3
        calm.foes[0].guardRest = 100
        furious.foes[0].guardRest = 100
        tick(&calm, for: 0.5)
        tick(&furious, for: 0.5)
        XCTAssertLessThan(furious.foe(b)!.distance, calm.foe(a)!.distance, "he comes faster")
        tick(&calm, for: 3) { _, events in events.contains(.raised(foe: a)) }
        tick(&furious, for: 3) { _, events in events.contains(.raised(foe: b)) }
        XCTAssertEqual(calm.foe(a)!.span, calm.foe(a)!.windup, accuracy: 1e-9)
        XCTAssertLessThan(furious.foe(b)!.span, calm.foe(a)!.span, "and strikes sooner")
    }

    func testTheWarlordWaitsForAnEmptyLane() {
        var fight = Fight(stage: 5, seed: 1, roster: [.grunt, .warlord])
        fight.hp = 50
        tick(&fight, for: 8)
        XCTAssertEqual(fight.arrived, 1)
        XCTAssertNil(fight.boss, "not while a man of his stands")
        guard let grunt = fight.foes.first else { return XCTFail("no grunt") }
        fight.foes[0].x = Side.of(grunt.x).sign * 0.25
        fight.strike(Side.of(grunt.x))
        let events = tick(&fight, for: 3) { fight, _ in fight.boss != nil }
        XCTAssertTrue(events.contains { if case .warlord = $0 { return true } else { return false } })
    }

    func testTheWarlordIsTougherEveryTimeAndCallsForHelp() {
        XCTAssertEqual([5, 10, 15, 20, 25, 30, 35, 40, 45].map { Difficulty(stage: $0).warlordHP },
                       [12, 16, 20, 24, 28, 32, 36, 40, 40])
        for (stage, men) in [(5, 2), (10, 3), (15, 4), (40, 4)] {
            var fight = lane(stage: stage)
            fight.roster = [.warlord]
            let id = fight.place(.warlord, at: -0.2, hp: 12)
            var calls: [[Int]] = []
            for _ in 0..<11 {
                guard let i = fight.foes.firstIndex(where: { $0.id == id }) else { break }
                fight.foes[i].x = -0.2
                fight.foes[i].enter(.advancing, for: 0)
                fight.cooldown = 0
                for case .summoned(_, let allies) in fight.strike(.left) { calls.append(allies) }
            }
            XCTAssertEqual(fight.foe(id)?.hp, 1)
            XCTAssertEqual(calls.count, 3, "at three quarters, a half and a quarter")
            XCTAssertEqual(calls.map(\.count), [men, men, men], "stage \(stage)")
            let kinds = Set(calls.flatMap { $0 }.compactMap { fight.foe($0)?.kind })
            XCTAssertEqual(kinds.contains(.runner), stage >= 10)
            XCTAssertEqual(kinds.contains(.brute), stage >= 10)
            XCTAssertEqual(fight.remaining, 1 + 3 * men)
            // Every man he calls comes from the lane's ends, none on top of another.
            let summoned = calls.flatMap { $0 }.compactMap { fight.foe($0) }
            for side in Side.allCases {
                let xs = summoned.filter { Side.of($0.x) == side }.map(\.distance).sorted()
                XCTAssertTrue(xs.allSatisfy { $0 >= Tuning.edge - 1e-9 })
            }
        }
    }

    // MARK: The pilot

    func testThePilotWaitsOutAGuardUnlessRash() {
        func guarded(_ pilot: Pilot) -> Fight {
            var fight = lane(stage: 5)
            fight.roster = [.warlord]
            fight.hp = 50
            fight.place(.warlord, at: -0.3)
            fight.foes[0].enter(.guarding, for: 1.2)
            fight.foes[0].timer -= Tuning.guardRise + Tuning.step
            fight.pilot = pilot
            tick(&fight, for: 0.9)
            return fight
        }
        XCTAssertEqual(guarded(.perfect).stats.parried, 0)
        XCTAssertEqual(guarded(.perfect).stats.cuts, 0)
        XCTAssertEqual(guarded(.human(slips: 0)).stats.parried, 0)
        XCTAssertGreaterThan(guarded(.human(slips: 0, rash: 50)).stats.parried, 0, "a rash one cuts into it")
    }

    // MARK: Modes

    func testModesSetHeartsReachAndPace() {
        XCTAssertEqual(Mode.allCases.map { Fight(stage: 1, seed: 1, mode: $0).hp }, [7, 5, 4, 3])
        let easy = Fight(stage: 6, seed: 1, mode: .shoshin), normal = Fight(stage: 6, seed: 1), insane = Fight(stage: 6, seed: 1, mode: .oni)
        XCTAssertLessThan(easy.difficulty.pace, normal.difficulty.pace)
        XCTAssertLessThan(normal.difficulty.pace, insane.difficulty.pace)
        XCTAssertGreaterThan(easy.difficulty.windup, insane.difficulty.windup)
        XCTAssertGreaterThan(easy.reach, normal.reach)
        XCTAssertGreaterThan(normal.reach, insane.reach)
        XCTAssertGreaterThan(insane.difficulty.crowd, normal.difficulty.crowd)
    }

    func testHarderModesScoreMore() {
        var scores: [Int] = []
        for mode in Mode.allCases {
            var fight = Fight(stage: 1, seed: 1, mode: mode, roster: [.grunt, .grunt])
            fight.arrived = 2
            fight.place(.grunt, at: 0.2)
            fight.strike(.right)
            scores.append(fight.score)
        }
        XCTAssertEqual(scores, scores.sorted())
        XCTAssertEqual(scores[1], Kind.grunt.bounty)
        XCTAssertLessThan(scores[0], scores[3])
    }

    // MARK: Saves

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

    func testASaveFromBeforeGlancesAndRashPilotsStillLoads() throws {
        var fight = Fight(stage: 5, seed: 12)
        fight.pilot = .human(seed: 1)
        _ = fight.step(5)
        let save = SaveGame(career: Career(seed: 3), fight: fight)
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(save)) as? [String: Any])
        var saved = try XCTUnwrap(json["fight"] as? [String: Any])
        var stats = try XCTUnwrap(saved["stats"] as? [String: Any])
        var pilot = try XCTUnwrap(saved["pilot"] as? [String: Any])
        XCTAssertNotNil(stats.removeValue(forKey: "glanced"))
        XCTAssertNotNil(pilot.removeValue(forKey: "rash"))
        saved["stats"] = stats
        saved["pilot"] = pilot
        json["fight"] = saved
        let old = try JSONSerialization.data(withJSONObject: json)
        let loaded = try JSONDecoder().decode(SaveGame.self, from: old)
        XCTAssertEqual(loaded, save)
    }
}
