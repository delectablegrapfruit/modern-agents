import XCTest
@testable import OnslaughtCore

final class OnslaughtCoreTests: XCTestCase {
    private func run(_ fight: inout Fight, seconds: Double, step: Double = 1.0 / 60) -> [FightEvent] {
        var events: [FightEvent] = []
        var t = 0.0
        while t < seconds && fight.outcome == nil {
            events += fight.step(step)
            t += step
        }
        return events
    }

    // MARK: Determinism and saving

    func testRandomIsDeterministicAndRoundTrips() throws {
        var a = RNG(seed: 42), b = RNG(seed: 42)
        for _ in 0..<100 { XCTAssertEqual(a.next(), b.next()) }
        var c = RNG(seed: 43)
        XCTAssertNotEqual(RNG(seed: 42).state, c.state)
        _ = c.next()
        let data = try JSONEncoder().encode(a)
        var decoded = try JSONDecoder().decode(RNG.self, from: data)
        XCTAssertEqual(decoded.next(), a.next())
    }

    func testSameSeedSameBossDifferentWavesDiffer() {
        XCTAssertEqual(Forge.design(wave: 4, seed: 9), Forge.design(wave: 4, seed: 9))
        XCTAssertNotEqual(Forge.design(wave: 4, seed: 9), Forge.design(wave: 5, seed: 9))
        let heavy = Forge.design(wave: 10, seed: 3)
        XCTAssertTrue(heavy.heavy)
        XCTAssertEqual(heavy.rank, "DREADNOUGHT")
        XCTAssertEqual(heavy.phases.count, 3)
        XCTAssertNotNil(heavy.phases[1].ambient)
        XCTAssertGreaterThan(Forge.hull(wave: 8, heavy: false), Forge.hull(wave: 7, heavy: false))
    }

    func testEveryPhaseHasSomethingAimed() {
        let aimed: Set<Attack.Kind> = [.fan, .stream, .snake, .laser, .mines, .sweep]
        for wave in 1...20 {
            for seed in 1...8 {
                let design = Forge.design(wave: wave, seed: seed)
                for (k, phase) in design.phases.enumerated() {
                    XCTAssertTrue(phase.attacks.contains { aimed.contains($0.kind) }, "wave \(wave) seed \(seed) phase \(k)")
                    XCTAssertEqual(phase.attacks.count, k == 0 ? 2 : 3)
                }
            }
        }
    }

    func testFightIsDeterministic() {
        var a = Fight(wave: 6, seed: 77, loadout: Loadout(), hull: 3)
        var b = a
        a.autopilot = true
        b.autopilot = true
        for _ in 0..<600 {
            let ea = a.step(1.0 / 60), eb = b.step(1.0 / 60)
            XCTAssertEqual(ea, eb)
        }
        XCTAssertEqual(a, b)
        XCTAssertGreaterThan(a.bullets.count + a.stats.cleared, 0)
    }

    func testSavedFightResumesOnTheSameFrame() throws {
        var fight = Fight(wave: 7, seed: 5, loadout: Loadout(), hull: 3)
        fight.autopilot = true
        _ = run(&fight, seconds: 9)
        XCTAssertFalse(fight.bullets.isEmpty)
        let data = try JSONEncoder().encode(fight)
        var copy = try JSONDecoder().decode(Fight.self, from: data)
        XCTAssertEqual(copy, fight)
        for _ in 0..<300 { XCTAssertEqual(copy.step(1.0 / 60), fight.step(1.0 / 60)) }
        XCTAssertEqual(copy, fight)
    }

    func testGameRoundTripsThroughJSON() throws {
        var game = Game(seed: 3)
        game.autopilot = true
        for _ in 0..<400 { _ = game.advance(0.05) }
        let copy = try JSONDecoder().decode(Game.self, from: JSONEncoder().encode(game))
        XCTAssertEqual(copy, game)
    }

    // MARK: The ship

    func testShipFollowsThePointerAndStaysBelowTheBoss() {
        var fight = Fight(wave: 1, seed: 1, loadout: Loadout(), hull: 3)
        fight.aim(at: Vec2(30, 280))
        XCTAssertEqual(fight.ship.target.y, Arena.shipCeiling)
        _ = fight.step(0.05)
        XCTAssertGreaterThan(fight.ship.pos.y, 42)
        XCTAssertLessThan(fight.ship.pos.distance(to: fight.ship.target), Vec2(120, 42).distance(to: fight.ship.target))
        _ = run(&fight, seconds: 2)
        XCTAssertEqual(fight.ship.pos.distance(to: Vec2(30, Arena.shipCeiling)), 0, accuracy: 1e-6)
        fight.aim(at: Vec2(-50, -50))
        XCTAssertEqual(fight.ship.target, Vec2(Arena.margin, Arena.margin))
    }

    func testAParkedShipGetsHit() {
        // Standing still is not a strategy: every boss reaches you.
        for seed in 1...5 {
            var fight = Fight(wave: 3, seed: seed, loadout: Loadout(), hull: 3)
            let events = run(&fight, seconds: 40)
            XCTAssertTrue(events.contains { if case .shipHit = $0 { return true }; if case .shipDestroyed = $0 { return true }; return false },
                          "seed \(seed): a parked ship was never hit")
        }
    }

    func testHitsCostHullThenTheFightIsLost() {
        var fight = Fight(wave: 12, seed: 2, loadout: Loadout(), hull: 2)
        XCTAssertEqual(fight.ship.hull, 2)
        let events = run(&fight, seconds: 120)
        XCTAssertEqual(fight.outcome, .defeat)
        XCTAssertEqual(fight.ship.hull, 0)
        XCTAssertTrue(events.contains(.ended(.defeat)))
        XCTAssertEqual(fight.stats.hitsTaken, 2)
    }

    func testDeflectorAbsorbsTheFirstHit() {
        var kit = Loadout()
        kit.add(.deflector)
        var fight = Fight(wave: 5, seed: 4, loadout: kit, hull: 3)
        XCTAssertTrue(fight.ship.shield)
        let events = run(&fight, seconds: 60)
        let firstHurt = events.firstIndex { if case .shieldAbsorbed = $0 { return true }; if case .shipHit = $0 { return true }; return false }
        XCTAssertNotNil(firstHurt)
        if let firstHurt, case .shieldAbsorbed = events[firstHurt] {} else { XCTFail("the first hit was not absorbed") }
    }

    // MARK: The boss

    func testAutopilotBeatsTheFirstBoss() {
        var fight = Fight(wave: 1, seed: 11, loadout: Loadout(), hull: 3)
        fight.autopilot = true
        let events = run(&fight, seconds: 120)
        XCTAssertEqual(fight.outcome, .victory)
        XCTAssertTrue(events.contains(.bossPhase(1)))
        XCTAssertTrue(events.contains(.bossPhase(2)))
        XCTAssertTrue(events.contains { if case .bossDestroyed = $0 { return true }; return false })
        XCTAssertNotNil(fight.bonus)
        XCTAssertGreaterThan(fight.score, fight.bonus!.total)
        XCTAssertTrue(fight.bullets.isEmpty)
    }

    func testPhaseBreakWipesTheFieldAndShieldsTheBoss() {
        var fight = Fight(wave: 4, seed: 8, loadout: Loadout(), hull: 3)
        fight.autopilot = true
        _ = run(&fight, seconds: 6)
        XCTAssertFalse(fight.bullets.isEmpty)
        var ev: [FightEvent] = []
        fight.damageBoss(fight.boss.hp - fight.boss.maxHP * 0.6, at: fight.boss.pos, &ev)
        XCTAssertEqual(fight.boss.phase, 1)
        XCTAssertTrue(fight.bullets.isEmpty)
        XCTAssertGreaterThan(fight.boss.shielded, 0)
        XCTAssertTrue(ev.contains(.bossPhase(1)))
        let hp = fight.boss.hp
        fight.shots = [Shot(kind: .bolt, pos: fight.boss.pos - Vec2(0, 3), vel: Vec2(0, 10), damage: 5)]
        let after = fight.step(Fight.tick)
        XCTAssertEqual(fight.boss.hp, hp, "a shielded boss took damage")
        XCTAssertTrue(after.contains { if case .bossShielded = $0 { return true }; return false })
    }

    func testNovaNeedsAFullChargeClearsBulletsAndHurts() {
        var fight = Fight(wave: 6, seed: 3, loadout: Loadout(), hull: 3)
        fight.autopilot = true
        _ = run(&fight, seconds: 5)
        XCTAssertTrue(fight.detonate().isEmpty, "an empty nova went off")
        fight.ship.nova = 1
        let hp = fight.boss.hp
        let events = fight.detonate()
        XCTAssertTrue(events.contains(.nova(fight.ship.pos)))
        XCTAssertLessThan(fight.boss.hp, hp)
        XCTAssertEqual(fight.ship.nova, 0)
        _ = run(&fight, seconds: 1.2)
        XCTAssertLessThan(fight.novaRadius, 0)
        XCTAssertGreaterThan(fight.stats.cleared, 0)
    }

    func testGrazingChargesTheNova() {
        var fight = Fight(wave: 1, seed: 1, loadout: Loadout(), hull: 3)
        fight.bullets = [Bullet(.pellet, pos: fight.ship.pos + Vec2(8, 30), vel: Vec2(0, -120))]
        let events = run(&fight, seconds: 0.5)
        XCTAssertTrue(events.contains { if case .graze = $0 { return true }; return false })
        XCTAssertEqual(fight.stats.grazes, 1)
        XCTAssertGreaterThan(fight.ship.nova, 0)
        XCTAssertEqual(fight.ship.hull, 3)
    }

    func testMinesCanBeShotDownOrBurst() {
        var fight = Fight(wave: 3, seed: 1, loadout: Loadout(), hull: 3)
        fight.boss.attack.resting = 100
        var mine = Bullet(.mine, tint: .accent, pos: Vec2(200, 120), vel: .zero)
        mine.fuse = 0.2
        mine.splits = 10
        fight.bullets = [mine]
        let events = run(&fight, seconds: 0.4)
        XCTAssertTrue(events.contains(.mineBurst(Vec2(200, 120))) || events.contains { if case .mineBurst = $0 { return true }; return false })
        XCTAssertEqual(fight.bullets.filter { $0.kind == .pellet }.count, 10)

        var target = Bullet(.mine, pos: fight.ship.pos + Vec2(0, 30), vel: .zero)
        target.fuse = 5
        target.hp = 1
        fight.bullets = [target]
        let shot = run(&fight, seconds: 0.3)
        XCTAssertTrue(shot.contains { if case .mineKilled = $0 { return true }; return false })
        XCTAssertFalse(fight.bullets.contains { $0.kind == .mine })
    }

    func testTrackingLaserHitsAStillShip() {
        var fight = Fight(wave: 5, seed: 1, loadout: Loadout(), hull: 3)
        fight.boss.attack.resting = 100
        _ = run(&fight, seconds: 2)
        fight.lasers = [Laser(offset: Vec2(0, -10), angle: -1.0, sweep: 0, warning: 0.8, firing: 0.35, width: 5, tracks: true)]
        let events = run(&fight, seconds: 1.3)
        XCTAssertTrue(events.contains { if case .laserFired = $0 { return true }; return false })
        XCTAssertEqual(fight.ship.hull, 2)
    }

    // MARK: Upgrades and runs

    func testUpgradesStackToTheirLimit() {
        var kit = Loadout()
        for _ in 0..<10 { kit.add(.splitBarrel) }
        XCTAssertEqual(kit.level(.splitBarrel), Mod.splitBarrel.maxLevel)
        XCTAssertEqual(kit.barrels, 4)
        XCTAssertFalse(kit.canTake(.splitBarrel))
        var rng = RNG(seed: 1)
        for _ in 0..<50 { XCTAssertFalse(Armory.offer(kit, rng: &rng).contains(.splitBarrel)) }
        kit.add(.overclock)
        XCTAssertLessThan(kit.fireInterval, Loadout().fireInterval)
        kit.add(.plating)
        XCTAssertEqual(kit.maxHull, 4)
    }

    func testMoreBarrelsFireMoreBolts() {
        var kit = Loadout()
        kit.add(.splitBarrel)
        kit.add(.splitBarrel)
        var fight = Fight(wave: 1, seed: 1, loadout: kit, hull: 3)
        fight.boss.attack.resting = 100
        _ = fight.step(Fight.tick * 2)
        XCTAssertEqual(fight.shots.filter { $0.kind == .bolt }.count, 3)
    }

    func testVictoryOffersThreeUpgradesThenTheNextWave() {
        var game = Game(seed: 7)
        game.autopilot = true
        var guardTime = 0.0
        while game.stage == .fighting && guardTime < 200 {
            _ = game.advance(0.1)
            guardTime += 0.1
        }
        XCTAssertEqual(game.stage, .armory)
        XCTAssertEqual(game.career.kills, 1)
        XCTAssertEqual(game.run.offer.count, 3)
        XCTAssertEqual(Set(game.run.offer).count, 3)
        XCTAssertGreaterThan(game.run.score, 0)
        let pick = game.run.offer[0]
        game.choose(pick)
        XCTAssertEqual(game.stage, .fighting)
        XCTAssertEqual(game.run.wave, 2)
        XCTAssertEqual(game.fight.wave, 2)
        XCTAssertEqual(game.fight.loadout.level(pick), 1)
        XCTAssertTrue(game.fight.autopilot)
    }

    func testDefeatEndsTheRunButTheCareerKeepsItsKills() {
        var game = Game(seed: 9)
        game.career.kills = 4
        game.fight = Fight(wave: 14, seed: 1, loadout: Loadout(), hull: 1)
        var guardTime = 0.0
        while game.stage == .fighting && guardTime < 200 {
            _ = game.advance(0.1)
            guardTime += 0.1
        }
        XCTAssertEqual(game.stage, .debrief)
        XCTAssertTrue(game.run.over)
        let score = game.run.score
        game.newRun()
        XCTAssertEqual(game.stage, .fighting)
        XCTAssertEqual(game.run.wave, 1)
        XCTAssertEqual(game.run.number, 2)
        XCTAssertEqual(game.career.runs, 2)
        XCTAssertEqual(game.career.kills, 4)
        XCTAssertEqual(game.career.bestScore, score)
        XCTAssertEqual(game.fight.ship.hull, 3)
    }

    func testRanksClimbWithKills() {
        XCTAssertEqual(Rank.title(kills: 0), "Cadet")
        XCTAssertEqual(Rank.title(kills: 9), "Ace")
        XCTAssertEqual(Rank.next(kills: 9)?.title, "Veteran")
        XCTAssertNil(Rank.next(kills: 1000))
    }

    func testStallsAreCapped() {
        var fight = Fight(wave: 1, seed: 1, loadout: Loadout(), hull: 3)
        _ = fight.step(30)
        XCTAssertLessThanOrEqual(fight.time, 0.1 + 1e-9)
    }
}
