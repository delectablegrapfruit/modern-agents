import Foundation

/// Drift points. While the car slides, points flow in at a rate of speed × angle; slides linked within a short
/// grace make a chain whose multiplier climbs with time spent sideways; the chain is banked once the grace runs out.
/// A proper wall hit or a spin drops the unbanked chain — the only thing the game ever takes away.
public struct DriftScorer: Equatable, Sendable {
    public static let minSlip = 12 * Double.pi / 180
    public static let maxSlip = 105 * Double.pi / 180
    public static let minSpeed = 55.0
    /// Seconds without a slide before a chain is banked.
    public static let grace = 1.4
    /// Seconds of sliding per step of multiplier.
    public static let secondsPerMultiplier = 2.2
    public static let maxMultiplier = 8
    /// Within this distance of a wall the points flow half again as fast.
    public static let closeDistance = 12.0

    /// Points of the running chain, not yet banked.
    public private(set) var chain = 0.0
    public private(set) var chainSeconds = 0.0
    /// Seconds left before the chain banks; zero with no chain.
    public private(set) var graceLeft = 0.0
    public private(set) var isSliding = false
    public private(set) var isClose = false
    /// Banked this lap.
    public private(set) var lapPoints = 0.0
    public private(set) var bestChain = 0.0

    public init() {}

    public var multiplier: Int { min(DriftScorer.maxMultiplier, 1 + Int(chainSeconds / DriftScorer.secondsPerMultiplier)) }
    public var hasChain: Bool { chain > 0 }
    /// 0…1 of the way to the next multiplier.
    public var multiplierProgress: Double {
        multiplier >= DriftScorer.maxMultiplier ? 1
            : chainSeconds.truncatingRemainder(dividingBy: DriftScorer.secondsPerMultiplier) / DriftScorer.secondsPerMultiplier
    }

    public enum Event: Equatable, Sendable {
        case multiplier(Int)
        case banked(Int)
    }

    /// Whether this car, this step, counts as sliding.
    public static func isSliding(_ car: Car) -> Bool {
        let slip = abs(car.slip)
        return car.isDrifting && car.forwardSpeed > 0 && car.speed > minSpeed && slip > minSlip && slip < maxSlip
    }

    public mutating func update(car: Car, wallDistance: Double, dt: Double) -> [Event] {
        var events: [Event] = []
        isSliding = DriftScorer.isSliding(car)
        isClose = isSliding && wallDistance < DriftScorer.closeDistance
        if isSliding {
            let before = multiplier
            let degrees = abs(car.slip) * 180 / .pi
            chain += car.speed * degrees / 10 * (isClose ? 1.5 : 1) * Double(multiplier) * dt
            chainSeconds += dt
            graceLeft = DriftScorer.grace
            if multiplier > before { events.append(.multiplier(multiplier)) }
        } else if graceLeft > 0 {
            graceLeft = max(0, graceLeft - dt)
            if graceLeft == 0 {
                if let banked = bank() { events.append(.banked(banked)) }
                chainSeconds = 0
            }
        }
        return events
    }

    /// Banks the running chain and ends it; the points banked, or nil with no chain.
    public mutating func bank() -> Int? {
        guard chain > 0 else { return nil }
        let points = chain.rounded()
        lapPoints += points
        bestChain = max(bestChain, points)
        chain = 0
        chainSeconds = 0
        graceLeft = 0
        return Int(points)
    }

    /// Crossing the line: the running chain's points so far go to the lap that ended; the chain itself carries on.
    public mutating func closeLap() -> Int {
        let points = lapPoints + chain.rounded()
        bestChain = max(bestChain, chain.rounded())
        chain = 0
        lapPoints = 0
        return Int(points)
    }

    /// A wall hit or a spin: the unbanked chain is lost. Returns the points lost, or nil with no chain.
    public mutating func breakChain() -> Int? {
        guard chain > 0 else { return nil }
        let lost = Int(chain.rounded())
        chain = 0
        chainSeconds = 0
        graceLeft = 0
        return lost
    }

    public mutating func resetLap() {
        chain = 0
        chainSeconds = 0
        graceLeft = 0
        lapPoints = 0
    }
}
