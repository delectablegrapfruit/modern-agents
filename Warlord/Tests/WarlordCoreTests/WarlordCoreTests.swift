import XCTest
@testable import WarlordCore

let epoch = Date(timeIntervalSinceReferenceDate: 800_000_000)

final class HexTests: XCTestCase {
    func testNeighboursAreMutualAndOneStepAway() {
        for hex in [Hex(0, 0), Hex(3, 2), Hex(4, 3), Hex(7, 4)] {
            XCTAssertEqual(Set(hex.neighbors).count, 6)
            for n in hex.neighbors {
                XCTAssertTrue(n.neighbors.contains(hex), "\(n) should border \(hex)")
                XCTAssertEqual(hex.distance(to: n), 1)
            }
        }
        XCTAssertEqual(Hex(0, 0).distance(to: Hex(5, 0)), 5)
        XCTAssertEqual(Hex(0, 0).distance(to: Hex(0, 4)), 4)
    }

    func testNeighbouringCentresAreOneCellApart() {
        let r = 10.0
        for n in Hex(2, 1).neighbors {
            let a = Hex(2, 1).center(radius: r), b = n.center(radius: r)
            XCTAssertEqual(((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)).squareRoot(), r * 3.0.squareRoot(), accuracy: 1e-9)
        }
    }
}

final class RealmTests: XCTestCase {
    func testGeneratedRealmsAreSound() {
        for seed in UInt64(1)...40 {
            for level in 1...5 {
                var rng = SplitMix64(seed: seed)
                let realm = RealmGenerator.make(level: level, rank: level - 1, rng: &rng)
                let (columns, rows) = RealmGenerator.dimensions(level: level)
                XCTAssertTrue(RealmGenerator.isConnected(realm.territories.map(\.hex)))
                XCTAssertEqual(realm.territories.count, columns * rows - columns * rows / 10)
                XCTAssertEqual(realm.territories.map(\.id), Array(realm.territories.indices))
                XCTAssertEqual(Set(realm.territories.map(\.name)).count, realm.territories.count)
                XCTAssertEqual(realm.rivals.count, RealmGenerator.rivalCount(level: level))
                XCTAssertEqual(realm.owned(by: .player), [realm.home])
                XCTAssertTrue(realm.territories[realm.home].isCapital)
                for house in realm.rivals {
                    XCTAssertEqual(realm.territories[house.seat].owner, house.id)
                    XCTAssertTrue(realm.territories[house.seat].isCapital)
                    XCTAssertGreaterThan(realm.territories[house.seat].hex.distance(to: realm.territories[realm.home].hex), 2)
                }
                // Nothing hostile at your door, and nothing stubborn either.
                for n in realm.adjacency[realm.home] {
                    XCTAssertEqual(realm.territories[n].owner, .neutral)
                    XCTAssertLessThanOrEqual(realm.territories[n].troops, 3)
                }
                XCTAssertTrue(realm.territories.allSatisfy { $0.troops >= 1 })
            }
        }
    }

    func testSameSeedSameRealm() throws {
        let a = Game(seed: 99, now: epoch), b = Game(seed: 99, now: epoch)
        XCTAssertEqual(a.realm.territories, b.realm.territories)
        XCTAssertNotEqual(a.realm.territories, Game(seed: 100, now: epoch).realm.territories)
    }
}

final class CombatTests: XCTestCase {
    func testChance() {
        XCTAssertEqual(Combat.chance(sent: 10, wall: 5), 1)
        XCTAssertEqual(Combat.chance(sent: 10, wall: 13), 0)
        XCTAssertEqual(Combat.chance(sent: 10, wall: 10), 0.5, accuracy: 1e-9)
        XCTAssertEqual(Combat.chance(sent: 0, wall: 1), 0)
    }

    func testCertainWinMovesInAndCertainLossComesHome() throws {
        var game = Game(seed: 7, now: epoch)
        let (home, target) = firstFront(game)
        game.realm.territories[home].troops = 30
        game.realm.territories[target].troops = 2
        let turn = try game.attack(from: home, to: target, now: epoch)
        XCTAssertTrue(turn.battle.won)
        XCTAssertEqual(game.realm.territories[home].troops, 1)
        XCTAssertEqual(game.realm.territories[target].owner, .player)
        XCTAssertEqual(game.realm.territories[target].troops, 29 - turn.battle.attackerLosses)
        XCTAssertGreaterThanOrEqual(game.realm.territories[target].troops, 1)
        XCTAssertEqual(game.orders, Rules.orderCap - 1)
        XCTAssertEqual(game.stats.battlesWon, 1)

        let (from, next) = firstFront(game)
        game.realm.territories[from].troops = 3
        game.realm.territories[next].troops = 40
        let loss = try game.attack(from: from, to: next, now: epoch).battle
        XCTAssertFalse(loss.won)
        XCTAssertEqual(game.realm.territories[from].troops, 1 + 2 - loss.attackerLosses)
        XCTAssertGreaterThanOrEqual(game.realm.territories[next].troops, 1)
        XCTAssertNotEqual(game.realm.territories[next].owner, .player)
        XCTAssertEqual(game.stats.battlesLost, 1)
    }

    func testTakingASeatBreaksTheHouse() throws {
        var game = Game(seed: 3, now: epoch)
        let house = game.realm.rivals[0]
        let lands = game.realm.owned(by: house.id)
        XCTAssertGreaterThan(lands.count, 1)
        // Plant an army of yours next to the seat.
        let staging = game.realm.adjacency[house.seat].first { game.realm.territories[$0].owner != house.id }
            ?? game.realm.adjacency[house.seat][0]
        game.realm.territories[staging].owner = .player
        game.realm.territories[staging].troops = 500
        let turn = try game.attack(from: staging, to: house.seat, now: epoch)
        XCTAssertEqual(turn.battle.broke, house.id)
        XCTAssertEqual(Set(turn.battle.subjugated), Set(lands).subtracting([house.seat, staging]))
        XCTAssertTrue(game.realm.owned(by: house.id).isEmpty)
        XCTAssertFalse(game.realm.rival(house.id)!.isAlive)
        XCTAssertEqual(game.stats.housesBroken, 1)
    }

    func testRefusals() throws {
        var game = Game(seed: 11, now: epoch)
        let (home, target) = firstFront(game)
        let far = game.realm.territories.first { $0.owner != .player && !game.realm.borders(home, $0.id) }!.id
        XCTAssertThrowsError(try game.attack(from: home, to: far, now: epoch)) { XCTAssertEqual($0 as? Refusal, .notBordering) }
        XCTAssertThrowsError(try game.attack(from: target, to: home, now: epoch)) { XCTAssertEqual($0 as? Refusal, .notYours) }
        XCTAssertThrowsError(try game.levy(at: target, now: epoch)) { XCTAssertEqual($0 as? Refusal, .notYours) }
        game.orders = 0
        XCTAssertThrowsError(try game.attack(from: home, to: target, now: epoch)) {
            XCTAssertEqual($0 as? Refusal, .noOrders(nextIn: Rules.orderInterval))
        }
        game.realm.territories[home].troops = 1
        XCTAssertThrowsError(try game.attack(from: home, to: target, now: epoch)) { XCTAssertEqual($0 as? Refusal, .tooFewTroops) }
    }

    func testRivalsNeverTakeYourSeat() throws {
        for seed in UInt64(1)...20 {
            var game = Game(seed: seed, now: epoch)
            game.realm.territories[game.realm.home].troops = 1
            for _ in 0..<60 { _ = game.rivalsMove() }
            XCTAssertEqual(game.realm.territories[game.realm.home].owner, .player)
        }
    }
}

final class ClockTests: XCTestCase {
    func testOrdersComeBackOnePerIntervalUpToTheCap() throws {
        var game = Game(seed: 5, now: epoch)
        game.orders = 1
        game.accrue(now: epoch)  // stock was full until now: the clock starts here
        XCTAssertEqual(game.nextOrder(now: epoch), Rules.orderInterval)
        game.accrue(now: epoch + Rules.orderInterval * 2.5)
        XCTAssertEqual(game.orders, 3)
        XCTAssertEqual(game.nextOrder(now: epoch + Rules.orderInterval * 2.5)!, Rules.orderInterval / 2, accuracy: 1e-6)
        // A clock set back never shows a wait longer than one interval.
        XCTAssertEqual(game.nextOrder(now: epoch - 3600), Rules.orderInterval)
        game.accrue(now: epoch + Rules.orderInterval * 100)
        XCTAssertEqual(game.orders, Rules.orderCap)
        XCTAssertNil(game.nextOrder(now: epoch + Rules.orderInterval * 100))
    }

    func testGoldAccruesAndIsCappedWhileAway() {
        var game = Game(seed: 5, now: epoch)
        let perMinute = game.incomePerMinute
        XCTAssertGreaterThan(perMinute, 0)
        game.accrue(now: epoch + 600)
        XCTAssertEqual(game.gold, Rules.startingGold + perMinute * 10, accuracy: 1e-9)
        game.accrue(now: epoch + 600 + 7 * 24 * 3600)
        XCTAssertEqual(game.gold, Rules.startingGold + perMinute * (10 + Rules.incomeCap / 60), accuracy: 1e-6)
        // A clock set back changes nothing.
        let gold = game.gold
        game.accrue(now: epoch)
        XCTAssertEqual(game.gold, gold)
    }

    func testHomecomingReportsWhatCameIn() {
        var game = Game(seed: 5, now: epoch)
        XCTAssertNil(game.checkIn(now: epoch + 60))
        let report = game.checkIn(now: epoch + 60 + 1800)
        XCTAssertEqual(report?.gold, Int(game.incomePerMinute * 30 + Rules.startingGold + game.incomePerMinute) - Int(Rules.startingGold + game.incomePerMinute))
        XCTAssertEqual(report?.orders, Rules.orderCap)
        XCTAssertNil(game.checkIn(now: epoch + 60 + 1800 + 10))
    }

    func testLevySpendsGold() throws {
        var game = Game(seed: 5, now: epoch)
        let home = game.realm.home, troops = game.realm.territories[home].troops
        XCTAssertEqual(try game.levy(at: home, now: epoch), Rules.levySize)
        XCTAssertEqual(game.realm.territories[home].troops, troops + Rules.levySize)
        XCTAssertEqual(game.gold, Rules.startingGold - Double(Rules.levySize) * Rules.troopCost, accuracy: 1e-9)
        game.gold = Rules.troopCost * 2.5
        XCTAssertEqual(try game.levy(at: home, now: epoch), 2)
        XCTAssertThrowsError(try game.levy(at: home, now: epoch)) { XCTAssertEqual($0 as? Refusal, .cannotAfford) }
    }
}

final class CampaignTests: XCTestCase {
    func testTheAdvisorConquersRealmsAndTheRankRises() throws {
        var now = epoch
        var game = Game(seed: 2024, now: now)
        for level in 1...3 {
            var breaks = 0
            while !game.realm.isConquered {
                breaks += 1
                XCTAssertLessThan(breaks, 40, "realm \(level) should fall")
                if breaks >= 40 { return }
                now += 30 * 60
                game.accrue(now: now)
                var moves = 0
                while moves < 200, let move = Advisor.suggest(game) {
                    moves += 1
                    do { try game.play(move, now: now) } catch { break }
                }
            }
            XCTAssertEqual(game.rank, level)
            XCTAssertThrowsError(try game.attack(from: 0, to: 1, now: now))
            try game.advance(now: now)
            XCTAssertEqual(game.realm.level, level + 1)
            XCTAssertFalse(game.realm.isConquered)
        }
        XCTAssertEqual(game.title, "Baron")
    }
}

final class StoreTests: XCTestCase {
    func testRoundTripAndUnreadableFilesAreSetAside() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("warlord-test-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = GameStore(directory: dir)
        XCTAssertNil(store.load())

        var game = Game(seed: 42, now: epoch)
        let (home, target) = firstFront(game)
        game.realm.territories[home].troops = 20
        _ = try game.attack(from: home, to: target, now: epoch + 5)
        try store.save(game)
        let back = try XCTUnwrap(store.load())
        XCTAssertEqual(back.realm.territories, game.realm.territories)
        XCTAssertEqual(back.realm.adjacency, game.realm.adjacency)
        XCTAssertEqual(back.gold, game.gold)
        XCTAssertEqual(back.orders, game.orders)
        XCTAssertEqual(back.stats, game.stats)
        XCTAssertEqual(back.nextOrder(now: epoch + 60), game.nextOrder(now: epoch + 60))
        // The dice carry on where they left off.
        var a = game, b = back
        let (from, to) = firstFront(a)
        let turnA = try a.attack(from: from, to: to, now: epoch + 10)
        let turnB = try b.attack(from: from, to: to, now: epoch + 10)
        XCTAssertEqual(turnA.battle, turnB.battle)

        try Data("{ not json".utf8).write(to: store.file)
        XCTAssertNil(store.load())
        XCTAssertFalse(FileManager.default.fileExists(atPath: store.file.path))
        let aside = try FileManager.default.contentsOfDirectory(atPath: dir.path)
        XCTAssertEqual(aside.count, 1)
        XCTAssertTrue(aside[0].hasPrefix("campaign-unreadable-"))
    }
}

/// A territory of yours and a hostile or unclaimed one next to it: the strongest of yours on the front.
func firstFront(_ game: Game) -> (Int, Int) {
    let realm = game.realm
    let mine = realm.owned(by: .player).sorted { realm.territories[$0].troops > realm.territories[$1].troops }
    for t in mine {
        if let n = realm.adjacency[t].first(where: { realm.territories[$0].owner != .player }) { return (t, n) }
    }
    fatalError("no front")
}
