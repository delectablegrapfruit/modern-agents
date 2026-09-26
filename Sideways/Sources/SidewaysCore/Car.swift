import Foundation

/// What the player asks of the car this step. Keys are all-or-nothing, so steering is smoothed by the car.
public struct CarInput: Equatable, Sendable {
    public var throttle: Double
    public var brake: Double
    /// −1 full right … +1 full left.
    public var steer: Double
    public var handbrake: Bool

    public init(throttle: Double = 0, brake: Double = 0, steer: Double = 0, handbrake: Bool = false) {
        self.throttle = throttle
        self.brake = brake
        self.steer = steer
        self.handbrake = handbrake
    }

    public static let idle = CarInput()
    public var isIdle: Bool { throttle == 0 && brake == 0 && steer == 0 && !handbrake }
}

/// The handling. Units are world units (a car is 18 long) and seconds.
public struct CarTuning: Sendable {
    public var maxSpeed = 250.0
    public var engine = 310.0
    public var brake = 480.0
    public var reverseSpeed = 70.0
    public var reverseAccel = 170.0
    public var rolling = 22.0
    public var airDrag = 0.18
    public var handbrakeDrag = 90.0
    /// How fast sideways motion dies away (per second): tyres gripping, sliding, and locked by the handbrake.
    public var gripRoad = 11.0
    public var gripPower = 3.6
    public var gripDrift = 2.0
    public var gripHandbrake = 0.7
    /// Full-lock turn rate (rad/s) gripping and sliding, and how quickly the body follows the wheel.
    public var yawRate = 2.7
    public var yawRateDrift = 3.2
    public var yawResponse = 9.0
    /// A slide starts beyond `driftEnter` and ends below `driftExit` (radians of slip).
    public var driftEnter = 13 * Double.pi / 180
    public var driftExit = 6 * Double.pi / 180
    /// Past this much slip the car countersteers for you, so a held key makes a big angle rather than a spin.
    public var assistAngle = 50 * Double.pi / 180
    public var assistGain = 5.0
    /// Keyboard steering: how fast the wheel winds on and returns (full lock per second).
    public var steerRise = 6.5
    public var steerFall = 11.0
    public var length = 18.0
    public var width = 9.0
    /// The circle the walls see.
    public var radius = 7.0

    public init() {}
    public static let standard = CarTuning()
}

/// A top-down arcade car: velocity split into along and across the body, the across part bled off by tyre grip.
/// Letting grip go — the handbrake, or a hard turn on the throttle at speed — keeps the body rotating while the
/// velocity lags behind it, which is a drift; throttle holds it, steering sets its angle.
public struct Car: Equatable, Sendable {
    public var position: Vec2
    public var velocity = Vec2.zero
    public var heading: Double
    public var yawRate = 0.0
    /// The smoothed steering, −1…1.
    public var steer = 0.0
    public var isDrifting = false
    /// 0 with sliding grip, 1 with full grip: grip returns over a moment rather than snapping back.
    public var gripBlend = 1.0
    public var throttle = 0.0
    public var braking = false
    public var handbrake = false

    public init(position: Vec2, heading: Double) {
        self.position = position
        self.heading = heading
    }

    public var forward: Vec2 { Vec2(angle: heading) }
    public var speed: Double { velocity.length }
    public var forwardSpeed: Double { velocity.dot(forward) }
    /// Heading minus direction of travel: positive when the car points left of where it is going.
    public var slip: Double { speed < 1 ? 0 : wrapAngle(heading - velocity.angle) }

    public mutating func step(_ input: CarInput, dt: Double, tuning t: CarTuning = .standard) {
        let target = clamp(input.steer, -1, 1)
        let winding = abs(target) > abs(steer) && target * steer >= 0
        steer = approach(steer, target, (winding ? t.steerRise : t.steerFall) * dt)
        throttle = input.throttle
        handbrake = input.handbrake

        let f = forward, l = f.perp
        var vF = velocity.dot(f), vL = velocity.dot(l)
        let speed = velocity.length, slipAngle = abs(slip)

        braking = false
        if input.brake > 0 {
            if vF > 8 {
                vF = max(0, vF - t.brake * input.brake * dt)
                braking = true
            } else {
                vF = max(-t.reverseSpeed, vF - t.reverseAccel * input.brake * dt)
            }
        }
        if input.throttle > 0 {
            if vF < 0 {
                vF = min(0, vF + t.brake * input.throttle * dt)
            } else {
                vF += input.throttle * t.engine * max(0, 1 - vF / t.maxSpeed) * dt
            }
        }
        vF -= vF * t.airDrag * dt
        if input.throttle == 0 && input.brake == 0 { vF = approach(vF, 0, t.rolling * dt) }
        if input.handbrake { vF = approach(vF, 0, t.handbrakeDrag * dt) }

        if vF < 0 {
            isDrifting = false
        } else if !isDrifting {
            isDrifting = (input.handbrake && speed > 60) || (slipAngle > t.driftEnter && speed > 50)
        } else if !input.handbrake && (slipAngle < t.driftExit || speed < 30) {
            isDrifting = false
        }
        gripBlend = approach(gripBlend, isDrifting ? 0 : 1, 3.5 * dt)
        var grip = t.gripDrift + (t.gripRoad - t.gripDrift) * gripBlend
        if !isDrifting && input.throttle > 0.5 && abs(steer) > 0.85 && speed > 150 { grip = min(grip, t.gripPower) }
        if input.handbrake { grip = t.gripHandbrake }
        vL *= exp(-grip * dt)
        velocity = f * vF + l * vL

        let speedFactor = min(1, speed / 70) * (1 - 0.3 * min(1, speed / t.maxSpeed))
        var targetYaw = steer * (isDrifting ? t.yawRateDrift : t.yawRate) * speedFactor * (vF >= 0 ? 1 : -1)
        if isDrifting && slipAngle > t.assistAngle {
            targetYaw -= (slip > 0 ? 1 : -1) * (slipAngle - t.assistAngle) * t.assistGain
        }
        yawRate += (targetYaw - yawRate) * min(1, t.yawResponse * dt)
        heading = wrapAngle(heading + yawRate * dt)
        position += velocity * dt
    }
}
