import Foundation
import XCTest
@testable import SidewaysCore

final class TrackTests: XCTestCase {
    /// Every circuit and a fortnight of dailies: closed, the right length, every bend drivable, no two stretches of
    /// road overlapping, and the same road from the same seed.
    func testEveryTrackIsDrivableAndDeterministic() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let start = calendar.date(from: DateComponents(year: 2026, month: 9, day: 20, hour: 12))!
        let dailies = (0..<14).map { TrackCatalog.daily(on: start.addingTimeInterval(Double($0) * 86_400), calendar: calendar) }
        XCTAssertEqual(Set(dailies.map(\.id)).count, 14)
        for info in TrackCatalog.circuits + dailies {
            let track = TrackGenerator.make(info)
            XCTAssertEqual(track.points, TrackGenerator.make(info).points, info.id)
            XCTAssertTrue(TrackGenerator.lengthRange.contains(track.length.rounded()) || abs(track.length - TrackGenerator.lengthRange.lowerBound) < 60,
                          "\(info.id) length \(track.length)")
            XCTAssertEqual(track.spacing, TrackGenerator.spacing, accuracy: 0.2, info.id)
            let tightest = 1 / (track.curvature.map(abs).max() ?? 1)
            XCTAssertGreaterThanOrEqual(tightest, track.halfWidth + TrackGenerator.innerRadius - 0.5, info.id)
            XCTAssertTrue(TrackGenerator.isClear(track.points, halfWidth: track.halfWidth), info.id)
            XCTAssertGreaterThanOrEqual(track.twist, TrackGenerator.minTwist, info.id)
            // The start line sits on a straight.
            XCTAssertLessThan(abs(track.curvature[0]), 1 / 250, info.id)
        }
    }

    func testCircuitsAreNamedAndFoundByID() {
        let circuits = TrackCatalog.circuits
        XCTAssertEqual(circuits.count, 8)
        XCTAssertEqual(Set(circuits.map(\.name)).count, circuits.count)
        for circuit in circuits { XCTAssertEqual(TrackCatalog.info(id: circuit.id), circuit) }
        let daily = TrackCatalog.info(id: "daily-20260926")
        XCTAssertEqual(daily?.subtitle, "Daily · 26 Sep")
        XCTAssertNil(TrackCatalog.info(id: "daily-2026"))
        XCTAssertNil(TrackCatalog.info(id: "circuit-99"))
    }

    func testProjectionFindsArcLengthAndOffset() {
        let track = TrackGenerator.make(TrackCatalog.circuits[2])
        var hint: Int?
        for k in 0..<200 {
            let s = Double(k) / 200 * track.length
            let offset = sin(Double(k)) * (track.halfWidth - 2)
            let pose = track.pose(atS: s)
            let position = track.project(pose.point + pose.tangent.perp * offset, hint: hint)
            hint = position.index
            XCTAssertEqual(position.offset, offset, accuracy: 1.5, "s \(s)")
            let ds = abs(position.s - s)
            XCTAssertLessThan(min(ds, track.length - ds), 4, "s \(s)")
        }
    }
}

final class CarTests: XCTestCase {
    func run(_ car: inout Car, _ input: CarInput, seconds: Double) {
        for _ in 0..<Int(seconds * 120) { car.step(input, dt: 1.0 / 120) }
    }

    func testAcceleratesToTopSpeedAndBrakesToAStop() {
        var car = Car(position: .zero, heading: 0)
        run(&car, CarInput(throttle: 1), seconds: 1)
        XCTAssertGreaterThan(car.speed, 140)
        run(&car, CarInput(throttle: 1), seconds: 6)
        XCTAssertGreaterThan(car.speed, 200)
        XCTAssertLessThan(car.speed, CarTuning.standard.maxSpeed)
        XCTAssertEqual(car.slip, 0, accuracy: 1e-9)
        var stopping = 0.0
        while car.forwardSpeed > 8 && stopping < 5 {
            car.step(CarInput(brake: 1), dt: 1.0 / 120)
            stopping += 1.0 / 120
        }
        XCTAssertLessThan(stopping, 0.6, "flat out to a stop")
        run(&car, CarInput(brake: 1), seconds: 2)
        XCTAssertLessThan(car.forwardSpeed, -50, "holding the brake reverses")
    }

    func testGripTurnsWithoutSliding() {
        var car = Car(position: .zero, heading: 0)
        run(&car, CarInput(throttle: 1), seconds: 0.6)
        run(&car, CarInput(steer: 0.5), seconds: 1)
        XCTAssertFalse(car.isDrifting)
        XCTAssertLessThan(abs(car.slip), 10 * .pi / 180)
        XCTAssertGreaterThan(car.heading, 0.5, "steering left turns counter-clockwise")
    }

    /// A handbrake flick into a turn starts a slide; holding the turn keeps a big angle without spinning; letting
    /// go straightens the car and gives the grip back.
    func testHandbrakeFlickHoldsADriftAndRecovers() {
        var car = Car(position: .zero, heading: 0)
        run(&car, CarInput(throttle: 1), seconds: 2)
        run(&car, CarInput(throttle: 1, steer: 1, handbrake: true), seconds: 0.25)
        XCTAssertTrue(car.isDrifting)
        run(&car, CarInput(throttle: 1, steer: 1), seconds: 0.5)
        XCTAssertGreaterThan(car.slip * 180 / .pi, 25)
        run(&car, CarInput(throttle: 1, steer: 1), seconds: 2)
        XCTAssertTrue(car.isDrifting)
        XCTAssertLessThan(abs(car.slip) * 180 / .pi, 75, "the assist keeps a held turn from spinning")
        XCTAssertGreaterThan(car.speed, 80)
        run(&car, CarInput(throttle: 1), seconds: 1.5)
        XCTAssertFalse(car.isDrifting)
        XCTAssertLessThan(abs(car.slip) * 180 / .pi, 6)
    }

    func testFullLockAtSpeedPowersIntoASlide() {
        var car = Car(position: .zero, heading: 0)
        run(&car, CarInput(throttle: 1), seconds: 3)
        run(&car, CarInput(throttle: 1, steer: -1), seconds: 0.6)
        XCTAssertTrue(car.isDrifting)
        XCTAssertLessThan(car.slip, 0, "turning right, the car points right of its travel")
    }
}

final class ScoringTests: XCTestCase {
    func slidingCar() -> Car {
        var car = Car(position: .zero, heading: 0.6)
        car.velocity = Vec2(150, 0)
        car.isDrifting = true
        return car
    }

    func testChainGrowsMultipliesAndBanksAfterGrace() {
        var scorer = DriftScorer()
        let car = slidingCar()
        var events: [DriftScorer.Event] = []
        for _ in 0..<(120 * 5) { events += scorer.update(car: car, wallDistance: 30, dt: 1.0 / 120) }
        XCTAssertTrue(scorer.isSliding)
        XCTAssertEqual(scorer.multiplier, 3)
        XCTAssertEqual(events, [.multiplier(2), .multiplier(3)])
        let chain = scorer.chain
        XCTAssertGreaterThan(chain, 4_000)
        let still = Car(position: .zero, heading: 0)
        events = []
        for _ in 0..<Int(120 * (DriftScorer.grace + 0.1)) { events += scorer.update(car: still, wallDistance: 30, dt: 1.0 / 120) }
        XCTAssertEqual(events, [.banked(Int(chain.rounded()))])
        XCTAssertEqual(scorer.lapPoints, chain.rounded())
        XCTAssertEqual(scorer.multiplier, 1)
        XCTAssertFalse(scorer.hasChain)
    }

    func testCloseToTheWallPaysMore() {
        var far = DriftScorer(), near = DriftScorer()
        let car = slidingCar()
        for _ in 0..<120 {
            _ = far.update(car: car, wallDistance: 30, dt: 1.0 / 120)
            _ = near.update(car: car, wallDistance: 4, dt: 1.0 / 120)
        }
        XCTAssertTrue(near.isClose)
        XCTAssertEqual(near.chain / far.chain, 1.5, accuracy: 0.01)
    }

    func testBreakingTheChainLosesOnlyUnbankedPoints() {
        var scorer = DriftScorer()
        for _ in 0..<120 { _ = scorer.update(car: slidingCar(), wallDistance: 30, dt: 1.0 / 120) }
        let lost = scorer.breakChain()
        XCTAssertNotNil(lost)
        XCTAssertEqual(scorer.lapPoints, 0)
        XCTAssertNil(scorer.breakChain())
    }
}

final class SessionTests: XCTestCase {
    func drive(_ session: Session, seconds: Double, keyboard: Bool = true) -> [GameEvent] {
        var pilot = Autopilot(style: .drift)
        var events: [GameEvent] = []
        let dt = 1.0 / 120
        for _ in 0..<Int(seconds / dt) {
            let input = keyboard ? pilot.keys(for: session, dt: dt).input : pilot.input(for: session, dt: dt)
            events += session.step(input, dt: dt)
        }
        return events
    }

    func testTheClockWaitsOnTheGrid() {
        let session = Session(track: TrackGenerator.make(TrackCatalog.circuits[0]))
        for _ in 0..<240 { session.step(.idle, dt: 1.0 / 120) }
        XCTAssertEqual(session.clock, 0)
        XCTAssertTrue(session.isOnGrid)
        XCTAssertNil(session.lapTime)
    }

    /// With keys, as a person drives, the autopilot laps every track in under 40 seconds, and the laps carry
    /// ghosts that give a sensible gap.
    func testLapsOnEveryCircuitWithKeys() {
        for info in TrackCatalog.circuits + [TrackCatalog.daily(on: Date())] {
            let session = Session(track: TrackGenerator.make(info))
            let events = drive(session, seconds: 90)
            let laps = events.compactMap { event -> LapResult? in
                if case .lapCompleted(let lap) = event { return lap }
                return nil
            }
            XCTAssertGreaterThanOrEqual(laps.count, 2, info.id)
            for lap in laps {
                XCTAssertGreaterThan(lap.time, 12, info.id)
                XCTAssertLessThan(lap.time, 40, info.id)
                XCTAssertEqual(Double(lap.ghost.count), lap.time / Ghost.interval, accuracy: 3, info.id)
            }
            XCTAssertEqual(session.bestLap, laps.map(\.time).min())
            XCTAssertEqual(laps.first?.previousBest, nil)
            XCTAssertEqual(laps.dropFirst().first?.previousBest, laps.first?.time)
            if let ghost = session.ghost {
                XCTAssertEqual(ghost.time(atS: 0) ?? -1, 0, accuracy: 0.1)
                XCTAssertEqual(ghost.time(atS: session.track.length * 0.5) ?? 0, ghost.lapTime * 0.5, accuracy: ghost.lapTime * 0.25)
            }
        }
    }

    func testDriftingLapsScorePoints() {
        let session = Session(track: TrackGenerator.make(TrackCatalog.circuits[3]))
        let events = drive(session, seconds: 60, keyboard: false)
        let banked = events.reduce(0) { total, event in
            if case .chainBanked(let points) = event { return total + points }
            return total
        }
        XCTAssertGreaterThan(banked, 0)
        XCTAssertGreaterThan(session.takePoints(), 0)
        XCTAssertEqual(session.takePoints(), 0)
    }

    /// Reversing from the grid over the line and back is not a lap.
    func testBackingOverTheLineIsNotALap() {
        let session = Session(track: TrackGenerator.make(TrackCatalog.circuits[0]))
        var events: [GameEvent] = []
        for _ in 0..<(120 * 2) { events += session.step(CarInput(throttle: 1), dt: 1.0 / 120) }
        XCTAssertEqual(session.lapNumber, 1, "crossing from the grid starts lap 1")
        for _ in 0..<(120 * 5) { events += session.step(CarInput(brake: 1), dt: 1.0 / 120) }
        XCTAssertLessThan(session.car.forwardSpeed, 0)
        for _ in 0..<(120 * 4) { events += session.step(CarInput(throttle: 1), dt: 1.0 / 120) }
        XCTAssertFalse(events.contains { if case .lapCompleted = $0 { return true } else { return false } })
    }

    func testResetGoesBackToTheGrid() {
        let session = Session(track: TrackGenerator.make(TrackCatalog.circuits[1]))
        _ = drive(session, seconds: 5)
        XCTAssertNotNil(session.lapTime)
        session.reset()
        XCTAssertTrue(session.isOnGrid)
        XCTAssertNil(session.lapTime)
        XCTAssertEqual(session.car.speed, 0)
    }
}

final class RecordTests: XCTestCase {
    func testGhostSurvivesEncoding() throws {
        var ghost = Ghost(lapTime: 21.5)
        for i in 0..<50 {
            var car = Car(position: Vec2(Double(i) * 3.5, -Double(i)), heading: Double(i) / 10)
            car.velocity = .zero
            ghost.append(car, s: Double(i) * 4)
        }
        let decoded = try JSONDecoder().decode(Ghost.self, from: JSONEncoder().encode(ghost))
        XCTAssertEqual(decoded, ghost)
        let pose = ghost.pose(at: 0.075)
        XCTAssertEqual(pose?.position.x ?? 0, 3.5 * 1.5, accuracy: 1e-4)
        XCTAssertNil(ghost.pose(at: 60))
        XCTAssertEqual(ghost.time(atS: 10) ?? 0, 0.125, accuracy: 1e-6)
    }

    func testRecordsLoadFromOlderFilesAndFileLaps() throws {
        var records = try JSONDecoder().decode(Records.self, from: Data("{\"careerPoints\": 42}".utf8))
        XCTAssertEqual(records.careerPoints, 42)
        XCTAssertTrue(records.showGhost)
        let lap = LapResult(number: 1, time: 24.2, points: 900, previousBest: nil, ghost: Ghost(lapTime: 24.2))
        XCTAssertTrue(records.add(lap, track: "circuit-1"))
        XCTAssertFalse(records.add(LapResult(number: 2, time: 25, points: 1200, previousBest: 24.2, ghost: Ghost(lapTime: 25)), track: "circuit-1"))
        XCTAssertEqual(records[track: "circuit-1"].bestLap, 24.2)
        XCTAssertEqual(records[track: "circuit-1"].bestLapPoints, 1200)
        XCTAssertEqual(records[track: "circuit-1"].laps, 2)
        XCTAssertEqual(records.careerLaps, 2)

        for day in 1...10 { records[track: String(format: "daily-202609%02d", day)] = TrackRecord() }
        records.pruneDailies(keeping: "daily-20260926")
        XCTAssertEqual(records.tracks.keys.filter { $0.hasPrefix("daily-") }.count, 7)
        XCTAssertNotNil(records.tracks["circuit-1"])

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("sideways-test-\(UUID().uuidString)/records.json")
        let store = RecordStore(url: url)
        try store.save(records)
        XCTAssertEqual(store.load(), records)
        try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
    }

    func testRanks() {
        XCTAssertEqual(Rank.of(points: 0).title, "Rookie")
        XCTAssertEqual(Rank.of(points: 20_000).title, "Street")
        XCTAssertEqual(Rank.of(points: 99_999).title, "Street")
        XCTAssertEqual(Rank.of(points: 50_000_000).title, "Drift King")
        XCTAssertNil(Rank.of(points: 50_000_000).next)
        XCTAssertEqual(Rank.of(points: 60_000).progress(points: 60_000), 0.5, accuracy: 1e-9)
        XCTAssertEqual(Paint.all.count, Rank.all.count)
    }

    func testFormats() {
        XCTAssertEqual(Format.lap(9.1), "9.10")
        XCTAssertEqual(Format.lap(23.456), "23.45")
        XCTAssertEqual(Format.lap(83.456), "1:23.45")
        XCTAssertEqual(Format.gap(-0.421), "\u{2212}0.42")
        XCTAssertEqual(Format.gap(1.05), "+1.05")
        XCTAssertEqual(Format.points(0), "0")
        XCTAssertEqual(Format.points(999), "999")
        XCTAssertEqual(Format.points(1_234_567), "1,234,567")
    }
}

final class GameTests: XCTestCase {
    func testPausedGameStandsStillAndDrivingKeysResumeIt() {
        var saves = 0
        let game = Game(records: Records()) { _ in saves += 1 }
        XCTAssertTrue(game.isPaused)
        XCTAssertTrue(game.showHelp, "first launch shows how to play")
        game.advance(by: 1)
        XCTAssertTrue(game.session.isOnGrid)
        XCTAssertFalse(game.isAnimating)

        game.resume()
        game.keys.up = true
        for _ in 0..<120 { game.advance(by: 1.0 / 60) }
        XCTAssertGreaterThan(game.session.car.speed, 100)
        XCTAssertFalse(game.showHelp, "help goes once the car moves")
        XCTAssertTrue(game.isAnimating)

        let before = game.session.clock
        game.pause()
        XCTAssertFalse(game.keys.any)
        game.advance(by: 1)
        XCTAssertEqual(game.session.clock, before)
        XCTAssertGreaterThan(saves, 0)
    }

    func testLapsFileRecordsAndPointsBuildTheCareer() {
        var saved: Records?
        var records = Records()
        records.seenHelp = true
        records.trackID = "circuit-3"
        let game = Game(records: records) { saved = $0 }
        XCTAssertEqual(game.info.id, "circuit-3")
        game.resume()
        var pilot = Autopilot(style: .drift)
        for _ in 0..<(60 * 70) {
            game.keys = pilot.keys(for: game.session, dt: 1.0 / 60)
            game.advance(by: 1.0 / 60)
        }
        game.pause()
        let record = game.records[track: "circuit-3"]
        XCTAssertGreaterThanOrEqual(record.laps, 2)
        XCTAssertNotNil(record.bestLap)
        XCTAssertNotNil(record.ghost)
        XCTAssertGreaterThan(game.records.careerPoints, 0)
        XCTAssertEqual(saved, game.records)
    }

    func testTracksCycleAndAPastDailyBecomesToday() {
        var records = Records()
        records.trackID = "daily-20200101"
        let today = Date()
        let game = Game(records: records, today: today)
        XCTAssertEqual(game.info.id, TrackCatalog.daily(on: today).id)
        XCTAssertEqual(game.tracks.count, 9)
        game.cycleTrack(1)
        XCTAssertEqual(game.info.id, "circuit-1")
        game.cycleTrack(-1)
        game.cycleTrack(-1)
        XCTAssertEqual(game.info.id, "circuit-8")
        XCTAssertEqual(game.records.trackID, "circuit-8")
    }

    func testPaintNeedsTheRank() {
        let game = Game(records: Records())
        game.setPaint(3)
        XCTAssertEqual(game.records.paint, 0)
        var records = Records()
        records.careerPoints = 500_000
        let pro = Game(records: records)
        pro.setPaint(3)
        XCTAssertEqual(pro.records.paint, 3)
    }
}
