import Foundation

public struct LapResult: Equatable, Sendable {
    public var number: Int
    public var time: Double
    public var points: Int
    /// The best lap before this one, if there was one.
    public var previousBest: Double?
    public var ghost: Ghost

    public var isBest: Bool { previousBest.map { time < $0 } ?? true }
    /// Seconds against the previous best: negative is faster.
    public var gain: Double? { previousBest.map { time - $0 } }
}

public enum GameEvent: Equatable, Sendable {
    case lapStarted(Int)
    case lapCompleted(LapResult)
    case chainBanked(Int)
    case chainLost(Int)
    case multiplier(Int)
    /// A proper knock, with the speed into the wall. Scrapes are free.
    case wallHit(Double)
    case spin
    case wrongWay(Bool)
}

/// One sitting at one track: the car, the laps, the drift chain, the ghost of the best lap. The clock only moves
/// while `step` is called, so pausing is simply not stepping; on the grid it waits for the first key.
public final class Session {
    /// A knock harder than this (units/s into the wall) costs the running chain.
    public static let hitSpeed = 45.0

    public let track: Track
    public let tuning: CarTuning
    public private(set) var car: Car
    public private(set) var position: TrackPosition
    public private(set) var scorer = DriftScorer()
    /// Simulated seconds.
    public private(set) var clock = 0.0
    /// When the current lap began; nil on the grid, before the line.
    public private(set) var lapStartedAt: Double?
    public private(set) var lapNumber = 0
    public private(set) var lastLap: LapResult?
    public var bestLap: Double?
    public var ghost: Ghost?
    public private(set) var isWrongWay = false
    public private(set) var isSpinning = false
    /// Points banked and not yet taken for the career total.
    public private(set) var unclaimedPoints = 0

    private var lastSector = Track.sectorCount - 1
    private var sectorsVisited = 0
    private var crossedBackwards = false
    private var recorder = GhostRecorder()
    private var wrongWaySeconds = 0.0
    private var waiting = true

    public init(track: Track, tuning: CarTuning = .standard, bestLap: Double? = nil, ghost: Ghost? = nil) {
        self.track = track
        self.tuning = tuning
        self.bestLap = bestLap
        self.ghost = ghost
        let grid = Session.grid(on: track)
        car = Car(position: grid.point, heading: grid.tangent.angle)
        position = track.project(grid.point)
    }

    /// A few car lengths behind the line, pointing down the road.
    static func grid(on track: Track) -> (point: Vec2, tangent: Vec2) { track.pose(atS: track.length - 30) }

    public var lapTime: Double? { lapStartedAt.map { clock - $0 } }
    public var isOnGrid: Bool { waiting }

    /// Seconds behind (+) or ahead (−) of the best lap at this point of the road.
    public var gap: Double? {
        guard let lapTime, let ghost, position.s < track.length * 0.97, lapTime > 0.5,
              let then = ghost.time(atS: position.s) else { return nil }
        return lapTime - then
    }

    public var ghostPose: (position: Vec2, heading: Double)? {
        guard let lapTime, let ghost else { return nil }
        return ghost.pose(at: lapTime)
    }

    /// Clearance between the car's side and the nearer wall.
    public var wallDistance: Double { max(0, track.halfWidth - tuning.radius - abs(position.offset)) }

    public func takePoints() -> Int {
        defer { unclaimedPoints = 0 }
        return unclaimedPoints
    }

    /// Back to the grid; the lap in progress and any running chain are dropped.
    public func reset() {
        let grid = Session.grid(on: track)
        car = Car(position: grid.point, heading: grid.tangent.angle)
        position = track.project(grid.point)
        scorer.resetLap()
        lapStartedAt = nil
        lastSector = Track.sectorCount - 1
        sectorsVisited = 0
        crossedBackwards = false
        wrongWaySeconds = 0
        isWrongWay = false
        isSpinning = false
        waiting = true
    }

    @discardableResult
    public func step(_ input: CarInput, dt: Double) -> [GameEvent] {
        if waiting {
            guard !input.isIdle else { return [] }
            waiting = false
        }
        var events: [GameEvent] = []
        clock += dt
        let previousS = position.s
        car.step(input, dt: dt, tuning: tuning)
        position = track.project(car.position, hint: position.index)
        collideWithWalls(&events)

        let slip = abs(car.slip)
        if !isSpinning && slip > 115 * .pi / 180 && car.speed > 25 {
            isSpinning = true
            events.append(.spin)
            if let lost = scorer.breakChain() { events.append(.chainLost(lost)) }
        } else if isSpinning && (slip < 60 * .pi / 180 || car.speed < 10) {
            isSpinning = false
        }

        for event in scorer.update(car: car, wallDistance: wallDistance, dt: dt) {
            switch event {
            case .multiplier(let m): events.append(.multiplier(m))
            case .banked(let points):
                unclaimedPoints += points
                events.append(.chainBanked(points))
            }
        }

        let along = car.velocity.dot(position.tangent)
        wrongWaySeconds = along < -25 ? wrongWaySeconds + dt : 0
        let wrongWay = wrongWaySeconds > 0.8 || (isWrongWay && along < 5)
        if wrongWay != isWrongWay {
            isWrongWay = wrongWay
            events.append(.wrongWay(wrongWay))
        }

        crossLine(from: previousS, dt: dt, &events)
        if let lapStartedAt { recorder.record(t: clock - lapStartedAt, car: car, s: position.s) }
        return events
    }

    private func collideWithWalls(_ events: inout [GameEvent]) {
        let limit = track.halfWidth - tuning.radius
        guard abs(position.offset) > limit else { return }
        // The wall's normal, pointing back onto the road.
        let n = position.tangent.perp * (position.offset > 0 ? -1 : 1)
        car.position += n * (abs(position.offset) - limit)
        let into = car.velocity.dot(n)
        if into < 0 {
            let impact = -into
            car.velocity -= n * (into * 1.35)
            let normal = n * car.velocity.dot(n)
            car.velocity = normal + (car.velocity - normal) * (1 - min(0.35, impact / 400))
            car.yawRate *= 0.6
            if impact > Session.hitSpeed {
                events.append(.wallHit(impact))
                if let lost = scorer.breakChain() { events.append(.chainLost(lost)) }
            }
        }
        position = track.project(car.position, hint: position.index)
    }

    private func crossLine(from previousS: Double, dt: Double, _ events: inout [GameEvent]) {
        let length = track.length, s = position.s
        let sector = track.sector(atS: s)
        if previousS > length * 0.75 && s < length * 0.25 {
            // Forward over the line, at this fraction of the step.
            let fraction = clamp((length - previousS) / max(length - previousS + s, 1e-9), 0, 1)
            let crossedAt = clock - dt + dt * fraction
            if crossedBackwards {
                crossedBackwards = false
            } else if let started = lapStartedAt {
                if sectorsVisited >= Track.sectorCount - 1 {
                    completeLap(time: crossedAt - started, &events)
                    startLap(at: crossedAt, &events)
                }
            } else {
                startLap(at: crossedAt, &events)
            }
        } else if previousS < length * 0.25 && s > length * 0.75 {
            crossedBackwards = true
        } else if sector == (lastSector + 1) % Track.sectorCount && sector != 0 {
            lastSector = sector
            sectorsVisited += 1
        }
    }

    private func startLap(at time: Double, _ events: inout [GameEvent]) {
        lapStartedAt = time
        lapNumber += 1
        lastSector = 0
        sectorsVisited = 0
        recorder = GhostRecorder()
        events.append(.lapStarted(lapNumber))
    }

    private func completeLap(time: Double, _ events: inout [GameEvent]) {
        let before = scorer.lapPoints
        let points = scorer.closeLap()
        // Banked chains were claimed as they banked; the running chain's share is claimed here.
        unclaimedPoints += points - Int(before)
        var ghost = recorder.ghost
        ghost.lapTime = time
        let result = LapResult(number: lapNumber, time: time, points: points, previousBest: bestLap, ghost: ghost)
        if result.isBest {
            bestLap = time
            self.ghost = ghost
        }
        lastLap = result
        events.append(.lapCompleted(result))
    }
}
