import Foundation
import XCTest
@testable import RoninCore

/// Where hearts come back from, and what it takes: the gourd (its bearer caught on two darts that land if they are not
/// met, and the gourd he flings caught as it comes down) and shards (a man cut down in the last moment of his wind-up),
/// with the pilots that play them.
final class HealthTests: XCTestCase {
    /// An empty lane (nothing will arrive) to stage situations on.
    private func lane(stage: Int = 1, mode: Mode = .bushido) -> Fight {
        var fight = Fight(stage: stage, seed: 42, mode: mode, roster: [.grunt])
        fight.arrived = fight.roster.count
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

    private func wounded(_ events: [FightEvent], by id: Int) -> Bool {
        events.contains { if case .wounded(let foe, _) = $0 { return foe == id } else { return false } }
    }

    /// A gourd-bearer placed on a fresh lane, `hp` cuts from falling.
    private func bearer(_ kind: Kind = .grunt, at x: Double, hp: Int = 2, in fight: inout Fight) -> Int {
        fight.roster += [kind]
        fight.arrived = fight.roster.count
        let id = fight.place(kind, at: x, hp: hp)
        fight.foes[fight.foes.count - 1].bearer = true
        return id
    }

    // MARK: The bearer

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

    func testHisDartIsHisWindUpAndItsBlowLands() {
        // He crouches at his spot for the tell, then goes: his weapon raised as he goes, not yet in reach, and the blow
        // lands as he gets to where his weapon reaches.
        var fight = lane()
        fight.hp = 5
        let id = bearer(at: -0.9, in: &fight)
        fight.foes[0].hover = 1
        var readied: Double?, went: Double?
        let events = tick(&fight, for: 8) { fight, events in
            if readied == nil, fight.foe(id)?.readying == true { readied = fight.time }
            if went == nil, events.contains(.raised(foe: id)) { went = fight.time }
            return events.contains { if case .wounded = $0 { return true } else { return false } }
        }
        guard let readied, let went else { return XCTFail("he never went") }
        XCTAssertEqual(went - readied, Tuning.dartTell, accuracy: 0.02, "the tell: crouched this long before he goes")
        XCTAssertTrue(wounded(events, by: id), "an uncut dart lands")
        XCTAssertEqual(fight.hp, 4)
        let blow = fight.time
        XCTAssertGreaterThanOrEqual(blow - went, Tuning.dartWindup - 1e-6)
        XCTAssertEqual(fight.foe(id)!.distance, Kind.grunt.range + 0.0, accuracy: 0.001, "struck from where his spear reaches")
        XCTAssertEqual(fight.foe(id)!.darts, 1)
        XCTAssertFalse(fight.foe(id)!.darting)
    }

    func testHisDartCanBeMetOnSight() {
        for mode in Mode.allCases {
            for stage in [1, 10, 20, 40] {
                for kind in [Kind.grunt, .runner] {
                    let label = "\(mode) stage \(stage) \(kind)"
                    var fight = Fight(stage: stage, seed: 42, mode: mode, roster: [kind])
                    fight.arrived = 1
                    let id = fight.place(kind, at: -0.9, hp: 2)
                    fight.foes[0].bearer = true
                    var dart: Double?, blow: Double?, reach: Double?
                    for _ in 0..<(120 * 12) where blow == nil {
                        let events = fight.step(Tuning.step)
                        if dart == nil, fight.foe(id)?.darting == true { dart = fight.time }
                        if dart != nil, reach == nil, fight.target(.left) == .foe(id) { reach = fight.time }
                        if wounded(events, by: id) { blow = fight.time }
                    }
                    guard let dart, let blow, let reach else { XCTFail(label); continue }
                    XCTAssertGreaterThanOrEqual(blow - dart, Tuning.dartWindup - 1e-6, label)
                    XCTAssertLessThan(blow - dart, 0.5, "\(label): quick enough to be a threat")
                    XCTAssertLessThan(reach - dart, 0.1, "\(label): in reach almost as soon as he goes")

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

    func testHeMustBeCaughtOnTwoDartsAndNeverWhereHeWaits() {
        var fight = lane()
        fight.hp = 3
        let id = bearer(.runner, at: -0.9, in: &fight)
        var cuts = 0, flung = false
        for _ in 0..<(120 * 12) where !flung {
            _ = fight.step(Tuning.step)
            guard let f = fight.foe(id) else { break }
            let spot = fight.reach + Kind.runner.width / 2 + 0.09
            if !f.darting, f.phase == .advancing, abs(f.distance - spot) < 0.01 {
                XCTAssertNil(fight.target(.left), "never in reach where he waits")
            }
            guard f.darting, fight.target(.left) == .foe(id), fight.cooldown == 0 else { continue }
            let events = fight.strike(.left)
            cuts += 1
            if events.contains(.flung(foe: id)) {
                flung = true
            } else {
                XCTAssertTrue(events.contains(.leapt(foe: id)), "cut once, he springs back")
                XCTAssertNil(fight.target(.left))
                XCTAssertEqual(fight.strike(.left), [], "a second press is held...")
            }
        }
        XCTAssertTrue(flung)
        XCTAssertEqual(cuts, 2, "...and let go: the second cut has to catch him on another dart")
        XCTAssertEqual(fight.stats.whiffs, 0)
        XCTAssertEqual(fight.stats.wounds, 0)
        XCTAssertEqual(fight.hp, 3, "cut down, he gives nothing yet: the gourd is in the air")
    }

    func testLeftAloneHeDartsThreeTimesAndMakesOffWithIt() {
        var fight = lane()
        fight.hp = 5
        let id = bearer(.runner, at: -0.9, in: &fight)
        var closest = 1.0, hovered = false, blows = 0
        let events = tick(&fight, for: 14) { fight, events in
            if let f = fight.foe(id) {
                closest = min(closest, f.distance)
                if f.phase == .advancing, f.gap > fight.reach, f.distance < 0.6 { hovered = true }
            }
            if self.wounded(events, by: id) { blows += 1 }
            return events.contains(.fled(foe: id))
        }
        XCTAssertTrue(hovered, "he waits out of reach")
        XCTAssertLessThanOrEqual(closest, Kind.runner.range + 0.001, "he darts in to strike")
        XCTAssertTrue(events.contains(.fled(foe: id)))
        XCTAssertEqual(blows, Tuning.bearerDarts, "every dart left alone lands")
        XCTAssertEqual(fight.hp, 5 - Tuning.bearerDarts)
        XCTAssertTrue(fight.healed, "the chance is gone")
        XCTAssertNil(fight.gourd)
        XCTAssertEqual(fight.defeated, 1)
    }

    func testDartsCutOrNotCountTowardHisGoing() {
        // Cut on his first two darts but not felled (he has a third cut in him): after his third he is gone.
        var fight = lane()
        fight.hp = 5
        let id = bearer(at: -0.9, hp: 3, in: &fight)
        var cut = 0, fled = false
        for _ in 0..<(120 * 20) where !fled {
            fled = fight.step(Tuning.step).contains(.fled(foe: id))
            if cut < 2, fight.foe(id)?.darting == true, fight.target(.left) == .foe(id), fight.cooldown == 0 {
                fight.strike(.left)
                cut += 1
            }
        }
        XCTAssertEqual(cut, 2)
        XCTAssertTrue(fled)
        XCTAssertEqual(fight.hp, 4, "only the third dart, left alone, landed")
    }

    func testHeLeavesIfHeLingers() {
        var fight = lane()
        let id = bearer(at: -0.9, in: &fight)
        fight.foes[0].hover = 100
        let events = tick(&fight, for: 12) { _, events in events.contains(.fled(foe: id)) }
        XCTAssertTrue(events.contains(.fled(foe: id)))
        XCTAssertGreaterThan(fight.time, Tuning.bearerStay)
        XCTAssertLessThan(fight.time, Tuning.bearerStay + 2)
        XCTAssertEqual(fight.stats.wounds, 0)
        XCTAssertTrue(fight.healed)
    }

    func testHeWaitsBehindTheManInFront() {
        var fight = lane()
        fight.roster = [.grunt, .grunt]
        fight.arrived = fight.roster.count
        fight.hp = 50
        let front = fight.place(.grunt, at: Kind.grunt.range)
        let carrier = fight.place(.grunt, at: 0.9)
        fight.foes[1].bearer = true
        fight.foes[1].hover = 0.2
        for _ in 0..<(120 * 3) {
            _ = fight.step(Tuning.step)
            let a = fight.foe(front)!, b = fight.foe(carrier)!
            XCTAssertNotEqual(b.phase, .windup, "he never darts past the man in front")
            XCTAssertTrue(b.readying, "poised for his way in to clear")
            if b.distance < 0.5 { XCTAssertGreaterThanOrEqual(b.distance - a.distance, Kind.grunt.width - 1e-6) }
        }
        fight.foes.removeAll { $0.id == front }
        let events = tick(&fight, for: 3) { _, events in events.contains { if case .wounded = $0 { return true } else { return false } } }
        XCTAssertTrue(events.contains(.raised(foe: carrier)), "the way clear, he darts in")
        XCTAssertTrue(wounded(events, by: carrier))
        XCTAssertEqual(fight.foe(carrier)!.distance, Kind.grunt.range, accuracy: 0.001)
    }

    // MARK: The flung gourd

    func testCutDownHeFlingsTheGourdAndItMustBeCaught() {
        var fight = lane()
        fight.roster = [.grunt, .grunt, .grunt]
        fight.arrived = fight.roster.count
        fight.hp = 2
        let id = bearer(at: -0.2, hp: 1, in: &fight)
        let events = fight.strike(.left)
        XCTAssertTrue(events.contains(.flung(foe: id)))
        XCTAssertFalse(events.contains { if case .healed = $0 { return true } else { return false } })
        XCTAssertEqual(fight.hp, 2)
        let gourd = try! XCTUnwrap(fight.gourd)
        XCTAssertEqual(gourd.from, id)
        XCTAssertEqual(gourd.start, -0.2)
        XCTAssertFalse(gourd.catchable)
        XCTAssertNil(fight.target(gourd.side), "overhead, out of reach")

        // It comes down, and in the last moments of its fall a cut toward it catches it.
        tick(&fight, for: 2) { fight, _ in fight.gourd?.catchable == true }
        XCTAssertEqual(fight.gourd?.timer ?? 0, Tuning.catchWindow, accuracy: Tuning.step + 1e-9)
        XCTAssertEqual(fight.target(gourd.side), .gourd)
        XCTAssertNil(fight.target(gourd.side.opposite))
        let caught = fight.strike(gourd.side)
        XCTAssertEqual(caught, [.healed(foe: id, restored: true)])
        XCTAssertEqual(fight.hp, 3)
        XCTAssertNil(fight.gourd)
        XCTAssertEqual(fight.stats.whiffs, 0)

        // One gourd a stage.
        _ = tick(&fight, for: 0.2)
        let second = bearer(at: 0.2, hp: 1, in: &fight)
        XCTAssertFalse(fight.strike(.right).contains(.flung(foe: second)))
        XCTAssertNil(fight.gourd)
    }

    func testAGourdLeftToFallShatters() {
        var fight = lane()
        fight.roster = [.grunt, .grunt]
        fight.arrived = fight.roster.count
        fight.hp = 2
        let id = bearer(at: 0.25, hp: 1, in: &fight)
        fight.strike(.right)
        let span = fight.gourd!.span
        let events = tick(&fight, for: 2) { _, events in events.contains(.shattered(foe: id)) }
        XCTAssertTrue(events.contains(.shattered(foe: id)))
        XCTAssertEqual(fight.time, span, accuracy: 2 * Tuning.step)
        XCTAssertNil(fight.gourd)
        XCTAssertEqual(fight.hp, 2)
    }

    func testACutTowardItWhileItIsStillHighWhiffs() {
        var fight = lane()
        fight.roster = [.grunt, .grunt]
        fight.arrived = fight.roster.count
        fight.hp = 2
        let id = bearer(at: -0.25, hp: 1, in: &fight)
        fight.strike(.left)
        tick(&fight, for: 0.3)
        let side = fight.gourd!.side
        XCTAssertEqual(fight.strike(side), [.whiff(side)], "too soon: it is still overhead")
        XCTAssertTrue(fight.isStumbling)
        let events = tick(&fight, for: 2) { _, events in events.contains(.shattered(foe: id)) }
        XCTAssertTrue(events.contains(.shattered(foe: id)), "and off balance, it is lost")
        XCTAssertEqual(fight.hp, 2)
    }

    func testItComesDownWithinReachOnEitherSide() {
        var sides = Set<Side>(), same = 0, over = 0
        for seed in 0..<200 as Range<UInt64> {
            var fight = Fight(stage: 3, seed: seed, roster: [.grunt, .grunt])
            fight.arrived = 2
            fight.place(.grunt, at: -0.2, hp: 1)
            fight.foes[0].bearer = true
            fight.strike(.left)
            let gourd = try! XCTUnwrap(fight.gourd)
            XCTAssertTrue(Tuning.gourdLanding.contains(abs(gourd.land)))
            XCTAssertTrue(Tuning.gourdFlight.contains(gourd.span))
            XCTAssertLessThan(abs(gourd.land), Tuning.reach * Mode.oni.reach, "within any reach")
            sides.insert(gourd.side)
            if gourd.side == .left { same += 1 } else { over += 1 }
        }
        XCTAssertEqual(sides, [.left, .right])
        XCTAssertGreaterThan(same, 60)
        XCTAssertGreaterThan(over, 60, "often over the ronin's head, to the other side")
    }

    func testTheNearestThingOnItsSideIsCutFirst() {
        // A man winding up on the gourd's side, nearer than it: the cut goes to him, and the gourd needs its own.
        var fight = lane()
        fight.roster = [.grunt, .runner, .runner]
        fight.arrived = fight.roster.count
        fight.hp = 2
        let id = bearer(at: -0.25, hp: 1, in: &fight)
        fight.strike(.left)
        tick(&fight, for: 2) { fight, _ in fight.gourd?.catchable == true }
        let side = fight.gourd!.side
        let runner = fight.place(.runner, at: side.sign * Kind.runner.range)
        XCTAssertLessThan(fight.foe(runner)!.gap, abs(fight.gourd!.x))
        XCTAssertEqual(fight.strike(side).first, .cut(side, foe: runner, killed: true))
        tick(&fight, for: Tuning.cooldown + Tuning.step)
        XCTAssertEqual(fight.strike(side), [.healed(foe: id, restored: true)])
    }

    func testTheStageIsNotWonWhileTheGourdIsInTheAir() {
        var fight = Fight(stage: 1, seed: 5, roster: [.grunt])
        fight.arrived = 1
        fight.place(.grunt, at: 0.2, hp: 1)
        fight.foes[0].bearer = true
        fight.strike(.right)
        XCTAssertEqual(fight.defeated, fight.roster.count)
        XCTAssertNil(fight.outcome, "the gourd is still up")
        tick(&fight, for: 2) { fight, _ in fight.outcome != nil }
        XCTAssertEqual(fight.outcome, .victory)
        XCTAssertNil(fight.gourd)
    }

    func testTheGourdIsWorthItsBonusWithNoHeartMissing() {
        for mode in Mode.allCases {
            var fight = lane(mode: mode)
            fight.roster = [.grunt, .grunt, .grunt]
            fight.arrived = fight.roster.count
            let id = bearer(at: 0.2, hp: 1, in: &fight)
            fight.strike(.right)
            tick(&fight, for: 2) { fight, _ in fight.gourd?.catchable == true }
            XCTAssertEqual(fight.strike(fight.gourd!.side), [.healed(foe: id, restored: false)])
            XCTAssertEqual(fight.hp, mode.hearts)
            XCTAssertEqual(fight.gourdBonus, Int((Double(Tuning.gourdPoints) * mode.score).rounded()))
            XCTAssertEqual(fight.score, Int((Double(Kind.grunt.bounty) * mode.score).rounded()) + fight.gourdBonus)
        }
    }

    func testAnArrowTurnedIntoHimFlingsItToo() {
        var fight = lane(stage: 4)
        fight.roster = [.grunt, .grunt]
        fight.arrived = fight.roster.count
        fight.hp = 2
        let id = bearer(at: 0.5, hp: 1, in: &fight)
        fight.arrows.append(Arrow(id: 99, from: 0, x: 0.2, velocity: Tuning.deflectSpeed, deflected: true))
        let events = tick(&fight, for: 0.5) { _, events in events.contains(.flung(foe: id)) }
        XCTAssertTrue(events.contains(.flung(foe: id)))
        XCTAssertNotNil(fight.gourd)
    }

    // MARK: Shards

    /// A spearman of one cut on the left, `left` seconds from his blow.
    @discardableResult
    private func windingUp(_ fight: inout Fight, left: Double, kind: Kind = .grunt, hp: Int = 1) -> Int {
        fight.roster += [kind]
        fight.arrived = fight.roster.count
        let id = fight.place(kind, at: -kind.range, hp: hp)
        let i = fight.foes.count - 1
        fight.foes[i].enter(.windup, for: fight.foes[i].windup)
        fight.foes[i].timer = left
        return id
    }

    func testAManCutDownAsHisBlowComesGivesAShard() {
        var fight = lane()
        let id = windingUp(&fight, left: Tuning.senNoSen - 0.01)
        XCTAssertTrue(fight.foe(id)!.senNoSen)
        let events = fight.strike(.left)
        XCTAssertEqual(events, [.cut(.left, foe: id, killed: true), .shard(foe: id, count: 1)])
        XCTAssertEqual(fight.shards, 1)

        // Earlier in his wind-up, or before it, a kill is only a kill.
        _ = fight.step(0.2)
        let early = windingUp(&fight, left: Tuning.senNoSen + 0.05)
        XCTAssertEqual(fight.strike(.left), [.cut(.left, foe: early, killed: true)])
        _ = fight.step(0.2)
        fight.roster += [.grunt]
        fight.arrived = fight.roster.count
        let walking = fight.place(.grunt, at: -0.3)
        XCTAssertEqual(fight.strike(.left), [.cut(.left, foe: walking, killed: true)])
        XCTAssertEqual(fight.shards, 1)
    }

    func testOnlyAFellingBladeGivesAShard() {
        // A brute cut late but not felled: knocked back, no shard.
        var fight = lane(stage: 3)
        let brute = windingUp(&fight, left: 0.05, kind: .brute, hp: 3)
        XCTAssertEqual(fight.strike(.left), [.cut(.left, foe: brute, killed: false)])
        XCTAssertEqual(fight.shards, 0)
        // Felled by an arrow turned back into him, as his blow comes: no shard either.
        var shot = lane(stage: 4)
        let id = windingUp(&shot, left: 0.1)
        shot.arrows.append(Arrow(id: 99, from: 0, x: -0.2, velocity: -Tuning.deflectSpeed, deflected: true))
        let events = tick(&shot, for: 0.1) { _, events in !events.isEmpty }
        XCTAssertEqual(events, [.pierced(foe: id, arrow: 99, killed: true)])
        XCTAssertTrue(shot.foes.isEmpty)
        XCTAssertEqual(shot.shards, 0)
    }

    func testThreeShardsMakeAHeartOrItsWorth() {
        var fight = lane()
        fight.hp = 3
        fight.shards = 2
        let id = windingUp(&fight, left: 0.05)
        let events = fight.strike(.left)
        XCTAssertEqual(events, [.cut(.left, foe: id, killed: true), .shard(foe: id, count: 3), .mended(restored: true)])
        XCTAssertEqual(fight.hp, 4)
        XCTAssertEqual(fight.shards, 0)

        for mode in Mode.allCases {
            var full = lane(mode: mode)
            full.shards = 2
            windingUp(&full, left: 0.05)
            XCTAssertTrue(full.strike(.left).contains(.mended(restored: false)))
            XCTAssertEqual(full.hp, mode.hearts)
            XCTAssertEqual(full.score, Int((Double(Kind.grunt.bounty) * mode.score).rounded()) + full.gourdBonus)
        }
    }

    func testAWoundScattersTheShards() {
        var fight = lane()
        fight.shards = 2
        let id = windingUp(&fight, left: 0.05)
        let events = tick(&fight, for: 0.2) { _, events in !events.isEmpty }
        XCTAssertEqual(events, [.wounded(foe: id, damage: 1), .scattered(2)])
        XCTAssertEqual(fight.shards, 0)
        XCTAssertEqual(fight.hp, Mode.bushido.hearts - 1)
        // With none held, a wound scatters nothing.
        windingUp(&fight, left: 0.05)
        let again = tick(&fight, for: 0.2) { _, events in !events.isEmpty }
        XCTAssertFalse(again.contains { if case .scattered = $0 { return true } else { return false } })
    }

    func testShardsAreBroughtInWithTheHearts() {
        XCTAssertEqual(Fight(stage: 3, seed: 1, hearts: 2, shards: 2).shards, 2)
        XCTAssertEqual(Fight(stage: 3, seed: 1, shards: 7).shards, Tuning.shardsPerHeart - 1, "never a whole heart's worth")
        XCTAssertEqual(Fight(stage: 3, seed: 1, shards: -1).shards, 0)
    }

    func testShardsCarryFromStageToStageAndAFallLosesThem() {
        var career = Career(seed: 9)
        var fight = career.makeFight()
        XCTAssertEqual(fight.shards, 0)
        fight.pilot = .perfect
        while fight.outcome == nil { _ = fight.step(0.1) }
        fight.shards = 2
        fight.hp = 3
        career.record(fight)
        XCTAssertEqual(career.carriedShards, 2)
        XCTAssertEqual(career.run.shards, 2)
        let next = career.makeFight()
        XCTAssertEqual(next.shards, 2)
        XCTAssertEqual(next.hp, 3)

        // Walking away keeps the lesser, hearts and shards together: shards made in the fight are lost, and so are
        // those a wound scattered.
        var gained = next
        gained.shards = 0
        gained.hp = 4
        career.abandon(gained)
        XCTAssertEqual(career.carried, 3)
        XCTAssertEqual(career.carriedShards, 2, "a heart made of shards and walked away from is lost")
        var hurt = career.makeFight()
        hurt.shards = 0
        career.abandon(hurt)
        XCTAssertEqual(career.carried, 3)
        XCTAssertEqual(career.carriedShards, 0, "scattered shards stay scattered")

        // An endless run carries its own.
        career.startEndless(at: 1)
        var endless = career.makeFight()
        endless.pilot = .perfect
        while endless.outcome == nil { _ = endless.step(0.1) }
        endless.shards = 1
        career.record(endless)
        XCTAssertEqual(career.endless?.shards, 1)
        XCTAssertEqual(career.makeFight().shards, 1)
        career.leaveEndless()

        // A fall: the campaign starts again whole, and empty-handed.
        career.carriedShards = 2
        XCTAssertEqual(career.makeFight().shards, 2)
        var lost = career.makeFight()
        lost.hp = 0
        lost.shards = 1
        lost.outcome = .defeat
        career.record(lost)
        XCTAssertEqual(career.carriedShards, 0)
        XCTAssertEqual(career.makeFight().shards, 0)
    }

    // MARK: The pilots

    /// A bearer of one cut felled on the left with `pilot` flying the rest: whether it caught the gourd.
    private func catches(_ pilot: Pilot) -> Bool {
        var fight = lane()
        fight.roster = [.grunt, .grunt]
        fight.arrived = fight.roster.count
        fight.hp = 2
        fight.place(.grunt, at: -0.2, hp: 1)
        fight.foes[0].bearer = true
        fight.strike(.left)
        fight.pilot = pilot
        let events = tick(&fight, for: 2) { fight, _ in fight.gourd == nil }
        return events.contains { if case .healed = $0 { return true } else { return false } }
    }

    func testThePerfectPilotAlwaysCatchesTheGourdAndAHumanOneMostly() {
        XCTAssertTrue(catches(.perfect))
        XCTAssertTrue(catches(.human(slips: 0, timing: 0, seed: 3)), "a press on the moment never misses")
        var caught = 0
        for seed in 0..<300 as Range<UInt64> where catches(.human(seed: seed)) { caught += 1 }
        XCTAssertGreaterThan(caught, 240, "a human-like pilot catches most")
        XCTAssertLessThan(caught, 300, "but not every one: its presses are timed no closer than a person's")
    }

    /// One spearman walking in from the left at `hearts`, `pilot` flying: whether he gave a shard, and whether his blow
    /// landed.
    private func late(_ pilot: Pilot, hearts: Int = 3) -> (shard: Bool, hit: Bool) {
        var fight = lane()
        fight.roster = [.grunt, .grunt]
        fight.arrived = fight.roster.count
        fight.hp = hearts
        let id = fight.place(.grunt, at: -0.7)
        fight.pilot = pilot
        let events = tick(&fight, for: 5) { fight, _ in fight.foe(id) == nil }
        return (events.contains { if case .shard = $0 { return true } else { return false } }, wounded(events, by: id))
    }

    func testTheHumanPilotCutsLateOnlyWithAHeartToWinBack() {
        XCTAssertEqual(late(.human(slips: 0, timing: 0, daring: 1)).shard, true, "hurt, and the lane quiet: it waits for the blow")
        XCTAssertEqual(late(.human(slips: 0, timing: 0, daring: 1), hearts: Mode.bushido.hearts).shard, false, "nothing to win back")
        XCTAssertEqual(late(.human(slips: 0, timing: 0, daring: 1), hearts: 1).shard, false, "no heart to spare")
        XCTAssertEqual(late(.human(slips: 0, timing: 0, daring: 0)).shard, false, "never daring, it cuts on sight")
        XCTAssertEqual(late(.perfect).shard, false)
        var shards = 0, hits = 0
        for seed in 0..<300 as Range<UInt64> {
            let result = late(.human(daring: 1, seed: seed))
            if result.shard { shards += 1 }
            if result.hit { hits += 1 }
        }
        XCTAssertGreaterThan(shards, 180, "a human-like pilot mostly times it")
        XCTAssertLessThan(shards, 290)
        XCTAssertGreaterThan(hits, 0, "and now and then waits too long")
        XCTAssertLessThan(hits, 60)
    }

    func testThePilotsHandsGoNoFasterThanItsRate() {
        var fight = Fight(stage: 8, seed: 3)
        fight.hp = 3
        fight.pilot = .human(seed: 5)
        var presses: [Double] = []
        while fight.outcome == nil, fight.time < 200 {
            for event in fight.step(Tuning.step) {
                switch event {
                case .cut, .whiff, .deflected, .healed, .parried: presses.append(fight.time)
                default: break
                }
            }
        }
        XCTAssertGreaterThan(presses.count, 20)
        for (a, b) in zip(presses, presses.dropFirst()) where b - a < 1 / 7 - 1e-6 {
            XCTFail("presses \(b - a) s apart at \(b)")
        }
    }

    // MARK: Saves

    func testASaveFromBeforeGourdsFlewAndShardsWereKeptStillLoads() throws {
        var fight = Fight(stage: 5, seed: 12)
        fight.pilot = Pilot(reaction: 0.22, rate: 7, slips: 0.02, seed: 4)
        _ = fight.step(5)
        let save = SaveGame(career: Career(seed: 3), fight: fight)
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(save)) as? [String: Any])
        var saved = try XCTUnwrap(json["fight"] as? [String: Any])
        var pilot = try XCTUnwrap(saved["pilot"] as? [String: Any])
        XCTAssertNotNil(saved.removeValue(forKey: "shards"))
        for key in ["timing", "daring", "waiting", "weighed", "pressed"] { XCTAssertNotNil(pilot.removeValue(forKey: key), key) }
        saved["pilot"] = pilot
        json["fight"] = saved
        let old = try JSONSerialization.data(withJSONObject: json)
        let loaded = try XCTUnwrap(SaveGame.load(old))
        XCTAssertEqual(loaded.fight.shards, 0)
        XCTAssertNil(loaded.fight.gourd)
        var expected = fight
        expected.pilot?.pressed = -1
        XCTAssertEqual(loaded.fight, expected, "the fight in progress resumes, not rolled afresh")
    }

    func testAFightWithTheGourdInTheAirResumesExactly() throws {
        var fight = lane()
        fight.roster = [.grunt, .grunt, .grunt]
        fight.arrived = fight.roster.count
        fight.hp = 2
        fight.shards = 1
        fight.place(.grunt, at: -0.2, hp: 1)
        fight.foes[0].bearer = true
        fight.strike(.left)
        fight.pilot = .human(seed: 8)
        _ = fight.step(0.3)
        XCTAssertNotNil(fight.gourd)
        let loaded = try JSONDecoder().decode(Fight.self, from: JSONEncoder().encode(fight))
        XCTAssertEqual(loaded, fight)
        var a = fight, b = loaded
        XCTAssertEqual(a.step(2), b.step(2))
        XCTAssertEqual(a, b)
    }
}
