import Foundation

/// A driver for tests, the headless simulator and the CI snapshots: aims at a point down the road, picks a speed
/// the next bends allow, and — in drift style — flicks the handbrake into the tight ones.
public struct Autopilot: Sendable {
    public enum Style: Sendable { case grip, drift }

    public var style: Style
    private var handbrakeLeft = 0.0
    private var stuckSeconds = 0.0
    private var reverseLeft = 0.0

    public init(style: Style = .drift) { self.style = style }

    public mutating func input(for session: Session, dt: Double) -> CarInput {
        let car = session.car, track = session.track, s = session.position.s, speed = car.speed

        if reverseLeft > 0 {
            reverseLeft -= dt
            return CarInput(brake: 1, steer: session.position.offset > 0 ? 1 : -1)
        }
        stuckSeconds = speed < 8 ? stuckSeconds + dt : 0
        if stuckSeconds > 1.2 {
            stuckSeconds = 0
            reverseLeft = 0.7
        }

        let aim = track.pose(atS: s + 40 + speed * 0.4).point
        // Sliding, the car goes where its velocity points, not its nose.
        let reference = car.isDrifting && speed > 30 ? car.velocity.angle : car.heading
        let error = wrapAngle((aim - car.position).angle - reference)
        var input = CarInput(steer: clamp(error * 3, -1, 1))

        var tightest = 0.0, d = 0.0
        while d < 50 + speed * 1.1 {
            tightest = max(tightest, abs(track.curvature(atS: s + d)))
            d += 10
        }
        let lateral = style == .drift ? 200.0 : 240.0
        let target = min(session.tuning.maxSpeed, (lateral / max(tightest, 1e-4)).squareRoot())
        if speed < target { input.throttle = 1 }
        if speed > target + 25 { input.brake = 1 }

        if style == .drift {
            let entering = abs(track.curvature(atS: s + 30)) > 1 / 200
            if handbrakeLeft <= 0 && entering && !car.isDrifting && speed > 100 { handbrakeLeft = 0.16 }
            if handbrakeLeft > 0 {
                handbrakeLeft -= dt
                input.handbrake = true
            }
            if car.isDrifting { input.throttle = 1 }
        }
        return input
    }
}

extension Autopilot {
    /// The autopilot's wishes as keys held down or not, the way a person has to drive.
    public mutating func keys(for session: Session, dt: Double) -> Keys {
        let input = input(for: session, dt: dt)
        var keys = Keys()
        keys.left = input.steer > 0.25
        keys.right = input.steer < -0.25
        keys.up = input.throttle > 0
        keys.down = input.brake > 0
        keys.handbrake = input.handbrake
        return keys
    }
}
