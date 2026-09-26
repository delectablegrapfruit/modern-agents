import Foundation
import XCTest
@testable import SkirmishCore

final class RandomTests: XCTestCase {
    func testSameSeedSameSequence() {
        var a = SeededRNG(seed: 42), b = SeededRNG(seed: 42)
        for _ in 0..<100 { XCTAssertEqual(a.next(), b.next()) }
        var c = SeededRNG(seed: 43)
        XCTAssertNotEqual(SeededRNG(seed: 42).state, c.state)
        XCTAssertNotEqual(a.next(), c.next())
    }

    func testUnitIsInRange() {
        var rng = SeededRNG(seed: 7)
        for _ in 0..<10_000 {
            let u = rng.unit()
            XCTAssert(u >= 0 && u < 1)
        }
    }
}

final class MapTests: XCTestCase {
    func testEverySectorMakesAPlayableMap() {
        for sector in 1...40 {
            for attempt in 0..<4 {
                let battle = Battle(sector: sector, seed: mixSeed(UInt64(sector), UInt64(attempt)))
                let outposts = battle.outposts
                XCTAssertGreaterThanOrEqual(outposts.count, 9, "sector \(sector)")
                XCTAssertEqual(outposts.filter { $0.owner == Side.player }.count, 1, "one home for you in sector \(sector)")
                for enemy in battle.enemies {
                    XCTAssert(outposts.contains { $0.owner == enemy }, "sector \(sector) has faction \(enemy)")
                }
                for (i, a) in outposts.enumerated() {
                    XCTAssertEqual(a.id, i)
                    XCTAssert((0.05...0.95).contains(a.position.x) && (0.05...0.95).contains(a.position.y), "on the field")
                    for b in outposts[(i + 1)...] {
                        XCTAssertGreaterThan(a.position.distance(to: b.position), a.radius + b.radius + 0.02, "no overlap in sector \(sector)")
                    }
                }
            }
        }
    }

    func testOneOnOneMapsAreSymmetric() {
        let battle = Battle(sector: 2, seed: 99)
        XCTAssertEqual(battle.difficulty.enemies, 1)
        for o in battle.outposts {
            let mirror = Vec2(1 - o.position.x, 1 - o.position.y)
            XCTAssert(battle.outposts.contains { $0.position.distance(to: mirror) < 1e-9 && $0.kind == o.kind },
                      "#\(o.id) has a twin")
        }
    }

    func testSiegeHasAWalledCitadel() {
        let battle = Battle(sector: 5, seed: 1)
        XCTAssert(battle.difficulty.siege)
        let citadel = battle.outposts.first { $0.kind == .citadel }
        XCTAssertEqual(citadel?.owner, 2)
        XCTAssertEqual(citadel?.armor, 1.5)
        XCTAssertEqual(battle.outposts.filter { $0.owner == 2 }.count, 3, "the citadel and its guard")
    }

    func testSameSeedSameMap() {
        XCTAssertEqual(Battle(sector: 9, seed: 5), Battle(sector: 9, seed: 5))
        XCTAssertNotEqual(Battle(sector: 9, seed: 5).outposts, Battle(sector: 9, seed: 6).outposts)
    }
}

final class BattleTests: XCTestCase {
    private func home(_ battle: Battle, _ faction: Int = Side.player) -> Int {
        battle.outposts.first { $0.owner == faction }!.id
    }

    private func nearestNeutral(_ battle: Battle, to source: Int) -> Int {
        let origin = battle.outposts[source].position
        return battle.outposts.filter { $0.owner == Side.neutral }
            .min { $0.position.distance(to: origin) < $1.position.distance(to: origin) }!.id
    }

    func testSendingTakesTheShareAndFlies() {
        var battle = Battle(sector: 1, seed: 3)
        let from = home(battle), to = nearestNeutral(battle, to: from)
        let before = battle.outposts[from].troops
        let fleets = battle.send(from: [from], to: to, fraction: 0.5)
        XCTAssertEqual(fleets.count, 1)
        XCTAssertEqual(fleets[0].count, Int(before * 0.5))
        XCTAssertEqual(battle.outposts[from].troops, before - Double(fleets[0].count), accuracy: 1e-9)
        XCTAssertEqual(battle.fleets.count, 1)
        XCTAssertEqual(battle.stats.launched, fleets[0].count)
    }

    func testCannotSendFromWhatYouDoNotHold() {
        var battle = Battle(sector: 1, seed: 3)
        let enemy = home(battle, 2)
        XCTAssert(battle.send(from: [enemy], to: home(battle), fraction: 1).isEmpty)
        XCTAssert(battle.send(from: [home(battle)], to: home(battle), fraction: 1).isEmpty, "not to itself")
    }

    func testAStrongAttackCaptures() {
        var battle = Battle(sector: 1, seed: 3)
        let from = home(battle), to = nearestNeutral(battle, to: from)
        let garrison = battle.outposts[to].troops
        battle.send(from: [from], to: to, fraction: 1)
        var events: [BattleEvent] = []
        for _ in 0..<200 where battle.outposts[to].owner != Side.player { events += battle.step(0.05) }
        XCTAssertEqual(battle.outposts[to].owner, Side.player)
        XCTAssert(events.contains(.captured(outpost: to, by: Side.player, from: Side.neutral)))
        XCTAssertEqual(battle.stats.captures, 1)
        XCTAssertEqual(battle.stats.kills, garrison, accuracy: 1e-9)
    }

    private func fleet(_ battle: Battle, owner: Int, count: Int, to: Int) -> Fleet {
        let p = battle.outposts[to].position
        return Fleet(id: 900 + count, owner: owner, count: count, from: 0, to: to, origin: p, control: p, target: p, elapsed: 0, duration: 1)
    }

    func testArrivalsReinforceClashAndCapture() {
        var battle = Battle(sector: 1, seed: 3)
        let mine = home(battle), neutral = nearestNeutral(battle, to: mine)
        battle.outposts[mine].troops = 10
        battle.outposts[neutral].troops = 12
        var events: [BattleEvent] = []
        battle.arrive(fleet(battle, owner: Side.player, count: 5, to: mine), &events)
        XCTAssertEqual(battle.outposts[mine].troops, 15, accuracy: 1e-9)
        battle.arrive(fleet(battle, owner: Side.player, count: 5, to: neutral), &events)
        XCTAssertEqual(battle.outposts[neutral].troops, 7, accuracy: 1e-9)
        XCTAssertEqual(battle.outposts[neutral].owner, Side.neutral)
        battle.arrive(fleet(battle, owner: Side.player, count: 7, to: neutral), &events)
        XCTAssertEqual(battle.outposts[neutral].owner, Side.neutral, "a tie holds")
        XCTAssertEqual(battle.outposts[neutral].troops, 0, accuracy: 1e-9)
        battle.arrive(fleet(battle, owner: Side.player, count: 4, to: neutral), &events)
        XCTAssertEqual(battle.outposts[neutral].owner, Side.player)
        XCTAssertEqual(battle.outposts[neutral].troops, 4, accuracy: 1e-9)
        XCTAssertEqual(events, [
            .reinforced(outpost: mine, count: 5),
            .clashed(outpost: neutral, attacker: Side.player, count: 5),
            .clashed(outpost: neutral, attacker: Side.player, count: 7),
            .captured(outpost: neutral, by: Side.player, from: Side.neutral),
        ])
    }

    func testCitadelWallsMakeDefendersCountHalfAgainMore() {
        var battle = Battle(sector: 5, seed: 1)
        let citadel = battle.outposts.first { $0.kind == .citadel }!.id
        battle.outposts[citadel].troops = 30
        var events: [BattleEvent] = []
        battle.arrive(fleet(battle, owner: Side.player, count: 30, to: citadel), &events)
        XCTAssertEqual(battle.outposts[citadel].owner, 2)
        XCTAssertEqual(battle.outposts[citadel].troops, 10, accuracy: 1e-9, "45 worth of wall less 30")
        battle.arrive(fleet(battle, owner: Side.player, count: 16, to: citadel), &events)
        XCTAssertEqual(battle.outposts[citadel].owner, Side.player)
        XCTAssertEqual(battle.outposts[citadel].troops, 1, accuracy: 1e-9)
    }

    func testProductionStopsAtCapacity() {
        var battle = Battle(sector: 1, seed: 3)
        let mine = home(battle)
        battle.outposts[mine].troops = battle.outposts[mine].capacity - 0.1
        _ = battle.step(1)
        XCTAssertEqual(battle.outposts[mine].troops, battle.outposts[mine].capacity, accuracy: 1e-9)
        XCTAssertEqual(battle.outposts.first { $0.owner == Side.neutral }!.production, 0)
    }

    func testTheEnemyMovesOnItsOwn() {
        var battle = Battle(sector: 1, seed: 11)
        var launched = 0
        for _ in 0..<400 {
            launched += battle.step(0.05).filter { if case .launched(let f) = $0 { return f.owner != Side.player } else { return false } }.count
        }
        XCTAssertGreaterThan(launched, 0)
    }

    func testDoingNothingLoses() {
        var battle = Battle(sector: 3, seed: 2)
        var events: [BattleEvent] = []
        while battle.outcome == nil, battle.time < 1200 { events += battle.step(1) }
        XCTAssertEqual(battle.outcome, .defeat)
        XCTAssertEqual(events.last, .ended(.defeat))
        XCTAssertEqual(battle.step(1), [], "a finished battle stays finished")
    }

    func testAutopilotWinsTheFirstSectors() {
        var wins = 0
        for k in 0..<10 {
            var battle = Battle(sector: 1, seed: mixSeed(1, UInt64(k)))
            battle.autopilot = true
            while battle.outcome == nil, battle.time < 900 { _ = battle.step(0.5) }
            XCTAssertNotNil(battle.outcome, "battle \(k) ends")
            if battle.outcome == .victory { wins += 1 }
        }
        XCTAssertGreaterThanOrEqual(wins, 6)
    }

    func testSavedBattleResumesExactly() throws {
        var battle = Battle(sector: 7, seed: 77)
        battle.autopilot = true
        _ = battle.step(20)
        let data = try JSONEncoder().encode(battle)
        var restored = try JSONDecoder().decode(Battle.self, from: data)
        XCTAssertEqual(restored, battle)
        let a = battle.step(15), b = restored.step(15)
        XCTAssertEqual(a, b)
        XCTAssertEqual(restored, battle)
    }

    func testStepSizeDoesNotChangeTheOutcome() {
        var coarse = Battle(sector: 4, seed: 4), fine = coarse
        coarse.autopilot = true
        fine.autopilot = true
        for _ in 0..<40 { _ = coarse.step(0.5) }
        for _ in 0..<400 { _ = fine.step(0.05) }
        XCTAssertEqual(coarse.outposts.map(\.owner), fine.outposts.map(\.owner))
        XCTAssertEqual(coarse.time, fine.time, accuracy: 0.051)
    }

    func testFleetPathStartsAndEndsOnTheOutposts() {
        var battle = Battle(sector: 1, seed: 3)
        let from = home(battle), to = nearestNeutral(battle, to: from)
        let fleet = battle.send(from: [from], to: to, fraction: 0.5)[0]
        XCTAssertEqual(fleet.point(at: 0), battle.outposts[from].position)
        XCTAssertLessThan(fleet.point(at: 1).distance(to: battle.outposts[to].position), 1e-9)
        XCTAssertGreaterThanOrEqual(fleet.duration * Battle.speed, battle.outposts[from].position.distance(to: battle.outposts[to].position) - 1e-9)
    }
}

final class CampaignTests: XCTestCase {
    func testVictoryAdvancesAndPromotes() {
        var campaign = Campaign()
        var battle = campaign.makeBattle()
        for attempt in 0..<10 {
            battle = Battle(sector: 1, seed: mixSeed(1, UInt64(attempt)))
            battle.autopilot = true
            while battle.outcome == nil, battle.time < 900 { _ = battle.step(1) }
            if battle.outcome == .victory { break }
        }
        XCTAssertEqual(battle.outcome, .victory)
        let promotion = campaign.record(battle)
        XCTAssertEqual(campaign.sector, 2)
        XCTAssertEqual(campaign.victories, 1)
        XCTAssertEqual(campaign.streak, 1)
        XCTAssertEqual(promotion, "Private")
        XCTAssertEqual(campaign.rank, "Private")
        XCTAssertEqual(campaign.nextRank?.title, "Corporal")
        XCTAssertNotNil(campaign.fastest)
    }

    func testDefeatKeepsTheSectorOnANewMap() {
        var campaign = Campaign()
        campaign.sector = 6
        campaign.streak = 4
        var battle = campaign.makeBattle()
        while battle.outcome == nil, battle.time < 2000 { _ = battle.step(1) }
        XCTAssertEqual(battle.outcome, .defeat)
        XCTAssertNil(campaign.record(battle))
        XCTAssertEqual(campaign.sector, 6)
        XCTAssertEqual(campaign.streak, 0)
        XCTAssertNotEqual(campaign.makeBattle().outposts, battle.outposts)
    }

    func testRanksClimb() {
        var campaign = Campaign()
        var last = campaign.rank
        var titles = [last]
        for v in 1...120 {
            campaign.victories = v
            if campaign.rank != last { last = campaign.rank; titles.append(last) }
        }
        XCTAssertEqual(titles, Campaign.ranks.map { $0.title })
    }

    func testSaveGameRoundTrips() throws {
        var save = SaveGame()
        save.campaign.victories = 3
        _ = save.battle.step(12)
        let decoded = try JSONDecoder().decode(SaveGame.self, from: JSONEncoder().encode(save))
        XCTAssertEqual(decoded, save)
    }

    func testSectorNamesAreStable() {
        XCTAssertEqual(Names.sector(7), Names.sector(7))
        XCTAssertEqual(Set((1...30).map(Names.sector)).count, 30, "no repeats early on")
    }
}
