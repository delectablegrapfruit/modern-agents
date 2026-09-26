import Foundation

/// The keys held down. Arrows and WASD both drive; the space bar is the handbrake.
public struct Keys: Equatable, Sendable {
    public var left = false
    public var right = false
    public var up = false
    public var down = false
    public var handbrake = false

    public init() {}

    public var input: CarInput {
        CarInput(throttle: up ? 1 : 0, brake: down ? 1 : 0, steer: (left ? 1 : 0) - (right ? 1 : 0), handbrake: handbrake)
    }

    public var any: Bool { left || right || up || down || handbrake }
}

/// A paint for the car, earned with rank.
public struct Paint: Equatable, Sendable {
    public var name: String
    public var red: Double
    public var green: Double
    public var blue: Double

    public static let all: [Paint] = [
        Paint(name: "Arctic White", red: 0.93, green: 0.94, blue: 0.97),
        Paint(name: "Sunset Orange", red: 1.0, green: 0.48, blue: 0.16),
        Paint(name: "Acid Lime", red: 0.66, green: 1.0, blue: 0.22),
        Paint(name: "Electric Blue", red: 0.20, green: 0.55, blue: 1.0),
        Paint(name: "Hot Magenta", red: 1.0, green: 0.22, blue: 0.66),
        Paint(name: "Gold Leaf", red: 1.0, green: 0.80, blue: 0.25),
        Paint(name: "Liquid Chrome", red: 0.78, green: 0.90, blue: 0.95),
    ]

    /// The rank that unlocks paint `index`.
    public static func rank(unlocking index: Int) -> Rank { Rank.all[min(index, Rank.all.count - 1)] }
}

/// The game as the window sees it: a session on the chosen track, the records it files into, the camera and the
/// effects. Time comes in as frame intervals and is run through the simulation in fixed steps, so the handling is
/// the same at any frame rate. Paused, nothing moves at all.
public final class Game {
    public static let step = 1.0 / 120

    public private(set) var records: Records
    public private(set) var info: TrackInfo
    public private(set) var track: Track
    public private(set) var session: Session
    public private(set) var effects = Effects()
    public private(set) var camera = Camera()
    public var keys = Keys()
    public private(set) var isPaused = true
    public var showHelp = false
    /// Frames drawn since launch, for the self-test.
    public var frames = 0
    private let save: (Records) -> Void
    private var accumulator = 0.0
    private var today: TrackInfo

    /// `save` is handed the records whenever there is something worth keeping: a lap, a pause, a change of track.
    public init(records: Records, today date: Date = Date(), save: @escaping (Records) -> Void = { _ in }) {
        var records = records
        let today = TrackCatalog.daily(on: date)
        records.pruneDailies(keeping: today.id)
        // A daily from a past day is swapped for today's.
        let stored = records.trackID.flatMap(TrackCatalog.info(id:))
        let info = stored.map { $0.isDaily ? today : $0 } ?? today
        self.records = records
        self.save = save
        self.today = today
        self.info = info
        track = TrackGenerator.make(info)
        let record = records[track: info.id]
        session = Session(track: track, bestLap: record.bestLap, ghost: record.ghost)
        camera.snap(to: session.car)
        self.records.trackID = info.id
        if !records.seenHelp { showHelp = true }
    }

    public var tracks: [TrackInfo] { [today] + TrackCatalog.circuits }
    public var paint: Paint { Paint.all[clamp(records.paint, 0, Paint.all.count - 1)] }
    public var rank: Rank { records.rank }

    /// Whether frames are needed: anything moving on screen.
    public var isAnimating: Bool {
        !isPaused && (!session.isOnGrid || effects.isActive || keys.any)
    }

    public func advance(by frameTime: Double) {
        frames += 1
        guard !isPaused else { return }
        accumulator += min(frameTime, 0.1)
        while accumulator >= Game.step {
            accumulator -= Game.step
            tick(Game.step)
        }
    }

    private func tick(_ dt: Double) {
        let wasOnGrid = session.isOnGrid
        let events = session.step(keys.input, dt: dt)
        if wasOnGrid && !session.isOnGrid && showHelp { dismissHelp() }
        if !session.isOnGrid {
            effects.emit(from: session.car, sliding: session.scorer.isSliding, dt: dt)
        }
        effects.update(dt: dt)
        camera.follow(session.car, dt: dt)
        for event in events { handle(event) }
    }

    private func handle(_ event: GameEvent) {
        switch event {
        case .lapCompleted(let lap):
            let isBest = records.add(lap, track: info.id)
            claimPoints()
            let points = lap.points > 0 ? "\(Format.points(lap.points)) pts" : nil
            if isBest, let gain = lap.gain {
                effects.toast("NEW BEST " + Format.lap(lap.time), [Format.gap(gain), points].compactMap { $0 }.joined(separator: " · "), tone: .gold, life: 2.6)
            } else if isBest {
                effects.toast("LAP " + Format.lap(lap.time), points ?? "first lap on the board", tone: .gold, life: 2.4)
            } else {
                let gap = lap.gain.map(Format.gap)
                effects.toast("LAP " + Format.lap(lap.time), [gap, points].compactMap { $0 }.joined(separator: " · "), tone: .plain, life: 2.2)
            }
            save(records)
        case .chainBanked(let points):
            claimPoints()
            effects.toast("+" + Format.points(points), nil, tone: .good, life: 1.3)
        case .chainLost(let points):
            effects.toast("CHAIN LOST", "\u{2212}" + Format.points(points), tone: .bad, life: 1.5)
        case .multiplier:
            effects.flash()
        case .wallHit(let impact):
            let car = session.car, position = session.position
            let side = position.offset > 0 ? 1.0 : -1.0
            let contact = car.position + position.tangent.perp * (side * session.tuning.radius)
            effects.sparks(at: contact, away: position.tangent.perp * -side, impact: impact)
        case .spin, .lapStarted, .wrongWay:
            break
        }
    }

    /// Moves banked points into the career total, and announces a new rank.
    private func claimPoints() {
        let before = records.rank
        records.careerPoints += session.takePoints()
        let after = records.rank
        if after.index > before.index {
            effects.toast("RANK UP · " + after.title.uppercased(), "new paint: " + Paint.all[min(after.index, Paint.all.count - 1)].name, tone: .gold, life: 3)
        }
    }

    // MARK: Control

    /// The car starts moving again only on a driving key, so clicking back into the window is safe.
    public func resume() {
        guard isPaused else { return }
        isPaused = false
        accumulator = 0
        // Help stays up on the grid until the car moves; mid-lap it goes as soon as driving resumes.
        if showHelp && !session.isOnGrid { dismissHelp() }
    }

    public func pause() {
        keys = Keys()
        guard !isPaused else { return }
        isPaused = true
        claimPoints()
        save(records)
    }

    public func reset() {
        session.reset()
        effects.clear()
        camera.snap(to: session.car)
    }

    public func select(_ next: TrackInfo) {
        claimPoints()
        info = next
        track = TrackGenerator.make(next)
        let record = records[track: next.id]
        session = Session(track: track, bestLap: record.bestLap, ghost: record.ghost)
        effects.clear()
        camera.snap(to: session.car)
        records.trackID = next.id
        save(records)
    }

    /// The next (+1) or previous (−1) track in the list.
    public func cycleTrack(_ direction: Int) {
        let list = tracks
        let index = list.firstIndex { $0.id == info.id } ?? 0
        select(list[(index + direction + list.count) % list.count])
    }

    public func setPaint(_ index: Int) {
        guard index >= 0, index < Paint.all.count, index <= records.rank.index else { return }
        records.paint = index
        save(records)
    }

    public func setShowGhost(_ on: Bool) {
        records.showGhost = on
        save(records)
    }

    public func setFadeWhenIdle(_ on: Bool) {
        records.fadeWhenIdle = on
        save(records)
    }

    public func setSize(_ size: Int) {
        records.size = clamp(size, 0, 2)
        save(records)
    }

    public func dismissHelp() {
        showHelp = false
        if !records.seenHelp {
            records.seenHelp = true
            save(records)
        }
    }

    public func resetRecords() {
        var fresh = Records()
        fresh.trackID = info.id
        fresh.seenHelp = true
        fresh.size = records.size
        fresh.fadeWhenIdle = records.fadeWhenIdle
        fresh.showGhost = records.showGhost
        records = fresh
        session.bestLap = nil
        session.ghost = nil
        reset()
        save(records)
    }

    public func flush() {
        claimPoints()
        save(records)
    }
}
